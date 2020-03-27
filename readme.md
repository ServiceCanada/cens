# Instructions

[How to do the setup](setup.md)

[Tests](https://github.com/ServiceCanada/x-notify/tree/master/test)


## Create topic

A topic could be compared to a mailing list.

Each topic is unilingual. They are created in pair.

For each topic you need:
* Unique Notify API key: "team and safe senders"
* Notify template ID that represent the confirmation email
* Confirmation subscription link
* Confirmation unsubscription link


## Topic naming convention

`{2-3 letter group name abbreviation}-{short topic name}{2 letter language}`

### database command sample

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
	langAlt: [ "test" ]
})
```

### Going live with a topic

You need to:
* Do sucessfully the journey of a subscribing to a topic.
	1. Subscribe
	2. Subscribe confirmation
	3. Email confirmation
	4. Sending a email message update with a CSV
	5. Unsubscribe
* Report any content anomaly, all subscription process should follow all best practice. At this stage you must let the client know + manager of any potential issue
* Ensure it is paired with another language via "langAlt". Usually it is English + French
* Ask the client to send us a Live Notify API Key via an encrypted communication
* Replace the Notify API key

### Updating an existing topic

1. Run the appropriate MongoDB query
2. Flush the cache: /api/v0.1/t-manager/{Private access code 1}/{Private access code 2}/flush-cache

### Topic

A topic could be compared to a mailing list.

`_id`

Raw string identifier for a topic. Could be a keyword.

**Updates when:** A user fills out the form to subscribe to a topic.

`templateId`

Notify API key for the specific email template related to this topic confirmation email in a string.

`notifyKey`

Notify API key for this Service in string. Services in Notify are split by "From" emails amongst other things.

`confirmURL`

String of the URL to the page to which user is redirected when they confirmed their subscription by clicking the link in the confirmation email.

`unsubURL`

String of the URL to the page to which user is redirected when they unsubscribe from their subscription by clicking the unsubscribe link in an email.


### Topics Details

Contains details about each topics.

`_id`

Raw string that matches the according topic ID.

`accessCode`

Simple string that adds a layer of validation to allow managing users to do restricted things like exporting topic emails list in CSV.

`createdAt`

Date of when the topic details are created.

`lastUpdated`

Date of last time a validation against the accessCode has been done.

**Updates when:** Every time a validation against the accessCode is done e.i. for export to CSV.

`groupName`

String containing name of a department responsible for the need to create such topic.

`description`

Description of the topic and its reason to exist, in a string.

`lang`

String that defines what language this topic is in abbrevation form.

`langAlt`

Array of pointers to other languages counterparts for the same topic. Needs ID in string of those other topics.

