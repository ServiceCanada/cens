/*==========================
 * APPS-167
 *
 * @description: Script is to resend confirmation emails from "subsUnconfirmed" database
 * @author: Government of Canada; @shiva; @duboisp
 * @version: 2.0
 * Previous version: apps-157.js
 * Command to run this script: docker exec -i x-notify /bin/bash -c "node scripts/apps-167.js"
 *
 * __________________________________________
 * Test procedure
 *
 * 1. Create a topic
 * 2. Subscribe 1 user and don't confirm its subscription
 * 3. Create a second topic
 * 4. Subscribe 1 user in that second topic and don't confirm its subscription
 * 
 * _______
 * TEST-1. Configure this script to test the default setting
 *
 *		+ Preparation:
 *			- Reset via MongoDB the notBefore value for the 2 subscriber to the numeric value "0" in the collection "subsUnconfirmed"
 *		+ Adjust the startDate and endDate based on your local setup
 *
		{
			startDate: "2023-10-12T00:00:00.000Z",
			endDate: "2023-10-14T00:00:00.000Z"
		}

 *	Expected:
 *		+ 2 confirmation email is sent
 * _______
 * TEST-2. Test by filtering a specifc topic
 *
 *		+ Preparation:
 *			- Reset via MongoDB the notBefore value for the 2 subscriber to the numeric value "0" in the collection "subsUnconfirmed"
 *		+ Adjust the items in the array of topicList to match your first locally configured topic

		{
			startDate: "2023-10-14T00:00:00.000Z",
			endDate: "2023-10-11T00:00:00.000Z",
			topicList: [ "test" ]
		}

 *	Expected:
 *		+ 1 confirmation email is sent associated to the topic "test"
 * _______
 * TEST-3. Configure this script to test the notBefore time
 *
 *		+ Adjust the notBefore date which should match a moment just before the TEST-2 has been ran.
 *		
		{
			startDate: "2023-10-14T00:00:00.000Z",
			endDate: "2023-10-11T00:00:00.000Z",
			notBefore: 1697228014617
		}

 *	Expected:
 *		+ The log should show that has tried to send 2 email and the "notBefore" value of the subscriber to the other topic don't change
 *
 * 
 *  If FAIL: Another message is displayed in the console, please note it and report it back in APPS-167
 *
 * ___________________________________________
 * Production RUN procedure
 *
 * 1. Set the value of the variable "runProductionMode" bellow at line 100 to true
 * 2. Run the script > node scripts/apps-167.js
 * 3. Wait for the script completion, it might take up to 10-15 minutes
 * 4. Report on it as the following expectation
 * 
 * Expected:
 *	+ SUCCESS: the following similar message are log in the console 
 *		> numberOfEmailSent: 2341
 *  + FAIL: Another message is displayed in the console, please note it and report it back in APPS-167
 *
 ===========================*/

const dotenv = require('dotenv'); // Application configuration
const path = require('path');
const chalk = require('chalk'); // To color message in console log 
const restClient=require('request-promise');
const MongoClient = require('mongodb').MongoClient;
	

/**
 * Load environment variables from .env file, where API keys and passwords are configured.
 */
dotenv.config({
    path: '.env'
});

const processEnv = process.env,
	  _keySalt = processEnv.keySalt || "salt";


//
// Script configuration
//
const runProductionMode = false; // Change for `true` to execute this script in production mode

const scriptConfig = {
		debugMode: {
			startDate: "2023-10-10T19:30:00.000Z",
			endDate: "2023-10-10T19:50:00.000Z",
			notBefore: 1697229643944,
			notBefore_note: "Unix Epoc to exclude those item. Define a refinement time in a case where this script has stop and we don't want to resend confirmation again. This time should match the last time the failed script has been ran. If the value is an ISO date, it will be converted into a Unix EPOC number. If it's value is a number, an Unix EPOC, it will remain the same.",
			topicList: false,
			topicList_note: "If value=false, it will get all topics"
		},
		prodMode: {
			note: "Resend confirmation email since August 14, 2023",
			startDate: "2023-08-14T00:00:00.000Z",
			endDate: "2023-10-11T00:00:00.000Z",
			topicList: [ "pob-grantsen", "pob-grantsfr" ],
		}
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
							

const key = generateKey();
let dbConn;

MongoClient.connect( processEnv.MONGODB_URI || '', {useUnifiedTopology: true} ).then( ( mongoInstance ) => {
	dbConn = mongoInstance.db( processEnv.MONGODB_NAME || 'subs' );
	iterateUnconfirmed( scriptConfig[ runProductionMode ? "prodMode" : "debugMode" ] );
}).catch( (e) => {
	console.log("%s MongoDB ERROR: %s", chalk.red('x'), e );
});

/**
 * This is the main script function.  It is a while loop that 
 * asynchronously iterates over all unconfirmed test subscribers
 * and confirms them via an http GET to the /subs/unconfirm/ 
 * endpoint.
 */
async function iterateUnconfirmed( config ){

	let findConfiguration = {
        $and: [
				{
				    createdAt: {
				        $gte: new Date( config.startDate )
				      }
				},
				{
				    createdAt: {
				        $lte: new Date( config.endDate )
				      }
				}
			]
		};

	if ( config.notBefore ) {
		findConfiguration.$and.push(
				{
					notBefore: {
						$gte: config.notBefore
					}
				}
			);
	}

	// Do we need to restrict by topic name
	if ( config.topicList ) {

		config.topicList = Array.isArray( config.topicList ) ? config.topicList : [ config.topicList ];

		findConfiguration.$and.push(
				{
					topicId: {
						$in: config.topicList
					}
				}
			);
	}


	let subsUnconfirmed = dbConn.collection("subsUnconfirmed").find( findConfiguration );
	
	console.log("subsUnconfirmed  count: " + await subsUnconfirmed.count());
	let numberOfEmailSent = 0;
	let numberOfFailedEmail = 0;

	await new Promise(resolve => setTimeout(resolve, 1000));
	while( await subsUnconfirmed.hasNext()){
		let subscriber = await subsUnconfirmed.next();
        let options = {
              method: 'POST',
              uri: 'http://localhost:8080/subs/post',
              json: true,
              body: {
                        tid: subscriber.topicId,  
                        eml: subscriber.email,
                        auke: key.authKey
                    },
              resolveWithFullResponse: true,
            };

        await restClient(options)
	        .then(response => console.log(response))
	        .catch(err => {
				if ( err.statusCode != 302) {
					console.log('Error: ' + err)
					console.log("subscriber  subscriber.topicId: " + subscriber.topicId);
					console.log("subscriber  subscriber.subscode: " + subscriber.subscode);
					numberOfFailedEmail ++;
					numberOfEmailSent --;
				}
			});

        numberOfEmailSent ++;

        if ( ( numberOfEmailSent % 14 ) === 0 ) {
            // wait 1000 milisecond for each 14 email to not trigger the default rate limit that trigger a 429 error with GC Notify
            console.log( "Wait 1s because " + numberOfEmailSent + " email was sent")
			await new Promise(resolve => setTimeout(resolve, 1000));
        }


	}
	console.log("numberOfEmailSent: " + numberOfEmailSent);
	console.log("numberOfEmail FAIL: " + numberOfFailedEmail);
	process.exit();
}

