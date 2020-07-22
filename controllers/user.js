/*==========================
 * User management
 *
 * @description: Manage user session logged in the admin/manager interface.
 * @author: Government of Canada; @duboisp;
 * @version: 1.0
 *
 ===========================*/
 
/*
 * Integration with the passport middleware
 *
 * - https://github.com/ServiceCanada/io.canada.ca/blob/283a7dad2d03564443205f056401dda149911e22/manager/config/passport.js
 */

const passport = require('passport');
const { Strategy: LocalStrategy } = require('passport-local');

const dbConn = module.parent.exports.dbConn;
const ObjectId = require('mongodb').ObjectId;
const _sessionMemTTL = process.env.sessionMemTTL || 30000;

let memoryUserSession = {}; // Schema: "userId": { {user config} + ttl } 


// Serialization of the user information
passport.serializeUser( ( user, done ) => {
	
	// Save in memory
	memoryUserSession[ user._id ] = user;
	memoryUserSession.ttl = Date.now();
	
	// Only save the user ID inside the session
	done( null, user._id );
});

passport.deserializeUser( ( id, done ) => {
	
	// Query local caching, if not expired
	let user = memoryUserSession[ id ];
	if ( user && ( user.ttl + _sessionMemTTL ) > Date.now() ) {
		return done( null, user );
	}
	
	// Query MongoDB
	dbConn.collection( "users" ).findOne( 
		{
			_id: ObjectId( id )
		},
		{
			projection: {
				_id: 1,
				email: 1,
				accessToTopicId: 1
			}
		}
	).then( ( rDoc ) => {
		
		// Save in memory
		memoryUserSession[ rDoc._id ] = rDoc;
		memoryUserSession.ttl = Date.now();
		
		return done( null, rDoc );
	} );
});



/**
 * Sign in using Email and Password.
 */
passport.use(new LocalStrategy({ usernameField: 'username' }, (email, password, done) => {

	// Query MongoDb to get the User info.
	dbConn.collection( "users" ).findOne( {
			name: email,
			pass: password
		},
		{
			projection: {
				_id: 1,
				email: 1,
				accessToTopicId: 1
			}
		} ).then( ( rDoc ) => {
			
			if ( !rDoc ) {
				return done(null, false, { msg: 'Invalid email or password.' } )
			}
			
			return done( null, rDoc );
			
		} );
}));

/**
 * Login Required middleware.
 */
exports.isAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect( ( process.env.baseFolder || "" ) + "/api/v1/mailing/login" );
};



/*
 * End points
 *
 * - https://github.com/ServiceCanada/io.canada.ca/blob/master/manager/controllers/user.js
 */


/**
 * GET /logout
 * Log out.
 */
exports.logout = (req, res) => {

	// Remove the user from the server cache
	const userId = (req.user ? req.user[ "_id" ] : false );
	memoryUserSession[ userId ] && delete memoryUserSession[ userId ];
	
	// logout
	req.logout();
	req.session.destroy((err) => {
		if ( err ) {
			console.log('Error : Failed to destroy the session during logout.', err);
		}
		req.user = null;
		res.redirect( ( process.env.baseFolder || "" ) + "/api/v1/mailing/login" );
	});
};
