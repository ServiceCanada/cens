/*==========================
 * APPS-53
 *
 * @description: Script to test the refactored addEmailPOST
 * @author: Government of Canada; @luc.l.bertrand
 * @version: 0.1
 ===========================*/

const dotenv = require('dotenv'); // Application configuration
const path = require('path');
const chalk = require('chalk'); // To color message in console log 
const restClient=require('request-promise');
	

/**
 * Load environment variables from .env file, where API keys and passwords are configured.
 */
dotenv.config({
    path: '.env'
});

const processEnv = process.env,
	  _keySalt = processEnv.keySalt || "salt";


//
// Generate key
//
// @return; a JSO containing valid key 
//
generateKey = () => {
	let currDate = Date.now();
	currDate = currDate + (24 * 60 * 60 * 1000);
	
	const clefBuff = new Buffer(_keySalt + "" + currDate);
	keyK = clefBuff.toString('base64');
	return { authKey: clefBuff.toString('base64') };
}
							

const key = generateKey();

/**
 * Set the restClient options
 */
let options = {
      method: 'POST',
      uri: 'http://localhost:8080/subs/post',
      json: true,
      body: {
		  		tid:"june22",
				eml:"luc.l.bertrand@hrsdc-rhdcc.gc.ca",
				auke: key.authKey
	  		},
      resolveWithFullResponse: true,
    };

restClient(options)
.then(response => console.log(response))
.catch(err => console.log('Error: ' + err))
