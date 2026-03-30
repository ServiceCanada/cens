/*==========================
 * Notify Callbacks
 *
 * @description: Handles inbound webhooks from GC Notify.
 *               Currently supports the one-click unsubscribe callback (RFC 8058).
 *
 * When a recipient clicks the "Unsubscribe" button in Gmail (or another RFC 8058
 * capable client), Notify sends a POST to this endpoint with the email address
 * and template ID. We look up the CENS topic by templateId and remove the
 * subscriber using the same logic as /subs/remove/:subscode.
 *
 * Configuration (environment variables):
 *   NOTIFY_UNSUBSCRIBE_BEARER_TOKEN  – Bearer token that Notify will send in the
 *                                      Authorization header. Set this value in the
 *                                      Notify admin "Callbacks → Email unsubscribe
 *                                      requests" form.
 *
 * @author: Government of Canada
 * @version: 1.0
 ===========================*/

"use strict";

const dbConn = module.parent.exports.dbConn;

const processEnv = process.env,
	_devLog = !!!processEnv.prodNoLog,
	_errorPage = processEnv.errorPage || "https://canada.ca",
	_notifyUnsubscribeBearerToken = processEnv.NOTIFY_UNSUBSCRIBE_BEARER_TOKEN || null;

/*
 * verifyBearerToken
 * Middleware that validates the Authorization: Bearer <token> header.
 */
const verifyBearerToken = ( req, res, next ) => {

	if ( !_notifyUnsubscribeBearerToken ) {
		console.error( "notify_callbacks: NOTIFY_UNSUBSCRIBE_BEARER_TOKEN is not set" );
		return res.status( 500 ).json( { error: "Callback endpoint not configured" } );
	}

	const authHeader = req.headers[ "authorization" ] || "";
	const token = authHeader.replace( /^bearer\s+/i, "" );

	if ( !token || token !== _notifyUnsubscribeBearerToken ) {
		console.warn( "notify_callbacks: unauthorized callback attempt" );
		return res.status( 401 ).json( { error: "Unauthorized" } );
	}

	next();
};

/*
 * getTopicByTemplateId
 * Looks up a topic document by its Notify templateId field.
 * Returns the topic document or null.
 */
const getTopicByTemplateId = async ( templateId ) => {
	try {
		return await dbConn.collection( "topics" ).findOne(
			{ templateId: templateId },
			{
				projection: {
					_id: 1,
					templateId: 1,
					notifyKey: 1,
					confirmURL: 1,
					unsubURL: 1,
				}
			}
		);
	} catch ( e ) {
		console.error( "notify_callbacks: getTopicByTemplateId error", e );
		return null;
	}
};

/*
 * POST /api/v1/notify/unsubscribe
 *
 * Receives the GC Notify unsubscribe callback.
 * Expected JSON body from Notify:
 *   {
 *     "notification_id": "<uuid>",
 *     "email_address": "<email>",
 *     "template_id": "<uuid>",
 *     "service_id": "<uuid>"
 *   }
 *
 * Performs the same removal steps as removeEmail() in subscriptions.js,
 * minus the subscode-based lookup (we find by email + topicId instead).
 */
exports.notifyUnsubscribeCallback = [
	verifyBearerToken,
	async ( req, res ) => {

		const { notification_id, email_address, template_id, service_id } = req.body || {};

		if ( !email_address || !template_id ) {
			return res.status( 400 ).json( { error: "Missing required fields: email_address, template_id" } );
		}

		const currDate = new Date();

		// Resolve the CENS topic from the Notify template ID
		const topic = await getTopicByTemplateId( template_id );

		if ( !topic ) {
			console.warn( "notify_callbacks: no topic found for template_id", template_id );
			// Return 200 so Notify doesn't retry — this template isn't managed by CENS
			return res.status( 200 ).json( { ok: true, skipped: true, reason: "template not found" } );
		}

		const topicId = topic._id;

		// Remove from subsConfirmed (look up by email + topicId since we have no subscode)
		let docSubs;
		try {
			docSubs = await dbConn.collection( "subsConfirmed" ).findOneAndDelete(
				{ email: email_address, topicId: topicId }
			);
		} catch ( e ) {
			console.error( "notify_callbacks: subsConfirmed findOneAndDelete error", e );
			return res.status( 500 ).json( { error: "Internal error" } );
		}

		const docValue = docSubs.value;

		if ( !docValue ) {
			// Subscriber not found — already unsubscribed or never confirmed. Not an error.
			_devLog && console.log( "notify_callbacks: subscriber not found, possibly already removed", email_address, topicId );
			return res.status( 200 ).json( { ok: true, skipped: true, reason: "subscriber not found" } );
		}

		// subs_logs entry (async, non-blocking)
		_devLog && dbConn.collection( "subs_logs" ).updateOne(
			{ _id: email_address },
			{
				$push: {
					unsubsEmail: {
						createdAt: currDate,
						topicId: topicId,
						via: "notify-callback",
						notificationId: notification_id || null
					}
				},
				$currentDate: { lastUpdated: true }
			}
		).catch( ( e ) => {
			console.error( "notify_callbacks: subs_logs error", e );
		} );

		// Insert unsubscribe audit record
		dbConn.collection( "subsUnsubs" ).insertOne( {
			createdAt: docValue.createdAt,
			confirmAt: docValue.confirmAt,
			unsubAt: currDate,
			email: email_address,
			topicId: topicId,
			via: "notify-callback",
			notificationId: notification_id || null
		} ).catch( ( e ) => {
			console.error( "notify_callbacks: subsUnsubs insertOne error", e );
		} );

		// Remove from subsExist (the unique-guard collection)
		try {
			await dbConn.collection( "subsExist" ).findOneAndDelete(
				{ e: email_address, t: topicId }
			);
		} catch ( e ) {
			console.error( "notify_callbacks: subsExist findOneAndDelete error", e );
		}

		// Upsert subsRecents TTL entry so a double-click is handled gracefully
		dbConn.collection( "subsRecents" ).findOneAndUpdate(
			{ email: email_address, topicId: topicId },
			{
				$set: {
					createdAt: currDate,
					email: email_address,
					topicId: topicId,
					link: topic.unsubURL || _errorPage,
					via: "notify-callback"
				}
			},
			{ upsert: true }
		).catch( ( e ) => {
			console.error( "notify_callbacks: subsRecents upsert error", e );
		} );

		console.log( `notify_callbacks: unsubscribed ${ email_address } from topic ${ topicId } via Notify callback` );

		return res.status( 200 ).json( { ok: true } );
	}
];
