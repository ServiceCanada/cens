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
	cleanSubsConfirmed();
}).catch( (e) => { console.log( "%s MongoDB ERRROR: %s", chalk.red('✗'), e ) } );

async function cleanSubsConfirmed() {
	let duplicates = 0;
	let subsConfirmedCursor = dbConn.collection("subsConfirmed").find({});

	while( await subsConfirmedCursor.hasNext()){
		let doc = await subsConfirmedCursor.next();
		let innerLoopCursor = dbConn.collection("subsConfirmed").find({email:{'$regex':new RegExp(doc.email,"i")}})
		console.log("Checking for duplicates against " + doc.email);

		while(await innerLoopCursor.hasNext()){
			let possibleDup = await innerLoopCursor.next();
			if(!doc._id.equals(possibleDup._id)){
				console.log(possibleDup.email + " is a duplicate of\n" + doc.email + "\n");
				duplicates++;
				// Delete duplicate
				const deleted = await dbConn.collection("subsConfirmed").deleteOne(possibleDup).catch((e)=>{
					console.log("delete from subsConfirmed");
					console.log(e);
				});
				subsConfirmedCursor = dbConn.collection("subsConfirmed").find({});
			}else{
				console.log(possibleDup.email + " is not a duplicate of " + doc.email + "\n");
			}
		}
	}

	console.log("Total duplicates removed: " + duplicates);

}
