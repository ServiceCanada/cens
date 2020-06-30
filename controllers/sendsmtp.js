/*==========================
 * Send through SMTP
 *
 * @description: Send an email through SMTP about a given topic
 * @author: Government of Canada; @GormFrank
 * @version: 1.0
 ===========================*/

const nodemailer = require('nodemailer');
const templater = require('mustache');

const dbConn = module.parent.exports.dbConn;
const ObjectId = require('mongodb').ObjectId;

const processEnv = process.env,
	_devLog = !!!processEnv.prodNoLog,
	_keySalt = processEnv.keySalt || "5417",
	_errorPage = processEnv.errorPage || "https://www.canada.ca",
	_successJSO = processEnv.successJSO || { statusCode: 200, ok: 1 },
	_cErrorsJSO = processEnv.cErrorsJSO ||  { statusCode: 400, bad: 1, msg: "Bad request" },
	_sErrorsJSO = processEnv.sErrorsJSO ||  { statusCode: 500, err: 1 },
	_topicCacheLimit = processEnv.topicCacheLimit || 50,
	_flushAccessCode = processEnv.flushAccessCode,
	_flushAccessCode2 = processEnv.flushAccessCode2,
	transporter = nodemailer.createTransport( JSON.parse( processEnv.transport || '{"port":"1025","ignoreTLS":true}' ) );

let topicCached = [],
	topicCachedIndexes = [];

//
// Get key
//
// @return; a JSON containing valid key 
//
exports.getKey = ( req, res, next ) => {
	
	res.json( generateKeySMTP() );
};

//
// Generate key
//
// @return; a JSO containing valid key 
//
generateKeySMTP = () => {
	let currDate = Date.now();
	currDate = currDate + (24 * 60 * 60 * 1000);

	const clefBuff = new Buffer(_keySalt + "" + currDate);
	keyK = clefBuff.toString('base64');
	return { authKey: clefBuff.toString('base64') };
}

//
// Add email to the newSubscriberEmail
//
// @return; a HTTP redirection 
//
exports.sendMailPOST = async ( req, res, next ) => {
	
	const reqbody = req.body,
		topicId = reqbody.tid,
		key = reqbody.auke || "",
		currDate = new Date(),
		currEpoc = Date.now();

	let keyBuffer = new Buffer(key, 'base64'),
		keyDecrypt = keyBuffer.toString('ascii');
	
	keyDecrypt = keyDecrypt.substring( _keySalt.length );

	// If no data or key not matching, then not worth going further
	if ( !reqbody || keyDecrypt < currEpoc ) {

		console.log( "SMTP - sendMailPOST: noauth " + key + " " + host);
		res.redirect( _errorPage );
		return true;
	}
	
	// Get the topic
	const topic = await getTopicSMTP( topicId );
	
	try {
		const timestamp = currDate,
			to = topic.to || reqbody.emailTo;

		// Define custom template fields
		let customFields = {
			timestamp: timestamp,
			pageTitle: reqbody.pageTitle,
			submissionPage: reqbody.submissionPage,
			helpful: reqbody.helpful,
			problem: reqbody.problem,
			details: reqbody.details,
			institution: reqbody.institutionopt,
			theme: reqbody.themeopt,
			section: reqbody.sectionopt
		};

		// No topic = no good
		if ( !topic || !topic.inputErrURL || !topic.thankURL || !topic.failURL || !to ) {
			console.log( "SMTP - sendMailPOST: no topic" );
			res.redirect( _errorPage );
			return true;
		}

		// Validate if template is complete
		if ( !customFields.pageTitle || !customFields.submissionPage || !customFields.helpful ) {
			res.redirect( topic.inputErrURL );
			return;
		}

		// Map fields in template
		const renderedTxt = templater.render( topic.templateTxt, customFields ),
			renderedHtml = templater.render( topic.templateHtml, customFields )
			mailOptions = {
				from: topic.from,
				to: to,
				subject: topic.subject,
				text: renderedTxt,
				html: renderedHtml
			};

		// Fire email and forget
		transporter.sendMail( mailOptions ).then( function( info ) {
				res.redirect( topic.thankURL );
		} )
		.catch( function( err ) {
			console.log( "SMTP - sendMailPOST: sendEmail " + err );
					
			// emailErr_logs entry - this can be async
			_devLog && dbConn.collection( "emailErr_logs" ).insertOne(
				{
					createdAt: currDate,
					topic: topic.tid,
					smtp: transporter,
					to: to,
					err: err
				}
			)
			.catch( (e) => {
				console.log( "SMTP - sendMail: emailErr_logs" );
				console.log( e );
			} );

			res.redirect( topic.failURL );
		} );
	} catch ( e ) { 

		console.log( "SMTP - sendMailPOST" );
		console.log( e );

		res.redirect( topic.failURL );
	}
};

//
// Flush the topic and notify cache
//
// @return; an HTML blob
//
exports.flushCacheSMTP = ( req, res, next ) => {
	
	const { accessCode, topicId } = req.params;
	
	if ( accessCode !== _flushAccessCode || topicId !== _flushAccessCode2 ||
		!_flushAccessCode || !_flushAccessCode2 ) {
		
		console.log( "SMTP - flushCache: noauth" );
		res.json( _sErrorsJSO );
		return;
	}
	
	// Flush topic
	topicCachedIndexes = [];
	topicCached = [];
	
	// Return success
	console.log( "SMTP - flushCache: success" );

	next();
};

//
// Get topic info
//
getTopicSMTP = ( topicId ) => {
	
	let topic = topicCached[ topicId ];
	
	if ( !topic ) {
		
		topic = dbConn.collection( "topics" ).findOne( 
			{ _id: topicId },
			{ projection: {
					_id: 1,
					templateTxt: 1,
					templateHtml: 1,
					from: 1,
					to: 1,
					subject: 1,
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

// Test send mail SMTP
//
// prompt users with a form
//
// @return; an HTML blob
//
exports.testsendMailPOST = ( req, res, next ) => {

	// You must run the getKey function if key is outdated or inexistent
	const { topicId } = req.params,
		key = generateKeySMTP();
	
	// Form is hardcoded for Was this page helpful use case
	res.status( 200 ).send( '<!DOCTYPE html>\n' +
		'<html lang="en">\n' +
		'<head>\n' +
		'<title>Send email through SMTP</title>\n' +
		'</head>\n' +
		'<body>\n' +
		'	<form action="/eml/send" method="post">\n' +
		'		<fieldset>\n' +
		'			<legend>Was this page helpful?</legend>\n' +
		'			<label><input type="radio" name="helpful" value="Yes" required /> Yes</label>\n' +
		'			<label><input type="radio" name="helpful" value="No" /> No</label><br>\n' +
		'		</fieldset>\n' +
		'		<label>What was the problem: <input type="text" name="problem" /></label><br>\n' +
		'		<label for="details">Details:</label><br>\n' +
		'		<textarea name="details" id="details"></textarea><br>\n' +
		'		<input type="hidden" name="tid" value="' + topicId + '">\n' +
		'		<input type="hidden" name="auke" value="' + key.authKey + '">\n' +
		'		<input type="hidden" name="pageTitle" value="Test">\n' +
		'		<input type="hidden" name="submissionPage" value="https://canada.ca">\n' +
		'		<input type="hidden" name="lang" value="en">\n' +
		'		<input type="submit" value="Send">\n' +
		'	</form>\n' +
		'</body>\n' +
		'</html>' 
	);
};
