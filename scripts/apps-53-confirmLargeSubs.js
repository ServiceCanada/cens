/*==========================
 * APPS-53
 *
 * @description: Script to fetch and confirm all unconfirmed test
 * 				subscribers to a topic.
 * @author: Government of Canada; @luc.l.bertrand
 * @version: 0.1
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

const processEnv = process.env;
const baseUrl = 'http://localhost:8080/subs/confirm/';

let dbConn;

MongoClient.connect( processEnv.MONGODB_URI || '', {useUnifiedTopology: true} ).then( ( mongoInstance ) => {
	dbConn = mongoInstance.db( processEnv.MONGODB_NAME || 'subs' );
	iterateUnconfirmed();
}).catch( (e) => {
	console.log("%s MongoDB ERROR: %s", chalk.red('x'), e );
});

/**
 * Set the restClient options
 */
var options = {
      method: 'GET',
      uri: 'http://localhost:8080/subs/confirm/',
    };

/**
 * This is the main script function.  It is a while loop that 
 * asynchronously iterates over all unconfirmed test subscribers
 * and confirms them via an http GET to the /subs/confirm/ 
 * endpoint.
 */
async function iterateUnconfirmed(){
	let subsUnconfirmed = dbConn.collection("subsUnconfirmed").find({});

	while( await subsUnconfirmed.hasNext()){
		let subscriber = await subsUnconfirmed.next();
		
		if(subscriber.email.includes("email")){
			options.uri = baseUrl + subscriber.subscode.toHexString();
			restClient(options)
				.catch(err => console.log('Error: ' + err))
		}
	}
}
