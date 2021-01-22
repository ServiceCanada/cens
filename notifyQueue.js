const Queue = require('bull');
const { setQueues } = require('bull-board');
const { UI } = require('bull-board');

const notifyQueue = new Queue('sendMail',
	{
		redis:{
			host:'127.0.0.1',
			port: 6379
		}
	}
);

setQueues([notifyQueue]);

module.exports.UI = UI;
