/*==========================
 * Managers
 *
 * @description: Getting the subscription list and various bulk operation
 * @author: Government of Canada; @duboisp
 * @version: 1.0
 ===========================*/

const AWS = require('aws-sdk');
const NotifyClient = require('notifications-node-client').NotifyClient;

const dbConn = module.parent.exports.dbConn;
const ObjectId = require('mongodb').ObjectId;
const mustache = require('mustache');
const fsPromises = require('fs').promises;

const _unsubBaseURL = process.env.removeURL || "https://apps.canada.ca/x-notify/subs/remove/",
	_convertSubCode = process.env.convertSubCode || false,
	_minBeforeToUploadOnly = process.env.minBeforeToUploadOnly || 50000,
	_AWS_ACCESS_KEY = process.env.AWS_ACCESS_KEY || false,
	_AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || false;
	_AWS_BUCKET = process.env.AWS_BUCKET || 'notify-csv-dump',
	_subsLinkSuffix = process.env.subsLinkSuffix || "853e0212b92a127";

//
// get subscription for a topic
//
// @return; a CSV text response 
//
exports.getTopicSubs = async ( req, res, next ) => {
	
	// Ensure the user is authorized and get the topicId
	let topicDetails = await isAuthorizedToDownload( req, "list"),
		currDate = new Date();

	if ( !topicDetails ) {
		res.json( { statusCode: 401, nal: 1 } );
		res.end()
		return;
	}

	let topicId = topicDetails.topicId;
	
	// Count the number of confirmed
	nbConfirmed = await getNumberConfirmed( topicId, { limit: _minBeforeToUploadOnly + 1 } );
	
	// If more than 50
	if ( nbConfirmed >= _minBeforeToUploadOnly ) {
		res.status( 200 ).send( await getFormToUploadList( topicId, req.originalUrl ) );
		res.end();
		return;
	}

	// Get the CSV
	const { csv, count } = await getConfirmedSubscriberAsCSV( topicId );

	// Initiate a file download
	res.setHeader( "Content-disposition", "attachment; filename=" + topicId + "-" + count + "-" + currDate.getTime() + ".csv" );
	res.set( "Content-Type", "text/csv" );
	res.status( 200 ).send( csv );
	res.end();

};

//
// Perform a direct upload
//
exports.uploadTopicSubs = async ( req, res, next ) => {
	
	// Ensure the user is authorized and get the topicId
	let topicDetails = await isAuthorizedToDownload( req, "list-upload");

	if ( !topicDetails ) {
		res.json( { statusCode: 401, nal: 1 } );
		res.end()
		return;
	}

	// Get the post URL and remove the ending "-upload"
	let url = req.originalUrl;
	url = await url.substring( 0, url.length - 7 );
	
	res.status( 200 ).send( await getFormToUploadList( topicDetails.topicId, url ) );
	res.end();
};

//
// Upload 50k list to aws s3
// 
exports.getTopicOver50kSubs = async ( req, res, next ) => {
	
	// Ensure the user is authorized and get the topicId
	let topicDetails = await isAuthorizedToDownload( req, "list50k"),
		currDate = new Date();

	if ( !topicDetails ) {
		res.json( { statusCode: 401, nal: 1 } );
		res.end()
		return;
	}

	// Get the template ID passed in parameter
	const body = req.body || {},
		nTemplateID = body.notifyTmplId;

	// Validation of input
	if( !body || !nTemplateID || nTemplateID.length < 30 ) {
		res.json( { statusCode: 404, err: "missing parameter" } );
		res.end()
		return 
	}
	
	let topicId = topicDetails.topicId;

	// Get CSV
	const { csv, count } = await getConfirmedSubscriberAsCSV( topicId );

	// Upload to AWS
	const s3 = new AWS.S3({
		accessKeyId: _AWS_ACCESS_KEY,
		secretAccessKey: _AWS_SECRET_ACCESS_KEY
	});

	let filenameUpload = ( topicDetails.nServiceId || "test" ) + "_" + nTemplateID + "_" + currDate.toISOString() + '.csv';

	const s3Params = {
		Bucket: _AWS_BUCKET,
		Key: filenameUpload,
		Body: csv
	};

	s3.upload(s3Params, function(s3Err, data) {
		if ( s3Err ) {
			console.log( s3Err );
			return;
		}

		//
		// Send confirmation email
		//
		let cdsNotifyClient = new NotifyClient( process.env.CDS_NOTIFY_END_POINT, process.env.CDS_NOTIFY_KEY );
		let email_to = JSON.parse( process.env.CDS_NOTIFY_SEND_EMAIL_TO || "[]" );
		email_to.forEach( ( emailGOC ) => {
			cdsNotifyClient.sendEmail( process.env.CDS_NOTIFY_TEMPLATE_ID, emailGOC,
				{
					personalisation: { file: filenameUpload },
					reference: "x-notify-50k"
				})
				.catch( ( e ) => {
					console.log( "getTopicOver50kSubs: x-notify-50k: " + emailGOC );
					console.log( e );
				});
		});
		
		res.status( 200 ).send( '<!DOCTYPE html>\n' +
			'<html lang="en">\n' +
			'<head>\n' +
			'<title>Download subscriber for:' + topicId + '</title>\n' +
			'</head>\n' +
			'<body>\n' +
			'	<h1>Download subscriber</h1>\n' +
			'	<p>For: <strong>' + topicId + '</strong> as from <em>' + currDate.toString() + '</em></p>\n' +
			'	<p>Filename uploaded: ' + filenameUpload + '</p>\n' +
			'	<p>Note: An email was directly sent to CDS about your request. Please contact them to pursue your request.</p>\n' +
			'</body>\n' +
			'</html>' 
		);
		res.end();
	})
	
	
};

