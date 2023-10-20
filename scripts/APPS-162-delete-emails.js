/*==========================
 * APPS-162
 *
 * @description: Script to delete subscriber e-mails from a given topic
 * @author: Government of Canada; Josh Berard and Jonas Graham
 * @version: 1.0
 ===========================*/


const topicIds = ["hc-covid19en", "hc-covid19fr"]; // Replace with an array of topicIds for which you wish to clear e-mail addresses

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
let db;

MongoClient.connect( processEnv.MONGODB_URI || '', {useUnifiedTopology: true} ).then( ( mongoInstance ) => {

		db = mongoInstance.db( processEnv.MONGODB_NAME || 'subs' );
		
		run();

	}).catch( (e) => { console.log( "%s MongoDB ERRROR: %s", chalk.red('✗'), e ) } );


async function run() {
	console.log(`Deleting e-mail addresses associated with ${topicIds.join(', ')} ...`);
	await clearFromLogs(topicIds);
	let collectionsToClearEmailsFrom = ["subsConfirmed", "subsConfirmedNewCode", "subsUnconfirmed", "subsExist", "subsRecents", "subs_Unsubs"];
	
	for (let coll of collectionsToClearEmailsFrom) {
		let emailCount = await countEmailsForTopicIdByCollection(topicIds, coll);
		console.log(`found ${emailCount} entries for ${topicIds.join(', ')} in ${coll}`);
	}
	
	for (let coll of collectionsToClearEmailsFrom) {
		await deleteEmailsForTopicIdByCollection(topicIds, coll);
		console.log(`Deleted entries for ${topicIds.join(', ')} in ${coll}`);
	}
	
	for (let coll of collectionsToClearEmailsFrom) {
		let emailCount = await countEmailsForTopicIdByCollection(topicIds, coll);
		console.log(`found ${emailCount} entries for ${topicIds.join(', ')} in ${coll}`);
	}
	
	let subsExistEmailCount = await db.collection("subsExist").countDocuments({t: {$in: topicIds}});
	console.log(`found ${subsExistEmailCount} entries for ${topicIds.join(', ')} in subsExist`);
	await db.collection("subsExist").deleteMany({t: {$in: topicIds}}); 
	console.log(`Deleted entries for ${topicIds.join(', ')} in subsExist`);
	subsExistEmailCount = await db.collection("subsExist").countDocuments({t: {$in: topicIds}});
	console.log(`found ${subsExistEmailCount} entries for ${topicIds.join(', ')} in subsExist`);
	invalidateTopics(topicIds);
	console.log(chalk.green("✓ DONE!"));	
	
}

async function deleteEmailsForTopicIdByCollection(topicIds, coll) {
	await db.collection(coll).deleteMany({topicId: {$in: topicIds}});
}

async function findEmailsForTopicIdByCollection(topicIds, coll) {
	let emailArray = await db.collection(coll).findMany({topicId: {$in: topicIds}}).toArray();
	return emailArray;
}

async function countEmailsForTopicIdByCollection(topicIds, coll) {
	let emailCount = await db.collection(coll).countDocuments({topicId: {$in: topicIds}});
	return emailCount;
}

async function deleteLogsBySubsCodes(coll, subscodesToDelete) {
	await db.collection(coll).deleteMany( 
		{ 
			subscode: 
				{
					$in: subscodesToDelete
				}
		}
	);
	console.log(`Deleted logs related to subscodes related to ${topicIds.join(', ')} from ${coll}.`);
}

async function countLogsBySubsCodes(coll, subscodesToDelete) {
	let numLogsBySubsCodes = await db.collection(coll).countDocuments( 
		{ 
			subscode: 
				{
					$in: subscodesToDelete
				}
		}
	);
	console.log(`Found ${numLogsBySubsCodes} logs related to subscodes related to ${topicIds.join(', ')} from ${coll}.`);
	return numLogsBySubsCodes;
}


