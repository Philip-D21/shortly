"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectRedis = void 0;
const redis_1 = require("redis");
const redisHost = process.env.REDIS_HOST || 'localhost';
const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);
const redisPassword = process.env.REDIS_PASSWORD || undefined;
const redisClient = (0, redis_1.createClient)({
    password: redisPassword,
    socket: {
        host: redisHost,
        port: redisPort,
        reconnectStrategy: (retries) => {
            if (retries > 5) {
                console.warn('Redis reconnection limit reached. Operating without cache.');
                return new Error('Redis connection failed');
            }
            return Math.min(retries * 100, 3000);
        },
    },
});
redisClient.on('error', (err) => console.error('Redis Client Error:', err.message));
redisClient.on('connect', () => console.log('Redis connected successfully'));
const connectRedis = async () => {
    try {
        await redisClient.connect();
    }
    catch (err) {
        console.warn('Could not connect to Redis, continuing without cache:', err.message);
    }
};
exports.connectRedis = connectRedis;
exports.default = redisClient;
