/**
 * Module dependencies.
 */
const express = require('express'); // HTTP server
const compression = require('compression'); // gzip for the HTTP body
const cors = require('cors'); // CORS

const logger = require('morgan'); // HTTP request logger

const expressStatusMonitor = require('express-status-monitor'); // Monitor of the service (CPU/Mem,....)
const errorHandler = require('errorhandler');
const dotenv = require('dotenv'); // Application configuration
const path = require('path');
const chalk = require('chalk'); // To color message in console log 

const passport = require('passport'); // Authentication	 
const session = require('express-session');
const MongoStore = require('connect-mongo')(session);
const BasicStrategy = require('passport-http').BasicStrategy;

const jwt = require('jsonwebtoken'); // JWT Authentication

const bodyParser = require('body-parser');
//const crypto = require('crypto'); // To encrypt Notify keys

const MongoClient = require('mongodb').MongoClient;
const notifyQueue = require('./notifyQueue.js');

const processEnv = process.env;

/**
 * Load environment variables from .env file, where API keys and passwords are configured.
 */
dotenv.config({
    path: '.env'
});

const _corsSettings = JSON.parse(processEnv.cors || '{"optionSucessStatus":200}');	// Parse CORS settings

const _baseFolder = process.env.baseFolder || ""; 


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
	const smtpController = require('./controllers/sendsmtp');
	const adminController = require('./controllers/admin');
	const mailingController = require('./controllers/mailing_view');
	const userController = require('./controllers/user');
	

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
	app.post('/subs/sendMailing', subsController.sendMailing);
	// app.get('/api/v0.1/subs/email/getAll', subsController.getAll); // TODO: kept for later if we create a "subscription" management page.



	/**
	 * Manager routes.
	 */
	app.get('/api/v0.1/t-manager/:accessCode/home',
		passport.authenticate('basic', { session: false }),
		managersController.serveHome);
	app.post('/api/v0.1/t-manager/:accessCode/topic',
		passport.authenticate('basic', { session: false }),
		bodyParser.urlencoded({extended:false, limit: '10kb'}),
		managersController.createTopic);
	app.get('/api/v0.1/t-manager/:accessCode/:topicId',
		passport.authenticate('basic', { session: false }),
		managersController.getTopic);
	app.put('/api/v0.1/t-manager/:accessCode/:topicId',
		passport.authenticate('basic', { session: false }),
		managersController.modifyTopic);
	app.get('/api/v0.1/t-manager/:accessCode/:topicId/modSuccess',
		passport.authenticate('basic', { session: false }),
		managersController.showModSuccess);
	app.delete('/api/v0.1/t-manager/:accessCode/:topicId/',
		passport.authenticate('basic', { session: false }),
		managersController.deleteTopic);
	app.get('/api/v0.1/t-manager/:accessCode/:topicId/deleteSuccess',
		passport.authenticate('basic', { session: false }),
		managersController.showDeleteSuccess);
	//app.param('/api/v0.1/t-manager/:code/:topic', managersController.validateCodeTopic);
	app.get('/api/v0.1/t-manager/:accessCode/:topicId/list',
		passport.authenticate('basic', { session: false }),
		managersController.getTopicSubs);
	app.get('/api/v0.1/t-manager/:accessCode/:topicId/list-upload',
		passport.authenticate('basic', { session: false }),
		managersController.uploadTopicSubs);	
	app.post('/api/v0.1/t-manager/:accessCode/:topicId/list',
		passport.authenticate('basic', { session: false }),
		bodyParser.urlencoded({extended:true, limit: '250k'}),
		managersController.getTopicOver50kSubs);
	app.get('/api/v0.1/t-manager/:accessCode/:topicId/bulk/form',
		passport.authenticate('basic', { session: false }),
		managersController.serveBulkForm);
	app.get('/api/v0.1/t-manager/:topicId/stats',
		passport.authenticate('basic', { session: false }),
		managersController.getTopicStats);
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
		subsController.simulateAddPost);
	app.get('/api/v0.1/t-manager/:topicId/test/sendsmtpPOST',
		smtpController.testsendMailPOST);
	app.post('/api/v0.1/t-manager/:topicId/confirmedSubscribers', 
		verifyJWT,
		managersController.getAllConfSubs);

	/**
	 * Admin routes.
	 */
	// app.get('/subs/remove_unconfirm/:subscode/:email', subsController.removeUnconfirmEmail);
	app.get('/api/v0.1/t-manager/:accessCode/:topicId/flush-cache',
		passport.authenticate('basic', { session: false }),
		smtpController.flushCacheSMTP,
		subsController.flushCache);
	
	
	app.use(session({
		resave: true,
		saveUninitialized: true,
		secret: process.env.SESSION_SECRET || "shhhut",
		cookie: {
			maxAge: 1209600000
		}, // two weeks in milliseconds
		store: new MongoStore({
			url: process.env.MONGODB_URI,
			autoReconnect: true,
		})
	}));
	app.use(passport.initialize());
	app.use(passport.session());
	
	
	app.get( '/api/v1/mailing/login', mailingController.v_mailingLogin );
	app.get( '/api/v1/mailing/logout', userController.logout );
	app.post( '/api/v1/mailing/login',
		bodyParser.urlencoded({extended:true, limit: '50k'}),
		passport.authenticate('local', { successRedirect: _baseFolder + '/api/v1/mailing/manage', failureRedirect: _baseFolder + '/api/v1/mailing/login'} ) );

		
	app.get('/api/v1/mailing/manage',
		userController.isAuthenticated,
		bodyParser.urlencoded({extended:true, limit: '250k'}),
		mailingController.v_mailingManage);
	app.post('/api/v1/mailing/create',
		userController.isAuthenticated,
		bodyParser.urlencoded({extended:true, limit: '250k'}),
		mailingController.v_mailingCreate);
	app.get('/api/v1/mailing/:mailingid/edit',
		userController.isAuthenticated,
		bodyParser.urlencoded({extended:true, limit: '250k'}),
		mailingController.v_mailingEdit);
	app.post('/api/v1/mailing/:mailingid/edit',
		userController.isAuthenticated,
		bodyParser.urlencoded({extended:true, limit: '1024k'}),
		mailingController.v_mailingSave);
	
	app.get('/api/v1/mailing/:mailingid/history',
		userController.isAuthenticated,
		mailingController.v_mailingHistory);
	app.get('/api/v1/mailing/:mailingid/approval',
		userController.isAuthenticated,
		mailingController.v_mailingApproval);
	app.get('/api/v1/mailing/:mailingid/approved',
		userController.isAuthenticated,
		mailingController.v_mailingApproved);
	app.get('/api/v1/mailing/:mailingid/cancel',
		userController.isAuthenticated,
		mailingController.v_mailingCancelled);
	app.get('/api/v1/mailing/:mailingid/sendToSubs',
		userController.isAuthenticated,
		mailingController.v_mailingSendToSub);
	
	/**
	 * SMTP Mail routes.
	 */
	app.get('/api/v0.1/eml/postkey', smtpController.getKey);
	app.post('/eml/send',
		cors(_corsSettings),
		bodyParser.urlencoded({extended:false, limit: '10kb'}),
		smtpController.sendMailPOST);

	/**
	 * Bull routes
	 */
	app.use('/admin/queues', notifyQueue.UI);


	/**
	 * JWT Authentication
	 */
	function verifyJWT(req, res, next){
		var token = req.headers['authorization'].replace(/^bearer\s/i, '');
		if (!token)
			return res.status(403).send({ auth: false, message: 'No token provided.' });

		jwt.verify(token, processEnv.jwtSecretAllSubsForTopic, function(err, decoded){
			if (err){
				console.log('if(err) ' + err);
				return res.status(500).send({ auth: false, message: 'Failed to authenticate token.' });
			}

			next();
		});
	}	

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

process.once('SIGUSR2', function () {
  console.log( "+++++++++++++++++++ restart +++++++++++");
    process.kill(process.pid, 'SIGUSR2');
  
});

module.exports = app;
