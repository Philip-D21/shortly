import 'dotenv/config';

// Polyfill for Node.js v22+ compatibility (SlowBuffer deprecation fix for legacy dependencies)
import buffer from 'buffer';
if (!(buffer as any).SlowBuffer) {
  (buffer as any).SlowBuffer = buffer.Buffer;
}

import express, { Request, Response, NextFunction } from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import path from 'path';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import createError from 'http-errors';
import logger from './logging/logger';
import httpLogger from './logging/httpLogger';
import { connect } from './db/connect';
import { connectRedis } from './config/redis';

import urlRouter from './route/url';
import userRouter from './route/user';
import mainRouter from './route/base';
import billingRouter from './route/billing';
import eventRouter from './route/event';
import { paystackWebhook } from './controller/billingController';
import { backfillEventFields } from './services/eventMigration';
import { startNotificationWorker } from './services/notificationJobs';

const app = express();

// Rate limiting (30 requests per minute per IP)
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests, please try again later.' },
});

// Security & utility middleware
app.use(
  helmet({
    contentSecurityPolicy: false, // Disabled for inline styles/scripts and Google Fonts
  })
);
app.use(httpLogger);
// Paystack signatures must be checked against the unmodified request bytes.
app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), paystackWebhook);
// Rate-limit API traffic, but never public redirects or Paystack webhook delivery.
app.use('/api', limiter);
app.use(express.json());
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));
const defaultOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
  'http://localhost:4400',
  'http://127.0.0.1:4400',
];
const envOrigins = (process.env.CORS_ORIGINS || process.env.FRONTEND_URL || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowedOrigins = Array.from(new Set([...defaultOrigins, ...envOrigins]));

app.use(
  cors({
    origin: (origin, callback) => {
      if (
        !origin ||
        process.env.NODE_ENV !== 'production' ||
        allowedOrigins.includes(origin) ||
        allowedOrigins.includes('*')
      ) {
        return callback(null, true);
      }
      const error = new Error(`Origin is not allowed by CORS: ${origin}`) as Error & { status?: number };
      error.status = 403;
      return callback(error);
    },
    credentials: true,
  })
);

// Public static assets
app.use(express.static(path.join(__dirname, 'public')));

// Views engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Mount routes
app.use('/api/auth', userRouter);
app.use('/api/url', urlRouter);
app.use('/api/billing', billingRouter);
app.use('/api/events', eventRouter);
app.use('/', mainRouter); // Base router handles landing and /:shortId redirect

// 404 handler
app.use((_req: Request, _res: Response, next: NextFunction) => {
  next(createError.NotFound());
});

// Centralized Error handling
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status || 500;
  const message = err.message || 'Internal Server Error';
  logger.error(err.message || 'Unknown Error');
  res.status(status).json({ status, message });
});

const port = process.env.PORT || 4400;

const start = async () => {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/urlshortener';
    await connect(mongoUri);
    logger.info(`Connected to MongoDB successfully at ${mongoUri}`);
    await backfillEventFields();

    await connectRedis();
    startNotificationWorker();

    app.listen(port, () => {
      logger.info(`Server is running on port ${port}...`);
    });
  } catch (err: any) {
    console.error('Failed to start server:', err.message || err);
    console.error('\n--> Tip: Make sure MongoDB is running locally (e.g. `docker compose up -d mongodb`) or check MONGO_URI in .env');
    process.exit(1);
  }
};

start();

export default app;
