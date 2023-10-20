/*==========================
 * APPS-166
 *
 * @description: Script to resend failed mailing emails with the 429 Too Many Request error, which are specific to one mailing
 * @author: Government of Canada; @duboisp
 * @version: 1.0
 * Command to run this script: docker exec -i x-notify /bin/bash -c "node scripts/apps-166.js"
 *
 * __________________________________________
 * Test procedure
 *
 * 1. Create a topic + confirm 2+ subscription
 * 2. Create a mailing + get it at least tested
 * 3. Create a fake entry in "notify_tooManyReq_logs" like the following by replacing
 *		+ email: (text) a valid email that has confirm subscribed
 *		+ code: (text) the subscode associated to the email and to the topic
 *		+ templateId: (text) the nTemplateId value of the tested topic
 *
 *			db.notify_tooManyReq_logs.insertOne( 
					{
						createdAt: ISODate("2023-10-10T19:42:57.433Z"),
						email: "email@example.com",
						code: "65201d4e2a6ee60033688609",
						templateId: "96e0420e-1500-4528-9291-56238ff355d8",
						details: "Exceeded rate limit for key type LIVE of 1000 requests per 60 seconds"
					}
				);
 *
 * 4. Find the mailing ID that was created/edited at step 2
 * 5. Update the scriptConfig  near line 75 with your local setup
 * 6. Run this script: docker exec -i x-notify /bin/bash -c "node scripts/apps-166.js"
 * 
 * Expected:
 *	+ SUCCESS: the following similar message are log in the console 
 *		> sendPartialMailing - Completed: 652023772a6ee6003368860d
 *		> Worker Send Email Completed Jobs
 *  + FAIL: Another message is displayed in the console, please note it and report it back in APPS-166
 *
 * ___________________________________________
 * Production RUN procedure
 *
 * 1. Set the value of the variable "runProductionMode" bellow at line 73 to true
 * 2. Run the script > node scripts/apps-166.js
 * 3. Wait for the script completion, it might take up to 10-15 minutes
 * 4. Report on it as the following expectation
 * Expected:
 *	+ SUCCESS: the following similar message are log in the console 
 *		> sendPartialMailing - Completed: 652023772a6ee6003368860d
 *		> Worker Send Email Completed Jobs
 *  + FAIL: Another message is displayed in the console, please note it and report it back in APPS-166
 *
 ===========================*/

const dotenv = require('dotenv'); // Application configuration
const path = require('path');
const chalk = require('chalk'); // To color message in console log 
const restClient=require('request-promise');
const MongoClient = require('mongodb').MongoClient;
const ObjectId = require('mongodb').ObjectId;
const { Worker } = require('worker_threads');
let dbConn;

dotenv.config({
    path: '.env'
});

const processEnv = process.env;


/**
 * Script configuration
 */
const runProductionMode = false; // Change for `true` to execute this script in production mode

const scriptConfig = {
	debugMode: [
			{
				note: "Script test and debug via a custom local configuration",
				mailingId: "652023772a6ee6003368860d",
				templateId: "96e0420e-1500-4528-9291-56238ff355d8",
				startDate: "2023-10-10T19:30:00.000Z",
				endDate: "2023-10-10T19:50:00.000Z"
			}
		],
	prodMode: [
			{
				note: "English mailing with 429 error",
				mailingId: "651ee45b07aa0b01c43b0221",
				templateId: "73e3a5e5-924a-4dda-b401-6c2d5474db34",
				startDate: "2023-10-10T19:30:00.000Z",
				endDate: "2023-10-10T19:50:00.000Z"
			},
			{
				note: "French mailing with 429 error",
				mailingId: "651ee4790a404d59b1fc6e64",
				templateId: "63004144-1cdf-4b5d-b440-f7958a4383a4",
				startDate: "2023-10-10T19:30:00.000Z",
				endDate: "2023-10-10T19:50:00.000Z"
			},
			{
				note: "English mailing 2 with 429 error",
				mailingId: "65302b13a4e8d919da2cff0e",
				templateId: "73e3a5e5-924a-4dda-b401-6c2d5474db34",
				startDate: "2023-10-18T19:20:00.000Z",
				endDate: "2023-10-10T19:40:00.000Z"
			},
			{
				note: "French mailing 2 with 429 error",
				mailingId: "65302b27a4e8d919da2cff10",
				templateId: "63004144-1cdf-4b5d-b440-f7958a4383a4",
				startDate: "2023-10-10T19:20:00.000Z",
				endDate: "2023-10-10T19:40:00.000Z"
			}
		]
	};


