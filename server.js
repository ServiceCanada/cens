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

// const passport = require('passport'); // Authentication	 

const MongoClient = require('mongodb').MongoClient;

/**
 * Load environment variables from .env file, where API keys and passwords are configured.
 */
dotenv.config({
    path: '.env'
});


/**
 * Create Express server.
 */
const app = express();


/**
 * Connect to MongoDB.
 */
//const dbConn = MongoClient.connect( process.env.MONGODB_URI || '', {} ).tehn( function( client ) {
//	return client.db( process.env.MONGO_DB || 'subs' );
//}).catch( err => console.log( err ) );
//const dbConn =  

MongoClient.connect( process.env.MONGODB_URI || '', {} ).then( ( mongoInstance ) => {

	module.exports.dbConn = mongoInstance.db( process.env.MONGO_DB || 'subs' );

	//mongoose.set('useFindAndModify', false);
	//mongoose.set('useCreateIndex', true);
	//mongoose.set('useNewUrlParser', true);
	//mongoose.set('useUnifiedTopology', true);
	//mongoose.connect(process.env.MONGODB_URI);
	//mongoose.connection.on('error', (err) => {
	//    console.error(err);
	//    console.log('%s MongoDB connection error. Please make sure MongoDB is running.', chalk.red('✗'));
	//    process.exit();
	//});

	
	
	/**
	 * Controllers (route handlers).
	 */
	const subsController = require('./controllers/subscriptions');

	

	/**
	 * Express configuration.
	 */
	app.set('host', process.env.OPENSHIFT_NODEJS_IP || '0.0.0.0');
	app.set('port', process.env.PORT || process.env.OPENSHIFT_NODEJS_PORT || 8080);

	app.use(expressStatusMonitor( { path: process.env.ServerStatusPath || "/sys-status" } ));
	app.use(compression());
	app.use(logger( process.env.LOG_FORMAT || 'dev'));

	app.use(express.json()) // for parsing application/json


	/**
	 * Authentication suggested - HTTP Basic
	 *
	 * Lib suggested: passport-http
	 * See: http://www.passportjs.org/packages/passport-http/
	 *
	 */
	//app.use(passport.initialize());
	//app.use(passport.session());


	app.disable('x-powered-by');


	/**
	 * Subscriber routes.
	 */
	app.post('/api/v0.1/subs/email/add', subsController.addEmail);
	//app.post('/api/v0.1/subs/email/confirm', subsController.confirmEmail); // TODO: need to handle data from "post"
	//app.post('/api/v0.1/subs/email/remove', subsController.removeEmail); // TODO: need to handle data from "post"
	
	app.get('/subs/confirm/:subscode/:email', subsController.confirmEmail);
	app.get('/subs/remove/:subscode/:email', subsController.removeEmail);
	// app.get('/api/v0.1/subs/email/getAll', subsController.getAll); // TODO: kept for later if we create a "subscription" management page.




	/**
	 * Manager routes.
	 */
	// app.get('/api/v0.1/t-manager/:accessCode/:topic/topic/list', managerController.getList);
	// app.get('/api/v0.1/t-manager/:accessCode/:topic/bulk/add', managerController.addBulk);
	// app.get('/api/v0.1/t-manager/:accessCode/:topic/bulk/remove', managerController.removeBulk);

	/**
	 * Admin routes.
	 */
	// app.get('/subs/remove_unconfirm/:subscode/:email', subsController.removeUnconfirmEmail);


	/**
	 * Error Handler.
	 */
	if (process.env.NODE_ENV === 'development') {
		// only use in development
		app.use(errorHandler());
	} else {
		app.use((err, req, res, next) => {
			console.error(err);
			res.status(500).send('Server Error');
		});
	}

	/**
	 * Start Express server.
	 */
	app.listen(app.get('port'), () => {
		console.log('%s App is running at http://localhost:%d in %s mode', chalk.green('✓'), app.get('port'), app.get('env'));
		console.log('  Press CTRL-C to stop\n');
	});
}).catch( (e) => { console.log( "MongoDB ERRROR: " + e ) } );

module.exports = app;


