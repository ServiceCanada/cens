const MongoClient = require('mongodb').MongoClient;

const mailingManager = require('./mailing');
const { bulkQueue } = require("../notifyQueue");
const { letUsKnow } = require("./subscriptions");
const BASE_URL = process.env.BASE_URL || "https://apps.canada.ca/x-notify";
const BULK_API = process.env.BULK_API || "https://api.notification.canada.ca/v2/notifications/bulk";
const BULK_GC_NOTIFY_PREPEND = process.env.BULK_GC_NOTIFY_PREPEND || "ApiKey-v1 ";
const BULK_Q_ATTEMPTS = parseInt(process.env.BULK_Q_ATTEMPTS) || 5;
const BULK_Q_TYPE = process.env.BULK_Q_TYPE || "exponential";
const BULK_Q_DELAY = parseInt(process.env.BULK_Q_DELAY) || 5 * 60 * 1000; // 5 min
const BULK_Q_MAX_EMAIL_BATCH_SIZE = parseInt(process.env.BULK_Q_MAX_EMAIL_BATCH_SIZE) || 45000;
const BULK_Q_JOB_DELAY_TIME = parseInt(process.env.BULK_Q_JOB_DELAY_TIME) || 1 * 60 * 1000; // 1 min
const _notifyUsTimeLimit = parseInt(process.env.notifyUsTimeLimit) || 180000;
const BULK_Q_REMOVE_ON_COMP = parseInt(process.env.BULK_Q_REMOVE_ON_COMP) || 500;
const BULK_Q_REMOVE_ON_FAIL = parseInt(process.env.BULK_Q_REMOVE_ON_FAIL) || 2500;
const _subsLinkSuffix = process.env.subsLinkSuffix || "853e0212b92a127";

let mongoInstance,
	dbConn,
	_notifyUsNotBeforeTimeLimit = 0;

bulkQueue.process(async (job) => {

	let jobData, emailLength,
		jobSuccess=false;
    try {
        const mailingState = mailingManager.mailingState;
        jobData = job.data;
		emailLength = Buffer.byteLength( JSON.stringify(jobData.bulkEmailBody) , "utf8" );

        let response = await fetch( BULK_API, {
		  method: 'POST',
		  headers: {
			'Content-Type': 'application/json',
			"Authorization" : BULK_GC_NOTIFY_PREPEND + jobData.notifyKey
		  },
		  body: JSON.stringify( jobData.bulkEmailBody ),
		});

        if (!response.ok) {
			console.error(`Bulk API failed with status: ${response.status} - HTTP Error Status: ${response.statusText}`);
			let errorDetails = {};
			try {
				errorDetails = await response.json();
			} catch (parseErr) {
				console.error('Failed to parse error body:', parseErr);
			}

			const err = new Error(`GC Notify Bulk API error: ${response.status} ${response.statusText}`);

			// Attach status + parsed body to error object
			err.httpStatus = response.status;
			err.statusText = response.statusText;
			err.errorBody = errorDetails?.errors?.[0] || errorDetails || errorDetails.toString();
			err.errorCode = errorDetails?.errors?.[0]?.code || errorDetails?.status_code || null;
			err.errorMessage = errorDetails?.errors?.[0]?.message || errorDetails?.message ||response.statusText;

			console.error(` --------------------> GC Notify Bulk API error: `);
			console.error(err);
			throw err;
		} else {
			jobSuccess = true;
			// If request is successful, update mailing status
			mailingManager.mailingUpdate(jobData.mailingId, mailingState.sent, { historyState: mailingState.sending });
			return await response.json();
		}

    } catch ( error ) {
		const currDate = new Date(),
		currDateTime = currDate.getTime();

		const httpStatus = error.httpStatus || null;
		const errCode = error.errorCode || error.code || null;
		const errMsg = error.errorMessage || error.message;
		const errDetails = error.errorBody ? JSON.stringify(error.errorBody) : error.toString();

		// Connect to MongoDB
        mongoInstance = await MongoClient.connect(process.env.MONGODB_URI || '', { useUnifiedTopology: true });
        dbConn = mongoInstance.db(process.env.MONGODB_NAME || 'subs');

        // Log the error into MongoDB
        if ( dbConn ) {
            try {
                await dbConn.collection("notify_logs").insertOne({
					createdAt: currDate,
					jobData: job.data,
					errorMessage: errMsg,       // GCNotify message
					http_status: httpStatus, // HTTP status
					notify_Errorcode: errCode,     // GC Notify error code or Node error.code
					errDetails: errDetails,     // full JSON/error string
					emailLength: emailLength,
                });
            } catch ( dbError ) {
                console.error( "Failed to log error in notify_logs:", dbError );
				throw new Error ( "Bulk Queue process DB error " + dbError.message )
            }
        }

		//
		// Try to email us (only with the predefined interval)
		//
		if ( _notifyUsNotBeforeTimeLimit <= currDateTime ) {
			letUsKnow( "Bulk Queue error " + error.message + " - " + errMsg, {
					type: "bulk_q_process_error",
					currTime: currDateTime,
					lastTime: _notifyUsNotBeforeTimeLimit
				},
				true );

			// Readjust the limit for the next period
			_notifyUsNotBeforeTimeLimit = currDateTime + _notifyUsTimeLimit;
		}

        // Handle retryable errors
        if ( error.message.includes("GC Notify Bulk API error: 5")) {
			console.log("===============================>>>>>>>>>>>>>>>>================ Retrying job due to server error...");
			throw new Error("Retryable error"); // Ensures Bull retries
        }

    } finally {
        // Close MongoDB connection if it was opened
        if (mongoInstance) {
			mongoInstance.close();
		}
		const jobRetries = job.opts.attempts || 1;

		//Wait for next job to be processed only after max retires (BULK_Q_ATTEMPTS)
		if ( jobSuccess || job.attemptsMade >= jobRetries-1) {
		  await new Promise(resolve => setTimeout( resolve, BULK_Q_JOB_DELAY_TIME )); // delay between each API call set by CDS
		}
    }
});

