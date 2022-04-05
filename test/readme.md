


# Test

Brief list of what to create test for

* Subscribe to a topic
	- source: restFull API
	- db: email added in exist subs collection
	- db: new entry in subsUnconfirmed

* Subscribe to a topic - invalid email or undefined topic id
	- source: restFull API
	- answer: JSON - status 400
	- note: Our example should cover this situation, like displaying a message, the form parameter is not properly configured. 

* Subscribe to a topic before the delay (25 min)
	- source: restFull API
	- db: logged
	- answer: JSON - status 200
	- note: In the confirmation message it should be mentionned to check in the spam box, and to whitelist the appropriate Notify sender email. Also it can mention that if he didn't received the confirmation, to try again later in half hours.

* Subscribe to a topic after the delay (25 min)
	- source: restFull API
	- db: logged
	- answer: JSON - status 200
	- notify: A new confirmation email is sent.

* Subscribe after subscription is completed
	- source: restFull API
	- db: logged
	- return: JSON - status 200

* Subscribe to unknown topic id
	- source: restFull API
	- db: logged
	- return: JSON - status 200

* Subscribe on internal error
	- source: restFull API
	- return: JSON - status 500



* Confirm the subscription
	- source: Email link
	- get redirect to a success page specific to the topic.
	- db: Subs data is moved into a subsConfirmed collection
	- db: unsub entry is deleted
	- db: subs logs created
	- answer: redirect

* Confirm the subscription after confirmed
	- source: Email link
	- answer: redirect to a general error page
	- note: That page can be a simple page not found or a message saying the link has expired. But it is impossible to know the difference.

* Confirm subscription with a wrong subscode
	- source: Email link
	- answer: redirect to a general error page



* Unsubscribe
	- source: Email link
	- db: logged
	- db: removed from Confirmed subscriber
	- db: added a record in unsub collection

	
* Notify Failling 
	- source: Notify API call
	- db: logged
	- impact: system will show as it was successful


## cURL command

Subscribe

```
curl -i -X POST -H 'Content-Type: application/json' -d '{"eml": "pierre@example.com", "tid": "test"}' http://127.0.0.1:8080/api/v0.1/subs/email/add
```

Confirm

```
curl -i -X GET http://127.0.0.1:8080/subs/confirm/2d3903975209cbq2/87462102
```


Unsubscribe

```
curl -i -X GET http://192.168.1.205:8080/subs/remove/2d3903975209cbq2/87462102
```

## database command

Create a topic

```
db.topics.insertOne( {
    _id: "test2",
    templateId: "<template id available in the template in Notify>",
    notifyKey: "<A valid Notify API key>",
    confirmURL: "https://canada.ca/en.html",
    unsubURL: "https://canada.ca/en.html"
})
```

Create a topic detail

```
db.topics_details.insertOne( {
    _id: "test2",
    accessCode: [ "123456" ],
	createdAt: ISODate( "2020-03-21T00:00:00.000-04:00" ),
	lastUpdated: ISODate( "2020-03-21T00:00:00.000-04:00" ),
	groupName: "Department Name",
	description: "Used for this service, related to request #",
	lang: "en",
	langAlt: [ "test" ],
	nServiceId: "test-serviceID-to-be-extracted-from-Notify-API-key"
})
```

Create a topic details, with approvers

```
db.topics_details.insertOne( {
    _id: "test",
	createdAt: ISODate( "2022-03-30T00:00:00.000-04:00" ),
	lastUpdated: ISODate( "2022-03-30T00:00:00.000-04:00" ),
	groupName: "Department Name",
	description: "Used for this service, related to request #",
	lang: "en",
    approvers: [
        {
            email: "pierre@example.com",
            subscode: "for_your_approval",
            name: "Pierre"
        }
        ]
})
```

Remove a user from the subs

```
db.topics.updateOne( 
	{ _id: "test" },
	{
		$pull: {
			subs: "<email....>"
		}
	});
```

Create a user in the mailing

```
db.users.insertOne( {
	"name" : "test",
	"email" : "pierre@example.com",
	"accessToTopicId" : [
		"test"
	],
	"pass" : "<a plain text password>"
})

```

