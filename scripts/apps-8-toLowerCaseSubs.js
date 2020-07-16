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
	
	toLowerCaseSubsConfirmed()
	.then(()=>{
		toLowerCaseSubsExist();
	})
	.then(()=>{
		toLowerCaseSubsUnconfirmed();
	});
}).catch( (e) => { console.log( "%s MongoDB ERRROR: %s", chalk.red('✗'), e ) } );

/**
 * This function will lowercase all email values of the documents
 * found in the subsConfirmed collection unless a duplicate would 
 * be created.  If a duplicate would be created the entry is 
 * deleted
 */
async function toLowerCaseSubsConfirmed() {
	let numUpperCaseFound = 0;
	let numDuplicatesRemoved = 0;
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
			).catch((err)=>{
				if(err.code == 11000){ //duplicate key error, remove entry
					console.log('Removing duplicate: ' + doc.email + "\n");
					dbConn.collection("subsConfirmed").findOneAndDelete({email:doc.email});
					numDuplicatesRemoved++;
				}
			})
		}else{
			console.log(doc.email + " is already all lowercase\n");
		}
	}

	console.log("Total upper cases found and corrected in collection subsConfirmed: " + numUpperCaseFound);
	console.log("Total duplicates found and corrected in collection subsConfirmed: " + numDuplicatesRemoved + "\n\n");
}

/**
 * This function will lowercase all email values of the documents
 * found in the subsExist collection unless a duplicate would 
 * be created.  If a duplicate would be created the entry is 
 * deleted
 */
async function toLowerCaseSubsExist() {
	let numUpperCaseFound = 0;
	let numDuplicatesRemoved = 0;
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
			).catch((err)=>{
				if(err.code == 11000){ //duplicate key error, remove entry
					console.log('Removing duplicate: ' + doc.e + "\n");
					dbConn.collection("subsExist").findOneAndDelete({e:doc.e});
					numDuplicatesRemoved++;
				}
			})
		}else{
			console.log(doc.e + " is already all lowercase\n");
		}
	}

	console.log("Total upper cases found and corrected in collection subsExist: " + numUpperCaseFound);
	console.log("Total duplicates found and corrected in collection subsExist: " + numDuplicatesRemoved + "\n\n");
}

/**
 * This function will lowercase all email values of the documents
 * found in the subsUnconfirmed collection.  It does not remove 
 * duplicates.
 */
async function toLowerCaseSubsUnconfirmed() {
	let numUpperCaseFound = 0;
	let numDuplicatesRemoved = 0;
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
			).catch((err)=>{
				console.log('Unexpected error processing: ' + doc.email + "\n");
			})
		}else{
			console.log(doc.email + " is already all lowercase\n");
		}
	}

	console.log("Total upper cases found and corrected in collection subsUnconfirmed: " + numUpperCaseFound);
	console.log("Total duplicates found and corrected in collection subsUnconfirmed: " + numDuplicatesRemoved + "\n\n");
}
