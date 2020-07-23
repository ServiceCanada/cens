/*==========================
 * Mailing - controller
 *
 * @description: Managing actions for the mailing management
 * @author: Government of Canada; @duboisp
 * @version: 1.0
 *
 ===========================*/
 
const dbConn = module.parent.parent.exports.dbConn;
const ObjectId = require('mongodb').ObjectId;

const { Worker } = require('worker_threads');

const _mailingState = {
	cancelled: "cancelled",
	draft: "draft",
	completed: "completed",
	approved: "approved",
	sending: "sending",
	sent: "sent"

};

exports.mailingState = _mailingState

/*
 * Get list of Mailing for the given topics
 */
exports.mailingListing = async ( topics ) => {
	// Produce a list of mailingID
	
	// Ensure that topics is an array
	topics = Array.isArray( topics ) ? topics : [ topics ];
	
	const rDoc = await dbConn.collection( "mailing" ).find( 
		{
			topicId: { $in: topics }
		},
		{
			projection: {
				title: 1,
				topicId: 1,
				createdAt: 1,
				updatedAt: 1,
				state: 1
			},
			sort: {
				createdAt: -1,
				updatedAt: -1
			}
		});
	
	return rDoc.toArray();
}

exports.mailingCreate = async ( paramTopicId, paramTitle ) => {
	// Create an empty mailing and show "mailingView"
	
	// Input: TopicID, Name
	const topicId = paramTopicId,
		mailingTitle = paramTitle + "" || "",
		currDate = new Date();
	
	// Validate topicId
	const topic = getTopic( topicId );

	if ( !topic ) {
		console.log( "mailingCreate: no topic: " + topicId );
		throw Error( "Can't create a topic" );
	}
	
	// Validate mailingName
	if ( !mailingTitle.length ) {
		console.log( "mailingCreate: Empty name: " + mailingTitle );
		throw Error( "Can't create a topic" );
	}
	
	// Create the mailing
	let rInsert = await dbConn.collection( "mailing" ).insertOne( 
		{
			topicId: topicId,
			title: mailingTitle,
			createdAt: currDate,
			state: _mailingState.draft
		});
	
	// Return: New MailingID
	return rInsert.insertedId;
	
}

exports.mailingView = mailingView;
async function mailingView( paramMailingId ) {
	// Input: MailingID
	
	const rDoc = await dbConn.collection( "mailing" ).findOne( { _id: ObjectId( paramMailingId ) } );
	
	if ( !rDoc ) {
		console.log( "mailingView: Invalid mailing id: " + paramMailingId );
		throw new Error( "Mailing unavailable" );
	}
	
	return {
		id: rDoc._id,
		topicId: rDoc.topicId,
		title: rDoc.title,
		state: rDoc.state,
		createdAt: rDoc.createdAt,
		updatedAt: rDoc.updatedAt || rDoc.createdAt,
		subject: rDoc.subject || "Mailing",
		body: rDoc.body || "Type your content here",
		history: rDoc.history || []
	}
}

exports.mailingGetHistory = async ( mailingId ) => {
	// Get all history for the given mailingId

	const rDoc = await dbConn.collection( "mailingHistory" ).find( 
		{
			mailingId: ObjectId( mailingId )
		},
		{
			sort: {
				createdAt: -1
			}
		});
	
	return rDoc.toArray();
}

exports.mailingCancelled = async ( mailingId ) => {
	// Set state to "cancelled"
	
	await mailingUpdate( mailingId, _mailingState.cancelled );

	return true;
}

async function mailingSave ( mailingId, title, subject, body, comments ) {
	// Save the draft email
	// Set state to "draft"
	
	const rDoc = await mailingUpdate( mailingId, _mailingState.draft, {
			comments: comments,
			$set: {
				title: title,
				subject: subject,
				body: body,
			}
		} );
	
	return mailingView( mailingId );
}
exports.mailingSave = mailingSave;

exports.mailingSaveTest = async ( email, mailingId, title, subject, body, comments ) => {
	// Send a test email to the current logged user email
	// Set state to "draft"
	
	const rSave = await mailingSave( mailingId, title, subject, body, comments );
		
	// TODO: Change for current user email
	sendMailing( 
		[
			{
				email: email,
				subscode: "mailingSaveAndTest"
			}
		], mailingId, rSave.topicId, subject, body );

	return rSave;
}

exports.mailingApproval = async ( mailingId ) => {
	// Send a test email to the predefined list of emails
	// Set state to "completed"
	
	const mailingInfo = await mailingUpdate( mailingId, _mailingState.completed );

	
	// Send the mailing to the "approval email list"
	let tDetails = await dbConn.collection( "topics_details" ).findOne( 
		{
			_id: mailingInfo.topicId
		},
		{
			projection: {
				approvers: 1
			}
		}
	);
	
	if ( !tDetails || !tDetails.approvers ) {
		console.log( "mailingSendToApproval-No approvals email for : " + mailingInfo.topicId );
		throw new Error( "No approvals email for : " + mailingInfo.topicId );
	}
	
	sendMailing ( tDetails.approvers, mailingInfo._id, mailingInfo.topicId, mailingInfo.subject, mailingInfo.body );
}

exports.mailingApproved = async ( mailingId ) => {
	// Need to be in current state "completed"
	// Set state to "approved"
	
	// await mailingUpdate( mailingId, _mailingState.approved, { historyState: _mailingState.completed } ); // To enfore it's current state is completed.
	await mailingUpdate( mailingId, _mailingState.approved );

	return true;
	
}

exports.mailingCancelSendToSub = async ( mailingId ) => {
	// TODO: stop the worker and Set the state to "cancelled"
}

