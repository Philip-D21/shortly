import crypto from 'crypto';
import { Request, Response } from 'express';
import QRCode from 'qrcode';
import validator from 'validator';
import Event from '../models/event';
import EventAttendee from '../models/eventAttendee';
import { enqueueNotification, processDueNotificationJobs } from '../services/notificationJobs';
import { parseDateTimeInTimezone } from '../utils/dateTime';

const ticketHash = (token: string): string => crypto.createHash('sha256').update(token).digest('hex');
const slugify = (title: string): string => `${title.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}-${crypto.randomBytes(3).toString('hex')}`;

const eventIsOpenForRegistration = (event: any): boolean => {
  const now = new Date();
  return event.status !== 'cancelled' && (event.status || 'published') === 'published' && event.registrationOpen !== false && (!event.registrationDeadline || event.registrationDeadline > now) && event.startsAt > now;
};

const publicEvent = (event: any, registrations: number) => ({
  ...event.toObject(),
  status: event.status || 'published',
  registrationOpen: event.registrationOpen !== false,
  registeredCount: event.registeredCount ?? registrations,
  registrationAvailable: eventIsOpenForRegistration(event),
});

export const createEvent = async (req: Request, res: Response): Promise<void> => {
  try {
    const { title, description, startsAt, endsAt, location, capacity, registrationDeadline, timezone, status, registrationOpen } = req.body;
    const eventTimezone = timezone || 'Africa/Lagos';
    const start = parseDateTimeInTimezone(startsAt, eventTimezone);
    const end = endsAt ? parseDateTimeInTimezone(endsAt, eventTimezone) : undefined;
    const deadline = registrationDeadline ? parseDateTimeInTimezone(registrationDeadline, eventTimezone) : undefined;
    const normalizedDescription = typeof description === 'string' ? description.trim() : '';
    const normalizedCapacity = capacity === undefined || capacity === '' ? undefined : Number(capacity);
    const normalizedStatus = status === 'draft' ? 'draft' : 'published';
    if (!title || !normalizedDescription || !start) { res.status(400).json({ message: 'A title, description, and valid start time are required' }); return; }
    if (end && (Number.isNaN(end.getTime()) || end <= start)) { res.status(400).json({ message: 'The end time must be after the start time' }); return; }
    if (deadline && (Number.isNaN(deadline.getTime()) || deadline > start)) { res.status(400).json({ message: 'Registration must close before the event starts' }); return; }
    if (normalizedCapacity !== undefined && (!Number.isSafeInteger(normalizedCapacity) || normalizedCapacity < 1)) { res.status(400).json({ message: 'Capacity must be a whole number greater than zero' }); return; }
    const event = await Event.create({ organizerId: (req as any).user.id, title: title.trim(), description: normalizedDescription, startsAt: start, endsAt: end, location, capacity: normalizedCapacity, registrationDeadline: deadline, timezone: eventTimezone, status: normalizedStatus, registrationOpen: normalizedStatus === 'published' && registrationOpen !== false, registeredCount: 0, slug: slugify(title) });
    res.status(201).json({ event });
  } catch (error: any) { res.status(500).json({ message: error.message || 'Unable to create event' }); }
};

export const listMyEvents = async (req: Request, res: Response): Promise<void> => {
  try { res.json({ events: await Event.find({ organizerId: (req as any).user.id }).sort({ startsAt: 1 }) }); } catch (error: any) { res.status(500).json({ message: error.message || 'Unable to load events' }); }
};

export const getPublicEvent = async (req: Request, res: Response): Promise<void> => {
  const event = await Event.findOne({ slug: req.params.slug }).select('-organizerId');
  if (!event) { res.status(404).json({ message: 'Event not found' }); return; }
  const registrations = await EventAttendee.countDocuments({ eventId: event._id, status: { $ne: 'cancelled' } });
  res.json({ event: publicEvent(event, registrations), registrations, remainingSeats: event.capacity ? Math.max(event.capacity - (event.registeredCount ?? registrations), 0) : null });
};

