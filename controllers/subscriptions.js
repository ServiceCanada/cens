/*==========================
 * Subscriptions
 *
 * @description: Managing the client subscription to be notified about a given topic
 * @author: Government of Canada; @duboisp
 * @version: 0.1
 ===========================*/

const NotifyClient = require('notifications-node-client').NotifyClient; // https://docs.notifications.service.gov.uk/node.html#node-js-client-documentation

const entities = require("entities");

const dbConn = module.parent.exports.dbConn;
const ObjectId = require('mongodb').ObjectId;

const processEnv = process.env,
	_devLog = !!!processEnv.prodNoLog,
	_keySalt = processEnv.keySalt || "5417",
	_validHosts = JSON.parse(processEnv.validHosts || '["localhost:8080"]'),
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
	_flushAccessCode2 = processEnv.flushAccessCode2,
	_notifyUsTimeLimit = processEnv.notifyUsTimeLimit || 180000;

let notifyCached = [],
	notifyCachedIndexes = [],
	topicCached = [],
	topicCachedIndexes = [],
	fakeSubsIncrement = 0,
	_notifyUsNotBeforeTimeLimit = 0;
	
//
// Get key
//
// @return; a JSON containing valid key 
//
exports.getKey = ( req, res, next ) => {
	
	res.json( generateKey() );
};

//
// Generate key
//
// @return; a JSO containing valid key 
//
generateKey = () => {
	let currDate = Date.now();
	currDate = currDate + (24 * 60 * 60 * 1000);

	const clefBuff = new Buffer(_keySalt + "" + currDate);
	keyK = clefBuff.toString('base64');
	return { authKey: clefBuff.toString('base64') };
}