exports.mailingSendToSub = async ( mailingId ) => {
	// Need to be in current state "approved"

	const rDoc = await mailingUpdate( mailingId, _mailingState.sending, { historyState: _mailingState.approved } );
	

	// Check if the operation was successful, if not we know the error is already logged
	if ( !rDoc ) {
		return true;
	}
	
	// Do the sending
	sendMailingToSubs( mailingId, rDoc.topicId, rDoc.subject, rDoc.body );
	
	
	// When completed, change state to "sent"
	
}

// Update an history item for the mailing
async function mailingUpdate( mailingId, newHistoryState, options ) {

	// If option is undefined
	options = options || {};
	
	const historyState = options.historyState || false,
		comments = options.comments || false
		$set = options.$set || {};

	const currDate = new Date();
	
	// Create the history item
	let history = 
		{
			state: newHistoryState,
			createdAt: currDate
		}
	if ( comments ) {
		history.comments = comments;
	}
	
	// Create the historyEntry
	let rInsert = await dbConn.collection( "mailingHistory" ).insertOne( 
		Object.assign( {},
			history,
			{
				mailingId: ObjectId( mailingId )
			}
		)
	);
	history.historyId = rInsert.insertedId;
	
	// Update the mailing
	let findQuery = {
		_id: ObjectId( mailingId )
	};
	if ( historyState ) {
		findQuery.state = historyState
	}
	const rDoc = await dbConn.collection( "mailing" ).findOneAndUpdate( 
		findQuery,
		{
			$set: Object.assign( {}, $set, {
					state: newHistoryState
				}
			),
			$push: {
				history: {
					$each: [ history ],
					$slice: -7,
				}
			},
			$currentDate: { 
				updatedAt: true
			}
			
		}
	);
	
	// Check if the operation was successful, if not, we need to log in the history
	if ( !rDoc.ok ) {
	
		let historyFail = {
			createdAt: currDate,
			state: historyState || _mailingState.draft, // Put it back as draft if previous state is unknown
			comments: newHistoryState + " fail",
			mailingId: ObjectId( mailingId )
		};
		
		const rInsertFail = dbConn.collection( "mailingHistory" ).insertOne( 
			historyFail
		);
		historyFail.historyId = rInsertFail.insertedId;
		
		dbConn.collection( "mailing" ).findOneAndUpdate( 
			{
				_id: ObjectId( mailingId ),
				state: newHistoryState
			},
			{
				$set: {
					state: historyState || _mailingState.draft // Put it back as draft if previous state is unknown
				},
				$push: {
					history: {
						$each: [ historyFail ],
						$slice: -7,
					}
				}
				
			}
		);
	}
	
	// Send the mailing to the "approval email list"
	return rDoc.value;
}


// Simple worker to send mailing
async function sendMailingToSubs ( mailingId, topicId, mailingSubject, mailingBody ) {
	
	// When completed, change state to "sent"

	// Start the worker.
	const worker = new Worker( './controllers/workerSendEmail.js', {
		workerData: {
			topicId: topicId,
			mailingBody: mailingBody,
			mailingSubject: mailingSubject,
			typeMailing: "msgUpdates",
			sentTo: "allSubs",
			dbConn: true //dbConn
		}
	});
	
	worker.on('message', function(msg){
		
		if ( msg.completed ) {
			
			mailingUpdate( mailingId, _mailingState.sent, { historyState: _mailingState.sending } );
			
			// Change the status of the mailing and mark it completed
			console.log( "Send to subs - Completed: " + mailingId );
		}
		
		console.log( msg.msg );
	});
	
    worker.on('error', function(msg){
		console.log( "Send to subs - Worker ERRROR: " + msg );
	});
	
}

// Simple worker to send mailing
async function sendMailing ( sendToEmails, mailingId, topicId, mailingSubject, mailingBody ) {
	
	// Ensure that we have an array of emails
	if ( !Array.isArray( sendToEmails ) ) {
		console.log( "Need a valid emails list" );
		throw new Error ( "Need a valid emails list" );
	}

	// Start the worker.
	const worker = new Worker( './controllers/workerSendEmail.js', {
		workerData: {
			topicId: topicId,
			mailingBody: mailingBody,
			mailingSubject: mailingSubject,
			typeMailing: "msgUpdates",
			sentTo: sendToEmails,
			dbConn: true //dbConn
		}
	});
	
	worker.on('message', function(msg){
		
		if ( msg.completed ) {
			// Change the status of the mailing and mark it completed
			console.log( "sendMailing - Completed: " + mailingId );
		}
		
		console.log( msg.msg );
	});
	
    worker.on('error', function(msg){
		console.log( "sendMailing - Worker ERRROR: " + msg );
	});
	
}



/*
 *
 * Helper taken from subscription
 */
// Get the topic
let topicCached = [],
	topicCachedIndexes = [];
const _topicCacheLimit = process.env.topicCacheLimit || 50;

getTopic = ( topicId ) => {

	let topic = topicCached[ topicId ];
	
	if ( !topic ) {
		
		topic = dbConn.collection( "topics" ).findOne( 
			{ _id: topicId },
			{ projection: {
					_id: 1,
					templateId: 1,
					nTemplateMailingId: 1,
					notifyKey: 1,
					confirmURL: 1,
					unsubURL: 1,
					thankURL: 1,
					failURL: 1,
					inputErrURL: 1
				} 
			} ).catch( (e) => {
				console.log( "getTopic" );
				console.log( e );
				return false;
			});

		topicCached[ topicId ] = topic;
		topicCachedIndexes.push( topicId );
		
		// Limit the cache to the last x topics
		if ( topicCachedIndexes.length > _topicCacheLimit ) {
			delete topicCached[ topicCachedIndexes.shift() ];
		}
	
	}
	
	return topic;
		
}