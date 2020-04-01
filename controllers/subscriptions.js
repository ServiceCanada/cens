/*==========================
 * Subscriptions
 *
 * @description: Managing the client subscription to be notified about a given topic
 * @author: Government of Canada; @duboisp
 * @version: 0.1
 ===========================*/

const NotifyClient = require('notifications-node-client').NotifyClient; // https://docs.notifications.service.gov.uk/node.html#node-js-client-documentation

const dbConn = module.parent.exports.dbConn;

const processEnv = process.env,
	_devLog = !!!processEnv.prodNoLog,
	_keySalt = processEnv.keySalt || 5417,
	_validHosts = processEnv.validHosts || ["localhost:8080"],
	_errorPage = processEnv.errorPage || "https://canada.ca",
	_successJSO = processEnv.successJSO || { statusCode: 200, ok: 1 },
	_cErrorsJSO = processEnv.cErrorsJSO ||  { statusCode: 400, bad: 1, msg: "Bad request" },
	_sErrorsJSO = processEnv.sErrorsJSO ||  { statusCode: 500, err: 1 },
	_notifyEndPoint = processEnv.notifyEndPoint ||  "https://api.notification.alpha.canada.ca",
	_confirmBaseURL = processEnv.confirmBaseURL ||  "https://apps.canada.ca/x-notify/subs/confirm/",
	_nbMinutesBF = processEnv.notSendBefore || 25, // Default of 25 minutes.
	_bypassSubscode = processEnv.subscode,
	_topicCacheLimit = processEnv.topicCacheLimit || 50,
	_notifyCacheLimit = processEnv.notifyCacheLimit || 40,
	_flushAccessCode = processEnv.flushAccessCode,
	_flushAccessCode2 = processEnv.flushAccessCode2;

let notifyCached = [],
	notifyCachedIndexes = [],
	topicCached = [],
	topicCachedIndexes = [];

//
// Get or generate key
//
// @return; a JSON Object containing valid key 
//
exports.getKey = async ( req, res, next ) => {
	
	let currDate = new Date.now();
	currDate = currDate + (24 * 60 * 60 * 1000);

	const clefBuff = new Buffer(_keySalt + "" + currDate);
	
	res.json( { authKey: clefBuff.toString('base64') } );
};


//
// Add email to the newSubscriberEmail
//
// @return; a JSON response 
//
exports.addEmail = async ( req, res, next ) => {
	
	const reqbody = req.body,
		email = reqbody.eml || "",
		topicId = reqbody.tid,
		currDate = new Date();

	// Validate if email is the good format (something@something.tld)
	if ( !email.match( /.+\@.+\..+/ ) || !topicId ) {
		console.log( "addEmail: bad email: " + email );
		res.json( _cErrorsJSO );
		return;
	}
	
	// Get the topic
	const topic = await getTopic( topicId );
	
	try {
		
		// No topic = no good
		if ( !topic ) {
			console.log( "addEmail: no topic: " + topicId );
			res.json( _sErrorsJSO );
			return true;
		}

		// Check if the email is in the "SubsExist"
		await dbConn.collection( "subsExist" ).insertOne( 
			{
				e: email,
				t: topicId
			}).then( () => {

				// The email is not subscribed for that topic
				// Generate an simple Unique Code
				const confirmCode = _bypassSubscode || (Math.floor(Math.random() * 999999) + "" + currDate.getMilliseconds()),
					tId = topic.templateId,
					nKey = topic.notifyKey;
				
				// Insert in subsToConfirm
				dbConn.collection( "subsUnconfirmed" ).insertOne( {
					email: email,
					subscode: confirmCode,
					topicId: topicId,
					notBefore: currDate.setMinutes( currDate.getMinutes() + _nbMinutesBF ),
					createAt: currDate,
					tId: tId,
					nKey: nKey,
					cURL: topic.confirmURL
				}) catch ( e ) { 
					console.log( "addEmail: subsUnconfirmed" );
					console.log( e );
				}

				// Send confirm email - async
				sendNotifyConfirmEmail( email, confirmCode, tId, nKey );
				
				res.json( _successJSO );
			}).catch( ( ) => {
			
				// The email was either subscribed-pending or subscribed confirmed
				resendEmailNotify( email, topicId, currDate );
				res.json( _successJSO );
			});

	} catch ( e ) { 

		console.log( "addEmail" );
		console.log( e );
		// Topic requested don't exist
		res.json( _sErrorsJSO );
	}


};