export const registerForEvent = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email } = req.body;
    const event = await Event.findOne({ slug: req.params.slug });
    if (!event) { res.status(404).json({ message: 'Event not found' }); return; }
    if (!name || !email || !validator.isEmail(email)) { res.status(400).json({ message: 'Enter your name and a valid email address' }); return; }
    if (!eventIsOpenForRegistration(event)) { res.status(403).json({ message: event.status === 'cancelled' ? 'This event has been cancelled' : event.status !== 'published' ? 'This event is not published' : event.registrationOpen === false ? 'Registration is closed' : 'Registration for this event has ended' }); return; }
    const normalizedEmail = email.toLowerCase().trim();
    if (await EventAttendee.exists({ eventId: event._id, email: normalizedEmail, status: { $ne: 'cancelled' } })) { res.status(409).json({ message: 'This email is already registered' }); return; }

    const reserved = await Event.findOneAndUpdate(
      { _id: event._id, status: 'published', registrationOpen: { $ne: false }, $or: [{ capacity: { $exists: false } }, { capacity: null }, { $expr: { $lt: ['$registeredCount', '$capacity'] } }] },
      { $inc: { registeredCount: 1 } },
      { new: true }
    );
    if (!reserved) { res.status(409).json({ message: 'This event is full' }); return; }

    const token = crypto.randomBytes(32).toString('base64url');
    let attendee: any;
    try {
      attendee = await EventAttendee.create({ eventId: event._id, name: String(name).trim(), email: normalizedEmail, ticketCode: `EVT-${crypto.randomBytes(4).toString('hex').toUpperCase()}`, ticketTokenHash: ticketHash(token) });
    } catch (error: any) {
      await Event.updateOne({ _id: event._id, registeredCount: { $gt: 0 } }, { $inc: { registeredCount: -1 } });
      if (error?.code === 11000) { res.status(409).json({ message: 'This email is already registered' }); return; }
      throw error;
    }

    const baseUrl = (process.env.FRONTEND_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
    const ticketUrl = `${baseUrl}/tickets/${token}`;
    const emailJob = await enqueueNotification({ eventId: String(event._id), attendeeId: String(attendee._id), recipientEmail: attendee.email, type: 'ticket', idempotencyKey: `ticket-${attendee._id}`, payload: { attendeeName: attendee.name, eventTitle: event.title, startsAt: event.startsAt.toISOString(), location: event.location, ticketCode: attendee.ticketCode, ticketUrl } });
    void processDueNotificationJobs();
    res.status(201).json({ attendee: { id: attendee._id, name: attendee.name, email: attendee.email, ticketCode: attendee.ticketCode, status: attendee.status }, ticketUrl, emailSent: emailJob.status === 'accepted', emailStatus: emailJob.status });
  } catch (error: any) { res.status(500).json({ message: error.message || 'Unable to register for this event' }); }
};

export const getTicket = async (req: Request, res: Response): Promise<void> => {
  const attendee = await EventAttendee.findOne({ ticketTokenHash: ticketHash(req.params.token) });
  if (!attendee) { res.status(404).json({ message: 'Ticket not found' }); return; }
  const event = await Event.findById(attendee.eventId).select('title description startsAt endsAt location timezone status registrationOpen slug');
  if (!event) { res.status(404).json({ message: 'Event not found' }); return; }
  const baseUrl = (process.env.FRONTEND_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
  const ticketUrl = `${baseUrl}/tickets/${req.params.token}`;
  const admissionValid = event.status !== 'cancelled' && attendee.status !== 'cancelled';
  const qrCodeDataUrl = await QRCode.toDataURL(ticketUrl, { errorCorrectionLevel: 'H', width: 320, margin: 2 });
  res.json({ ticket: { id: attendee._id, name: attendee.name, ticketCode: attendee.ticketCode, status: attendee.status, checkedInAt: attendee.checkedInAt, admissionValid }, event, qrCodeDataUrl, ticketUrl });
};
