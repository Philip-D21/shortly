"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listMessageJobs = exports.scheduleReminder = exports.sendMessage = exports.previewMessage = exports.acceptStaffInvitation = exports.revokeStaff = exports.inviteStaff = exports.listStaff = exports.reverseCheckIn = exports.checkInGuest = exports.resendGuestTicket = exports.cancelGuestRegistration = exports.getGuest = exports.exportGuests = exports.csvCell = exports.listGuests = exports.duplicateEvent = exports.cancelEvent = exports.setRegistrationOpen = exports.publishEvent = exports.updateEvent = exports.getEventManagement = void 0;
const crypto_1 = __importDefault(require("crypto"));
const validator_1 = __importDefault(require("validator"));
const event_1 = __importDefault(require("../models/event"));
const eventAttendee_1 = __importDefault(require("../models/eventAttendee"));
const attendanceAudit_1 = __importDefault(require("../models/attendanceAudit"));
const eventStaff_1 = __importDefault(require("../models/eventStaff"));
const notificationJob_1 = __importDefault(require("../models/notificationJob"));
const eventAccess_1 = require("../services/eventAccess");
const notificationJobs_1 = require("../services/notificationJobs");
const dateTime_1 = require("../utils/dateTime");
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ticketHash = (token) => crypto_1.default.createHash('sha256').update(token).digest('hex');
const tokenForTicket = () => crypto_1.default.randomBytes(32).toString('base64url');
const ticketBaseUrl = () => (process.env.FRONTEND_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const accessOr403 = async (req, eventId, permission, res) => {
    const access = await (0, eventAccess_1.getEventAccess)(eventId, req.user.id);
    if (!access || !(0, eventAccess_1.hasEventPermission)(access.role, permission)) {
        res.status(403).json({ message: 'You do not have permission for this event' });
        return null;
    }
    return access;
};
const serializeGuest = (guest) => ({ id: guest._id, name: guest.name, email: guest.email, ticketCode: guest.ticketCode, status: guest.status, checkedInAt: guest.checkedInAt, checkedIn: Boolean(guest.checkedInAt), emailSent: Boolean(guest.emailId), createdAt: guest.createdAt });
const getEventManagement = async (req, res) => {
    try {
        const access = await accessOr403(req, req.params.eventId, 'manage', res);
        if (!access)
            return;
        const [registered, checkedIn, cancelled, staff] = await Promise.all([
            eventAttendee_1.default.countDocuments({ eventId: access.event._id, status: 'registered' }),
            eventAttendee_1.default.countDocuments({ eventId: access.event._id, status: 'registered', checkedInAt: { $ne: null } }),
            eventAttendee_1.default.countDocuments({ eventId: access.event._id, status: 'cancelled' }),
            eventStaff_1.default.find({ eventId: access.event._id }).select('email role status expiresAt createdAt'),
        ]);
        res.json({ event: access.event, role: access.role, counts: { registered, checkedIn, cancelled }, staff });
    }
    catch (error) {
        res.status(500).json({ message: error.message || 'Unable to load event management' });
    }
};
exports.getEventManagement = getEventManagement;
const updateEvent = async (req, res) => {
    try {
        const access = await accessOr403(req, req.params.eventId, 'manage', res);
        if (!access)
            return;
        const allowed = ['title', 'description', 'startsAt', 'endsAt', 'timezone', 'location', 'capacity', 'registrationDeadline', 'status', 'registrationOpen'];
        const update = {};
        for (const field of allowed)
            if (req.body[field] !== undefined)
                update[field] = req.body[field];
        const eventTimezone = update.timezone || access.event.timezone || 'Africa/Lagos';
        if (update.startsAt)
            update.startsAt = (0, dateTime_1.parseDateTimeInTimezone)(update.startsAt, eventTimezone);
        if (update.endsAt)
            update.endsAt = (0, dateTime_1.parseDateTimeInTimezone)(update.endsAt, eventTimezone);
        if (update.registrationDeadline)
            update.registrationDeadline = (0, dateTime_1.parseDateTimeInTimezone)(update.registrationDeadline, eventTimezone);
        if ((req.body.startsAt && !update.startsAt) || (req.body.endsAt && !update.endsAt) || (req.body.registrationDeadline && !update.registrationDeadline)) {
            res.status(400).json({ message: 'Invalid date or timezone' });
            return;
        }
        if (update.capacity !== undefined && update.capacity !== null && update.capacity !== '')
            update.capacity = Number(update.capacity);
        const currentCount = Number(access.event.registeredCount || 0);
        if (update.capacity !== undefined && update.capacity !== null && (!Number.isSafeInteger(update.capacity) || update.capacity < currentCount || update.capacity < 1)) {
            res.status(400).json({ message: `Capacity cannot be lower than the ${currentCount} occupied seats` });
            return;
        }
        if (update.endsAt && update.startsAt && update.endsAt <= update.startsAt) {
            res.status(400).json({ message: 'The end time must be after the start time' });
            return;
        }
        if (update.registrationDeadline && update.startsAt && update.registrationDeadline > update.startsAt) {
            res.status(400).json({ message: 'Registration must close before the event starts' });
            return;
        }
        if (update.status === 'cancelled') {
            res.status(400).json({ message: 'Use the cancellation action for cancelled events' });
            return;
        }
        const dateChanged = update.startsAt || update.endsAt || update.timezone || update.location;
        const saved = await event_1.default.findByIdAndUpdate(access.event._id, { $set: update }, { new: true, runValidators: true });
        if (!saved) {
            res.status(404).json({ message: 'Event not found' });
            return;
        }
        if (dateChanged)
            await (0, notificationJobs_1.cancelObsoleteEventJobs)(String(saved._id));
        res.json({ event: saved });
    }
    catch (error) {
        res.status(400).json({ message: error.message || 'Unable to update event' });
    }
};
exports.updateEvent = updateEvent;
const publishEvent = async (req, res) => {
    try {
        const access = await accessOr403(req, req.params.eventId, 'manage', res);
        if (!access)
            return;
        const event = await event_1.default.findOneAndUpdate({ _id: access.event._id, status: { $ne: 'cancelled' } }, { $set: { status: 'published', registrationOpen: true } }, { new: true });
        res.json({ event });
    }
    catch (error) {
        res.status(400).json({ message: error.message || 'Unable to publish event' });
    }
};
exports.publishEvent = publishEvent;
const setRegistrationOpen = async (req, res) => {
    const access = await accessOr403(req, req.params.eventId, 'manage', res);
    if (!access)
        return;
    const open = Boolean(req.body.open);
    const event = await event_1.default.findOneAndUpdate({ _id: access.event._id, status: { $ne: 'cancelled' } }, { $set: { registrationOpen: open, status: open ? 'published' : access.event.status } }, { new: true });
    res.json({ event });
};
exports.setRegistrationOpen = setRegistrationOpen;
const cancelEvent = async (req, res) => {
    try {
        const access = await accessOr403(req, req.params.eventId, 'manage', res);
        if (!access)
            return;
        const event = await event_1.default.findOneAndUpdate({ _id: access.event._id, status: { $ne: 'cancelled' } }, { $set: { status: 'cancelled', registrationOpen: false, cancelledAt: new Date(), cancelledBy: req.user.id } }, { new: true });
        if (!event) {
            res.status(409).json({ message: 'Event is already cancelled' });
            return;
        }
        await (0, notificationJobs_1.cancelObsoleteEventJobs)(String(event._id));
        const attendees = await eventAttendee_1.default.find({ eventId: event._id, status: { $ne: 'cancelled' } }).select('name email ticketCode');
        await Promise.all(attendees.map((attendee) => (0, notificationJobs_1.enqueueNotification)({ eventId: String(event._id), attendeeId: String(attendee._id), recipientEmail: attendee.email, type: 'event_cancelled', idempotencyKey: `event-cancelled-${event._id}-${attendee._id}`, payload: { attendeeName: attendee.name, eventTitle: event.title, startsAt: event.startsAt.toISOString(), location: event.location, message: req.body.message || 'This event has been cancelled. Your ticket is no longer valid.' } })));
        res.json({ event, notificationCount: attendees.length });
    }
    catch (error) {
        res.status(500).json({ message: error.message || 'Unable to cancel event' });
    }
};
exports.cancelEvent = cancelEvent;
const duplicateEvent = async (req, res) => {
    const access = await accessOr403(req, req.params.eventId, 'manage', res);
    if (!access)
        return;
    const copy = await event_1.default.create({ organizerId: access.event.organizerId, title: `${access.event.title} (Copy)`, description: access.event.description, startsAt: access.event.startsAt, endsAt: access.event.endsAt, timezone: access.event.timezone, location: access.event.location, capacity: access.event.capacity, registrationDeadline: access.event.registrationDeadline, status: 'draft', registrationOpen: false, registeredCount: 0, slug: `${access.event.slug}-copy-${crypto_1.default.randomBytes(3).toString('hex')}` });
    res.status(201).json({ event: copy });
};
exports.duplicateEvent = duplicateEvent;
const listGuests = async (req, res) => {
    const access = await accessOr403(req, req.params.eventId, 'guests', res);
    if (!access)
        return;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const search = String(req.query.search || '').trim();
    const filter = { eventId: access.event._id };
    if (search) {
        const expression = new RegExp(escapeRegExp(search), 'i');
        filter.$or = [{ name: expression }, { email: expression }, { ticketCode: expression }];
    }
    if (req.query.status === 'registered' || req.query.status === 'cancelled')
        filter.status = req.query.status;
    if (req.query.attendance === 'checked_in')
        filter.checkedInAt = { $ne: null };
    if (req.query.attendance === 'not_checked_in')
        filter.checkedInAt = null;
    const [total, guests] = await Promise.all([eventAttendee_1.default.countDocuments(filter), eventAttendee_1.default.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit)]);
    res.json({ guests: guests.map(serializeGuest), page, limit, total, pages: Math.ceil(total / limit) });
};
exports.listGuests = listGuests;
const csvCell = (value) => {
    let text = String(value ?? '');
    if (/^[=+\-@]/.test(text))
        text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
};
exports.csvCell = csvCell;
const exportGuests = async (req, res) => {
    const access = await accessOr403(req, req.params.eventId, 'export', res);
    if (!access)
        return;
    const guests = await eventAttendee_1.default.find({ eventId: access.event._id }).sort({ createdAt: 1 });
    const rows = [['Name', 'Email', 'Ticket code', 'Registration status', 'Attendance status', 'Registered at'], ...guests.map((guest) => [guest.name, guest.email, guest.ticketCode, guest.status, guest.checkedInAt ? 'checked_in' : 'not_checked_in', guest.createdAt.toISOString()])];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${access.event.slug}-guests.csv"`);
    res.send(rows.map((row) => row.map(exports.csvCell).join(',')).join('\n'));
};
exports.exportGuests = exportGuests;
const getGuest = async (req, res) => {
    const access = await accessOr403(req, req.params.eventId, 'guests', res);
    if (!access)
        return;
    const guest = await eventAttendee_1.default.findOne({ _id: req.params.attendeeId, eventId: access.event._id });
    if (!guest) {
        res.status(404).json({ message: 'Guest not found' });
        return;
    }
    res.json({ guest: serializeGuest(guest), audit: await attendanceAudit_1.default.find({ attendeeId: guest._id }).sort({ createdAt: -1 }) });
};
exports.getGuest = getGuest;
const cancelGuestRegistration = async (req, res) => {
    const access = await accessOr403(req, req.params.eventId, 'guests', res);
    if (!access)
        return;
    const guest = await eventAttendee_1.default.findOneAndUpdate({ _id: req.params.attendeeId, eventId: access.event._id, status: 'registered' }, { $set: { status: 'cancelled' } }, { new: true });
    if (!guest) {
        res.status(404).json({ message: 'Guest is missing or already cancelled' });
        return;
    }
    await event_1.default.updateOne({ _id: access.event._id, registeredCount: { $gt: 0 } }, { $inc: { registeredCount: -1 } });
    res.json({ guest: serializeGuest(guest) });
};
exports.cancelGuestRegistration = cancelGuestRegistration;
const resendGuestTicket = async (req, res) => {
    const access = await accessOr403(req, req.params.eventId, 'guests', res);
    if (!access)
        return;
    const guest = await eventAttendee_1.default.findOne({ _id: req.params.attendeeId, eventId: access.event._id });
    if (!guest) {
        res.status(404).json({ message: 'Guest not found' });
        return;
    }
    if (guest.status === 'cancelled' || access.event.status === 'cancelled') {
        res.status(409).json({ message: 'A cancelled ticket cannot be resent' });
        return;
    }
    const token = tokenForTicket();
    guest.ticketTokenHash = ticketHash(token);
    const ticketUrl = `${ticketBaseUrl()}/tickets/${token}`;
    await guest.save();
    const job = await (0, notificationJobs_1.enqueueNotification)({ eventId: String(access.event._id), attendeeId: String(guest._id), recipientEmail: guest.email, type: 'ticket_resend', idempotencyKey: `ticket-resend-${guest._id}-${guest.ticketTokenHash}`, payload: { attendeeName: guest.name, eventTitle: access.event.title, startsAt: access.event.startsAt.toISOString(), location: access.event.location, ticketCode: guest.ticketCode, ticketUrl } });
    void (0, notificationJobs_1.processDueNotificationJobs)();
    res.status(202).json({ status: job.status, ticketUrl, emailSent: job.status === 'accepted' });
};
exports.resendGuestTicket = resendGuestTicket;
const findGuestFromCheckInInput = async (eventId, token, ticketCode) => {
    if (token)
        return eventAttendee_1.default.findOne({ ticketTokenHash: ticketHash(token) });
    if (ticketCode)
        return eventAttendee_1.default.findOne({ ticketCode: ticketCode.trim().toUpperCase() });
    return null;
};
const checkInGuest = async (req, res) => {
    const access = await accessOr403(req, req.params.eventId, 'checkin', res);
    if (!access)
        return;
    if (access.event.status === 'cancelled') {
        res.status(409).json({ result: 'cancelled', message: 'This event is cancelled' });
        return;
    }
    const found = await findGuestFromCheckInInput(String(access.event._id), req.body.token, req.body.ticketCode);
    if (!found) {
        res.status(404).json({ result: 'invalid', message: 'Ticket not found' });
        return;
    }
    if (String(found.eventId) !== String(access.event._id)) {
        res.status(409).json({ result: 'wrong_event', message: 'This ticket belongs to another event' });
        return;
    }
    if (found.status === 'cancelled') {
        res.status(409).json({ result: 'cancelled', message: 'This registration is cancelled' });
        return;
    }
    if (found.checkedInAt) {
        res.status(409).json({ result: 'already_checked_in', guest: serializeGuest(found), message: 'This guest is already checked in' });
        return;
    }
    const guest = await eventAttendee_1.default.findOneAndUpdate({ _id: found._id, eventId: access.event._id, status: 'registered', checkedInAt: null }, { $set: { checkedInAt: new Date(), checkedInBy: req.user.id } }, { new: true });
    if (!guest) {
        res.status(409).json({ result: 'already_checked_in', message: 'This guest was checked in by another staff member' });
        return;
    }
    await attendanceAudit_1.default.create({ eventId: access.event._id, attendeeId: guest._id, action: 'check_in', actorId: req.user.id, ticketCode: guest.ticketCode });
    res.json({ result: 'checked_in', guest: serializeGuest(guest) });
};
exports.checkInGuest = checkInGuest;
const reverseCheckIn = async (req, res) => {
    const access = await accessOr403(req, req.params.eventId, 'manage', res);
    if (!access)
        return;
    const guest = await eventAttendee_1.default.findOneAndUpdate({ _id: req.params.attendeeId, eventId: access.event._id, checkedInAt: { $ne: null } }, { $unset: { checkedInAt: 1, checkedInBy: 1 } }, { new: true });
    if (!guest) {
        res.status(409).json({ message: 'Guest is not currently checked in' });
        return;
    }
    await attendanceAudit_1.default.create({ eventId: access.event._id, attendeeId: guest._id, action: 'check_in_reversal', actorId: req.user.id, ticketCode: guest.ticketCode });
    res.json({ guest: serializeGuest(guest) });
};
exports.reverseCheckIn = reverseCheckIn;
const listStaff = async (req, res) => {
    const access = await accessOr403(req, req.params.eventId, 'staff', res);
    if (!access)
        return;
    res.json({ staff: await eventStaff_1.default.find({ eventId: access.event._id }).select('email role status expiresAt createdAt revokedAt') });
};
exports.listStaff = listStaff;
const inviteStaff = async (req, res) => {
    const access = await accessOr403(req, req.params.eventId, 'staff', res);
    if (!access || access.role !== 'owner') {
        if (access)
            res.status(403).json({ message: 'Only the event owner can manage staff' });
        return;
    }
    const email = String(req.body.email || '').toLowerCase().trim();
    const role = req.body.role === 'checkin_staff' ? 'checkin_staff' : 'manager';
    if (!validator_1.default.isEmail(email)) {
        res.status(400).json({ message: 'Enter a valid staff email' });
        return;
    }
    const token = tokenForTicket();
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const staff = await eventStaff_1.default.findOneAndUpdate({ eventId: access.event._id, email }, { $set: { role, status: 'pending', invitationTokenHash: ticketHash(token), invitedBy: req.user.id, expiresAt, revokedAt: undefined } }, { upsert: true, new: true, setDefaultsOnInsert: true });
    await (0, notificationJobs_1.enqueueNotification)({ eventId: String(access.event._id), recipientEmail: email, type: 'staff_invitation', idempotencyKey: `staff-invite-${staff._id}-${expiresAt.getTime()}`, payload: { eventTitle: access.event.title, startsAt: access.event.startsAt.toISOString(), location: access.event.location, message: `You have been invited as ${role.replace('_', ' ')}. Invitation token: ${token}` } });
    res.status(201).json({ staff: { email: staff.email, role: staff.role, status: staff.status, expiresAt: staff.expiresAt }, invitationToken: token });
};
exports.inviteStaff = inviteStaff;
const revokeStaff = async (req, res) => {
    const access = await accessOr403(req, req.params.eventId, 'staff', res);
    if (!access || access.role !== 'owner') {
        if (access)
            res.status(403).json({ message: 'Only the event owner can manage staff' });
        return;
    }
    const staff = await eventStaff_1.default.findOneAndUpdate({ _id: req.params.staffId, eventId: access.event._id }, { $set: { status: 'revoked', revokedAt: new Date() }, $unset: { invitationTokenHash: 1 } }, { new: true });
    if (!staff) {
        res.status(404).json({ message: 'Staff member not found' });
        return;
    }
    res.json({ staff: { email: staff.email, role: staff.role, status: staff.status } });
};
exports.revokeStaff = revokeStaff;
const acceptStaffInvitation = async (req, res) => {
    const token = String(req.body.token || '');
    const userId = req.user?.id;
    const userEmail = req.user?.email?.toLowerCase();
    if (!token || !userId || !userEmail) {
        res.status(401).json({ message: 'Sign in before accepting an invitation' });
        return;
    }
    const staff = await eventStaff_1.default.findOne({ invitationTokenHash: ticketHash(token), status: 'pending', expiresAt: { $gt: new Date() } });
    if (!staff || staff.email !== userEmail) {
        res.status(403).json({ message: 'Invitation is invalid, expired, or not assigned to this email' });
        return;
    }
    staff.status = 'active';
    staff.acceptedAt = new Date();
    staff.invitationTokenHash = undefined;
    await staff.save();
    res.json({ eventId: staff.eventId, role: staff.role, status: staff.status });
};
exports.acceptStaffInvitation = acceptStaffInvitation;
const previewMessage = async (req, res) => {
    const access = await accessOr403(req, req.params.eventId, 'messages', res);
    if (!access)
        return;
    res.json({ subject: `${req.body.heading || 'Event update'}: ${access.event.title}`, message: req.body.message || '', recipientCount: await eventAttendee_1.default.countDocuments({ eventId: access.event._id, status: 'registered' }) });
};
exports.previewMessage = previewMessage;
const sendMessage = async (req, res) => {
    const access = await accessOr403(req, req.params.eventId, 'messages', res);
    if (!access)
        return;
    const heading = String(req.body.heading || 'Event update');
    const message = String(req.body.message || '').trim();
    if (!message) {
        res.status(400).json({ message: 'Write a message before sending' });
        return;
    }
    const attendees = await eventAttendee_1.default.find({ eventId: access.event._id, status: 'registered' }).select('name email ticketCode ticketTokenHash');
    const jobs = await Promise.all(attendees.map((attendee) => (0, notificationJobs_1.enqueueNotification)({ eventId: String(access.event._id), attendeeId: String(attendee._id), recipientEmail: attendee.email, type: 'event_update', idempotencyKey: `event-update-${access.event._id}-${attendee._id}-${crypto_1.default.createHash('sha1').update(`${heading}:${message}`).digest('hex')}`, payload: { attendeeName: attendee.name, eventTitle: access.event.title, startsAt: access.event.startsAt.toISOString(), location: access.event.location, message: `${heading}\n\n${message}`, ticketUrl: undefined } })));
    void (0, notificationJobs_1.processDueNotificationJobs)();
    res.status(202).json({ status: 'queued', queued: jobs.length, jobIds: jobs.map((job) => job._id) });
};
exports.sendMessage = sendMessage;
const scheduleReminder = async (req, res) => {
    const access = await accessOr403(req, req.params.eventId, 'messages', res);
    if (!access)
        return;
    const remindAt = new Date(req.body.remindAt);
    const message = String(req.body.message || '').trim();
    if (Number.isNaN(remindAt.getTime()) || remindAt <= new Date()) {
        res.status(400).json({ message: 'Choose a future reminder time' });
        return;
    }
    if (!message) {
        res.status(400).json({ message: 'Write a reminder before scheduling' });
        return;
    }
    const attendees = await eventAttendee_1.default.find({ eventId: access.event._id, status: 'registered' }).select('name email _id');
    const digest = crypto_1.default.createHash('sha1').update(`${remindAt.toISOString()}:${message}`).digest('hex');
    const jobs = await Promise.all(attendees.map((attendee) => (0, notificationJobs_1.enqueueNotification)({ eventId: String(access.event._id), attendeeId: String(attendee._id), recipientEmail: attendee.email, type: 'reminder', idempotencyKey: `reminder-${access.event._id}-${attendee._id}-${digest}`, nextAttemptAt: remindAt, payload: { attendeeName: attendee.name, eventTitle: access.event.title, startsAt: access.event.startsAt.toISOString(), location: access.event.location, message } })));
    res.status(202).json({ status: 'scheduled', scheduledFor: remindAt, scheduled: jobs.length });
};
exports.scheduleReminder = scheduleReminder;
const listMessageJobs = async (req, res) => {
    const access = await accessOr403(req, req.params.eventId, 'messages', res);
    if (!access)
        return;
    res.json({ jobs: await notificationJob_1.default.find({ eventId: access.event._id }).sort({ createdAt: -1 }).limit(100).select('type status recipientEmail attempts providerMessageId lastError createdAt acceptedAt') });
};
exports.listMessageJobs = listMessageJobs;
