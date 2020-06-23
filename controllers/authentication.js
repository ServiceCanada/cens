/*==========================
 * Subscriptions
 *
 * @description: Managing the client subscription to be notified about a given topic
 * @author: Government of Canada; @duboisp
 * @version: 1.0
 ===========================*/

 const axios = require('axios');

 const NotifyClient = require('notifications-node-client').NotifyClient; // https://docs.notifications.service.gov.uk/node.html#node-js-client-documentation
 
 const entities = require("entities");
 
 const dbConn = module.parent.exports.dbConn;
 const ObjectId = require('mongodb').ObjectId;
 
 var options = {
    apiVersion: 'v1', // default
    endpoint: 'http://127.0.0.1:8200' // default
    //token: '1234' // optional client token; can be fetched after valid initialization of the server
  };
  
  // get new instance of the client
 //const vault = require("node-vault");
 
 const processEnv = process.env,
     _devLog = !!!processEnv.prodNoLog,
     _keySalt = processEnv.keySalt || "salt",
     _validHosts = JSON.parse(processEnv.validHosts || '["localhost:8080"]'),
     _errorPage = processEnv.errorPage || "https://canada.ca",
     _successJSO = processEnv.successJSO || { statusCode: 200, ok: 1 },
     _cErrorsJSO = processEnv.cErrorsJSO ||  { statusCode: 400, bad: 1, msg: "Bad request" },
     _sErrorsJSO = processEnv.sErrorsJSO ||  { statusCode: 500, err: 1 },
     _notifyEndPoint = processEnv.notifyEndPoint ||  "https://api.notification.alpha.canada.ca",
     _confirmBaseURL = processEnv.confirmBaseURL ||  "https://apps.canada.ca/x-notify/subs/confirm/",
     _nbMinutesBF = processEnv.notSendBefore || 25, // Default of 25 minutes.
     _bypassSubscode = processEnv.subscode,
     _topicCacheLimit = processEnv.topicCacheLimit || 50,
     _notifyCacheLimit = processEnv.notifyCacheLimit || 40,
     _flushAccessCode = processEnv.flushAccessCode,
     _flushAccessCode2 = processEnv.flushAccessCode2,
     _notifyUsTimeLimit = processEnv.notifyUsTimeLimit || 180000,
     _subsLinkSuffix = processEnv.subsLinkSuffix || "853e0212b92a127";
 
 let notifyCached = [],
     notifyCachedIndexes = [],
     topicCached = [],
     topicCachedIndexes = [],
     fakeSubsIncrement = 0,
     _notifyUsNotBeforeTimeLimit = 0;
     


    /*
      // init vault server
      vault.init({ secret_shares: 1, secret_threshold: 1 })
      .then( (result) => {
        var keys = result.keys;
        // set token for all following requests
        vault.token = result.root_token;
        // unseal vault server
        console.log("result.root_token : " + result.root_token);
        return vault.unseal({ secret_shares: 1, key: keys[0] })
      })
      .catch(console.error);
      

      vault.write('secret/hello', { value: 'world', lease: '1s' })
        .then( () => vault.read('secret/hello'))
        .then( () => vault.delete('secret/hello'))
        .catch(console.error);
      */
      
 //
 // Get key
 //
 // @return; a JSON containing valid key 
 //
 exports.getKey = ( req, res, next ) => {
 
     generateAuthenticationKey().then(data => {
         res.json({data})
       })
 };
 
 
 
 //
 // Get Authentication Token key from Vault
 //
 // @return; a JSON containing valid key 
 //
 generateAuthenticationKey = () => {
 
  

    /*return  axios.get("http://127.0.0.1:8200/v1/secret?help=1",
         { headers: {'X-Vault-Token': 'root'}}
       )
       .then((response) => {
         console.log(response.data);
         //console.log(response.status);
         return response.data
       }, (error) => {
         console.log(error);
       });
*/
      /// http://localhost:8200/v1/sys/seal-status
      // https://dog.ceo/api/breeds/list/all
      // http://172.18.0.1:8200/v1/sys/seal-status
      return  axios.get("http://ec2-100-26-121-207.compute-1.amazonaws.com:8200/v1/sys/seal-status",
       { headers: {'Content-Type': 'application/json'}}
       )
       .then((response) => {
         console.log(response.data);
         //console.log(response.status);
         return response.data
       }, (error) => {
         console.log(error);
       });
   

 }


