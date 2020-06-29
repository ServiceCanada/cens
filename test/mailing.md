

Documentation- for mailing

Mailing management database

collection
* mailing
* history ===> to be rename to mailing_his


mailing:
* _id
* topicId
* title
* createdAt
* state
* body
* history (cap array of last history)
* updatedAt

history:
* _id
* state
* createdAt
* mailingId


Indexes

mailing
* topicId + updatedAt


Send Test
Modify "topics" collection
* Use same API key
* nTemplateMailingId: Notify Template ID used to send mailing
//* mailingNbMsgPerS: Number of message we can send per second (default 40), what we need it's a pools -- TODO --


topics_details
* approvers: Array of emails for approval. containing the following object.
	{
		email: "email@example.com",
		subscode: "---This-Is-For-Approval---"
	}

user:
* accessToTopicId: Array of topicID
* name // User name
* pass // password
* email // email