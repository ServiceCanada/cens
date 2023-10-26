const chalk = require('chalk'); // To color message in console log 

const MongoClient = require('mongodb').MongoClient;
const { workerData, parentPort } = require('worker_threads')

const NotifyClient = require('notifications-node-client').NotifyClient;

const ObjectId = require('mongodb').ObjectId;
//const dbConn = module.parent.parent.exports.dbConn;

const processEnv = process.env,
	_notifyEndPoint = processEnv.notifyEndPoint ||  "https://api.notification.alpha.canada.ca",
	_unsubBaseURL = process.env.removeURL || "https://apps.canada.ca/x-notify/subs/remove/",
	_subsLinkSuffix = process.env.subsLinkSuffix || "853e0212b92a127"


let dbConn, notifyKey;

MongoClient.connect( processEnv.MONGODB_URI || '', {useUnifiedTopology: true} ).then( ( mongoInstance ) => {

	dbConn = mongoInstance.db( processEnv.MONGODB_NAME || 'subs' );

}).catch( (e) => { console.log( "%s Worker MongoDB ERRROR: %s", chalk.red('✗'), e ) } );


exports.getSubscribers = async (job, done, createJob) => {
	console.log("job data -----> ")
	console.log(job)
	
	// Ensure we have received all the data
	if ( !job.mailingBody || !job.mailingSubject ) {
		throw new Error( "Send Email: No email body" );
	}
	
	if ( !job.topicId ) {
		throw new Error( "Send Email: No topicId selected" );
	}
	
	/*
	 * Get mailing notify information
	 *
	 */
	 console.log("module.parent.parent.exports.dbConn " + module.parent.parent.exports )
	let topic = await dbConn.collection( "topics" ).findOne( 
		{ _id: job.topicId },
		{ projection: {
				nTemplateMailingId: 1,
				templateId: 1,
				notifyKey: 1,
			} 
		} ).catch( (e) => {
			console.log( "sendEmail-getTopic" );
			console.log( e );
			throw new Error( "sendEmail: Can't find the topic: " +  job.topicId );
		});
	
	let templateId;
		notifyKey = topic.notifyKey;

	
	if ( !topic.nTemplateMailingId ) {
		throw new Error( "Worker: There is no mailing template associated with : " + topicId );
	}
	
	console.log("topic.nTemplateMailingId " + topic.nTemplateMailingId);
	
	// Get the correct notify email template
	if ( job.typeMailing === "msgUpdates" ) {
		templateId = topic.nTemplateMailingId;
	} else if ( job.typeMailing === "confirmSubs" ) {
		templateId = topic.templateId;
	} else {
		throw new Error( "Worker: Invalid type mailing, was : " + job.typeMailing );
	}
	
	/*
	 * Get list of confirmed subscribers
	 *
	 */
	let listEmail = [];
	
	if ( Array.isArray( job.sentTo ) ) {
		listEmail = sentTo;
	} else if ( job.sentTo === "allSubs" ) {
		listEmail = await getConfirmedSubscriberAsArray( job.topicId );
	}
	
	// No subscribers
	if ( !listEmail.length ){
		console.log( "Worker: No subscriber" );
		
		//parentPort.postMessage( { msg: "No subscriber" } );
	
	}
	let emailData = {
		listEmail : listEmail,
		notifyKey : notifyKey,
		emailData : job,
		
	}
	console.log("sendM+EMAil")
	console.log(typeof createJob);
	createJob("q_sendEmail", emailData);
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

exports.processSendEmail = async (job, done) => {
	//console.log("emailListv        " + job)
	console.log("sendEmail _notifyEndPoint  " + _notifyEndPoint)
	 console.log("notifyKey " + job.notifyKey);
	 
	
	notifyClient = new NotifyClient( _notifyEndPoint, job.notifyKey );
	let listEmail = job.listEmail;
	console.log("sendEmail  listEmail " +  listEmail);
	let i, i_len = listEmail.length, i_cache;
	for( i = 0; i !== i_len; i++) {
		i_cache = listEmail[ i ];
		
		const { email, subscode } = i_cache;
		
		const userCodeUrl = ( subscode.id ? subscode.toHexString() : subscode );
		
		//console.log( "Worker: Send for : " + email );

		if ( !email ) {
			continue;
		}
	
		parentPort.postMessage( { msg: "Send for : " + email } );
		
		
		console.log( "templateId: " + templateId );
		console.log( "email: " + email );
		console.log( "subject: " + mailingSubject );
		console.log( "body: " + mailingBody );
		console.log( "unsub_link: " + _unsubBaseURL + userCodeUrl + "/" + _subsLinkSuffix );
		console.log( "reference: " + "x-notify_" + typeMailing );
		
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
			
			//parentPort.postMessage( { msg: "worker-Error in Notify" } );
			
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
			mailingUpdate( mailingId, _mailingState.sent, { historyState: _mailingState.sending } );
		});
	}
}

