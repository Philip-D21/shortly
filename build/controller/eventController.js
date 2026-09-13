"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTicket = exports.registerForEvent = exports.getPublicEvent = exports.listMyEvents = exports.createEvent = void 0;
const crypto_1 = __importDefault(require("crypto"));
const qrcode_1 = __importDefault(require("qrcode"));
const validator_1 = __importDefault(require("validator"));
const event_1 = __importDefault(require("../models/event"));
const eventAttendee_1 = __importDefault(require("../models/eventAttendee"));
const notificationJobs_1 = require("../services/notificationJobs");
const dateTime_1 = require("../utils/dateTime");
const ticketHash = (token) => crypto_1.default.createHash('sha256').update(token).digest('hex');
const slugify = (title) => `${title.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}-${crypto_1.default.randomBytes(3).toString('hex')}`;
const eventIsOpenForRegistration = (event) => {
    const now = new Date();
    return event.status !== 'cancelled' && (event.status || 'published') === 'published' && event.registrationOpen !== false && (!event.registrationDeadline || event.registrationDeadline > now) && event.startsAt > now;
};
const publicEvent = (event, registrations) => ({
    ...event.toObject(),
    status: event.status || 'published',
    registrationOpen: event.registrationOpen !== false,
    registeredCount: event.registeredCount ?? registrations,
    registrationAvailable: eventIsOpenForRegistration(event),
});
const createEvent = async (req, res) => {
    try {
        const { title, description, startsAt, endsAt, location, capacity, registrationDeadline, timezone, status, registrationOpen } = req.body;
        const eventTimezone = timezone || 'Africa/Lagos';
        const start = (0, dateTime_1.parseDateTimeInTimezone)(startsAt, eventTimezone);
        const end = endsAt ? (0, dateTime_1.parseDateTimeInTimezone)(endsAt, eventTimezone) : undefined;
        const deadline = registrationDeadline ? (0, dateTime_1.parseDateTimeInTimezone)(registrationDeadline, eventTimezone) : undefined;
        const normalizedDescription = typeof description === 'string' ? description.trim() : '';
        const normalizedCapacity = capacity === undefined || capacity === '' ? undefined : Number(capacity);
        const normalizedStatus = status === 'draft' ? 'draft' : 'published';
        if (!title || !normalizedDescription || !start) {
            res.status(400).json({ message: 'A title, description, and valid start time are required' });
            return;
        }
        if (end && (Number.isNaN(end.getTime()) || end <= start)) {
            res.status(400).json({ message: 'The end time must be after the start time' });
            return;
        }
        if (deadline && (Number.isNaN(deadline.getTime()) || deadline > start)) {
            res.status(400).json({ message: 'Registration must close before the event starts' });
            return;
        }
        if (normalizedCapacity !== undefined && (!Number.isSafeInteger(normalizedCapacity) || normalizedCapacity < 1)) {
            res.status(400).json({ message: 'Capacity must be a whole number greater than zero' });
            return;
        }
        const event = await event_1.default.create({ organizerId: req.user.id, title: title.trim(), description: normalizedDescription, startsAt: start, endsAt: end, location, capacity: normalizedCapacity, registrationDeadline: deadline, timezone: eventTimezone, status: normalizedStatus, registrationOpen: normalizedStatus === 'published' && registrationOpen !== false, registeredCount: 0, slug: slugify(title) });
        res.status(201).json({ event });
    }
    catch (error) {
        res.status(500).json({ message: error.message || 'Unable to create event' });
    }
};
exports.createEvent = createEvent;
const listMyEvents = async (req, res) => {
    try {
        res.json({ events: await event_1.default.find({ organizerId: req.user.id }).sort({ startsAt: 1 }) });
    }
    catch (error) {
        res.status(500).json({ message: error.message || 'Unable to load events' });
    }
};
exports.listMyEvents = listMyEvents;
const getPublicEvent = async (req, res) => {
    const event = await event_1.default.findOne({ slug: req.params.slug }).select('-organizerId');
    if (!event) {
        res.status(404).json({ message: 'Event not found' });
        return;
    }
    const registrations = await eventAttendee_1.default.countDocuments({ eventId: event._id, status: { $ne: 'cancelled' } });
    res.json({ event: publicEvent(event, registrations), registrations, remainingSeats: event.capacity ? Math.max(event.capacity - (event.registeredCount ?? registrations), 0) : null });
};
exports.getPublicEvent = getPublicEvent;
const registerForEvent = async (req, res) => {
    try {
        const { name, email } = req.body;
        const event = await event_1.default.findOne({ slug: req.params.slug });
        if (!event) {
            res.status(404).json({ message: 'Event not found' });
            return;
        }
        if (!name || !email || !validator_1.default.isEmail(email)) {
            res.status(400).json({ message: 'Enter your name and a valid email address' });
            return;
        }
        if (!eventIsOpenForRegistration(event)) {
            res.status(403).json({ message: event.status === 'cancelled' ? 'This event has been cancelled' : event.status !== 'published' ? 'This event is not published' : event.registrationOpen === false ? 'Registration is closed' : 'Registration for this event has ended' });
            return;
        }
        const normalizedEmail = email.toLowerCase().trim();
        if (await eventAttendee_1.default.exists({ eventId: event._id, email: normalizedEmail, status: { $ne: 'cancelled' } })) {
            res.status(409).json({ message: 'This email is already registered' });
            return;
        }
        const reserved = await event_1.default.findOneAndUpdate({ _id: event._id, status: 'published', registrationOpen: { $ne: false }, $or: [{ capacity: { $exists: false } }, { capacity: null }, { $expr: { $lt: ['$registeredCount', '$capacity'] } }] }, { $inc: { registeredCount: 1 } }, { new: true });
        if (!reserved) {
            res.status(409).json({ message: 'This event is full' });
            return;
        }
        const token = crypto_1.default.randomBytes(32).toString('base64url');
        let attendee;
        try {
            attendee = await eventAttendee_1.default.create({ eventId: event._id, name: String(name).trim(), email: normalizedEmail, ticketCode: `EVT-${crypto_1.default.randomBytes(4).toString('hex').toUpperCase()}`, ticketTokenHash: ticketHash(token) });
        }
        catch (error) {
            await event_1.default.updateOne({ _id: event._id, registeredCount: { $gt: 0 } }, { $inc: { registeredCount: -1 } });
            if (error?.code === 11000) {
                res.status(409).json({ message: 'This email is already registered' });
                return;
            }
            throw error;
        }
        const baseUrl = (process.env.FRONTEND_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
        const ticketUrl = `${baseUrl}/tickets/${token}`;
        const emailJob = await (0, notificationJobs_1.enqueueNotification)({ eventId: String(event._id), attendeeId: String(attendee._id), recipientEmail: attendee.email, type: 'ticket', idempotencyKey: `ticket-${attendee._id}`, payload: { attendeeName: attendee.name, eventTitle: event.title, startsAt: event.startsAt.toISOString(), location: event.location, ticketCode: attendee.ticketCode, ticketUrl } });
        void (0, notificationJobs_1.processDueNotificationJobs)();
        res.status(201).json({ attendee: { id: attendee._id, name: attendee.name, email: attendee.email, ticketCode: attendee.ticketCode, status: attendee.status }, ticketUrl, emailSent: emailJob.status === 'accepted', emailStatus: emailJob.status });
    }
    catch (error) {
        res.status(500).json({ message: error.message || 'Unable to register for this event' });
    }
};
exports.registerForEvent = registerForEvent;
const getTicket = async (req, res) => {
    const attendee = await eventAttendee_1.default.findOne({ ticketTokenHash: ticketHash(req.params.token) });
    if (!attendee) {
        res.status(404).json({ message: 'Ticket not found' });
        return;
    }
    const event = await event_1.default.findById(attendee.eventId).select('title description startsAt endsAt location timezone status registrationOpen slug');
    if (!event) {
        res.status(404).json({ message: 'Event not found' });
        return;
    }
    const baseUrl = (process.env.FRONTEND_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
    const ticketUrl = `${baseUrl}/tickets/${req.params.token}`;
    const admissionValid = event.status !== 'cancelled' && attendee.status !== 'cancelled';
    const qrCodeDataUrl = await qrcode_1.default.toDataURL(ticketUrl, { errorCorrectionLevel: 'H', width: 320, margin: 2 });
    res.json({ ticket: { id: attendee._id, name: attendee.name, ticketCode: attendee.ticketCode, status: attendee.status, checkedInAt: attendee.checkedInAt, admissionValid }, event, qrCodeDataUrl, ticketUrl });
};
exports.getTicket = getTicket;
