/*==========================
 * APPS-53
 *
 * @description: Script to send out a mailing to a large amounts of emails.
 * 				Email sends are requested separately via the http POST 
 * 				endpoint /subs/sendMailing
 *
 * @author: Government of Canada; @luc.l.bertrand
 * @version: 0.1
 ===========================*/

const dotenv = require('dotenv'); // Application configuration
const path = require('path');
const MongoClient = require('mongodb').MongoClient;
const chalk = require('chalk');
const restClient=require('request-promise');

/**
 * Load environment variables from .env file, where API keys and passwords are configured.
 */
dotenv.config({
    path: '.env'
});

const processEnv = process.env;
const baseUrl = 'http://localhost:8080/subs/confirm/';

let options = {
				method: 'POST',
				uri: 'http://localhost:8080/subs/sendMailing',
				json: true,
				body: {
						email: 'email',
						templateId: 'd420219a-f11b-4c61-a855-4c9284001b96',
						personalisation: {unsub:"myUnsub"},
						reference: "luc-local-script",
						notifyKey: "pretendslocalluc-e738cd64-a9f2-4610-904a-d523b844c748-4bbc442e-a457-4b7e-861e-a310a676fcf3"	
					}
};

let dbConn;

MongoClient.connect( processEnv.MONGODB_URI || '', {useUnifiedTopology: true} ).then( ( mongoInstance ) => {
	dbConn = mongoInstance.db( processEnv.MONGODB_NAME || 'subs' );
	sendLargeMailing();
}).catch( (e) => {
	console.log("%s MongoDB ERROR: %s", chalk.red('x'), e );
});

async function sendLargeMailing(){
	let subsConfirmed = dbConn.collection("subsConfirmed").find({});

	while( await subsConfirmed.hasNext()){
		let subscriber = await subsConfirmed.next();

		console.log("posting to /subs/sendMailing for email: " + subscriber.email);
		options.body.email = subscriber.email;
		restClient(options);
	}
	
	console.log("Done");
}
