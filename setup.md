
# Setup

## Config setup

Run the following commands under the project root:
```
$ cp .env.example .env
$ vim .env
```

And modify the following variable, if needed
* user - For auth for management task
* password - For auth for management task
* flushAccessCode - For auth to flush alls "Topics" keep in memory
* flushAccessCode2 - For auth to flush alls "Topics" keep in memory
* more for prod - All variable that start with "OUR_NOTIFY" - Those is to notify the dev team
* more for prod - All variable that start with "CDS_NOTIFY" - Those is to let CDS know they need to send a 50k+ emails message
* more for prod - All variable that start with "AWS_" - Those is the S3 upload bucket to save the 50k+ emails list 

## Docker

`docker-compose up --build`

### URLs

* Server: http://localhost:8080/
* MongoDB external connector: http://localhost:27016/

### Containers

* x-notify-mongo (Mongo DB instance)
* x-notify (Server)


## First run

You need:

* In mongo: Create at least 1 topic
	* See the docker exec command "First run" in [docker readme](docker/readme.md)
* Setup one (1) email confirmation template with Notify (notification.alpha.canada.ca) - That template contains at least the personalisation `(( confirm_link ))`
* Update the topic with the appropriate template ID and notify API key
	* You can update by connecting to mongo via port 27016 or via command line in the docker container `x-notify-mongo`
	* Example of mongo command: `db.topics.updateOne( { _id: "test" }, { $set: { templateId: "<Notify template id>", notifyKey: "<Your team only notify API key>" } } );`

## Run locally

Require
* MongoDB 4.2.x
* NodeJS

* Create a `.env` and configure MONGODB_URI, user, password
* `npm install`
* `npm run start`

Server will run at `0.0.0.0:8080` by default.


## Environment variables

`cors` Set up CORS headers, method and origin for specific endpoints.
`errorPage` URL to redirect when error occur, like invalid link. Default: https://canada.ca
`confirmBaseURL` Base URL to follow in order to confirm the validity of an email address for a given topic. Default: `https://apps.canada.ca/x-notify/subs/confirm/`
`removeURL` Base URL to follow in order to unsubscribe from a topic. Default: `https://apps.canada.ca/x-notify/subs/remove/`
`successJSO` JavaScript Object returned on successful JSON API call. Default: `{ statusCode: 200, ok: 1 }`
`cErrorsJSO` JavaScript Object returned on client error, like bad email format or missing parameter. Default `{ statusCode: 400, bad: 1, msg: "Bad request" }`
`sErrorsJSO` JavaScript Object returned on client error, like MongoDB can't connect. Default: `{ statusCode: 500, err: 1 }`
`notifyEndPoint` Notify end point. Default: `https://api.notification.alpha.canada.ca`
`notSendBefore` Number of minute before to accept a resend email request. Default: `25`

`Host` URL of the host server. Default: `0.0.0.0`
`Port` Port of the server. Default: `8080`
`ServerStatusPath` Path to where we can see the server status. Default: `/admin/sys-status`
`prodNoLog` Do not log transactions in subs_log collection if in prod mode. Default: `undefined`

`NODE_ENV` Error logging for the running environment. Set to `prod` for production Default: `development`

`MONGODB_URI` MongoDB URI. Default: none, it must be set
`MONGODB_NAME` MongoDB database name. Default: `subs`

`user` User name to access at the service. Default: none, it must be set
`password` Password to access at the service. Default: none, it must be set

`keySalt` Add salt to key encoding. Default: `5417`
`validHosts` Array of valid referrer. Default: `["localhost:8080"]`
`subscode` Bypasses subscode and Notify client if set. Default: `undefined`

`topicCacheLimit`  Cache limit of number topic kept in memory. Default: `50`
`notifyCacheLimit` Cache limit of number Notify client kept in memory. Default: `40`

`flushAccessCode` Private code to allow to flush the cache. Default: undefined
`flushAccessCode2` Private second code to allow to flush the cache. Default: undefined

`convertSubCode` Migration of old subcode to one created with an uid during the download csv files. Default: false

`minBeforeToUploadOnly` Minimum of subscription before to switch to the upload only to Notify feature. Default: `50000`

`transport` Custom SMTP transporter configs. Default: none

Setting for frequency of notifying us - all the following MUST be set:
`notifyUsTimeLimit` Number of millisecond to wait before to send again a email message `180000`
`OUR_NOTIFY_END_POINT` Notify end point to us to notify us. Default: Nothing, but we can reuse the same as `notifyEndPoint`
`OUR_NOTIFY_KEY` Our private Notify key to communicate with us. Default: Nothing
`OUR_NOTIFY_SEND_EMAIL_TO` String array of emails to which to send a notification. Default: `[]`
`OUR_NOTIFY_TEMPLATE_ID` Notify template ID to use when communicating with us.


50k automation upload
`CDS_NOTIFY_END_POINT` Notify end point to notify CDS. Default: Nothing, but we can reuse the same as `notifyEndPoint`
`CDS_NOTIFY_KEY` CDS Notify key to communicate let them know we completed the upload. Default: Nothing
`CDS_NOTIFY_SEND_EMAIL_TO` String array of emails to which to send a notification to CDS. Default: `[]`
`CDS_NOTIFY_TEMPLATE_ID` Notify template ID to use when communicating with CDS.

