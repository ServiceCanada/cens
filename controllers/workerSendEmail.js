/*
 *
 * Experimental worker to send email via Notify
 *
 *
 */
const chalk = require('chalk'); // To color message in console log 

const MongoClient = require('mongodb').MongoClient;
const NotifyClient = require('notifications-node-client').NotifyClient;

const ObjectId = require('mongodb').ObjectId;

const { workerData, parentPort } = require('worker_threads')


if ( !workerData ) {
	throw new Error( "Worker need parameter" );
}

const { topicId, mailingSubject, mailingBody, typeMailing, sentTo } = workerData;

const processEnv = process.env,
	_notifyEndPoint = processEnv.notifyEndPoint ||  "https://api.notification.alpha.canada.ca",
	_unsubBaseURL = process.env.removeURL || "https://apps.canada.ca/x-notify/subs/remove/",
	_subsLinkSuffix = process.env.subsLinkSuffix || "853e0212b92a127"

let dbConn;

MongoClient.connect( processEnv.MONGODB_URI || '', {useUnifiedTopology: true} ).then( ( mongoInstance ) => {

	dbConn = mongoInstance.db( processEnv.MONGODB_NAME || 'subs' );
	
	init();

}).catch( (e) => { console.log( "%s Worker MongoDB ERRROR: %s", chalk.red('✗'), e ) } );

async function init() {

	// Ensure we have received all the worker data
	if ( !mailingBody || !mailingSubject ) {
		throw new Error( "Worker: No email body" );
	}
	
	

	/*
	 * Get mailing notify information
	 *
	 */
	let topic = await dbConn.collection( "topics" ).findOne( 
		{ _id: topicId },
		{ projection: {
				nTemplateMailingId: 1,
				templateId: 1,
				notifyKey: 1,
			} 
		} ).catch( (e) => {
			console.log( "worker-getTopic" );
			console.log( e );
			throw new Error( "Worker: Can find the topic: " +  topicId );
		});

	let templateId,
		notifyKey = topic.notifyKey;

		
	// Get the correct notify email template
	if ( typeMailing === "msgUpdates" ) {
		templateId = topic.nTemplateMailingId;
	} else if ( typeMailing === "confirmSubs" ) {
		templateId = topic.templateId;
	} else {
		throw new Error( "Worker: Invalid type mailing, was : " + typeMailing );
	}



	/*
	 * Get list of confirmed subscribers
	 *
	 */
	let listEmail = [];
	
	if ( Array.isArray( sentTo ) ) {
		listEmail = sentTo;
	} else if ( sentTo === "allSubs" ) {
		listEmail = await getConfirmedSubscriberAsArray( topicId );
	}

	// No subscribers
	if ( !listEmail.length ){
		console.log( "Worker: No subscriber" );
		
		parentPort.postMessage( { msg: "No subscriber" } );
	
	}

	/*
	 * Send the mailing
	 *
	 */
	let notifyClient = new NotifyClient( _notifyEndPoint, notifyKey );

	//console.log( "_notifyEndPoint: " + _notifyEndPoint );
	//console.log( "notifyKey: " + notifyKey );
	
	let i, i_len = listEmail.length, i_cache;
	for( i = 0; i !== i_len; i++) {
		
		i_cache = listEmail[ i ];
		
		const { email, subscode } = i_cache;
		
		const userCodeUrl = ( subscode.id ? subscode.toHexString() : subscode );
		
		//console.log( "Worker: Send for : " + email );

		if ( !email ) {
			continue;
		}
	
		//parentPort.postMessage( { msg: "Send for : " + email } );
		
		
		//console.log( "templateId: " + templateId );
		//console.log( "email: " + email );
		//console.log( "subject: " + mailingSubject );
		//console.log( "body: " + mailingBody );
		//console.log( "unsub_link: " + _unsubBaseURL + userCodeUrl + "/" + _subsLinkSuffix );
		//console.log( "reference: " + "x-notify_" + typeMailing );
		
		notifyClient.sendEmail( templateId, email, 
		{
			personalisation: { 
				body: mailingBody,
				subject: mailingSubject,
				unsub_link: _unsubBaseURL + userCodeUrl + "/" + _subsLinkSuffix
			},
			reference: "x-notify_" + typeMailing
		}).catch( ( e ) => {
			// Log the Notify errors
			// console.log( "Error in Notify" );
			// console.log( e );
			
			parentPort.postMessage( { msg: "worker-Error in Notify" } );
			
			const currDate = new Date(),
				currDateTime = currDate.getTime(),
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
						code: userCodeUrl,
						email: email
					}
				).catch( (e2) => {
					console.log( "worker-sendNotifyConfirmEmail: notify_badEmail_logs: " + userCodeUrl );
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
						code: userCodeUrl,
						templateId: templateId,
						details: msg
					}
				).catch( (e2) => {
					console.log( "worker-sendNotifyConfirmEmail: notify_tooManyReq_logs: " + userCodeUrl );
					console.log( e2 );
					console.log( e );
				});

				//
				// Try to email us (only with the predefined interval)
				//
				if ( _notifyUsNotBeforeTimeLimit <= currDateTime ) {

					letUsKnow( "429 Too Many Request error", {
							type: "ratelimit",
							currTime: currDateTime,
							lastTime: _notifyUsNotBeforeTimeLimit
						},
						true );

					// Readjust the limit for the next period
					_notifyUsNotBeforeTimeLimit = currDateTime + _notifyUsTimeLimit;

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
						code: userCodeUrl
					}
				).catch( (e2) => {
					console.log( "worker-sendNotifyConfirmEmail: notify_logs: " + userCodeUrl );
					console.log( e2 );
					console.log( e );
				});
				
			}
		
			console.log( "worker-sendNotifyConfirmEmail: sendEmail " + userCodeUrl );
		});
		
		// after 40, wait 1 second before to send the next 40 emails.
		if ( i % 40 ) {
			await sleep( 1000 );
		}
	}
	
	parentPort.postMessage({ completed: true, msg: "Worker Send Email Completed Jobs" })
}

/*
 * Utilities function
 */
getConfirmedSubscriberAsArray = async ( topicId ) => {

	// Get all the emails for the given topic
	let docs = await dbConn.collection( "subsConfirmed" ).find(
		{
			topicId: topicId
		},
		{
			projection: {
				email: 1,
				subscode: 1
			}
		}
	);

	let docsItems = await docs.toArray();
	
	return docsItems;
};




