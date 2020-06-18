/*==========================
 * APPS-36
 *
 * @description: Script to fetch all subscriptions to a topic
 * @author: Government of Canada; @luc.l.bertrand
 * @version: 0.1
 ===========================*/

const dotenv = require('dotenv'); // Application configuration
const path = require('path');
const chalk = require('chalk'); // To color message in console log 
const jwt = require('jsonwebtoken'),
	restClient=require('request-promise');
	

/**
 * Load environment variables from .env file, where API keys and passwords are configured.
 */
dotenv.config({
    path: '.env'
});

const processEnv = process.env;

/**
 * Create a JWT 
 */
var myToken = jwt.sign(
	{
		iss: "testScript",
		iat: Math.round(Date.now()/1000)
	},
	processEnv.jwtSecretAllSubsForTopic,
	{
		header: {typ: "JWT", alg: "HS256"}
	}
);

/**
 * Set the restClient options
 */
var options = {
      method: 'POST',
      uri: 'http://localhost:8080/api/v0.1/t-manager/test2/confirmedSubscribers',
      json: true,
      body: {},
      resolveWithFullResponse: true,
      headers: {
        'Authorization': 'Bearer ' + myToken,
        'User-agent': 'APPS-36 Test Script/'
      }
    };

restClient(options)
.then(response => console.log(response))
.catch(err => console.log('Error: ' + err))
