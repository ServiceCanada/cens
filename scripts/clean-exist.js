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
	cleanSubsExist();
}).catch( (e) => { console.log( "%s MongoDB ERRROR: %s", chalk.red('✗'), e ) } );

async function cleanSubsExist() {
	let duplicates = 0;
	let subsExistCursor = dbConn.collection("subsExist").find({});

	while( await subsExistCursor.hasNext()){
		let doc = await subsExistCursor.next();
		let innerLoopCursor = dbConn.collection("subsExist").find({e:{'$regex':new RegExp(doc.e,"i")}})
		console.log("Checking against " + doc.e);

		while(await innerLoopCursor.hasNext()){
			let possibleDup = await innerLoopCursor.next();
			if(!doc._id.equals(possibleDup._id)){
				console.log(possibleDup.e + " is a duplicate of\n" + doc.e + "\n");
				duplicates++;
				// Delete duplicate
				const deleted = await dbConn.collection("subsExist").deleteOne(possibleDup).catch((e)=>{
					console.log("delete from subsExist");
					console.log(e);
				});
				subsExistCursor = dbConn.collection("subsExist").find({});
			}else{
				console.log(possibleDup.e + " is not a duplicate of " + doc.e + "\n");
			}
		}
	}

	console.log("Total duplicates removed: " + duplicates);

}
