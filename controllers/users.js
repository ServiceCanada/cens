/**
 * Module dependencies.
 */


const express = require('express'); // HTTP server
const compression = require('compression'); // gzip for the HTTP body
const cors = require('cors'); // CORS

const logger = require('morgan'); // HTTP request logger
const bcrypt = require('bcryptjs');
const expressStatusMonitor = require('express-status-monitor'); // Monitor of the service (CPU/Mem,....)
const errorHandler = require('errorhandler');
const dotenv = require('dotenv'); // Application configuration
const path = require('path');
const chalk = require('chalk'); // To color message in console log 
const jwt = require('jsonwebtoken')
const passport = require('passport'); // Authentication	 


const bodyParser = require('body-parser');
//const { generateKeyPair } = require('crypto');
const crypto = require('crypto');
const util = require('util');

const MongoClient = require('mongodb').MongoClient;

const processEnv = process.env;

/**
 * Create Express server.
 */
const app = express();


/**
 * Load environment variables from .env file, where API keys and passwords are configured.
 */
dotenv.config({
    path: '.env'
});

const _corsSettings = JSON.parse(processEnv.cors || '{"optionSucessStatus":200}');	// Parse CORS settings


/**
 * Connect to MongoDB.
 */

MongoClient.connect( processEnv.MONGODB_URI || '', {useUnifiedTopology: true} ).then( ( mongoInstance ) => {

	var dbConn = mongoInstance.db( processEnv.MONGODB_NAME || 'sandbox' );
	var userNameSecretKeyCollection = dbConn.collection("userNameSecretKey");
	var userNamePasswordCollection = dbConn.collection("userNamePassword");
	userNameSecretKeyCollection.createIndex( { "userName": 1 }, { unique: true } );
	//userNamePasswordCollection.createIndex( { "userName": 1 }, { unique: true } );
// 



/**
 * Express configuration.
 */
app.set('host', processEnv.Host || '0.0.0.0');
app.set('port', processEnv.Port || 8080);

//app.use(compression()); // Compression not recommended
app.use(logger( processEnv.LOG_FORMAT || 'dev'));

app.use(bodyParser.json()); // for parsing application/json

app.disable('x-powered-by');





/**
 * Middleware to enable cors
 */
app.use( cors( { "origin": "*" } ) );



  // List mailing for the user
app.get( '/mailing/create/:topicId', cors( { "origin": "*" } ), 
         verifyToken, ( req, res ) => {
	const user = req.user;
	res.json( {
				id: "uid-33",
				created: "2020-06-16",
				updated: "2020-06-16",
				title: "Mailing Title",
				user
			} );

});

// Generate the secret key 
let keyMap = new Map()
const NO_USER = "noUser";
app.post('/test/getSecretKey', (req, res) => {
	const secretKey =  crypto.randomBytes(64).toString('base64').replace(/\//g,'_').replace(/\+/g,'-');
	console.log(secretKey);
	// first loading to get secret key, there is no way to get to know the user info
	keyMap.set(NO_USER, secretKey);

	
	userNameSecretKeyCollection.replaceOne( 
		{ userName: NO_USER },
		{ userName: NO_USER, secretKey: secretKey },
		{ upsert : true}
	).then( () => {
		console.log("1 document inserted on api /test/getSecretKey ");
	}).catch( ( e ) => { 
		console.log( "err while generate secretKey on api /test/getSecretKey" );
		console.log( e );
	});

	res.json({ secretKey: secretKey })
  })


  // Get all the username Password 
app.get('/test/getAllUserNamePassword', (req, res) => {
		
	userNamePasswordCollection.find({}).toArray(function(err, result) {
		if (err) throw err;
		console.log(result);
		res.sendStatus(200);
	  });
	}
  );



  // Register
app.post('/test/register', (req, res) => {
	var { username,  password } = req.body;
	console.log(username + " as username and password " + password);
	let errors = [];

	userNamePasswordCollection.findOne({ username: username }).then(user => {
		if (user) {
		  errors.push({ msg: 'UserName already exists' });
		  console.log("UserName already exists");
		  res.status(200).send("UserName already exists");
		} else {
		  bcrypt.genSalt(10, (err, salt) => {
			bcrypt.hash(password, salt, (err, hash) => {
			  if (err) throw err;
			  password = hash;
			  userNamePasswordCollection.insertOne({username: username, password: password})
			   .then(user => {
				console.log("You are now registered and can log in");
				//res.redirect('/users/login');
				res.sendStatus(200);
			   })
			  .catch(err => {
				  console.log(err);
				  res.sendStatus(500);
			});
			});
		  });
		}
	  });
	}
  );





// Generate the key and persist in hashmap
app.post('/test/login', verifyToken, (req, res) => {
	// Authenticate User
	//res.status(500).send('The email is not registered');
	//console.log( req.headers );
	//console.log( req.body );

	const username = req.body.username;
	const password = req.body.password;
	console.log("username is " + username + " and password is " + password);
	var secretKey;

	// Match user
	userNamePasswordCollection.findOne({
		username: username
		  }).then(user => {
		if (!user) {
			console.log("That email is not registered");
			res.status(500).send('The email is not registered');
		 }  else {
		// Match password
		bcrypt.compare(password, user.password, (err, isMatch) => {
			if (err) throw err;
				if (isMatch) {
				  console.log("Password is matched and user can login");
				  secretKey =  crypto.randomBytes(64).toString('base64').replace(/\//g,'_').replace(/\+/g,'-');
				  console.log(secretKey);
				  keyMap.set(username, secretKey);
			  
				  userNameSecretKeyCollection.replaceOne( 
					  { userName: username },
					  { userName: username, secretKey: secretKey },
					  { upsert: true }
				  ).then( () => {
					  console.log("1 document inserted on api /test/login");
					  res.json({ secretKey: secretKey });
				  }).catch( ( e ) => { 
					  console.log( "err while generate secretKey on api /test/login" );
					  console.log( e );
				  });
				} else {
				  console.log("Password incorrect");
				}
			  });
		 }
		});

	
  })



// Authenticate the JWT and verify that if it is tampered or not
// FORMATE OF TOKEN
// Authorization : Bearer <accessToken>
// Verify Token
function verifyToken(req, res, next) {
	// check if the secretKey is generated by server
	// check if the request include jws in http header authroization
	const authHeader = req.headers['authorization']
	const token = authHeader && authHeader.split(' ')[1]
	if (token == null) return res.sendStatus(401)
	console.log("incoming token payload : " + token);

	let secretKey ='';
	if (req.body.secretKey){
		secretKey = req.body.secretKey;
		jwt.verify(token, secretKey, (err, decoded) => {
			console.log(err)
			if (err) return res.sendStatus(403)
			console.log("decoded payload : " + decoded.name);
			console.log("decoded payload : " + decoded.sub);
			console.log("decoded payload : " + decoded.iat);
			req.user = decoded
			next()
		  })
	} else {
		let payload = token.split('.')[1];
		let buff = new Buffer(payload, 'base64');
		let payLoadJson = JSON.parse(buff.toString('ascii'));
		let userNameFromPayload = payLoadJson.name;
		secretKey = keyMap.get(userNameFromPayload);

	  
		userNameSecretKeyCollection.find({}).toArray(function(err, result) {
			if (err) throw err;
			console.log(result);
		  });

		userNameSecretKeyCollection.findOne(
			{ userName: userNameFromPayload	}
		).then((documentRecord) => {
			console.log("userName in payload in verify : " + documentRecord.userName);
			console.log("secretKey in mongoDb : " + documentRecord.secretKey);
			jwt.verify(token, documentRecord.secretKey, (err, decoded) => {
				console.log(err)
				if (err) return res.sendStatus(403)
				console.log("decoded payload : " + decoded.name);
				console.log("decoded payload : " + decoded.sub);
				console.log("decoded payload : " + decoded.iat);
				req.user = decoded
				next()
			  })
		}).catch( (e) => {
			console.log( "look up document by useName in verify" );
			console.log( e );
		});
	}

  }



	
module.exports = app;