// Listen for failures
bulkQueue.on('failed', (job, err) => {
    console.error(`bulkQueue Job ${job.id} failed: ${err.message}`);
	console.log(err)
});

exports.sendBulkEmails = async ( mailingId, topicId ) => {
	let mailingTopic, mailing_name, emailLength, bulkEmailBody;
	try {
		mailing_name = "Bulk_email-" + topicId;
		mailingTopic = await mailingManager.getTopic( topicId );

		if ( !mailingTopic ) {
			console.log( " Bulkmailer -- sendBulkEmails: no mailingTopic found with: " +  topicId);
			throw new Error( "Bulkmailer sendBulkEmails: no mailingTopic found with: " +  topicId );
		}

		if ( !mailingTopic.nTemplateMailingId || !mailingTopic.notifyKey ) {
			console.log( " Bulkmailer -- sendBulkEmails: check mailingTopic details with topicId: " + topicId );
			throw new Error( "Bulkmailer -- sendBulkEmails: check mailingTopic details with topicId: " +  topicId );
		}

		let subscribers = await getConfirmedSubscriberAsArray( topicId );
		if ( !subscribers.length) {
			console.log( " Bulkmailer -- sendBulkEmails : No subscribers found for the topic: " + topicId );
			throw new Error( "Bulkmailer -- sendBulkEmails: No subscribers found for the topic: " +  topicId );
		}

		for (let i = 0; i < subscribers.length; i += BULK_Q_MAX_EMAIL_BATCH_SIZE) {
			const batchSubs = subscribers.slice(i, i + BULK_Q_MAX_EMAIL_BATCH_SIZE);

			let formattedSubsArray = await formatSubsArray( batchSubs );

			bulkEmailBody = {
				"name": mailing_name,
				"template_id": mailingTopic.nTemplateMailingId,
				"rows": formattedSubsArray
			};
			emailLength = Buffer.byteLength( JSON.stringify(bulkEmailBody) , "utf8" );

			bulkQueue.add(
			{
				bulkEmailBody: bulkEmailBody,
				notifyKey: mailingTopic.notifyKey,
				mailingId: mailingId,
			},
			{
				attempts: BULK_Q_ATTEMPTS, // Maximum number of retries
				backoff: {
				  type: BULK_Q_TYPE, // Use exponential backoff or fixed
				  delay: BULK_Q_DELAY // Initial delay of 1 second (doubles each retry)
				},
				removeOnComplete: BULK_Q_REMOVE_ON_COMP,
				removeOnFail: BULK_Q_REMOVE_ON_FAIL
			}
			);
		}

	} catch (err) {
		console.error(" bulkApiMailer -- sendBulkEmails error ")
		console.log(err.message)
		const currDate = new Date(),
		currDateTime = currDate.getTime();

		mongoInstance = await MongoClient.connect(process.env.MONGODB_URI || '', { useUnifiedTopology: true });
        dbConn = mongoInstance.db(process.env.MONGODB_NAME || 'subs');

		dbConn.collection( "notify_logs" ).insertOne(
					{
						createdAt: currDate,
						e: err.message,
						error: err.toString(),
						nTemplateMailingId: mailingTopic.nTemplateMailingId,
						emailLength: emailLength,
						bulkEmailBody: bulkEmailBody
					}
				).catch( (e2) => {
					console.log( "bulkApiMailer -- sendBulkEmails: notify_logs: " + userCodeUrl );
					console.log( e2 );
					console.log( err );
				});
		//
		// Try to email us (only with the predefined interval)
		//
		if ( _notifyUsNotBeforeTimeLimit <= currDateTime ) {

			letUsKnow( "Adding Bulk Queue error", {
					type: "bulk_q_add_error",
					currTime: currDateTime,
					lastTime: _notifyUsNotBeforeTimeLimit
				},
				true );

			// Readjust the limit for the next period
			_notifyUsNotBeforeTimeLimit = currDateTime + _notifyUsTimeLimit;
		}

	}
}

formatSubsArray = async ( listEmail ) => {

	let i, i_len = listEmail.length, subscriber;
	let subsArray = [
			[ "email address", "unsub_link" ]
		];
	for( i = 0; i !== i_len; i++) {
		subscriber = listEmail[ i ];

		const { email, subscode } = subscriber;

		const userCodeUrl = ( subscode ? subscode.toHexString() : subscode );

		if ( !email || !userCodeUrl ) {
			continue;
		}

		let unsub_link =  BASE_URL + "/subs/remove/" + userCodeUrl + "/" + _subsLinkSuffix;
		subsArray.push( [ email, unsub_link ] );
	}

	return subsArray;

}

/*
 * Utilities function
 */
getConfirmedSubscriberAsArray = async ( topicId ) => {
	mongoInstance = await MongoClient.connect(process.env.MONGODB_URI || '', { useUnifiedTopology: true });
    dbConn = mongoInstance.db(process.env.MONGODB_NAME || 'subs');

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

	if (mongoInstance) {
		mongoInstance.close();
	}
	return docsItems;
};
