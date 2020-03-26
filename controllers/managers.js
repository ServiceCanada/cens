/*==========================
 * Managers
 *
 * @description: Getting the subscription list and various bulk operation
 * @author: Government of Canada; @duboisp
 * @version: 0.1
 ===========================*/

const dbConn = module.parent.exports.dbConn;


const _unsubBaseURL = process.env.removeURL || "https://apps.canada.ca/x-notify/subs/remove/";

//
// get subscription for a topic
//
// @return; a CSV text response 
//
exports.getTopicSubs = async ( req, res, next ) => {
	
	// Params: accessCode, topicId
	const { accessCode, topicId } = req.params,
		currDate = new Date(),
		task = "list";
	
	// Validate the accessCode and logs
	dbConn.collection( "topics_details" ).findOneAndUpdate(
		{ 
			_id: topicId,
			accessCode: { $in: [ accessCode ] }
		},
		{
			$currentDate: { 
				lastUpdated: true
			}
		}
	).then( ( docTopic ) => {

		if ( !docTopic.value ) {
			
			// log access denied
			dbConn.collection( "topics_details" ).updateOne(
				{ _id: topicId },
				{
					$push: {
						denied: {
							createdAt: currDate,
							accessCode: accessCode,
							task: task,
							granted: false
						}
					},
					$currentDate: { 
						lastUpdated: true
					}
				}
			).catch( (e) => {
				console.log( e );
			});
		
			res.json( { statusCode: 401, nal: 1 } );
			return;
		}
		
		// Get all the emails for the given topic
		let docs = dbConn.collection( "subsConfirmed" ).find(
			{
				topicId: topicId
			},
			{
				projection: {
					_id: 0,
					email: 1,
					subscode: 1
				}
			}
		);

		// log access granted
		dbConn.collection( "topics_details" ).updateOne(
			{ _id: topicId },
			{
				$push: {
					access: {
						createdAt: currDate,
						accessCode: accessCode,
						task: task,
						granted: true
					}
				},
				$currentDate: { 
					lastUpdated: true
				}
			}
		).catch( (e) => {
			console.log( e );
		});

		let csv = '"email address","unsub"\r\n'; // Need to change this for a stream.

		docs.toArray( ( err, docsItems ) => {

			// create CSV rows
			let i, i_len = docsItems.length, i_cache;
			for( i = 0; i !== i_len; i++) {
				i_cache = docsItems[ i ];				
				csv += '"' + i_cache.email + '","' + _unsubBaseURL + i_cache.subscode + "/" + i_cache.email + '"\r\n';
			}

			// Send the file
			res.setHeader( "Content-disposition", "attachment; filename=" + topicId + "-" + currDate.getTime() + ".csv" );
			res.set( "Content-Type", "text/csv" );
			res.status( 200 ).send( csv );

			res.end();
		} );
		
	}).catch( (e) => {
		console.log( e );
	});
	
};


//
// prompt users with a form
//
// @return; an HTML blob
//
exports.serveBulkForm = ( req, res, next ) => {

	// Params: accessCode, topicId
	const { accessCode, topicId } = req.params;

	res.status( 200 ).send( '<!DOCTYPE html>\n' +
		'<html lang="en">\n' +
		'<head>\n' +
		'<title>Bulk action emails</title>\n' +
		'</head>\n' +
		'<body>\n' +
		'	<form action="/api/v0.1/t-manager/' + accessCode + '/' + topicId + '/bulk/action" method="post">\n' +
		'		<fieldset>\n' +  
		'			<legend>Do you wish to subscribe or unsubscribe emails:</legend>\n' +   
		'			<label><input name="action" type="radio" value="add"> Subscribe</label><br>\n' +
		'			<label><input name="action" type="radio" value="remove"> Unsubscribe</label><br>\n' +
		'		</fieldset><br><br>\n' + 
		'		<label for="emails">List of emails to action (one email address per line):<br>\n' +
		'		<textarea id="emails" name="emails" rows="25" cols="50" required></textarea><br>\n' +
		'		<input type="submit" value="Submit">\n' +
		'	</form>\n' +
		'</body>\n' +
		'</html>' 
	);
};


//
// Bulk action multiple emails to a topic (assume implicit consent)
//
// @return; a JSON response
//
exports.actionBulk = async ( req, res, next ) => {

	const body = req.body,
		action = body.action,
		task = "bulk",
		currDate = new Date(),
		{ accessCode, topicId } = req.params;
	
	let emails = body.emails,
		confirmedEmails = [],
		granted;

	// Validation of input
	if( !emails ) {
		res.send({
			status: false,
			message: 'No emails to action'
		});
		return;
	}

	// Validate the accessCode and logs
	await dbConn.collection( "topics_details" ).findOne(
		{
			_id: topicId,
			accessCode: { $in: [ accessCode ] }
		}
	).then( ( docTopic ) => {

		granted = docTopic;
			
		// log access granted or denied
		dbConn.collection( "topics_details" ).updateOne(
			{ _id: topicId },
			{
				$push: {
					access: {
						createdAt: currDate,
						accessCode: accessCode,
						granted: granted,
						task: task
					}
				},
				$currentDate: { 
					lastUpdated: true
				}
			}
		).catch( (e) => {
			console.log( e );
		});
		
	}).catch( (e) => {
		console.log( e );
	});

	// Reject if access denied
	if(!granted) {
		res.json( { statusCode: 401, nal: 1 } );
		return;
	}

	// Sanitize list of emails
	emails = emails.replace(/\r/g, '').split('\n');
	emails.forEach((eml) => {
		if ( eml.match( /.+\@.+\..+/ ) ) {
			confirmedEmails.push(eml);
		}
	});

	// Action selected opeation, either remove or add in bulk
	if( action === "remove" ) {
		await removeBulk( confirmedEmails, topicId );
	} else {
		await addBulk( confirmedEmails, topicId, currDate );
	}
	
	// Log an bulk_logs entry for bulk operation
	dbConn.collection( "bulk_logs" ).insertOne(
		{
			task: action,
			createdAt: currDate,
			topicId: topicId,
			email: confirmedEmails
		},
	).catch( (e) => {
		console.log( e );
	});

	// Send response and return a page with a successful message
	res.status( 200 ).send( '<!DOCTYPE html>\n' +
		'<html lang="en">\n' +
		'<head>\n' +
		'<title>Bulk emails action</title>\n' +
		'</head>\n' +
		'<body>\n' +
		'	<p>Thank you, ' + action + ' emails list operation was successful.</p>\n' +
		'</body>\n' +
		'</html>' 
	);
};

//
// ADDS emails in bulk
//
// Does not return anything... assume in res that operation went well
//
addBulk = async ( emails, topicId, currDate ) => {

	let subscode,
		cookedEmails = [];

	// Generates unique subscodes and cooks data for insertion
	emails.forEach((eml) => {
		subscode = Math.floor(Math.random() * 999999) + "" + currDate.getMilliseconds();
		cookedEmails.push({
			email: eml, 
			subscode: subscode, 
			topicId: topicId
		});
	});

	// Add to confirmed list
	dbConn.collection( "subsConfirmed" ).insertMany(
		cookedEmails,
		{
			ordered: false
		}
	).catch( (e) => {
		console.log( e );
	});
};

//
// REMOVES emails in bulk
//
// Does not return anything... assume in res that operation went well
//
removeBulk = async ( emails, topicId ) => {

	// Remove from confirmed list
	dbConn.collection( "subsConfirmed" ).removeMany({ 
		email: { 
			$in:  emails
		}, 
		topicId: topicId
	}).catch( (e) => {
		console.log( e );
	});
};
