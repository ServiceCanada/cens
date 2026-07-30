const { Queue } = require('bullmq');
const { createBullBoard } = require('@bull-board/api');
const { BullMQAdapter } = require('@bull-board/api/bullMQAdapter');
const { ExpressAdapter } = require('@bull-board/express');

const redisUri = process.env.REDIS_URI || 'notify-redis-1';
const redisPort = process.env.REDIS_PORT || '6379';
const redisSentinel1Uri = process.env.REDIS_SENTINEL_1_URI || '127.0.0.1';
const redisSentinel1Port = process.env.REDIS_SENTINEL_1_PORT || '26379';
const redisSentinel2Uri = process.env.REDIS_SENTINEL_2_URI || '127.0.0.1';
const redisSentinel2Port = process.env.REDIS_SENTINEL_2_PORT || '26379';
const redisMasterName = process.env.REDIS_MASTER_NAME || 'x-notify-master';

let connection = {};
if (process.env.NODE_ENV === 'prod') {
	connection = {
		sentinels: [
			{ host: redisSentinel1Uri, port: Number(redisSentinel1Port) },
			{ host: redisSentinel2Uri, port: Number(redisSentinel2Port) }
		],
		name: redisMasterName,
		host: redisUri,
		port: Number(redisPort)
	}
} else {
	connection = {
		host: redisUri,
		port: Number(redisPort),
	}
}

const workerConnection = Object.assign({}, connection, {
	maxRetriesPerRequest: null
});

const notifyQueue = new Queue('sendMail-v2', { connection });
exports.notifyQueue = notifyQueue;

//used by bulk Api manager
const bulkQueue = new Queue('bulk-api-v2', { connection });
exports.bulkQueue = bulkQueue;
exports.connection = connection;
exports.workerConnection = workerConnection;

const serverAdapter = new ExpressAdapter();

createBullBoard({
  queues: [
    new BullMQAdapter( notifyQueue ),
	new BullMQAdapter( bulkQueue ),
  ],
  serverAdapter 
})

function getRouter( basePath ) {
	serverAdapter.setBasePath( basePath );
	return serverAdapter.getRouter();
}


module.exports.UI = getRouter;

module.exports.closeQueues = async function closeQueues() {
	await Promise.all([
		notifyQueue.close(),
		bulkQueue.close()
	]);
};