//
// Get stats for a topic - Cumulative numbers of confirmed and unconfirmed email addresses
//
// @return; a simple page with the stats 
//
exports.getTopicStats = async ( req, res, next ) => {
	
	// Params: topicId
	const { topicId } = req.params,
		currDate = new Date(),
		task = "stats";
		
	let nbConfirmed, nbUnconfirmed;

	// Get numbers
	nbConfirmed = await getNumberConfirmed( topicId );
	nbUnconfirmed = await dbConn.collection( "subsUnconfirmed" ).countDocuments(
		{
			topicId: topicId
		}
	);
	
	// Return the data
	res.status( 200 ).send( '<!DOCTYPE html>\n' +
		'<html lang="en">\n' +
		'<head>\n' +
		'<title>Cumulative subscription</title>\n' +
		'</head>\n' +
		'<body>\n' +
		'	<h1>Cumulative subscription</h1>\n' +
		'	<p>For: <strong>' + topicId + '</strong> as from <em>' + currDate.toString() + '</em></p>\n' +
		'	<dl>\n' +
		'		<dt>Confirmed</dt>\n' +   
		'		<dd>' + ( nbConfirmed || 'N/A' ) +'<dd>\n' +
		'		<dt>Awaiting email confirmation</dt>\n' +   
		'		<dd>' + ( nbUnconfirmed || 'N/A' ) +'<dd>\n' +
		'	</dl>\n' +
		'</body>\n' +
		'</html>' 
	);
	res.end();
}


//
// Get numbers of confirmed user for a given topic
//
getNumberConfirmed = async ( topicId, options ) => {

	options = options || {};

	return await dbConn.collection( "subsConfirmed" ).countDocuments(
		{
			topicId: topicId
		},
		options
	);
};

//
// is Auth to download
//
isAuthorizedToDownload = async( req, task ) => {
	// Params: accessCode, topicId
	const { accessCode, topicId } = req.params,
		currDate = new Date();

	task = task || "unknown";
	
	// Validate the accessCode and logs
	let docTopic = await dbConn.collection( "topics_details" ).findOneAndUpdate(
		{ 
			_id: topicId,
			accessCode: { $in: [ accessCode ] }
		},
		{
			$currentDate: { 
				lastUpdated: true
			}
		}
	)

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
	
		return false;
	}

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
	
	return {
		topicId: topicId,
		nServiceId: docTopic.value.nServiceId || false
	};
};