MongoClient.connect( processEnv.MONGODB_URI || '', {useUnifiedTopology: true} ).then( ( mongoInstance ) => {
	dbConn = mongoInstance.db( processEnv.MONGODB_NAME || 'subs' );

	let config = scriptConfig[ runProductionMode ? "prodMode" : "debugMode" ];
	config.forEach( ( itm ) => {
		resendFailedMailing( itm.mailingId, itm.templateId, itm.startDate, itm.endDate );
	} );

}).catch( (e) => {
	console.log("%s MongoDB ERROR: %s", chalk.red('x'), e );
});


//
// Resend the mailing for the failed ones because of the rate limit
//
async function resendFailedMailing( mailingId, templateId, afterDate, beforeDate ) {

	// Log in history
	const rDoc = await pushLogInMailingHistory( mailingId );
	
	// Get email
	const emailList = await getEmail429List( templateId, afterDate, beforeDate );
	
	// Send the mailing
	await sendPartialMailing( emailList, mailingId, rDoc.topicId, rDoc.subject, rDoc.body );
}

//
// Initiate the worker to send the mailing
//
async function sendPartialMailing( sendToEmails, mailingId, topicId, mailingSubject, mailingBody ) {

	// Start the worker.
	const worker = new Worker( './controllers/workerSendEmail.js', {
		workerData: {
			topicId: topicId,
			mailingBody: mailingBody,
			mailingSubject: mailingSubject,
			typeMailing: "msgUpdates",
			sentTo: sendToEmails,
			dbConn: true //dbConn
		}
	});
	
	worker.on('message', function(msg){
		
		if ( msg.completed ) {
			// Change the status of the mailing and mark it completed
			console.log( "sendPartialMailing - Completed: " + mailingId );
		}
		
		console.log( msg.msg );
	});
	
	worker.on('error', function(msg){
		console.log( "sendPartialMailing - Worker ERRROR: " + msg );
	});
}


//
// Get list of email in the 429 too many, by templateID
//
async function getEmail429List( templateId, afterDate, beforeDate ) {

	let docs = await dbConn.collection( "notify_tooManyReq_logs" ).find(
		{
			templateId: templateId,
			
			$and: [
	            {
	                createdAt: {
	                    $gte: new Date( afterDate )
	                  },
	            },
	            {
	                createdAt: {
	                    $lte: new Date( beforeDate )
	                  }
	            }
	        ]
		},
		{
			projection: {
				email: 1,
				code: 1
			}
		}
	);
	
	let listEmail = await docs.toArray();
	
	// Convert "code" field for "subscode"
	let i, i_len = listEmail.length, i_cache;
	for( i = 0; i !== i_len; i++) {
		i_cache = listEmail[ i ];
		i_cache.subscode = i_cache.code;
	}

	return listEmail;
}


//
// Push a log into the mailing history
//
async function pushLogInMailingHistory( mailingId ) {

	const currDate = new Date();
	let history = 
		{
			state: "sent",
			comments: "Special re-send to fix 429 error - ref. APPS-166",
			createdAt: currDate
		}
	
	// Create the historyEntry
	let rInsert = await dbConn.collection( "mailingHistory" ).insertOne( 
		Object.assign( {},
			history,
			{
				mailingId: ObjectId( mailingId )
			}
		)
	);
	history.historyId = rInsert.insertedId;

	// Update the mailing
	let findQuery = {
		_id: ObjectId( mailingId )
	};
	const rDoc = await dbConn.collection( "mailing" ).findOneAndUpdate( 
		findQuery,
		{
			$push: {
				history: {
					$each: [ history ],
					$slice: -7
				}
			},
			$currentDate: { 
				updatedAt: true
			}
			
		}
	);
	
	return rDoc.value;
}
