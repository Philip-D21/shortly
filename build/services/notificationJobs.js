"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startNotificationWorker = exports.notificationStatusForResponse = exports.processDueNotificationJobs = exports.cancelObsoleteEventJobs = exports.enqueueNotification = void 0;
const notificationJob_1 = __importDefault(require("../models/notificationJob"));
const resend_1 = require("./resend");
const enqueueNotification = async (input) => notificationJob_1.default.findOneAndUpdate({ idempotencyKey: input.idempotencyKey }, {
    $setOnInsert: {
        ...input,
        status: 'queued',
        attempts: 0,
        nextAttemptAt: input.nextAttemptAt || new Date(),
    },
}, { upsert: true, new: true, setDefaultsOnInsert: true });
exports.enqueueNotification = enqueueNotification;
const cancelObsoleteEventJobs = async (eventId) => {
    await notificationJob_1.default.updateMany({ eventId, type: { $in: ['reminder', 'event_update'] }, status: { $in: ['queued', 'failed'] } }, { $set: { status: 'cancelled', lastError: 'Obsolete because the event changed or was cancelled.' } });
};
exports.cancelObsoleteEventJobs = cancelObsoleteEventJobs;
const sendJob = async (job) => {
    const payload = job.payload;
    if (job.type === 'ticket' || job.type === 'ticket_resend') {
        if (!payload.attendeeName || !payload.ticketCode || !payload.ticketUrl)
            throw new Error('Ticket notification payload is incomplete');
        return (0, resend_1.sendTicketEmail)({
            attendeeName: payload.attendeeName,
            attendeeEmail: job.recipientEmail,
            eventTitle: payload.eventTitle,
            startsAt: new Date(payload.startsAt),
            location: payload.location,
            ticketCode: payload.ticketCode,
            ticketUrl: payload.ticketUrl,
        });
    }
    return (0, resend_1.sendEventNoticeEmail)({
        attendeeName: payload.attendeeName || 'there',
        attendeeEmail: job.recipientEmail,
        eventTitle: payload.eventTitle,
        startsAt: new Date(payload.startsAt),
        location: payload.location,
        ticketUrl: payload.ticketUrl,
        heading: job.type === 'event_cancelled' ? 'Event cancelled' : job.type === 'reminder' ? 'Event reminder' : 'Event update',
        message: payload.message,
    });
};
const processDueNotificationJobs = async (limit = 20) => {
    let processed = 0;
    for (let index = 0; index < limit; index += 1) {
        const job = await notificationJob_1.default.findOneAndUpdate({ status: { $in: ['queued', 'failed'] }, nextAttemptAt: { $lte: new Date() }, attempts: { $lt: 5 } }, { $set: { status: 'processing' }, $inc: { attempts: 1 } }, { sort: { createdAt: 1 }, new: true });
        if (!job)
            break;
        processed += 1;
        try {
            const providerMessageId = await sendJob(job);
            if (!providerMessageId) {
                await notificationJob_1.default.updateOne({ _id: job._id }, { $set: { status: 'queued', nextAttemptAt: new Date(Date.now() + 5 * 60 * 1000), lastError: 'Email provider is not configured.' } });
                continue;
            }
            await notificationJob_1.default.updateOne({ _id: job._id }, { $set: { status: 'accepted', providerMessageId, acceptedAt: new Date(), lastError: undefined } });
        }
        catch (error) {
            const attempts = Number(job.attempts || 1);
            await notificationJob_1.default.updateOne({ _id: job._id }, {
                $set: {
                    status: attempts >= 5 ? 'failed' : 'queued',
                    nextAttemptAt: new Date(Date.now() + Math.min(60 * 60 * 1000, 2 ** attempts * 60 * 1000)),
                    lastError: String(error.message || error).slice(0, 500),
                },
            });
        }
    }
    return processed;
};
exports.processDueNotificationJobs = processDueNotificationJobs;
const notificationStatusForResponse = (status) => status;
exports.notificationStatusForResponse = notificationStatusForResponse;
const startNotificationWorker = () => {
    if (process.env.NOTIFICATION_WORKER_ENABLED !== 'true')
        return undefined;
    const intervalMs = Math.max(5_000, Number(process.env.NOTIFICATION_WORKER_INTERVAL_MS || 30_000));
    const worker = setInterval(() => {
        void (0, exports.processDueNotificationJobs)().catch((error) => console.error('Notification worker failed:', error));
    }, intervalMs);
    worker.unref();
    void (0, exports.processDueNotificationJobs)().catch((error) => console.error('Notification worker failed:', error));
    return worker;
};
exports.startNotificationWorker = startNotificationWorker;