//
// get List as CSV format
//
getConfirmedSubscriberAsCSV = async ( topicId ) => {

	// Get all the emails for the given topic
	let docs = await dbConn.collection( "subsConfirmed" ).find(
		{
			topicId: topicId
		},
		{
			projection: {
				_id: 1,
				email: 1,
				subscode: 1
			}
		}
	);

	let csv = '"email address","unsub_link"\r\n';
	let docsItems = await docs.toArray();
	
	// create CSV rows
	let i, i_len = docsItems.length, i_cache, cached_code;
	for( i = 0; i !== i_len; i++) {
		i_cache = docsItems[ i ];
		
		// To support deprecated query where the email was included in the URL, the subsequent URL can be made permanent after 60 days of it's deployment date
		if ( _convertSubCode && i_cache.subscode.length ) {
			let codeObj = new ObjectId();
			
			dbConn.collection( "subsConfirmed" ).updateOne(
				{
					_id: i_cache._id
				},
				{
					$set: {
						subscode: codeObj
					}
				}
			);
			
			dbConn.collection( "subsConfirmedNewCode" ).insertOne(
				{
					subscode: i_cache.subscode,
					email: i_cache.email,
					newsubscode: codeObj,
					topicId: topicId
				}
			);

			cached_code = codeObj.toHexString();
		} else {
			cached_code = ( i_cache.subscode.length ? i_cache.subscode : i_cache.subscode.toHexString() ); 
		}
		
		csv += '"' + i_cache.email + '","' + _unsubBaseURL + cached_code + "/" + _subsLinkSuffix + '"\r\n';
	}
	
	return {
		csv: csv,
		count: i_len
	};
};

