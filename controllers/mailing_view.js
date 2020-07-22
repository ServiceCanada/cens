/*==========================
 * Mailing - views controller
 *
 * @description: Managing views actions for the mailing management
 * @author: Government of Canada; @duboisp
 * @version: 1.0
 *
 ===========================*/
 
const mustache = require('mustache');
const fsPromises = require('fs').promises;
const mailing = require('./mailing');
const _mailingState = mailing.mailingState;
const _baseRedirFolder = ( process.env.baseFolder || "" ) + "/api/v1/mailing/";
 
async function renderTemplate( tmplName, data ) {
	// Get the view, mustache template
	// Render and return the result.
	
	let createTemplate = await fsPromises.readFile( 'views/' + tmplName, 'UTF-8' );
	return mustache.render( createTemplate, data );
}


/*
 * Management of Mailing
 */
exports.v_mailingManage = async ( req, res, next ) => {

	const userId = req.body.userId;
	
	if ( !req.user.accessToTopicId ) {
		res.status( 401 );
		res.end();
		return
	}
	
	// Get the topic ID group the
	let topics = req.user.accessToTopicId;
	
	// Show a interface to create mailing + Choice of topicID
	let mailings = await mailing.mailingListing( topics );

	const mustacheData = Object.assign( {}, { topics: topics }, { mailings: mailings } );
	
	//console.log( mustacheData );

	// Show a list of mailingID
	
	res.status( 200 ).send( await renderTemplate( "mailingManage.html",  mustacheData ) );
}

/*
 * Mailing login
 */
exports.v_mailingLogin = async ( req, res, next ) => {
	res.status( 200 ).send( await fsPromises.readFile( 'views/' + 'mailingLogin.html', 'UTF-8' ) );
}

exports.v_mailingEdit = async ( req, res, next ) => {
	// Input: MailingID
	

	try {
		const mailingid = req.params.mailingid;
	
		// Get the mailing
		let mailingData = await mailing.mailingView( mailingid ),
			mailingState = mailingData.state;
		
		let btnControler = {
			showApproved: 1
		}
		// Adjust the workflow based on the state
		// Nothing to do for: mailingState.draft; mailingState.cancelled; mailingState.sent

		
		if ( mailingState === _mailingState.completed ) {

			btnControler = {
				showApproved: 1
			}
		
		} else if ( mailingState === _mailingState.approved ) {
		
			btnControler = {
				showSendToSubs: 1
			}
			
		} else if ( mailingState === _mailingState.sending ) {
		
			btnControler = { 
				showCancelSend: 1
			}
		
		}
		
		
		// Parse the body
		jsBody = { jsBody: mailingData.body.replace( /\r/g, "").replace( /\n/g, "\\n" ) };
		
		// Render the page
		res.status( 200 ).send( await renderTemplate( "mailingEdit.html", Object.assign( {}, mailingData, btnControler, jsBody ) ) );
		
	} catch ( e ){
		
		// Return mailingManager + Error message
		console.log( "v_mailingEdit err:" );
		console.log( e );
		res.status( 200 ).send( await renderTemplate( "mailingEdit.html", e ) );
	}
	
}


/* 
 * Mailing Edit actions
 */
// Create an empty mailing and show "mailingView"
exports.v_mailingCreate = async ( req, res, next ) => {
	
	try {
		const { topic, title } = req.body;
	
		// Create the mailing
		let mailingId = await mailing.mailingCreate( topic, title );
		
		// Let's the edit mailing do the work
		res.redirect( _baseRedirFolder + mailingId + "/edit" )
	} catch ( e ){
		
		// Return mailingManager + Error message
		console.log( "v_mailingCreate err:" );
		console.log( e );
		res.status( 200 ).send( await renderTemplate( "mailingManage.html", e ) );
	}
	
	next();
}

exports.v_mailingHistory = async ( req, res, next ) => {

 
	const mailingId = req.params.mailingid;
		
		// Save the mailing
		let history = await mailing.mailingGetHistory( mailingId );
		
		// Render the page
		res.status( 200 ).send( await renderTemplate( "mailingHistory.html", { history : history } ) );
		

}

exports.v_mailingSave = async ( req, res, next ) => {
	// Save the draft email
	// Set state to "draft"
	
	if ( !req.user.email ) {
		res.status( 401 );
		res.end();
		return
	}
	
	try {
		const mailingid = req.params.mailingid,
			isSaveAndTest = req.body.action;
		
		// console.log( req.body );
		
		// Save the mailing
		let mailingData = {};

		let msg = "Saved"; // status message
		
		if ( isSaveAndTest === "saveTest" ) {
			mailingData = await mailing.mailingSaveTest( req.user.email, mailingid, req.body.title, req.body.subject, req.body.body, req.body.comments );
			msg += " and test sent";
		} else {
			mailingData = await mailing.mailingSave( mailingid, req.body.title, req.body.subject, req.body.body, req.body.comments );
		}
		
		mailingData.msg = msg; // status message		
		
		// Parse the body
		jsBody = { jsBody: mailingData.body.replace( /\r/g, "").replace( /\n/g, "\\n" ) };
		
		// Render the page
		res.status( 200 ).send( await renderTemplate( "mailingEdit.html", Object.assign( {}, mailingData, jsBody ) ) );
		
		
	} catch ( e ){
		
		// Return mailingManager + Error message
		console.log( "v_mailingSave err:" );
		console.log( e );
		res.status( 200 ).send( await renderTemplate( "mailingEdit.html", e ) );
	}
}

exports.v_mailingCancelled = async ( req, res, next ) => {
	// Set state to "cancelled"
	
	const mailingId = req.params.mailingid;
	
	await mailing.mailingCancelled( mailingId );

	res.redirect( _baseRedirFolder + mailingId + "/edit" );
}


exports.v_mailingApproval = async ( req, res, next ) => {
	// Send a test email to the predefined list of emails
	// Set state to "completed"
	
	const mailingId = req.params.mailingid;
	
	await mailing.mailingApproval( mailingId );
	
	res.redirect( _baseRedirFolder + mailingId + "/edit" );
	
}

exports.v_mailingApproved = async ( req, res, next ) => {
	// Need to be in current state "completed"
	// Set state to "approved"
	
	const mailingId = req.params.mailingid;
	
	await mailing.mailingApproved( mailingId );
	
	res.redirect( _baseRedirFolder + mailingId + "/edit" );
}

exports.v_mailingSendToSub = async ( req, res, next ) => {
	// Need to be in current state "approved"
	// Change state tot "sending"
	// Do the sending
	// When completed, change state to "sent"
	
	const mailingId = req.params.mailingid;
	
	await mailing.mailingSendToSub( mailingId );
	
	res.redirect( _baseRedirFolder + mailingId + "/edit" );
	
}


exports.v_mailingCancelSendingToSub = async ( req, res, next ) => {
	// TODO: Abort the sending job.
	
	const mailingId = req.params.mailingid;
	
	await mailing.mailingCancelSendToSub( mailingId );

	res.redirect( _baseRedirFolder + mailingId + "/edit" );
	
}
