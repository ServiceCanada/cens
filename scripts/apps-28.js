/*==========================
 * APPS-28
 *
 * @description: Script to add the createdAt to existing subscription
 * @author: Government of Canada; @duboisp
 * @version: 0.1
 ===========================*/

/* **************************
// SIDE NOTE:   data change
   **************************
subsUnconfirmed
- Renamed createAt => createdAt

subsRecents
- Renamed created => createdAt

subsUnsubs (will be done by the script bellow)
- Rename c => unsubAt
- Rename e => email
- Rename t => topicId

subsConfirmed
- New confirmAt: date
*/
 
const dotenv = require('dotenv'); // Application configuration
const path = require('path');
const chalk = require('chalk'); // To color message in console log 
const MongoClient = require('mongodb').MongoClient;


/**
 * Load environment variables from .env file, where API keys and passwords are configured.
 */
dotenv.config({
    path: '.env'
});

const processEnv = process.env;
let dbConn;

MongoClient.connect( processEnv.MONGODB_URI || '', {useUnifiedTopology: true} ).then( ( mongoInstance ) => {

		dbConn = mongoInstance.db( processEnv.MONGODB_NAME || 'subs' );
		
		init();

	}).catch( (e) => { console.log( "%s MongoDB ERRROR: %s", chalk.red('✗'), e ) } );


//
// Script pre-condition
//
/* Clone the collection

use mongoexport and mongoimport to clone the following collection.

* subsConfirmed => script_subsConfirmed
* subsUnsubs => script_subsUnsubs

mongoexport -d subs -c subsConfirmed | mongoimport -d subs -c script_subsConfirmed --drop

mongoexport -d subs -c subsUnsubs | mongoimport -d subs -c script_subsUnsubs --drop

*/


async function init() {

	let result = true,
		i = 0;
	
	while ( result ) {
		console.log( i );
		result = await confirmed();
		
		i ++;
	}
	
	console.log( "Confirmed completed" );
	
	result = true;
	i = 0;
	
	while ( result ) {
		console.log( i );
		result = await unsub();
		
		i ++;
	}

	console.log( "Unsub completed" );

}


async function confirmed() {
	
	const docs = await dbConn.collection( "script_subsConfirmed" ).findOneAndDelete( {} );
	
	const value = docs.value;
	
	// Is it the ends?
	if ( !value ) {
		return false; // stop
	}
	
	// Is this entry was already converted
	if ( value.createdAt ) {
		return true; // skip this one
	}
	
	// Get the corresponding subsLog
	const logs = await dbConn.collection( "subs_logs" ).findOne( { _id: value.email } );
	
	// Get the date
	const createdAt = await getCreatedAtDateForTopic( value.topicId, logs.subsEmail );
	const confirmAt = await getCreatedAtDateForTopic( value.topicId, logs.confirmEmail );
	
	// Remove 25 min of the createAt date (was added by mistake)
	createdAt.setMinutes( createdAt.getMinutes() - 25 );
	
	// Update the subsConfirmed
	dbConn.collection( "subsConfirmed" ).findOneAndUpdate(
		{
			subscode: value.subscode
		},
		{
			$set: {
				createdAt: createdAt,
				confirmAt: confirmAt
			}
		
		}
	);
	
	return true;
}


async function unsub() {

	const docs = await dbConn.collection( "script_subsUnsubs" ).findOneAndDelete( {} );

	const value = docs.value;

	// Is it the ends?
	if ( !value ) {
		return false; // stop
	}

	// Is this entry was already converted
	if ( value.createdAt ) {
		return true; // skip this one
	}

	// Get the corresponding subsLog
	const logs = await dbConn.collection( "subs_logs" ).findOne( { _id: value.e } );

	// Get the date
	const createdAt = await getCreatedAtDateForTopic( value.t, logs.subsEmail );
	const confirmAt = await getCreatedAtDateForTopic( value.t, logs.confirmEmail );

	// Remove 25 min of the createAt date (was added by mistake)
	createdAt.setMinutes( createdAt.getMinutes() - 25 );

	// Update the subsConfirmed
	dbConn.collection( "subsUnsubs" ).findOneAndUpdate(
		{
			e: value.e,
			t: value.t
		},
		{
			$set: {
				createdAt: createdAt,
				confirmAt: confirmAt,
				unsubAt: value.c,
				email: value.e,
				topicId: value.t
			},
			$unset: {
				c: "",
				e: "",
				t: ""
			}
		}
	);
	
	return true;
}

// Get the date for the topic
function getCreatedAtDateForTopic( topic, arr ) {
	
	arr = arr || [];
	
	let i_len = arr.length,
		i, i_cache;
	
	for( i = 0; i < i_len; i ++ ) {
		i_cache = arr[ i ];
		
		if ( i_cache.topicId === topic ) {
			return i_cache.createdAt;
		}
	}
	
	return false;
}
