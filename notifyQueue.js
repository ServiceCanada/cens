const Queue = require('bull');
const { createBullBoard } = require('@bull-board/api');
const { BullAdapter } = require('@bull-board/api/bullAdapter');
const { ExpressAdapter } = require('@bull-board/express');

const redisUri = process.env.REDIS_URI || 'notify-redis-1';
const redisPort = process.env.REDIS_PORT || '6379';
const redisSentinel1Uri = process.env.REDIS_SENTINEL_1_URI || '127.0.0.1';
const redisSentinel1Port = process.env.REDIS_SENTINEL_1_PORT || '26379';
const redisSentinel2Uri = process.env.REDIS_SENTINEL_2_URI || '127.0.0.1';
const redisSentinel2Port = process.env.REDIS_SENTINEL_2_PORT || '26379';
const redisMasterName = process.env.REDIS_MASTER_NAME || 'x-notify-master';

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

const notifyQueue = new Queue('sendMail', redisConf);

//used by bulk Api manager
const bulkQueue = new Queue('bulk-api', redisConf);
exports.bulkQueue = bulkQueue;

const serverAdapter = new ExpressAdapter();

createBullBoard({
  queues: [
    new BullAdapter( notifyQueue ),
	new BullAdapter( bulkQueue ),
  ],
  serverAdapter 
})

function getRouter( basePath ) {
	serverAdapter.setBasePath( basePath );
	return serverAdapter.getRouter();
}


module.exports.UI = getRouter;
