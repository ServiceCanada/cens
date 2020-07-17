/**
 * Module dependencies.
 */
const express = require('express'); // HTTP server
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const userNameSecretKeyCollection = module.parent.exports.userNameSecretKeyCollection;

const userNamePasswordCollection = module.parent.exports.userNamePasswordCollection;

userNameSecretKeyCollection.createIndex( { "userName": 1 }, { unique: true } );

let keyMap = new Map()
const NO_USER = "noUser";


exports.getSecretKey = ( req, res, next ) => {
	
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
};


// Get all the username Password 
exports.getAllUserNamePassword = ( req, res, next ) => {
	
	userNamePasswordCollection.find({}).toArray(function(err, result) {
		if (err) throw err;
		console.log(result);
		res.sendStatus(200);
	  });
};

// Register
exports.register = ( req, res, next ) => {
	
	
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
};

// Generate the key and persist in hashmap
exports.login = ( req, res, next ) => {
	
	
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
};

// List mailing for the user
exports.getMailingByTopicId = ( req, res, next ) => {
	
	const user = req.user;
	res.json( {
				id: "uid-33",
				created: "2020-06-16",
				updated: "2020-06-16",
				title: "Mailing Title",
				user
			} );
};

