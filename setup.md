
# Setup

* Create a `.env` and configure MONGODB_URI, user, password
* `npm install`
* `npm run start`

Server will run at `0.0.0.0:8080` by default.


## Environment variables

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
`LOG_FORMAT` Log fomat for the logger. Default: `dev`

`NODE_ENV` Error logging for the running environment. Set to `prod` for production Default: `development`

`MONGODB_URI` MongoDB URI. Default: none, it must be set
`MONGODB_NAME` MongoDB database name. Default: `subs`

`user` User name to access at the service. Default: none, it must be set
`password` Password to access at the service. Default: none, it must be set

## Collections

topics
	_id: topicId
	subs: Array of <email>
	templateId: Notify template id
	notifyKey: Notify Key
	confirmURL: Confirmation URL
	unsubURL: Unsubscription URL

topics_details
	_id: topicId
	accessCode: Array of <string>
	createdAt
	lastUpdated
	groupName: Name of the department or section
	description: Short description about this topic
	lang: Language of this topic
	langAtl: Alternative language equivalent at this topic
	retrieving: Array of <managersAccess>

subsUnconfirmed
	email
	subscode
	topicId
	noBefore: timestamps to prevent to resend a new email in a short period of time
	createAt
	tId: Notify template id
	nKey: Notify key
	cURL: Confirmation URL


subsConfirmed
	email
	subscode
	topicId
	

subs_logs
	_id: email or phone
	createdAt
	lastUpdated
	confirmEmail: Array of <subsInfo>
	subsEmail: Array of <subsInfo>, on subscription
	unsubsEmail: Array of <subsInfo>
	resendEmail: Array of <subInfoResend>	

### Sub documents

subsInfo
	topicId
	subscode
	createdAt

subInfoResend
	topicId
	createdAt
	withEmail // flag set to true when a new confirmation is sent

managersAccess
	createdAt
	tId: Topic ID
	code: Access code used

## Indexes

```
db.collection('topics').createIndex(
	{ _id: 1, subs: 1 }
);

db.collection('topics_details').createIndex(
	{ _id: 1, subs: 1 }
);


db.collection('subsUnconfirmed').createIndexes( [
	{ email: 1, subscode: 1 }.
	{ email: 1, notBefore: 1 }
]);


db.collection('subsConfirmed').createIndexes( [
	{ email: 1, subscode: 1 }.
	{ topicId: 1, email: 1 }

]);
```