//
// Add email to the newSubscriberEmail
//
// @return; a HTTP redirection 
//
exports.addEmailPOST = async ( req, res, next ) => {
	
	const reqbody = req.body,
		email = reqbody.eml || "",
		topicId = reqbody.tid,
		key = reqbody.auke || "",
		host = req.headers.host,
		currDate = new Date(),
		currEpoc = Date.now(); 

	let keyBuffer = new Buffer(key, 'base64'),
		keyDecrypt = keyBuffer.toString('ascii');
	
	keyDecrypt = keyDecrypt.substring( _keySalt.length );
		
	// If no data, key not matching or referer not part of whitelist, then not worth going further
	if ( !reqbody || _validHosts.indexOf(host) !== -1 || keyDecrypt > currEpoc ) {

		console.log( "addEmailPOST: noauth" );
		console.log( e );
		res.redirect( _errorPage );
		return true;
	}
	
	// Get the topic
	const topic = await getTopic( topicId );
	
	try {
		
		// No topic = no good
		if ( !topic || !topic.inputErrURL || !topic.thankURL || !topic.failURL ) {
		
			console.log( "addEmailPOST: no topic" );
			console.log( e );
			res.redirect( _errorPage );
			return true;
		}
		
		// Validate if email is the good format (something@something.tld)
		if ( !email.match( /.+\@.+\..+/ ) ) {
			res.redirect( topic.inputErrURL );
			return;
		}
		
		// Check if the email is in the "SubsExist"
		await dbConn.collection( "subsExist" ).insertOne( 
			{
				e: email,
				t: topicId
			}).then( () => {

				// The email is not subscribed for that topic
				// Generate an simple Unique Code
				const confirmCode = _bypassSubscode || (Math.floor(Math.random() * 999999) + "" + currDate.getMilliseconds()),
					tId = topic.templateId,
					nKey = topic.notifyKey;
				
				// Insert in subsToConfirm
				dbConn.collection( "subsUnconfirmed" ).insertOne( {
					email: email,
					subscode: confirmCode,
					topicId: topicId,
					notBefore: currDate.setMinutes( currDate.getMinutes() + _nbMinutesBF ),
					createAt: currDate,
					tId: tId,
					nKey: nKey,
					cURL: topic.confirmURL
				});

				// Send confirm email - async
				sendNotifyConfirmEmail( email, confirmCode, tId, nKey );
				
				res.redirect( topic.thankURL );
			}).catch( () => {
			
				// The email was either subscribed-pending or subscribed confirmed
				resendEmailNotify( email, topicId, currDate );

				res.redirect( topic.thankURL );
			});

	} catch ( e ) { 

		console.log( "addEmailPOST" );
		console.log( e );

		res.redirect( topic.failURL );
	}

};

//
// Confirm subscription email
//
// @return; a HTTP redirection
//
exports.confirmEmail = ( req, res, next ) => {

	// Request param: email, confirmCode
	const { subscode, email } = req.params,
		currDate = new Date();
	
	// TODO: validate parameters.

	dbConn.collection( "subsUnconfirmed" )
		.findOneAndDelete( { email: email, subscode: subscode } )
		.then( async ( docSubs ) => {

			const docValue = docSubs.value,
				topicId = docValue.topicId;
			
			// move into confirmed list
			await dbConn.collection( "subsConfirmed" ).insertOne( {
				email: email,
				subscode: subscode,
				topicId: topicId
			});

			// subs_logs entry - this can be async
			_devLog && dbConn.collection( "subs_logs" ).updateOne( 
				{ _id: email },
				{
					$setOnInsert: {
						_id: email,
						createdAt: currDate
					},
					$push: {
						confirmEmail: {
							createdAt: currDate,
							topicId: topicId,
							subscode: subscode
						},
						subsEmail: {
							createdAt: docValue.createAt,
							topicId: topicId,
							subscode: subscode
						}
					},
					$currentDate: { 
						lastUpdated: true
					}
				},
				{ upsert: true }
			).catch( (e) => {
				console.log( "confirmEmail: subs_logs" );
				console.log( e );
			});
			
			// Redirect to Generic page to confirm the email is removed
			res.redirect( docValue.cURL );

		})
		.catch( ( e ) => {
			console.log( "confirmEmail: subsUnconfirmed" );
			console.log( e );
			res.redirect( _errorPage );
		});
};