//
// get HTML form to initiate the upload to notify
//
getFormToUploadList = ( topicId, url ) => {

	return '<!DOCTYPE html>\n' +
			'<html lang="en">\n' +
			'<head>\n' +
			'<title>Download subscriber for:' + topicId + '</title>\n' +
			'</head>\n' +
			'<body>\n' +
			'	<h1>Download 50k+ subscriber</h1>\n' +
			'<form action="list" method="post">\n' +
			'	<p>Please provide the <strong>Notify template ID</strong> to use for your mailing.\n' +
			'	<label>Notify Template ID: <input type="text" name="notifyTmplId" /></label>\n' +
			'	<button type="submit">Submit</button>\n' +
			'</form>\n' +
			'</body>\n' +
			'</html>';
}



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
// get all subscriptions for a topic
//
// @return; a CSV text response
//
exports.getAllConfSubs = async (req, res, next) =>{
	let topicId = req.params.topicId,
		currDate = new Date();
	
	// Get the CSV
        const { csv, count } = await getConfirmedSubscriberAsCSV( topicId );
 
	// Initiate a file download
	res.setHeader( "Content-disposition", "attachment; filename=" + topicId + "-" + count + "-" + currDate.getTime() + ".csv" );
	res.set( "Content-Type", "text/csv" );
	res.status( 200 ).send( csv );
	res.end();
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


exports.serveHome = async ( req, res, next ) => {

	// Params: accessCode
	const accessCode = req.params.accessCode;

	var createTemplate = await fsPromises.readFile('views/createTopic.mustache', 'UTF-8');
	var smtpTemplate = await fsPromises.readFile('views/smtpConfig.mustache', 'UTF-8');

	createTemplate = mustache.render(createTemplate,
							{
								accessCode: accessCode,
								smtpConfig: mustache.render(smtpTemplate,
														{
															templateTxt: "Enter Mustache text here",
															templateHtml: "Enter Mustache html here"
														}
											)
							}
	);

	res.status( 200 ).send(createTemplate);
};


exports.createTopic = async ( req, res, next ) => {

	// Params: accessCode
	const accessCode = req.params.accessCode;
	var insertErr;

	await dbConn.collection("topics").insertOne(
		{
			_id: req.body.topicId,
			templateId: req.body.notifyTemplateId,
			notifyKey: req.body.notifyAPIKey,
			confirmURL: req.body.confSubLink,
			unsubURL: req.body.confUnsubLink,
			thankURL: req.body.thankYouUrl,
			failURL: req.body.failureUrl,
			inputErrURL: req.body.inputErrorUrl,
			templateTxt: req.body.templateTxt,
			templateHtml: req.body.templateHtml,
			from: req.body.from,
			to: req.body.to,
			subject: req.body.subject
		}
	).catch( (error) => {
		insertErr = error;
		res.status(200).json({error: error.toString()});
	});

	if(insertErr!==undefined)
		return;

	dbConn.collection("topics_details").insertOne(
		{
			_id: req.body.topicId,
			createdAt: new Date(),
			lastUpdated: new Date(),
			groupName: req.body.groupName,
			description: req.body.description,
			lang: req.body.lang,
			langAlt: req.body.langAlt
		}
	).catch( (error) => {
		insertErr = error;
		res.status(200).json({error: error.toString()});
	});
	
	if(insertErr!==undefined)
		return;

	res.status( 200 ).send( '<!DOCTYPE html>\n' +
		'<html lang="en">\n' +
		'<head>\n' +
		'<title>Topic Management Home</title>\n' +
		'</head>\n' +
		'<body>\n' +
		'	<p>Thank you, topic created successfully.</p>\n' +
		'	<p>\n' +
		'	<form action="/api/v0.1/t-manager/' + accessCode + '/topic" method="get">\n' +
		'		<label for"topicId">Topic Id:</label><br>\n' +	
		'		<input type="text" id="topicId" name="topicId"><br><br>\n' +
		'		<input type="submit" value="GET">\n' +
		'	</form>\n' +
		'</body>\n' +
		'</html>' 
	);
};

exports.getTopic = async ( req, res, next ) => {
	
	// Params: accessCode
	const accessCode = req.params.accessCode;

	let topicId = req.query.topicId;

	let doc = await dbConn.collection( "topics" ).findOne(
		{
			_id: topicId
		}
	).catch((err) => {
		console.log("my error" + err);
		return;
	});

	let topicDetails = await dbConn.collection( "topics_details" ).findOne(
		{
			_id: topicId
		}
	).catch((err) => {
		console.log("my error" + err);
		return;
	});

	if(doc === null){
		res.status( 200 ).send( '<!DOCTYPE html>\n' +
			'<html lang="en">\n' +
			'<head>\n' +
			'	<title>Topic Not Found</title>\n' +
			'</head>\n' +
			'<body>\n' +
			'	Unable to find topic\n' +
			'	<p>\n' +
			'	<form action="/api/v0.1/t-manager/' + accessCode + '/topic" method="get">\n' +
			'		<label for"topicId">Topic Id:</label><br>\n' +	
			'		<input type="text" id="topicId" name="topicId" required><br><br>\n' +
			'		<input type="submit" value="GET">\n' +
			'	</form>\n' +
			'</body>\n' +
			'</html>' 
		);
	}else{
		var topicDetailsTemplate = await fsPromises.readFile('views/topic_details.mustache', 'UTF-8');
		topicDetailsTemplate = mustache.render(topicDetailsTemplate,
							{
								createdAt: topicDetails.createdAt,
								lastUpdated: topicDetails.lastUpdated,
								groupName: topicDetails.groupName,
								description: topicDetails.description,
								lang: topicDetails.lang,
								langAlt: topicDetails.langAlt
							}
		);

		var smtpConfigTemplate = await fsPromises.readFile('views/smtpConfig.mustache', 'UTF-8');
		smtpConfigTemplate = mustache.render(smtpConfigTemplate,
							{
								templateTxt: doc.templateTxt,
								templateHtml: doc.templateHtml,
								emailFrom: doc.from,
								emailTo: doc.to,
								emailSubject: doc.subject
							}
		);

		var html ='<!DOCTYPE html>\n' +
			'<html lang="en">\n' +
			'<head>\n' +
			'<title>Topic Search Result</title>\n' +
			'</head>\n' +
			'<body>\n' +
			'	<form action="/api/v0.1/t-manager/' + accessCode + '/' + topicId + '" method="PUT">\n' +
			'		<h3>Update a Topic</h3><br>\n' +
			'		<label>Topic Id:&nbsp;&nbsp;' + topicId + '</label><br><br>\n' +	
			'		<table>\n' +
			'			<tr><td>\n' +
			'		<label for"notifyAPIKey">Notify API Key:</label><br>\n' +	
			'		<input type="text" id="notifyAPIKey" name="put_notifyAPIKey" value="' + doc.notifyKey + '"><br><br>\n' +
			'		<label for"notifyTemplateId">Notify Template Id:</label><br>\n' +	
			'		<input type="text" id="notifyTemplateId" name="put_notifyTemplateId" value="' + doc.templateId + '"><br><br>\n' +
			'		<label for"confSubLink">Confirmation Subscription Link:</label><br>\n' +	
			'		<input type="text" id="confSubLink" name="put_confSubLink" value="' + doc.confirmURL + '"><br><br>\n' +
			'		<label for"confUnsubLink">Unsubscription Link:</label><br>\n' +	
			'		<input type="text" id="confUnsubLink" name="put_confUnsubLink" value="' + doc.unsubURL + '"><br><br>\n' +
			'		<label for"thankYouUrl">Thank you URL:</label><br>\n' +	
			'		<input type="text" id="thankYouUrl" name="put_thankYouUrl" value="' + doc.thankURL + '"><br><br>\n' +
			'		<label for"failureUrl">Server Error URL:</label><br>\n' +	
			'		<input type="text" id="failureUrl" name="put_failureUrl" value="' + doc.failURL + '"><br><br>\n' +
			'		<label for"inputErrorUrl">Form Error URL:</label><br>\n' +	
			'		<input type="text" id="inputErrorUrl" name="put_inputErrorUrl" value="' + doc.inputErrURL + '"><br><br>\n' +
			'			</td>\n' +
			'			<td>\n' +
			'				<div id="topic_details">' + topicDetailsTemplate + '</div>\n' +
			'			</td>\n' +
			'			<td>\n' +
			'				<div id="smtp_config">' + smtpConfigTemplate + '</div>\n' +
			'			</td>\n' +
			'			</tr>\n' +
			'		</table>\n' + 
			'		<br>\n' +
			'		<div>\n' +
			'			<button name="update_topic">Modify</button>\n' +
			'		</div>\n' +
			'	</form>\n' +
			'	<br/><br/><p>\n' +
			'	<form action="/api/v0.1/t-manager/' + accessCode + '/' + topicId + '" method="DELETE">\n' +
			'		<h3>Delete a Topic</h3><br/>\n' +
			'		Delete the above topic entirely<br><br>\n' +
			'		<button name="delete_topic">Delete</button>\n' +		
				'</form>\n' +
				'<script>\n' +
				'	\n' +   		
				'	var putMethod = ( event ) => {\n' +
				'		// Prevent redirection of Form Click\n' +
				'		event.preventDefault();\n' +
				'		var target = event.target;\n' +
				'		while ( target.tagName != "FORM" ) {\n' +
				'			target = target.parentElement;\n' +
				'		} // Find the FORM tag\n' +
				'		\n' +
				'		// Get the destination URL from FORM tag\n' +
				'		var url = target.getAttribute( "action" );\n' +
				'		\n' +
				'		// Collect Form Data from prefix "put_" on name attribute\n' +
				'		var bodyForm = target.querySelectorAll( "[name^=put_]");\n' +
				'		var body = {};\n' +
				'		bodyForm.forEach( element => {\n' +
				'				// I used split to separate prefix from worth name attribute\n' +
				'				var nameArray = element.getAttribute( "name" ).split( "_" );\n' +
				'				var name = nameArray[ nameArray.length - 1 ];\n' +
				'				\n' +
				'				// all elements with name="put_*" has value registered in body object\n' +
				'				body[ name ] = element.value;\n' +
				'			}\n' +
				'		);\n' +
				'		var xhr = new XMLHttpRequest();\n' +
				'		xhr.open( "PUT", url );\n' +
				'		xhr.setRequestHeader( "Content-Type", "application/json" );\n' +
				'		xhr.onload = () => {\n' +
				'			if ( xhr.status === 200 ) {\n' +
				'				var assignUrl = location.href.replace("topic?topicId=","").concat("/modSuccess");\n' +
				'				location.assign(assignUrl);\n' +
				'			} else {\n' +
				'				console.log( xhr.status, xhr.responseText );\n' +
				'			}\n' +
				'		}\n' +
				'		xhr.send(JSON.stringify(body));\n' +
				'	}\n' +
				'	\n' +
				'	var deleteMethod = ( event ) => {\n' +
				'		event.preventDefault();\n' +
				'		var confirm = window.confirm( "Are you sure you want to permantly delete this topic?" );\n' +
				'		if ( confirm ) {\n' +
				'			var target = event.target;\n' +
				'			while ( target.tagName != "FORM" ) {\n' +
				'				target = target.parentElement;\n' +
				'			}\n' +
				'		}\n' +
				'		var url = target.getAttribute( "action" );\n' +
				'		var xhr = new XMLHttpRequest();\n' +
				'		xhr.open( "DELETE", url );\n' +
				'		xhr.setRequestHeader( "Content-Type", "application/json" );\n' +
				'		xhr.onload = () => {\n' +
				'			if ( xhr.status === 200 ) {\n' +
				'				location.assign(url.concat("/deleteSuccess"));\n' +
			        '			} else {\n' +
				'				console.log( xhr.status, xhr.responseText );\n' +
				'			}\n' +
				'		}\n' +
				'		xhr.send();\n' +
				'	}\n\n' +
				'	document.querySelectorAll( "[name=update_topic], [name=delete_topic]" ).forEach( element => {\n' +
				'		var button = element;\n' +
				'		var form = element;\n' +
				'		while ( form.tagName != "FORM" ) {\n' +
				'			form = form.parentElement;\n' +
				'		}\n' +
				'		var method = form.getAttribute( "method" );\n' +
				'		if ( method == "PUT" ) {\n' +
				'			button.addEventListener( "click", putMethod );\n' +
				'		}else if( method ==  "DELETE"){\n' +
				'			button.addEventListener( "click", deleteMethod);\n' +
				'		}\n' +
			  	'	} );\n' +
				'	\n' +
				'</script>\n' +
			'</body>\n' +
			'</html>' ;
		res.status( 200 ).send(html);
	}

	res.end();
};

exports.modifyTopic = async ( req, res, next ) => {
	
	// Params: accessCode
	const accessCode = req.params.accessCode;

	let topicId = req.params.topicId,
	    	body = req.body;

	dbConn.collection("topics").findOneAndUpdate(
		{
			_id: topicId
		},
		{
			$set: {
				templateId: body.notifyTemplateId,
				notifyKey: body.notifyAPIKey,
				confirmURL: body.confSubLink,
				unsubURL: body.confUnsubLink,
				thankURL: body.thankYouUrl,
				failURL: body.failureUrl,
				inputErrURL: body.inputErrorUrl,	
				templateTxt: body.templateTxt,
				templateHtml: body.templateHtml,
				from: body.from,
				to: body.to,
				subject: body.subject
			}
		}
	).catch( (error) => {
		console.log(error);
	});
	
	dbConn.collection("topics_details").findOneAndUpdate(
		{
			_id: topicId
		},
		{
			$set: {
				groupName: body.groupName,
				description: body.description,
				lang: body.lang,
				langAlt: body.langAlt,
			},
			$currentDate: { 
				lastUpdated: true
			}
		}
	).catch( (error) => {
		console.log(error);
	});

	res.status( 200 ).send();
	res.end();
	
};

exports.showModSuccess = ( req, res, next ) => {

	// Params: accessCode
	const accessCode = req.params.accessCode;

	res.status( 200 ).send( '<!DOCTYPE html>\n' +
		'<html lang="en">\n' +
		'<head>\n' +
		'<title>Topic Management Home</title>\n' +
		'</head>\n' +
		'<body>\n' +
		'	<p>Thank you, ' + ' topic properties updated successfully.</p>\n' +
		'	<p>\n' +
		'	<form action="/api/v0.1/t-manager/' + accessCode + '/topic" method="get">\n' +
		'		<label for"topicId">Topic Id:</label><br>\n' +	
		'		<input type="text" id="topicId" name="topicId" required><br><br>\n' +
		'		<input type="submit" value="GET">\n' +
		'	</form>\n' +
		'</body>\n' +
		'</html>' 
	);
}

exports.showDeleteSuccess = ( req, res, next ) => {

	// Params: accessCode
	const accessCode = req.params.accessCode;

	res.status( 200 ).send( '<!DOCTYPE html>\n' +
		'<html lang="en">\n' +
		'<head>\n' +
		'<title>Topic Management Home</title>\n' +
		'</head>\n' +
		'<body>\n' +
		'	<p>Topic successfully deleted.</p>\n' +
		'	<p>\n' +
		'	<form action="/api/v0.1/t-manager/' + accessCode + '/topic" method="get">\n' +
		'		<label for"topicId">Topic Id:</label><br>\n' +	
		'		<input type="text" id="topicId" name="topicId" required><br><br>\n' +
		'		<input type="submit" value="GET">\n' +
		'	</form>\n' +
		'</body>\n' +
		'</html>' 
	);
}

exports.deleteTopic = async ( req, res, next ) => {
	// Params: accessCode
	const accessCode = req.params.accessCode;

	let topicId = req.params.topicId;

	dbConn.collection("topics").findOneAndDelete(
		{
			_id: topicId
		}
	).catch( (error) => {
		console.log(error);
	});
	
	dbConn.collection("topics_details").findOneAndDelete(
		{
			_id: topicId
		}
	).catch( (error) => {
		console.log(error);
	});
	
	res.status( 200 ).send();
	res.end();
	
};
