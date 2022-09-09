/*==========================
 * APPS-157
 *
 * @description: Script is to resend confirmation emails from "subsUnconfirmed" database
 * @author: Government of Canada; @shiva
 * @version: 0.1
 * Command to run this script: docker exec -i x-notify /bin/bash -c "node scripts/apps-157.js"
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
	iterateUnconfirmed();
}).catch( (e) => {
	console.log("%s MongoDB ERROR: %s", chalk.red('x'), e );
});

/**
 * This is the main script function.  It is a while loop that 
 * asynchronously iterates over all unconfirmed test subscribers
 * and confirms them via an http GET to the /subs/unconfirm/ 
 * endpoint.
 */
async function iterateUnconfirmed(){
	let subsUnconfirmed = dbConn.collection("subsUnconfirmed").find({
        $and: [
                {
                    createdAt: {
                        $gte: new Date("2022-08-09T10:45:00.000-04:00")
                      }
                },
                {
                    createdAt: {
                        $lte: new Date("2022-09-01T11:36:59.999-04:00")
                      }
                }
            ]
       });
	
	console.log("subsUnconfirmed  count" + await subsUnconfirmed.count());
	let numberOfEmailSent = 0;

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

        restClient(options)
        .then(response => console.log(response))
        .catch(err => {
			if ( err.statusCode != 302) {
				console.log('Error: ' + err)
				console.log("subscriber  subscriber.topicId" + subscriber.topicId);
				console.log("subscriber  subscriber.subscode" + subscriber.subscode);
			}
		})

        numberOfEmailSent ++;

        if (numberOfEmailSent % 40) {
            // wait 1000 milisecond
			await new Promise(resolve => setTimeout(resolve, 1000));
        }


	}
	console.log("numberOfEmailSent: " + numberOfEmailSent);
	process.exit();
}

