//const Queue = require("bull");
const { processSendEmail, getSubscribers } = require("../helpers/sendEmail");
//const { setQueues } = require('bull-board');


const Queue = require('bull');
const { createBullBoard } = require('@bull-board/api');
const { BullAdapter } = require('@bull-board/api/bullAdapter');
const { ExpressAdapter } = require('@bull-board/express');


const redisUri = process.env.REDIS_URI || 'x-notify-redis';
const redisPort = process.env.REDIS_PORT || '6379';
const redisSentinel1Uri = process.env.REDIS_SENTINEL_1_URI || '127.0.0.1';
const redisSentinel1Port = process.env.REDIS_SENTINEL_1_PORT || '26379';
const redisSentinel2Uri = process.env.REDIS_SENTINEL_2_URI || '127.0.0.1';
const redisSentinel2Port = process.env.REDIS_SENTINEL_2_PORT || '26379';
const redisMasterName = process.env.REDIS_MASTER_NAME || 'x-notify-master';

var maxCompletedJobs = process.env.COMPLETED_JOBS_TO_KEEP || 300;



let redisConf = {};
if (process.env.NODE_ENV === 'prod') {
	redisConf = {
		redis: {
			sentinels: [
				{ host: redisSentinel1Uri, port: redisSentinel1Port },
				{ host: redisSentinel2Uri, port: redisSentinel2Port }
			],
			name: redisMasterName,
			host: redisUri,
			port: redisPort
		}
	}
} else {
	redisConf = {
		redis: {
			host: redisUri,
			port: redisPort,
		}
	}
}


const queue = new Queue("Jobs", redisConf);

createJob = async (options, data) => {
	console.log("job creattion")
		console.log(options);
	console.log(data);
	queue.add(options, data,  {
		removeOnComplete: true,
		removeOnFail: true,
	});
};
exports.createJob = createJob;

queue.process("q_getSubscribers", (job, done) => {
	console.log("subscribers retrieved --------      " + job.data);
	console.log("bullConfig")
	console.log(typeof createJob);
	getSubscribers(job.data, done, createJob);
});

queue.process("q_sendEmail", (job, done) => {
	console.log("send email triggered========");
	console.log(job.data);
	processSendEmail(job.data, done);
});



const serverAdapter = new ExpressAdapter();

createBullBoard({
  queues: [
    new BullAdapter( queue ),
  ],
  serverAdapter 
})

function getRouter( basePath ) {
	serverAdapter.setBasePath( basePath );
	return serverAdapter.getRouter();
}

//setQueues([queue]);


//module.exports.createJob = createJob;
module.exports.UI = getRouter;
