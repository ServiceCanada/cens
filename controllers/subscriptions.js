/*==========================
 * Subscriptions
 *
 * @description: Managing the client subscription to be notified about a given topic
 * @author: Government of Canada; @duboisp
 * @version: 0.1
 ===========================*/

 
const dbConn = module.parent.exports.dbConn;
var NotifyClient = require('notifications-node-client').NotifyClient; https://docs.notifications.service.gov.uk/node.html#node-js-client-documentation


//
// Add email to the newSubscriberEmail
//
exports.addEmail = ( req, res, next ) => {

	const mongo = context.conn.mongo;
	
	// Request param: email, topicId
	
	// Validate if email is the good format (something@something.tld)

	// Select Topic where email $nin "subs"
	const colTopic = dbConn.collection( "topics" );
	
	try {
		const topic = await colTopic.findOne( { _id: topicId, subs: { $nin: [ email ] } } );
		
		console.log( topic );
		
		return resendEmailNotify( email, topicId, topic.templateId, topic.notifyKey )
					.then( () => { 
						// answer a positive JSON response
						//res.redirect( topic.confirmSubUrl ) 
					} )
					.catch( ( e ) => {
						// answer a negative JSON response + reason code
					} );
	} catch ( e ) { 
	
		// Expected to fail if no record is found
		console.log( e );
		
	}

	// Generate an simple Unique Code ( like now().miliseconds )
	// Insert in subsToConfirm
	// Update - Add to topic subs array
	// Send confirm email
	
	// sendNotifyConfirmEmail( email, confirmCode, templateId, NotifyKey );
};

//
// Resend email notify
//
resendEmailNotify = ( email, topicId, templateId, NotifyKey ) = {
	
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
sendNotifyConfirmEmail = ( email, confirmCode, templateId, NotifyKey ) = {
	
	// There is 1 personalisation, the confirm links
	// /subs/confirm/:subscode/:email
	
	var notifyClient = new NotifyClient( NotifyKey );
	
	notifyClient
		.sendEmail( templateId, email, {
			personalisation: { confirm_link: "https://apps.canada.ca/x-notify/subs/confirm/" + confirmCode + "/" + email },
			reference: "x-notify_subs_confirm"
		})
		.then(response => console.log(response))
		.catch(err => console.error(err))

}

//
// Confirm subscription email
//
exports.confirmEmail = ( req, res, next ) => {

	// Request param: email, confirmCode

	// findOneAndDelete()
	
	// Select docs in subToConfirms
	// Not found -> exit error
	
	// Create doc in subsConfirmed
	// Create doc in subs_logs (async)

	// HTTP Redirect to the confirmation success page
};

//
// Remove subscription email
//
exports.removeEmail = ( req, res, next ) => {

	// Request param: email, confirmCode
	
	// findOneAndDeleted in subsConfirmedEmail document
	// Create subs_log
	
	// Get topic unsubs redirect link
	
	// Remove the email in the "subs" list in Topics (FindOneAndUpdate)
	
	// Redirect to confirm page
};

//
// Get all subscription associated to the email|phone
//
exports.getAll = (confirmCode, email, phone) = {

};