//
// Remove subscription email
//
// @return; a HTTP redirection
//
exports.removeEmail = ( req, res, next ) => {

	// Request param: email, confirmCode
	const { subscode, email } = req.params,
		currDate = new Date();
	
	// findOneAndDeleted in subsConfirmedEmail document
	dbConn.collection( "subsConfirmed" )
		.findOneAndDelete( { email: email, subscode: subscode } )
		.then( async ( docSubs ) => {
			
			
			const topicId = docSubs.value.topicId;
			const topic = await getTopic( topicId );

			if ( !topic ) {
				console.log( "removeEmail: notopic" );
				console.log( e );
				res.redirect( _errorPage );
				return true;
			}
			
			const unsubLink =  topic.unsubURL;
			
			// subs_logs entry - this can be async
			_devLog && dbConn.collection( "subs_logs" ).updateOne( 
				{ _id: email },
				{
					$push: {
						unsubsEmail: {
							createdAt: currDate,
							topicId: topicId,
							subscode: subscode
						}
					},
					$currentDate: { 
						lastUpdated: true
					}
				}
			).catch( (e) => {
				console.log( "removeEmail: subs_logs" );
				console.log( e );
			});
			
			// Create entry in unsubs
			dbConn.collection( "subsUnsubs" ).insertOne( 
			{
				c: currDate,
				e: email,
				t: topicId
			});
			
			// Remove from subsExits
			await dbConn.collection( "subsExist" ).findOneAndDelete( 
				{
					e:email,
					t: topicId
				}).then( ( ) => {
					
					// Redirect to Generic page to confirm the email is removed
					res.redirect( unsubLink );

				}).catch( ( e ) => {
					console.log( "removeEmail: subsExist" );
					console.log( e );
					res.redirect( _errorPage );
				});
			
		} ).catch( ( e ) => {
			console.log( "removeEmail: subsConfirmed" );
			console.log( e );
			res.redirect( _errorPage );
		});
};

//
// Get all subscription associated to the email|phone
//
exports.getAll = (confirmCode, email, phone) => {

};



//
// Flush the topic and notify cache
//
// @return; an HTML blob
//
exports.flushCache = ( req, res, next ) => {
	
	const { accessCode, topicId } = req.params;
	
	if ( accessCode !== _flushAccessCode || topicId !== _flushAccessCode2 ||
		!_flushAccessCode || !_flushAccessCode2 ) {
		
		console.log( "flushCache: noauth" );
		res.json( _sErrorsJSO );
	}
	
	// Flush topic
	topicCachedIndexes = [];
	topicCached = [];
	
	// Flush notify client
	notifyCachedIndexes = [];
	notifyCached = [];
	
	// Return success
	console.log( "flushCache: success" );
	res.json( _successJSO );

};

//
// Resend email notify
//
resendEmailNotify = ( email, topicId, currDate ) => {
	
	// Find email in 
	return dbConn.collection( "subsUnconfirmed" )
		.findOneAndUpdate( 
			{ topicId: topicId, email: email, notBefore: { $lt: currDate.getTime() } },
			{
				$set: {
					notBefore: currDate.setMinutes( currDate.getMinutes() + _nbMinutesBF )
				}
			}
		).then( async ( docSubs ) => {
			
			const docValue = docSubs.value;
			
			// subs_logs entry - this can be async
			_devLog && dbConn.collection( "subs_logs" ).updateOne( 
				{ _id: email },
				{
					$setOnInsert: {
						_id: email,
						createdAt: currDate
					},
					$push: {
						resendEmail: {
							createdAt: currDate,
							topicId: topicId,
							withEmail: docValue ? true : false
						}
					},
					$currentDate: { 
						lastUpdated: true
					}
				},
				{ upsert: true }
			).catch( (e) => {
				console.log( "resendEmailNotify: subs_logs" );
				console.log( e );
			});

			await docValue && sendNotifyConfirmEmail( email, docValue.subscode, docValue.tId, docValue.nKey );

			
		})
		.catch( (e) => {
			console.log( "resendEmailNotify: subsUnconfirmed" );
			console.log( e );
		});

}

