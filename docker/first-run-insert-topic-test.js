use subs

db.topics.insertOne( {
    _id: "test",
    templateId: "<template id available in the template in Notify>",
    notifyKey: "<A valid Notify API key>",
    confirmURL: "https://canada.ca/en.html",
    unsubURL: "https://canada.ca/en.html"
})
