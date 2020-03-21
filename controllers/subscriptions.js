/*==========================
 * Subscriptions
 *
 * @description: Managing the client subscription to be notified about a given topic
 * @author: Government of Canada; @duboisp
 * @version: 0.1
 ===========================*/

const NotifyClient = require('notifications-node-client').NotifyClient; // https://docs.notifications.service.gov.uk/node.html#node-js-client-documentation

const nbMinutesBF = process.env.notSendBefore || 25; // Default of 25 minutes.
const failURL = process.env.notSendBefore || "https://canada.ca/" ; // Fail URL like if the email confirmation has failed

const dbConn = module.parent.exports.dbConn;

const notifyCached = [];

//
// Add email to the newSubscriberEmail
//
// @return; a JSON response 
//
exports.addEmail = async ( req, res, next ) => {
	
	

	const email = "pierre.dubois@servicecanada.gc.ca",
		topicId = "test",
		currDate = new Date();
	
	// Request param: email, topicId
	
	// Validate if email is the good format (something@something.tld)
	// TODO: validate parameters.

	// Select Topic where email $nin "subs"
	const colTopic = dbConn.collection( "topics" );
	
	try {
		const topic = await colTopic.findOne( { _id: topicId, subs: { $nin: [ email ] } } ); // fyi - return null when there is no result.

		// If email found, try to resend
		if (! topic ) {
			console.log( "RESEND confirm email: " + email );
			return resendEmailNotify( email, topicId, currDate )
					.then( () => { 
						res.json( { statusCode: "200" } );
					} )
					.catch( ( e ) => {
						// answer a negative JSON response + reason code
						console.log( e );
						res.json( { statusCode: "500" } );
					} );
		}
		
		// We complete the transaction
		console.log( topic );
		
		// Generate an simple Unique Code
		const confirmCode = Math.floor(Math.random() * 999999) + "" + currDate.getMilliseconds(),
			tId = topic.templateId,
			nKey = topic.notifyKey;
		
		// Insert in subsToConfirm
		await dbConn.collection( "subsUnconfirmed" ).insertOne( {
			email: email,
			subscode: confirmCode,
			topicId: topicId,
			notBefore: currDate.setMinutes( currDate.getMinutes() + nbMinutesBF ),
			createAt: currDate,
			tId: tId,
			nKey: nKey,
			cURL: topic.confirmSuccessURL
		});
		
		// Update - Add to topic subs array
		await colTopic.updateOne( 
			{ _id: topicId },
			{
				$push: {
					subs: email
				}
			});

		// Send confirm email
		sendNotifyConfirmEmail( email, confirmCode, tId, nKey );
		
		res.json( { statusCode: "200" } );
	
	} catch ( e ) { 
	
		// The query has not ran
		console.log( e );
		
		res.json( { statusCode: "500" } );
	}

	
	// sendNotifyConfirmEmail( email, confirmCode, templateId, NotifyKey );
};

//
// Resend email notify
//
resendEmailNotify = ( email, topicId, currDate ) => {
	
	// Find email in 
	return dbConn.collection( "subsUnconfirmed" )
		.findOneAndUpdate( 
			{ email: email, notBefore: { $lt: currDate.getTime() } },
			{
				$set: {
					notBefore: currDate.setMinutes( currDate.getMinutes() + nbMinutesBF )
				}
			}
		).then( async ( docSubs ) => {
			
			const docValue = docSubs.value;
			
			// subs_logs entry - this can be async
			dbConn.collection( "subs_logs" ).updateOne( 
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
				console.log( e );
			});
			
			await docValue && sendNotifyConfirmEmail( email, docValue.subscode, docValue.tId, docValue.nKey );

			
		})
		.catch( (e) => {
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

	let notifyClient = notifyCached[ templateId ];
	
	if ( !notifyClient ) {
		notifyClient = new NotifyClient( "https://api.notification.alpha.canada.ca", NotifyKey );
		notifyCached[ templateId ] = notifyClient;
	}
	

	await notifyClient.sendEmail( templateId, email, 
		{
			personalisation: { confirm_link: "https://apps.canada.ca/x-notify/subs/confirm/" + confirmCode + "/" + email },
			reference: "x-notify_subs_confirm"
		});
}

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
			dbConn.collection( "subs_logs" ).updateOne( 
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
				console.log( e );
			});
			
			// Redirect to Generic page to confirm the email is removed
			res.redirect( docValue.cURL );

		})
		.catch( () => {
			res.redirect( "https://universallabs.org" );
		});
};


//
// Remove subscription of unconfirmed email
//
// @return; a HTTP redirection
// @description: To ease testing
//
exports.removeUnconfirmEmail = ( req, res, next ) => {

	// Request param: email, confirmCode
	const { subscode, email } = req.params;
	
	// TODO: validate parameters.

	
	dbConn.collection( "subsConfirmed" ).findOneAndDelete( { email: email, subscode: subscode } ).catch( () => {} );
	
	dbConn.collection( "subsUnconfirmed" )
		.findOneAndDelete( { email: email, subscode: subscode } )
		.then( ( docSubs ) => {

			// update topics
			dbConn.collection( "topics" ).updateOne( 
			{ _id: docSubs.value.topicId },
			{
				$pull: {
					subs: email
				}
			});

			// Redirect to Generic page to confirm the email is removed
			res.redirect( "https://universallabs.org/labs" );

		} ).catch( () => {
			res.redirect( "https://universallabs.org" );
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
		currDate = new Date();;
	
	// findOneAndDeleted in subsConfirmedEmail document
	dbConn.collection( "subsConfirmed" )
		.findOneAndDelete( { email: email, subscode: subscode } )
		.then( ( docSubs ) => {
			
			const topicId = docSubs.value.topicId;
			let unsubURL;
			
			// update topics
			dbConn.collection( "topics" ).findOneAndUpdate( 
			{ _id: topicId },
			{
				$pull: {
					subs: email
				}
			},
			{
				projection: { unsubsSuccessURL }
			}).then( ( docTp ) => {
				unsubURL = docTp.value.unsubsSuccessURL;
			}).catch( ( e ) => {
				console.log( e );
			});
			
			// subs_logs entry - this can be async
			dbConn.collection( "subs_logs" ).updateOne( 
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
				console.log( e );
			});

			// Redirect to Generic page to confirm the email is removed
			res.redirect( unsubURL || "https://universallabs.org/labs" );

		} ).catch( () => {
			res.redirect( "https://universallabs.org" );
		});
};

//
// Get all subscription associated to the email|phone
//
exports.getAll = (confirmCode, email, phone) => {

};


/*
todo. Notify error code logging

.statusCode
details

*/




