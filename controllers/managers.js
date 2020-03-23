/*==========================
 * Managers
 *
 * @description: Getting the subscription list and various bulk operation
 * @author: Government of Canada; @duboisp
 * @version: 0.1
 ===========================*/

const dbConn = module.parent.exports.dbConn;


const _unsubBaseURL = process.env.removeURL || "https://apps.canada.ca/x-notify/subs/remove/";

//
// get subscription for a topic
//
// @return; a CSV text response 
//
exports.getTopicSubs = async ( req, res, next ) => {
	
	// Params: accessCode, topicId
	const { accessCode, topicId } = req.params,
		currDate = new Date();
	
	// Validate the accessCode and logs
	dbConn.collection( "topics_details" ).findOneAndUpdate( 
		{ 
			_id: topicId,
			accessCode: { $in: [ accessCode ] }
		},
		{
			$push: {
				retrieving : {
					createdAt: currDate,
					tId: topicId,
					code: accessCode
				}
			},
			$currentDate: { 
				lastUpdated: true
			}
		}
	).then( ( docTopic ) => {

		if ( !docTopic.value ) {
			
			// log access denied
			dbConn.collection( "topics_logs" ).updateOne( 
				{ _id: topicId },
				{
					$setOnInsert: {
						_id: topicId,
						createdAt: currDate
					},
					$push: {
						denied: {
							createdAt: currDate,
							accessCode: accessCode
						}
					},
					$currentDate: { 
						lastUpdated: true
					}
				},
				{ upsert: true }
			).catch( (e) => {
				console.log( e );
			});
		
			res.json( { statusCode: 401, nal: 1 } );
			return;
		}
		
		// Get all the emails for the given topic
		let docs = dbConn.collection( "subsConfirmed" ).find(
			{
				topicId: topicId
			},
			{
				projection: {
					_id: 0,
					email: 1,
					subscode: 1
				}
			}
		);

		// log access granted
		dbConn.collection( "topics_logs" ).updateOne( 
			{ _id: topicId },
			{
				$setOnInsert: {
					_id: topicId,
					createdAt: currDate
				},
				$push: {
					granted: {
						createdAt: currDate,
						accessCode: accessCode
					}
				},
				$currentDate: { 
					lastUpdated: true
				}
			},
			{ upsert: true }
		).catch( (e) => {
			console.log( e );
		});

		let csv = '"email address","unsub"\r\n'; // Need to change this for a stream.

		docs.toArray( ( err, docsItems ) => {

			// create CSV rows
			let i, i_len = docsItems.length, i_cache;
			for( i = 0; i !== i_len; i++) {
				i_cache = docsItems[ i ];				
				csv += '"' + i_cache.email + '","' + _unsubBaseURL + i_cache.subscode + "/" + i_cache.email + '"\r\n';
			}

			// Send the file
			res.setHeader( "Content-disposition", "attachment; filename=" + topicId + "-" + currDate.getTime() + ".csv" );
			res.set( "Content-Type", "text/csv" );
			res.status( 200 ).send( csv );

			res.end();
		} );
		
	}).catch( (e) => {
		console.log( e );
	});
	
};



//
// get subscription for a topic
//
// @return; a JSON response
//
exports.addBulk = async ( req, res, next ) => {

};


//
// get subscription for a topic
//
// @return; a JSON response
//
exports.removeBulk = async ( req, res, next ) => {

};
