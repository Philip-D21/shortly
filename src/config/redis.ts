import { createClient } from 'redis';

const redisHost = process.env.REDIS_HOST || 'localhost';
const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);
const redisPassword = process.env.REDIS_PASSWORD || undefined;

const redisClient = createClient({
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

export const connectRedis = async (): Promise<void> => {
  try {
    await redisClient.connect();
  } catch (err: any) {
    console.warn('Could not connect to Redis, continuing without cache:', err.message);
  }
};

export default redisClient;
