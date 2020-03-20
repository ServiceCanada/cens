/*==========================
 * Subscriptions
 *
 * @description: Managing the client subscription to be notified about a given topic
 * @author: Government of Canada; @duboisp
 * @version: 0.1
 ===========================*/

const NotifyClient = require('notifications-node-client').NotifyClient; // https://docs.notifications.service.gov.uk/node.html#node-js-client-documentation

const nbMinutesBF = process.env.notSendBefore || 25; // Default of 25 minutes.
const failURL = process.env.notSendBefore || "https://canada.ca/" ; // Fail URL like if the email confirmation has failed


const dbConn = module.parent.exports.dbConn;


//
// Add email to the newSubscriberEmail
//
// @return; a JSON response 
//
exports.addEmail = async ( req, res, next ) => {
	
	

	const email = "pierre.dubois@servicecanada.gc.ca",
		topicId = "test",
		currDate = new Date();
	
	// Request param: email, topicId
	
	// Validate if email is the good format (something@something.tld)
	// TODO: validate parameters.

	// Select Topic where email $nin "subs"
	const colTopic = dbConn.collection( "topics" );
	
	try {
		const topic = await colTopic.findOne( { _id: topicId, subs: { $nin: [ email ] } } ); // fyi - return null when there is no result.

		// If email found, try to resend
		if (! topic ) {
			console.log( "RESEND confirm email: " + email );
			return resendEmailNotify( email, topicId )
					.then( () => { 
						// answer a positive JSON response
						//res.redirect( topic.confirmSubUrl ) 
					} )
					.catch( ( e ) => {
						// answer a negative JSON response + reason code
					} );
		}
		
		// We complete the transaction
		console.log( topic );
		
		// Generate an simple Unique Code
		const confirmCode = Math.floor(Math.random() * 999999) + "" + currDate.getMilliseconds(),
			tId = topic.templateId,
			nKey = topic.notifyKey;
		
		// Insert in subsToConfirm
		await dbConn.collection( "subsUnconfirmed" ).insertOne( {
			email: email,
			subscode: confirmCode,
			topicId: topicId,
			notBefore: currDate.setMinutes( currDate.getMinutes() + nbMinutesBF ),
			createAt: currDate,
			tId: tId,
			nKey: nKey,
			cURL: topic.confirmSuccessURL
		});
		
		// Update - Add to topic subs array
		await colTopic.updateOne( 
			{ _id: topicId },
			{
				$push: {
					subs: email
				}
			});

		// Send confirm email
		sendNotifyConfirmEmail( email, confirmCode, tId, nKey );
		
		res.json( { statusCode: "200" } );
	
	} catch ( e ) { 
	
		// The query has not ran
		console.log( e );
		
		res.json( { statusCode: "500" } );
	}

	
	// sendNotifyConfirmEmail( email, confirmCode, templateId, NotifyKey );
};

//
// Resend email notify
//
resendEmailNotify = ( email, topicId ) => {
	
	// Select SubToConfirmed where Email + noResendBefore > 25min
	// If not found, exit with success
	
	// If found, 
	//	-> get the confirmCode
	//	-> resend a confirmation email
	//	-> log the resend
	
	sendNotifyConfirmEmail( email, confirmCode, templateId, NotifyKey );
}

//
// Send an email through Notify API
//
sendNotifyConfirmEmail = async ( email, confirmCode, templateId, NotifyKey ) => {
	
	return true;
	
	
	// There is 1 personalisation, the confirm links
	// /subs/confirm/:subscode/:email
	
	var notifyClient = new NotifyClient( "https://api.notification.alpha.canada.ca", NotifyKey );
	// TODO cache the notifyClient
	
	await notifyClient
		.sendEmail( templateId, email, {
			personalisation: { confirm_link: "https://apps.canada.ca/x-notify/subs/confirm/" + confirmCode + "/" + email },
			reference: "x-notify_subs_confirm"
		})
		//.then(response => console.log(response))
		//.catch(err => console.error(err))

}

//
// Confirm subscription email
//
// @return; a HTTP redirection
//
exports.confirmEmail = ( req, res, next ) => {

	// Request param: email, confirmCode

	// findOneAndDelete()
	
	// Select docs in subToConfirms
	// Not found -> exit error || Check if is already subscribed?
	
	// Create doc in subsConfirmed
	// Create doc in subs_logs (async)

	// HTTP Redirect to the confirmation success page
};


//
// Remove subscription of unconfirmed email
//
// @return; a HTTP redirection
// @description: To ease testing
//
exports.removeUnconfirmEmail = ( req, res, next ) => {

	// Request param: email, confirmCode
	const { subscode, email } = req.params;
	
	// TODO: validate parameters.

	dbConn.collection( "subsUnconfirmed" ).findOneAndDelete( { email: email, subscode: subscode } ).then( ( docSubs ) = {

		// update topics
		dbConn.collection( "topics" ).updateOne( 
		{ _id: docSubs.value.topicId },
		{
			$pull: {
				subs: email
			}
		});

		// Redirect to Generic page to confirm the email is removed
		res.redirect( "https://universallabs.org/labs" );

	} ).catch( () => {
		res.redirect( "https://universallabs.org" );
	});

};

exports.removeUnconfirmEmailBack2056 = async ( req, res, next ) => {

	// Request param: email, confirmCode
	const { subscode, email } = req.params;
	
	// TODO: validate parameters.

	const docSubs = await dbConn.collection( "subsUnconfirmed" ).findOneAndDelete( { email: email, subscode: subscode } );


	// Redirect to general error page, entry not found
	if ( !docSubs ) {
		res.redirect( "https://universallabs.org" );
		return;
	}
	
	// update topics
	await dbConn.collection( "topics" ).updateOne( 
	{ _id: docSubs.value.topicId },
	{
		$pull: {
			subs: email
		}
	});

	// Redirect to Generic page to confirm the email is removed
	await res.redirect( "https://universallabs.org/labs" )

};

//
// Remove subscription email
//
// @return; a HTTP redirection
//
exports.removeEmail = ( req, res, next ) => {

	// Request param: email, confirmCode
	const { subscode, email } = req.params;
	
	// findOneAndDeleted in subsConfirmedEmail document
	// Create subs_log
	
	// Get topic unsubs redirect link
	
	// Remove the email in the "subs" list in Topics (FindOneAndUpdate)
	
	// Redirect to confirm page
};

//
// Get all subscription associated to the email|phone
//
exports.getAll = (confirmCode, email, phone) => {

};


/*
todo. Notify error code logging

.statusCode
details

*/