//
// Add email to the newSubscriberEmail
//
// @return; a JSON response 
//
exports.addEmail = async ( req, res, next ) => {
	
	const reqbody = req.body,
		topicId = reqbody.tid,
		currDate = new Date();
	let email = reqbody.eml || "";

	// Validate if email is the good format (something@something.tld)
	if ( !email.match( /.+\@.+\..+/ ) || !topicId ) {
		console.log( "addEmail: bad email: " + email );
		res.json( _cErrorsJSO );
		return;
	}

	// URL Decrypt the email. It is double encoded like: "&amp;#39;" should be "&#39;" which should be "'"
	email = await entities.decodeXML( await entities.decodeXML( email ) );

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
			}).then( async ( docSExist ) => {

				// The email is not subscribed for that topic
				// Generate an simple Unique Code
				const confirmCode = docSExist.insertedId,
					tId = topic.templateId,
					nKey = topic.notifyKey;
				
				// Insert in subsToConfirm
				await dbConn.collection( "subsUnconfirmed" ).insertOne( {
					email: email,
					subscode: confirmCode,
					topicId: topicId,
					notBefore: currDate.setMinutes( currDate.getMinutes() + _nbMinutesBF ),
					createAt: currDate,
					tId: tId,
					nKey: nKey,
					cURL: topic.confirmURL
				}).catch( ( e ) => { 
					console.log( "addEmail: subsUnconfirmed" );
					console.log( e );
				});

				// Send confirm email - async
				sendNotifyConfirmEmail( email, confirmCode.toHexString(), tId, nKey );
				
				if ( _bypassSubscode ) {
					res.subscode = confirmCode.toHexString();
				}
				
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
		topicId = reqbody.tid,
		key = reqbody.auke || "",
		host = req.headers.host,
		currDate = new Date(),
		currEpoc = Date.now(); 
	let email = reqbody.eml || "";

	let keyBuffer = new Buffer(key, 'base64'),
		keyDecrypt = keyBuffer.toString('ascii');
	
	keyDecrypt = keyDecrypt.substring( _keySalt.length );

	// If no data, key not matching or referer not part of whitelist, then not worth going further
	// _validHost need to be changed for "validReferer" || _validHosts.indexOf(host) === -1 
	if ( !reqbody || keyDecrypt < currEpoc ) {

		console.log( "addEmailPOST: noauth " + key + " " + host);
		res.redirect( _errorPage );
		return true;
	}
	
	// Get the topic
	const topic = await getTopic( topicId );
	
	try {
		
		// No topic = no good
		if ( !topic || !topic.inputErrURL || !topic.thankURL || !topic.failURL ) {
			console.log( "addEmailPOST: no topic" );
			res.redirect( _errorPage );
			return true;
		}
		
		// Validate if email is the good format (something@something.tld)
		if ( !email.match( /.+\@.+\..+/ ) ) {
			res.redirect( topic.inputErrURL );
			return;
		}

		// URL Decrypt the email. It is double encoded like: "&amp;#39;" should be "&#39;" which should be "'"
		email = await entities.decodeXML( await entities.decodeXML( email ) );

		// Check if the email is in the "SubsExist"
		await dbConn.collection( "subsExist" ).insertOne( 
			{
				e: email,
				t: topicId
			}).then( async ( docSExist ) => {

				// The email is not subscribed for that topic
				// Generate an simple Unique Code
				const confirmCode = docSExist.insertedId,
					tId = topic.templateId,
					nKey = topic.notifyKey;
				
				// Insert in subsToConfirm
				await dbConn.collection( "subsUnconfirmed" ).insertOne( {
					email: email,
					subscode: confirmCode,
					topicId: topicId,
					notBefore: currDate.setMinutes( currDate.getMinutes() + _nbMinutesBF ),
					createAt: currDate,
					tId: tId,
					nKey: nKey,
					cURL: topic.confirmURL
				}).catch( ( e ) => { 
					console.log( "addEmailPOST: subsUnconfirmed" );
					console.log( e );
				});

				// Send confirm email - async
				sendNotifyConfirmEmail( email, confirmCode.toHexString(), tId, nKey );
				
				if ( _bypassSubscode ) {
					res.subscode = confirmCode.toHexString();
				}

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
	let { subscode, emlParam } = req.params,
		currDate = new Date();
	
	let findQuery = { subscode: subscode };
	
	// If no email, ensure the subscode if longer than 9 character
	// (conditional to support deprecated query where the email was included in the URL, can be removed after 60 days of it's deployment date)
	if ( emlParam && subscode.length < 10 ) {
		findQuery.email = emlParam;
		subscode = new ObjectId();
	} else {
		subscode = ObjectId( subscode );
		findQuery.subscode = subscode;
	}

	dbConn.collection( "subsUnconfirmed" )
		.findOneAndDelete( findQuery )
		.then( async ( docSubs ) => {

			const docValue = docSubs.value;
			
			if ( !docValue ) {
				res.redirect( await getRedirectForRecents( findQuery, true ) || _errorPage );
				return;
			}
			
			const topicId = docValue.topicId,
				email = docValue.email;
			
			// move into confirmed list
			await dbConn.collection( "subsConfirmed" ).insertOne( {
				email: email,
				subscode: subscode,
				topicId: topicId
			});
			
			// Be aware for a TTL 7 days, if user click again.
			dbConn.collection( "subsRecents" ).findOneAndUpdate( {
					subscode: subscode
				}, {
					$set: {
						created: currDate,
						email: email,
						subscode: subscode,
						topicId: topicId
					}
				}, { upsert: true });

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
	let { subscode, emlParam } = req.params,
		currDate = new Date();
	
		
	let findQuery = { subscode: subscode };
	
	// If no email, ensure the subscode if longer than 9 character
	// (conditional to support deprecated query where the email was included in the URL, can be removed after 60 days of it's deployment date)
	if ( emlParam && subscode.length < 10 ) {
		findQuery.email = emlParam;
	} else {
		subscode = ObjectId( subscode );
		findQuery.subscode = subscode;
	}
	
	// findOneAndDeleted in subsConfirmedEmail document
	dbConn.collection( "subsConfirmed" )
		.findOneAndDelete( findQuery )
		.then( async ( docSubs ) => {

			let docValue = docSubs.value;

			// Try if that code was converted
			// To support deprecated query where the email was included in the URL, the subsequent URL can be made permanent after 60 days of it's deployment date
			if ( !docValue && findQuery.email ) {
				docNewSubs = await dbConn.collection( "subsConfirmedNewCode" ).findOneAndDelete( findQuery );
				if ( !docNewSubs.value ) {
					res.redirect( await getRedirectForRecents( findQuery ) || _errorPage );
					return;
				}
				findQuery.subscode = docNewSubs.value.newsubscode;
				docSubsConf = await dbConn.collection( "subsConfirmed" ).findOneAndDelete( findQuery );
				docValue = docNewSubs.value;
			}
			
			if ( !docValue ) {
				res.redirect( await getRedirectForRecents( findQuery ) || _errorPage );
				return;
			}
			
			const topicId = docValue.topicId,
				email = docValue.email,
				topic = await getTopic( topicId );

			if ( !topic ) {
				console.log( "removeEmail: notopic" );
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
					
					
					// Be aware for a TTL 7 days, if user click again.
					dbConn.collection( "subsRecents" ).findOneAndUpdate( {
						subscode: subscode
					}, {
						$set: {
							created: currDate,
							email: email,
							subscode: subscode,
							topicId: topicId,
							link: unsubLink
						}
					}, { upsert: true });
					
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
			
			// if docValue is null, that means the person are trying again before the _nbMinutesDF delay
			if ( !docValue ) {
				console.log( "resendEmailNotify: must wait " + email + ":" + topicId + " -" + currDate.getTime() );
				return true;
			}
			
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

			// To support deprecated query where the email was included in the URL, the subsequent URL can be made permanent after 60 days of it's deployment date
			let subscode = ( docValue.subscode.length ? docValue.subscode : docValue.subscode.toHexString() );
			
			await docValue && sendNotifyConfirmEmail( email, subscode, docValue.tId, docValue.nKey );

			
		})
		.catch( (e) => {
			console.log( "resendEmailNotify: subsUnconfirmed " + email + ":" + topicId );
			console.log( e );
		});

}


//
// getRedirectForRecents - Check recent transaction when second confirm/unsubs and return redirect
//
getRedirectForRecents = async ( query, mustBeSubscribed ) => {
	
	docValue = await dbConn.collection( "subsRecents" ).findOne( query );

	if ( !docValue ) {
		console.log( "getRedirectForRecents: not found: " + ( mustBeSubscribed ? "c ": "r " ) + JSON.stringify( query ) );
		return false;
	}
	
	const topicId = docValue.topicId,
		email = docValue.email,
		subscode = query.subscode;

	if ( mustBeSubscribed ) {
	
		// Ensure the person is registered
		dbConn.collection( "subsConfirmed" ).insertOne( {
			email: email,
			subscode: subscode,
			topicId: topicId
		}).then( () => {

			// Resubscribe the user
			dbConn.collection( "subsExist" ).insertOne( {
				e: email,
				t: topicId
			})
			
			console.log( "getRedirectForRecents: re-subscribed" );
		}).catch( () => {
			
			// Ignore, that means it is already confirmed
		});
		
		// Get the confirmURL (in the case of it was an unsub) and do the redirect
		const topic = await getTopic( topicId );

		return topic.confirmURL;
	}

	// This is an unsub, just return the last know link
	return docValue.link;
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
	
	
	// To support deprecated query where the email was included in the URL, the subsequent URL can be made permanent after 60 days of it's deployment date
	const codeURL = ( confirmCode.length ? confirmCode : confirmCode.toHexSTring() );
	
	!_bypassSubscode && notifyClient.sendEmail( templateId, email, 
		{
			personalisation: { confirm_link: _confirmBaseURL + codeURL },
			reference: "x-notify_subs_confirm"
		})
		.catch( ( e ) => {
			// Log the Notify errors

			const currDate = new Date(),
				errDetails = e.error.errors[0],
				statusCode = e.error.status_code,
				msg = errDetails.message;
			
			
			
			if ( statusCode === 400 && msg.indexOf( "email_address" ) !== -1 ) {

				//
				// We need to remove that user and log it
				//
				// Removal of bad email should be done after 25 min, same delay used to the not-before
				// The following task need to be quoeud and delayed. It could be addressed at the same time of APPS-26
				//dbConn.collection( "subsUnconfirmed" ).findOneAndDelete(
				//	{
				//		email: email
				//	}
				//)
				//dbConn.collection( "subsExist" ).findOneAndDelete(
				//	{
				//		e: email
				//	}
				//)
				
				
				// Log
				dbConn.collection( "notify_badEmail_logs" ).insertOne( 
					{
						createdAt: currDate,
						code: confirmCode,
						email: email
					}
				).catch( (e2) => {
					console.log( "sendNotifyConfirmEmail: notify_badEmail_logs: " + confirmCode );
					console.log( e2 );
					console.log( e );
				});

			} else if ( statusCode === 429 ) {
			
				//
				// This is a rate limit error, the system should notify us
				//
				dbConn.collection( "notify_tooManyReq_logs" ).insertOne( 
					{
						createdAt: currDate,
						email: email,
						code: confirmCode,
						templateId: templateId,
						details: msg
					}
				).catch( (e2) => {
					console.log( "sendNotifyConfirmEmail: notify_tooManyReq_logs: " + confirmCode );
					console.log( e2 );
					console.log( e );
				});

				//
				// Try to email us (only with the predefined interval)
				//
				if ( _notifyUsNotBeforeTimeLimit <= currDate.getTime() ) {
					
					// Readjust the limit for the next period
					_notifyUsNotBeforeTimeLimit = currDate.getTime() + _notifyUsTimeLimit;
					
					
					let ourNotifyClient = new NotifyClient( processEnv.OUR_NOTIFY_END_POINT, processEnv.OUR_NOTIFY_KEY );
					let email_to = JSON.parse( processEnv.OUR_NOTIFY_SEND_EMAIL_TO || "[]" );


					email_to.forEach( ( emailGOC ) => {

						ourNotifyClient.sendEmail( processEnv.OUR_NOTIFY_TEMPLATE_ID, emailGOC,
							{
								personalisation: { msg: "x-notify 429 Too Many Request error :: " + confirmCode },
								reference: "x-notify"
							})
							.catch( ( e2 ) => {
								console.log( "sendNotifyConfirmEmail: notifying_us: " + confirmCode );
								console.log( e2 );
								console.log( e );
							});
					});
				}
				
			} else {
			
				//
				// Any other kind of error - https://docs.notifications.service.gov.uk/node.html#send-an-email-error-codes
				//
				// notify_logs entry - this can be async
				dbConn.collection( "notify_logs" ).insertOne( 
					{
						createdAt: currDate,
						templateId: templateId,
						e: errDetails.error,
						msg: msg,
						statusCode: statusCode,
						err: e.toString(),
						code: confirmCode
					}
				).catch( (e2) => {
					console.log( "sendNotifyConfirmEmail: notify_logs: " + confirmCode );
					console.log( e2 );
					console.log( e );
				});
			}
		
			console.log( "sendNotifyConfirmEmail: sendEmail " + confirmCode );
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
	const key = generateKey();

	res.status( 200 ).send( '<!DOCTYPE html>\n' +
		'<html lang="en">\n' +
		'<head>\n' +
		'<title>Bulk action emails</title>\n' +
		'</head>\n' +
		'<body>\n' +
		'	<form action="/subs/post" method="post">\n' +
		'		<label>Email: <input type="email" name="eml" /></label><br>\n' +
		'		<label>Topic: <input type="text" name="tid" /></label><br>\n' +
		'		<input type="hidden" name="auke" value="' + key.authKey + '">\n' +
		'		<input type="submit" value="Add">\n' +
		'	</form>\n' +
		'</body>\n' +
		'</html>' 
	);
};


exports.simulateAddJSON = async ( req, res, next ) => {

	if ( !_bypassSubscode ) {
		return;
	}

	const { prefix, suffix, topicId } = req.params,
		email = prefix + fakeSubsIncrement + suffix;
	
	fakeSubsIncrement = fakeSubsIncrement + 1;

	// addEmail
	let responseFake = {
			json: function(){}
		};
	
	await exports.addEmail( { 
			body: {
				tid: topicId,
				eml: email
			}
		}, responseFake );

	// Confirm the email
	await exports.confirmEmail( { 
			params: {
				subscode: responseFake.subscode
			}
		}, {
			redirect: function(){}
		} );
	
	res.json( { test: "ok" } );
}

exports.simulateAddPost = async ( req, res, next ) => {

	if ( !_bypassSubscode ) {
		return;
	}

	const { prefix, suffix, topicId } = req.params,
		email = prefix + fakeSubsIncrement + suffix,
		key = await generateKey();
	
	fakeSubsIncrement = fakeSubsIncrement + 1;

	// addEmailPOST
	let responseFake = {
			redirect: function(){}
		};

	await exports.addEmailPOST( { 
			body: {
				tid: topicId,
				eml: email,
				auke: key.authKey
			},
			headers: {}
		}, responseFake );

	// Confirm the email
	await exports.confirmEmail( { 
			params: {
				subscode: responseFake.subscode
			}
		}, {
			redirect: function(){}
		} );
	
	res.json( { test: "ok" } );
}