## Creation of new topic

1. Create a minimal topic as per the Create a topic query above
2. Create a topic details collection
	* topic_id
	* groupName
	* accessCode: `[ "accessCode" ]`
	* list-retreived: `[ { time, accessCode } ]`
	* description
	* lang
	* langAlt: `[ "topicIds" ]`

## Mongo Indexes and schema

todo

## GC Notification setup

1. Create an account with [GC Notification](https://notification.canada.ca) or from a equivalent service.
2. Create new service 
3. Create an email template to send confirmation email. For example:

**Template name:** TEST - Confirmation email
**Subject line of the email:** Confirm of your email to completed your subscription at TEST
**Message:**

```
Click on the following link to confirm your subscription
((confirm_link))

You have sign up to the TEST subscription
```

4. Save the templateID for the value "templateID" for the Topic creation in x-notify
5. Create an email template to send mailing to subscribers

**Template name:** TEST - Send mailing
**Subject line of the email:** TEST - ((subject))
**Message:**

```
Hi

This is a test for TEST subscription.

((body))

Click on the following link to unsubscribe: ((unsub_link))
```

6. Save the templateID for the value "nTemplateMailingId" for the Topic creation in x-notify
7. Go in the "API integration" menu
8. Select the "API Keys" doormat
9. Click on "Create an API key"
10. Name the key like: TEST-subscription
11. Choose the option "Team and safelist - limits who you can send to"
12. Save the API key string for the value "notifyKey" for the Topic creation in x-notify


## Regression testing

Initial setup
* GC Notification. See instruction above
 Clear the database, drop all collection. Like by connecting to Mongo via the local port 27016
* Create a topic with the notify key created and the template ID for email confirmation and mailing

Test - Simple topic, minimal configuration
* Create a new subscriber with your email. See the curl command above
* TEST: Wait, you should receive a email in your inbox.
* Confirm you email either following the link from where the local instance of x-notify is running or by running the above curl command by replacing the first id of 16 character in the URL.
* TEST: Connect into the database, you should see a collection named "subsConfirmed" with your email in it.
* Create a new mailing user by running a database command. Ensure the user has access to the topic ID you have set previously
() Open you browser and go at http://localhost:8080/api/v1/mailing/login
* Login with the user/pass credential you defined when creating the user
* Create a new mailing by providing a campaign name
* TEST: The mailing status should be set to "Draft"
* TEST: In the workflow section, only "Approve" and "Cancel the mailing" option should be available
* Click "Save and test"
* TEST: Wait, you should receive an email with a special added message saying this is a test email
* Click "Approve"
* TEST: The mailing status should say "approved"
* Go back into the all the mailing
* Select your recently created mailing in the table
* TEST: The mailing status should remain "approved"
* TEST: In the workflow section, you should be able to see "Send mailing to subscriber" option
* Click: "Save"
* TEST: The mailing status should have changed back to "Draft"
* TEST: In the working section, you should only see "Approve" and "Cancel" option. The "Send mailing" option should have been removed
* Click: "Approve"
* Click: "Send mailing to subscribers"
* TEST: The mailing status should be "sending" and no option are available in the workflow
* TEST: An option to cancel the mailing should appear before the mailing campaign name
* Refresh the current page
* TEST: The mailing status should have change to "Sent"
* TEST: Check you email, you should have received the email.
* END OF TEST, expected all test passed

Test - Send a copy of the mailing to approvers
* Add a list of approvers in the topic_details for the created topic
* Go into the mailing and save it
* TEST: In the workflow, you should see send to all approvers or be able to select specific name
* Click on your name
* TEST: Wait, you should receive an email with a message asking for approval
* TEST: Check the mailing status, it should show "completed"
* END OF TEST, expected all test passed

## Endpoint URLs

* API end point: https://apps.canada.ca/x-notify/api/v0.1/subs/email/add
* Confirmation link: https://apps.canada.ca/x-notify/subs/confirm/
* Remove link: https://apps.canada.ca/x-notify/subs/remove/

* Get subscriber list: https://apps.canada.ca/x-notify/api/v0.1/t-manager/123456/test/topic/list