//
// Send an email through Notify API
//
sendNotifyConfirmEmail = async ( email, confirmCode, templateId, NotifyKey ) => {
	
	if ( !NotifyKey || !templateId || !email || !confirmCode ) {
		return true;
	}
	
	// There is 1 personalisation, the confirm links
	// /subs/confirm/:subscode/:email

	let notifyClient = notifyCached[ NotifyKey ];

	
	if ( !notifyClient ) {
		notifyClient = new NotifyClient( _notifyEndPoint, NotifyKey );
		notifyCached[ NotifyKey ] = notifyClient;
		notifyCachedIndexes.push( NotifyKey );
		
		// Limit the cache to the last x instance of Notify
		if ( notifyCachedIndexes.length > _notifyCacheLimit ) {
			delete notifyCached[ notifyCachedIndexes.shift() ];
		}

	}
	
	!_bypassSubscode && notifyClient.sendEmail( templateId, email, 
		{
			personalisation: { confirm_link: _confirmBaseURL + confirmCode + "/" + email },
			reference: "x-notify_subs_confirm"
		})
		.catch( ( e ) => {
			// Log the Notify errors

			const currDate = new Date();

			// notify_logs entry - this can be async
			dbConn.collection( "notify_logs" ).updateOne( 
				{ _id: templateId },
				{
					$setOnInsert: {
						_id: templateId,
						createdAt: currDate
					},
					$push: {
						errLogs: {
							createdAt: currDate,
							e: e
						}
					},
					$currentDate: { 
						lastUpdated: true
					}
				},
				{ upsert: true }
			).catch( (e2) => {
				console.log( "sendNotifyConfirmEmail: notify_logs" );
				console.log( e2 );
			});

			// TODO: evaluate if we need to trigger something else
			
			console.log( "sendNotifyConfirmEmail: sendEmail" );
			console.log( e );
		});
}

//
// Get topic info
//

// Get the topic
getTopic = ( topicId ) => {

	let topic = topicCached[ topicId ];
	
	if ( !topic ) {
		
		topic = dbConn.collection( "topics" ).findOne( 
			{ _id: topicId },
			{ projection: {
					_id: 1,
					templateId: 1,
					notifyKey: 1,
					confirmURL: 1,
					unsubURL: 1,
					thankURL: 1,
					failURL: 1,
					inputErrURL: 1
				} 
			} ).catch( (e) => {
				console.log( "getTopic" );
				console.log( e );
				return false;
			});

		topicCached[ topicId ] = topic;
		topicCachedIndexes.push( topicId );
		
		// Limit the cache to the last x topics
		if ( topicCachedIndexes.length > _topicCacheLimit ) {
			delete topicCached[ topicCachedIndexes.shift() ];
		}
	
	}
	
	return topic;
		
}



// Test add form
//
// prompt users with a form
//
// @return; an HTML blob
//
exports.testAdd = ( req, res, next ) => {

	// You must run the getKey function if key is outdated or inexistent
	const key = keyCached;

	res.status( 200 ).send( '<!DOCTYPE html>\n' +
		'<html lang="en">\n' +
		'<head>\n' +
		'<title>Bulk action emails</title>\n' +
		'</head>\n' +
		'<body>\n' +
		'	<form action="/subs/post" method="post">\n' +
		'		<label>Email: <input type="email" name="eml" /></label><br>\n' +
		'		<label>Topic: <input type="text" name="tid" /></label><br>\n' +
		'		<input type="hidden" name="auke" value="' + key + '">\n' +
		'		<input type="submit" value="Add">\n' +
		'	</form>\n' +
		'</body>\n' +
		'</html>' 
	);
};