async function clearFromLogs(topicIds) {
	console.log("Clearing Logs...")
	let subscodesForTopics = await db.collection("subsUnconfirmed").distinct( 
		"subscode", 
		{ 
			topicId: 
				{
					$in: topicIds
				}
		}
	);
	console.log(`Found ${subscodesForTopics.length} subscodes for ${topicIds.join(', ')}`);
	
	let logCollectionsToClearBySubsCodes = ["notify_tooManyReq_logs", "notify_badEmail_logs"];
	
	for (let coll of logCollectionsToClearBySubsCodes) {
		await countLogsBySubsCodes(coll, subscodesForTopics);
		await deleteLogsBySubsCodes(coll, subscodesForTopics);
		let numLogsRemainingForSubsCodes = await countLogsBySubsCodes(coll, subscodesForTopics);
		if(numLogsRemainingForSubsCodes > 0) {
			throw new Error(`Not all logs were deleted from ${coll} for subscodes related to ${topicIds.join(', ')}.
				${numLogsRemainingForSubsCodes} logs remain.`);
		}
		let subsCodesRemainingInLog = await db.collection(coll).distinct("subscode");
		if(subsCodesRemainingInLog) {
			let numRemainingInSubsUnconfirmedForRemainingSubscodesForSpecifiedTopicIds = await db.collection("subsUnconfirmed").countDocuments(
				{
						$and: 
							[
								{
									subscode: 
										{
											$in: subsCodesRemainingInLog
										},
								},
								{ 
									topicId: 
										{
											$in: topicIds
										}
								}
							]
								
				}
			)
			
			if(numRemainingInSubsUnconfirmedForRemainingSubscodesForSpecifiedTopicIds > 0) {
				throw new Error(`Some logs still exist in ${coll} for subscodes related to ${topicIds.join(', ')}`);
			}
		}
		
		
	}
		
	let numOtherSubLogs = await db.collection("subs_logs").countDocuments(
		{
			$or: 
				 [
					  { confirmEmail: 
						   { $elemMatch: 
								{ topicId: {
									 $nin: topicIds
									 }
								}
						   }
					  },
					  { subsEmail: 
						   { $elemMatch: 
								{ topicId: {
									 $nin: topicIds
									 }
								}
						   }
					  },
					  { unsubsEmail: 
						   { $elemMatch: 
								{ topicId: {
									 $nin: topicIds
									 }
								}
						   }
					  },
					  { resendEmail: 
						   { $elemMatch: 
								{ topicId: {
									 $nin: topicIds
									 }
								}
						   }
					  }
					  
				 ]
		}
	);

	console.log(`There are ${numOtherSubLogs} logs for subscribers who are subscribed to at least one topic OTHER than ${topicIds.join(', ')}`)
	
	await db.collection("subs_logs").deleteMany({
     $nor: 
		 [
			  { confirmEmail: 
				   { $elemMatch: 
						{ topicId: {
							 $nin: topicIds
							 }
						}
				   }
			  },
			  { subsEmail: 
				   { $elemMatch: 
						{ topicId: {
							 $nin: topicIds
							 }
						}
				   }
			  },
			  { unsubsEmail: 
				   { $elemMatch: 
						{ topicId: {
							 $nin: topicIds
							 }
						}
				   }
			  },
			  { resendEmail: 
				   { $elemMatch: 
						{ topicId: {
							 $nin: topicIds
							 }
						}
				   }
			  }
			  
		 ]
	});
	
	let arraysToPullFrom = ["confirmEmail", "subsEmail", "unsubsEmail", "resendEmail"];
	for (let arr of arraysToPullFrom) {
		await pull("subs_logs", topicIds, arr);
	}
	
	let numSubLogs = await db.collection("subs_logs").countDocuments();
	if(numSubLogs > numOtherSubLogs) {
		throw new Error(`We may not have deleted all subs_logs related to ${topicIds.join(', ')} in the subs_logs collection.
			${numSubLogs} logs remain.  
			But only ${numOtherSubLogs} are for subscribers who are subscribed to at least one topic OTHER than ${topicIds.join(', ')}`);
	}
	else if(numSubLogs < numOtherSubLogs) {
		throw new Error(`We may have deleted logs for subscribers to topics other than ${topicIds.join(', ')} in the subs_logs collection.
			There were ${numOtherSubLogs} for subscribers who are subscribed to at least one topic OTHER than ${topicIds.join(', ')}.
			But now, only ${numSubLogs} logs remain.`);
	}
	
	let numSubLogsWithSpecTopicIds = await db.collection("subs_logs").countDocuments(
		{
			$or: 
				 [
					  { confirmEmail: 
						   { $elemMatch: 
								{ topicId: {
									 $in: topicIds
									 }
								}
						   }
					  },
					  { subsEmail: 
						   { $elemMatch: 
								{ topicId: {
									 $in: topicIds
									 }
								}
						   }
					  },
					  { unsubsEmail: 
						   { $elemMatch: 
								{ topicId: {
									 $in: topicIds
									 }
								}
						   }
					  },
					  { resendEmail: 
						   { $elemMatch: 
								{ topicId: {
									 $in: topicIds
									 }
								}
						   }
					  }
					  
				 ]
		}
	);
	
	if(numSubLogsWithSpecTopicIds > 0) {
		throw new Error(`We didn't delete all the sub logs for ${topicIds.join(', ')}. 
			${numSubLogsWithSpecTopicIds} logs related to ${topicIds.join(', ')} remain in the subs_logs collection.`);
	}
	
	
}

async function pull(coll, topicIds, arrayToPullFrom) {
	let updateQuery = { $pull: { } };
	console.log(`Removing entries related to ${topicIds.join(', ')} from ${arrayToPullFrom} in the ${coll} collection
		for subscribers also subscribed to topics OTHER than ${topicIds.join(', ')}`)
	updateQuery["$pull"][arrayToPullFrom] = { topicId: { $in: topicIds } };
	await db.collection(coll).updateMany({}, updateQuery);
}

async function invalidateTopics(topicIds) {
	console.log(`Nullifying notifyKey and URLs for ${topicIds.join(', ')}`)
	let findQuery = { _id: { $in: topicIds } };
	let updateQuery = { 
		$set: 
			{
				notifyKey: null,
				confirmURL: null,
				unsubURL: null,
				failURL: null
			} 
		}
	await db.collection( "topics" ).updateMany(findQuery, updateQuery);
}
