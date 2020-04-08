/**
 * Module dependencies.
 */


const express = require('express'); // HTTP server
const compression = require('compression'); // gzip for the HTTP body

const logger = require('morgan'); // HTTP request logger

const expressStatusMonitor = require('express-status-monitor'); // Monitor of the service (CPU/Mem,....)
const errorHandler = require('errorhandler');
const dotenv = require('dotenv'); // Application configuration
const path = require('path');
const chalk = require('chalk'); // To color message in console log 

const passport = require('passport'); // Authentication	 
const BasicStrategy = require('passport-http').BasicStrategy;

const bodyParser = require('body-parser');
//const crypto = require('crypto'); // To encrypt Notify keys

const MongoClient = require('mongodb').MongoClient;

const processEnv = process.env;

/**
 * Load environment variables from .env file, where API keys and passwords are configured.
 */
dotenv.config({
    path: '.env'
});


// 
// HTTP auth
//
passport.use(new BasicStrategy({ qop: 'auth' },
  function( user, pass, cb ) {
	if( user !== processEnv.user || pass !== processEnv.password ) {
		return cb( null, false );
	}
	return cb( null, user );
  }
));


/**
 * Create Express server.
 */
const app = express();



/**
 * Connect to MongoDB.
 */

MongoClient.connect( processEnv.MONGODB_URI || '', {useUnifiedTopology: true} ).then( ( mongoInstance ) => {

	module.exports.dbConn = mongoInstance.db( processEnv.MONGODB_NAME || 'subs' );
	//app.emit('ready');


	/**
	 * Controllers (route handlers).
	 */
	const subsController = require('./controllers/subscriptions');
	const managersController = require('./controllers/managers');

	

	/**
	 * Express configuration.
	 */
	app.set('host', processEnv.Host || '0.0.0.0');
	app.set('port', processEnv.Port || 8080);

	app.use(expressStatusMonitor( { path: processEnv.ServerStatusPath || "/admin/sys-status" } ));
	app.use(compression());
	app.use(logger( processEnv.LOG_FORMAT || 'dev'));

	app.use(bodyParser.json()); // for parsing application/json

	app.disable('x-powered-by');


	/**
	 * Subscriber routes.
	 */
	app.get('/api/v0.1/subs/postkey', subsController.getKey);
	app.post('/api/v0.1/subs/email/add',
		// Need to do more testing
		// passport.authenticate('basic', { session: false }),
		subsController.addEmail);
	//app.post('/api/v0.1/subs/email/confirm', subsController.confirmEmail); // TODO: need to handle data from "post"
	//app.post('/api/v0.1/subs/email/remove', subsController.removeEmail); // TODO: need to handle data from "post"
	
	app.get('/subs/confirm/:subscode/:emlParam', subsController.confirmEmail); // Deprecated, to be removed after 60 days of it's deployment date
	app.get('/subs/remove/:subscode/:emlParam', subsController.removeEmail); // Deprecated, to be removed after 60 days of it's deployment date
	app.get('/subs/confirm/:subscode', subsController.confirmEmail);
	app.get('/subs/remove/:subscode', subsController.removeEmail);
	app.post('/subs/post',
		bodyParser.urlencoded({extended:false, limit: '10kb'}),
		subsController.addEmailPOST);
	// app.get('/api/v0.1/subs/email/getAll', subsController.getAll); // TODO: kept for later if we create a "subscription" management page.



	/**
	 * Manager routes.
	 */
	//app.param('/api/v0.1/t-manager/:code/:topic', managersController.validateCodeTopic);
	app.get('/api/v0.1/t-manager/:accessCode/:topicId/list',
		passport.authenticate('basic', { session: false }),
		managersController.getTopicSubs);
	app.get('/api/v0.1/t-manager/:accessCode/:topicId/bulk/form',
		passport.authenticate('basic', { session: false }),
		managersController.serveBulkForm);
	app.post('/api/v0.1/t-manager/:accessCode/:topicId/bulk/action',
		passport.authenticate('basic', { session: false }),
		bodyParser.urlencoded({extended:true, limit: '50mb'}),
		managersController.actionBulk);
	app.get('/api/v0.1/t-manager/:accessCode/:topicId/email/add/test',
		passport.authenticate('basic', { session: false }),
		subsController.testAdd);
	app.get('/api/v0.1/t-manager/:topicId/:prefix/:suffix/test/addJSON',
		subsController.simulateAddJSON);
	app.get('/api/v0.1/t-manager/:topicId/:prefix/:suffix/test/addPost',
		subsController.simulateAddPost );

	/**
	 * Admin routes.
	 */
	// app.get('/subs/remove_unconfirm/:subscode/:email', subsController.removeUnconfirmEmail);
	app.get('/api/v0.1/t-manager/:accessCode/:topicId/flush-cache',
		passport.authenticate('basic', { session: false }),
		subsController.flushCache);

	/**
	 * Error Handler.
	 */
	if (processEnv.NODE_ENV === 'development') {
		// only use in development
		app.use(errorHandler());
	} else {
		app.use((err, req, res, next) => {
		
			console.log( "app.use: Server Error" );
			console.error(err);
			res.status(500).send('Server Error');
		});
	}

	/**
	 * Start Express server.
	 */
	//app.on('ready', function() { 
		app.listen(app.get('port'), () => {
			console.log('%s App is running at http://localhost:%d in %s mode', chalk.green('✓'), app.get('port'), app.get('env'));
			console.log('  Press CTRL-C to stop\n');
		});
	//}); 
}).catch( (e) => { console.log( "%s MongoDB ERRROR: %s", chalk.red('✗'), e ) } );

module.exports = app;


