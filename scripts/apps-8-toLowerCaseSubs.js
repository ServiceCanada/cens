const dotenv = require('dotenv');  // Application configuration
const MongoClient = require('mongodb').MongoClient;
const chalk = require('chalk');  // To color message in console log

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
	
	toLowerCaseSubsConfirmed();
	toLowerCaseSubsExist();
	toLowerCaseSubsUnconfirmed();
}).catch( (e) => { console.log( "%s MongoDB ERRROR: %s", chalk.red('✗'), e ) } );

async function toLowerCaseSubsConfirmed() {
	let numUpperCaseFound = 0;
	let cursor = dbConn.collection("subsConfirmed").find({});

	while( await cursor.hasNext()){
		let doc = await cursor.next();
		console.log("Collection subsConfirmed checking for upperCase against " + doc.email);

		if(doc.email != doc.email.toLowerCase()){
			console.log("Calling toLowerCase() on: " + doc.email + "\n");
			numUpperCaseFound++;
		
			// toLowerCase() on email containing upperCase
			const lowerCased = await dbConn.collection("subsConfirmed").findOneAndUpdate(
				{
					email: doc.email
				},
				{
					$set: { email: doc.email.toLowerCase() }
				}
			)
		}else{
			console.log(doc.email + " is already all lowercase\n");
		}
	}

	console.log("Total upper cases found and corrected in collection subsConfirmed: " + numUpperCaseFound + "\n\n");
}

async function toLowerCaseSubsExist() {
	let numUpperCaseFound = 0;
	let cursor = dbConn.collection("subsExist").find({});

	while( await cursor.hasNext()){
		let doc = await cursor.next();
		console.log("Collection subsExist checking for upperCase against " + doc.e);

		if(doc.e != doc.e.toLowerCase()){
			console.log("Calling toLowerCase() on: " + doc.e + "\n");
			numUpperCaseFound++;
		
			// toLowerCase() on email containing upperCase
			const lowerCased = await dbConn.collection("subsExist").findOneAndUpdate(
				{
					e: doc.e
				},
				{
					$set: { e: doc.e.toLowerCase() }
				}
			)
		}else{
			console.log(doc.e + " is already all lowercase\n");
		}
	}

	console.log("Total upper cases found and corrected in collection subsExist: " + numUpperCaseFound + "\n\n");
}

async function toLowerCaseSubsUnconfirmed() {
	let numUpperCaseFound = 0;
	let cursor = dbConn.collection("subsUnconfirmed").find({});

	while( await cursor.hasNext()){
		let doc = await cursor.next();
		console.log("Collection subsUnconfirmed checking for upperCase against " + doc.email);

		if(doc.email != doc.email.toLowerCase()){
			console.log("Calling toLowerCase() on: " + doc.email + "\n");
			numUpperCaseFound++;
		
			// toLowerCase() on email containing upperCase
			const lowerCased = await dbConn.collection("subsUnconfirmed").findOneAndUpdate(
				{
					email: doc.email
				},
				{
					$set: { email: doc.email.toLowerCase() }
				}
			)
		}else{
			console.log(doc.email + " is already all lowercase\n");
		}
	}

	console.log("Total upper cases found and corrected in collection subsUnconfirmed: " + numUpperCaseFound + "\n\n");
}
