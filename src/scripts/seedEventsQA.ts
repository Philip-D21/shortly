import bcrypt from 'bcrypt';
import crypto from 'crypto';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Event from '../models/event';
import EventAttendee from '../models/eventAttendee';
import EventStaff from '../models/eventStaff';
import User from '../models/user';

dotenv.config();

const password = 'QA-Events-Password-2026!';
const tokenHash = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

const main = async (): Promise<void> => {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/urlshortener');
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const users = await Promise.all([
      ['qa-event-owner@shortly.local', 'QA Event Owner'],
      ['qa-event-manager@shortly.local', 'QA Event Manager'],
      ['qa-event-staff@shortly.local', 'QA Event Staff'],
      ['qa-event-guest@shortly.local', 'QA Event Guest'],
    ].map(([email, username]) => User.findOneAndUpdate({ email }, { $set: { email, username, password: hashedPassword } }, { upsert: true, new: true, setDefaultsOnInsert: true })));
    const [owner, manager, staff, guest] = users;
    const now = Date.now();
    const eventSpecs = [
      { slug: 'qa-event-draft', title: 'QA Draft Event', status: 'draft', registrationOpen: false, startsAt: new Date(now + 14 * 86400000) },
      { slug: 'qa-event-capacity-one', title: 'QA Capacity One', status: 'published', registrationOpen: true, startsAt: new Date(now + 7 * 86400000), capacity: 1 },
      { slug: 'qa-event-cancelled', title: 'QA Cancelled Event', status: 'cancelled', registrationOpen: false, startsAt: new Date(now + 10 * 86400000), cancelledAt: new Date() },
    ];
    for (const spec of eventSpecs) {
      const event = await Event.findOneAndUpdate({ slug: spec.slug }, { $set: { organizerId: owner._id, description: `Deterministic fixture for ${spec.title}`, timezone: 'Africa/Lagos', location: 'QA Hall', ...spec } }, { upsert: true, new: true, setDefaultsOnInsert: true });
      await EventAttendee.deleteMany({ eventId: event._id });
      await EventStaff.deleteMany({ eventId: event._id });
      if (spec.slug === 'qa-event-capacity-one') {
        const token = 'qa-capacity-ticket-token';
        const attendee = await EventAttendee.create({ eventId: event._id, name: 'Checked In Guest', email: guest.email, ticketCode: 'EVT-QACHECK1', ticketTokenHash: tokenHash(token), checkedInAt: new Date(), checkedInBy: staff._id });
        await Event.updateOne({ _id: event._id }, { $set: { registeredCount: 1 } });
        await EventStaff.create([{ eventId: event._id, email: manager.email, role: 'manager', status: 'active', invitedBy: owner._id }, { eventId: event._id, email: staff.email, role: 'checkin_staff', status: 'active', invitedBy: owner._id }]);
        void attendee;
      } else {
        await Event.updateOne({ _id: event._id }, { $set: { registeredCount: 0 } });
      }
    }
    console.log('Event QA seed complete.');
    console.log(`Users: ${users.map((user) => user.email).join(', ')}`);
    console.log(`Password: ${password}`);
  } finally { await mongoose.disconnect(); }
};

main().catch((error) => { console.error('Event QA seed failed:', error); process.exitCode = 1; });
