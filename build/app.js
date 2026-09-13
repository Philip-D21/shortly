"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
// Polyfill for Node.js v22+ compatibility (SlowBuffer deprecation fix for legacy dependencies)
const buffer_1 = __importDefault(require("buffer"));
if (!buffer_1.default.SlowBuffer) {
    buffer_1.default.SlowBuffer = buffer_1.default.Buffer;
}
const express_1 = __importDefault(require("express"));
const body_parser_1 = __importDefault(require("body-parser"));
const cors_1 = __importDefault(require("cors"));
const path_1 = __importDefault(require("path"));
const helmet_1 = __importDefault(require("helmet"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const http_errors_1 = __importDefault(require("http-errors"));
const logger_1 = __importDefault(require("./logging/logger"));
const httpLogger_1 = __importDefault(require("./logging/httpLogger"));
const connect_1 = require("./db/connect");
const redis_1 = require("./config/redis");
const url_1 = __importDefault(require("./route/url"));
const user_1 = __importDefault(require("./route/user"));
const base_1 = __importDefault(require("./route/base"));
const billing_1 = __importDefault(require("./route/billing"));
const event_1 = __importDefault(require("./route/event"));
const billingController_1 = require("./controller/billingController");
const eventMigration_1 = require("./services/eventMigration");
const notificationJobs_1 = require("./services/notificationJobs");
const app = (0, express_1.default)();
// Rate limiting (30 requests per minute per IP)
const limiter = (0, express_rate_limit_1.default)({
    windowMs: 1 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many requests, please try again later.' },
});
// Security & utility middleware
app.use((0, helmet_1.default)({
    contentSecurityPolicy: false, // Disabled for inline styles/scripts and Google Fonts
}));
app.use(httpLogger_1.default);
// Paystack signatures must be checked against the unmodified request bytes.
app.post('/api/billing/webhook', express_1.default.raw({ type: 'application/json' }), billingController_1.paystackWebhook);
// Rate-limit API traffic, but never public redirects or Paystack webhook delivery.
app.use('/api', limiter);
app.use(express_1.default.json());
app.use(body_parser_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
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
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        if (!origin ||
            process.env.NODE_ENV !== 'production' ||
            allowedOrigins.includes(origin) ||
            allowedOrigins.includes('*')) {
            return callback(null, true);
        }
        const error = new Error(`Origin is not allowed by CORS: ${origin}`);
        error.status = 403;
        return callback(error);
    },
    credentials: true,
}));
// Public static assets
app.use(express_1.default.static(path_1.default.join(__dirname, 'public')));
// Views engine setup
app.set('view engine', 'ejs');
app.set('views', path_1.default.join(__dirname, 'views'));
// Mount routes
app.use('/api/auth', user_1.default);
app.use('/api/url', url_1.default);
app.use('/api/billing', billing_1.default);
app.use('/api/events', event_1.default);
app.use('/', base_1.default); // Base router handles landing and /:shortId redirect
// 404 handler
app.use((_req, _res, next) => {
    next(http_errors_1.default.NotFound());
});
// Centralized Error handling
app.use((err, _req, res, _next) => {
    const status = err.status || 500;
    const message = err.message || 'Internal Server Error';
    logger_1.default.error(err.message || 'Unknown Error');
    res.status(status).json({ status, message });
});
const port = process.env.PORT || 4400;
const start = async () => {
    try {
        const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/urlshortener';
        await (0, connect_1.connect)(mongoUri);
        logger_1.default.info(`Connected to MongoDB successfully at ${mongoUri}`);
        await (0, eventMigration_1.backfillEventFields)();
        await (0, redis_1.connectRedis)();
        (0, notificationJobs_1.startNotificationWorker)();
        app.listen(port, () => {
            logger_1.default.info(`Server is running on port ${port}...`);
        });
    }
    catch (err) {
        console.error('Failed to start server:', err.message || err);
        console.error('\n--> Tip: Make sure MongoDB is running locally (e.g. `docker compose up -d mongodb`) or check MONGO_URI in .env');
        process.exit(1);
    }
};
start();
exports.default = app;
