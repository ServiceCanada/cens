/*==========================
 * APPS-53
 *
 * @description: Script to create a large amount of test subscribers
 * 				to a topic.  Subscribers are added via an HTTP POST to 
 * 				the subs/email/add endpoint.
 *
 * 				Set the numToCreate and topicId constants below.
 *
 * @author: Government of Canada; @luc.l.bertrand
 * @version: 0.1
 ===========================*/

const numToCreate = 250;
const topicId = "june22";

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
const email = "email_x@test.com";

/**
 * Set the restClient options
 */
var options = {
      method: 'POST',
      uri: 'http://localhost:8080/api/v0.1/subs/email/add',
      json: true,
      body: {
	  			eml: email,
	  			tid: topicId
	  },
      resolveWithFullResponse: true,
    };

for(i = 0; i < numToCreate; i++){
	options.body.eml = email.replace('x', i);
	restClient(options)
	.then(response => console.log(response.request.body))
	.catch(err => console.log('Error: ' + err))
}