`AWS_ACCESS_KEY` AWS access key for S3, provided by CDS
`AWS_SECRET_ACCESS_KEY` AWS secret access key for S3, provided by CDS
`AWS_BUCKET` AWS bucket name to use for the upload 

Note: We need to set the Service ID associated to the topic details (field: `nServiceId`) otherwise the file name will start with "test-". We can extract that number from the Notify API Key they have provided, it is `apikey.substring(apikey.length - 73, apikey.length - 37)`


`subsLinkSuffix` Suffix buffer URL parameter for when we send confirm/remove link. Default: "853e0212b92a127"
`jwtSecretAllSubsForTopic` This is the secret key necessary for authentication via JWT to the confirmedSubscribers service

`baseFolder` Base folder where the application run. ex: "/x-notify" Default: undefined

## Collections

topics
* _id: topicId
* templateId: Notify template id
* notifyKey: Notify Key
* confirmURL: Confirmation URL
* unsubURL: Unsubscription URL
* templateTxt: Mustache template for the email text version (SMTP only),
* templateHtml: Mustache template for the email HTML version (SMTP only),
* from: Email address from (SMTP only),
* to: Email address to (SMTP only),
* subject: Subject of email (SMTP only),
* thankURL: Thank you URL for redirection,
* failURL: Failure URL for server error,
* inputErrURL: Failure URL for filling out the form incorrectly
* nTemplateMailingId: template ID for sending a corresponding mailing


topics_details
* _id: topicId
* accessCode: Array of <string>
* createdAt
* lastUpdated
* groupName: Name of the department or section
* description: Short description about this topic
* lang: Language of this topic
* langAtl: Alternative language equivalent at this topic
* retrieving: Array of <managersAccess>
* nServiceId: Service ID associated with the notify key
* approvers: Array of <approvers>

subsExist
* e: email
* t: topicId
	
subsUnconfirmed
* email
* subscode
* topicId
* noBefore: timestamps to prevent to resend a new email in a short period of time
* createAt
* tId: Notify template id
* nKey: Notify key
* cURL: Confirmation URL


subsConfirmed
* email
* subscode
* topicId

subsUnsubs
* c: createdAt (ttl of 30 days)
* e: email
* t: topicID

subs_logs
* _id: email or phone
* createdAt
* lastUpdated
* confirmEmail: Array of <subsInfo>
* subsEmail: Array of <subsInfo>, on subscription
* unsubsEmail: Array of <subsInfo>
* resendEmail: Array of <subInfoResend>	

subsRecents
* email
* subscode
* topicId
* link: Only there when unsubscribing
	
### Sub documents

subsInfo
* topicId
* subscode
* createdAt

subInfoResend
* topicId
* createdAt
* withEmail // flag set to true when a new confirmation is sent

managersAccess
* createdAt
* tId: Topic ID
* code: Access code used

subsConfirmedNewCode
* subscode
* email
* newsubscode
* topicId

notify_badEmail_logs
* createdAt
* code
* email

notify_tooManyReq_logs
* createdAt
* email
* code
* templateId: Of Notify
* details: Description of the error message returned

approvers
* email
* subscode

### Mailing

mailing
* topicId
* title
* state: value of <mailingStateEnum>
* subject
* createdAt
* updatedAt
* history: Capped array of 10 <mailingInnerHistory>

mailingHistory
* state: value of <mailingStateEnum>
* createdAt
* comments
* mailingId

users
* name
* pass
* email
* accessToTopicId: Array of topicID 

### Sub documents for Mailing


{
		email: "email@example.com",
		subscode: "---This-Is-For-Approval---"
	}
	
mailingInnerHistory
* state: value of <mailingStateEnum>
* createAt
* comments
* historyId

mailingStateEnum (Enumeration)
* draft
* completed
* approved
* sending
* sent
* cancelled


## Indexes

```
db.topics_details.createIndex(
	{ _id: 1, accessCode: 1 }
)

db.subsUnconfirmed.createIndexes( [
	{ email: 1, subscode: 1 },
	{ topicId: 1, email: 1, notBefore: 1 }
]);


db.subsConfirmed.createIndex(
	{ topicId: 1, email: 1 },
	{ unique: true }
);


db.subsExist.createIndex(
	{ e: 1, t: 1 },
	{ unique: true }
);


db.subsUnsubs.createIndex(
	{ c: 1 },
	{ expireAfterSeconds: 2952000 }
);


db.subsRecents.createIndex(
	{ created: 1 },
	{ expireAfterSeconds: 604800 }
)
db.subsRecents.createIndex(
	{ subscode: 1 }
)

db.notify_badEmail_logs.createIndex(
	{ created: 1 },
	{ expireAfterSeconds: 604800 }
)


// To be applied after the conversion, the previous version has a risk of duplicate subscode
db.subsConfirmed.createIndex(
	{ subscode: 1 },
	{ unique: true }
);

// Depricated - to remove after subscode is converted
db.subsConfirmed.createIndex(
	{ email: 1, subscode: 1 },
	{ unique: true }
);


mailing
* topicId + updatedAt

```
