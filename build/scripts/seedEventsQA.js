"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bcrypt_1 = __importDefault(require("bcrypt"));
const crypto_1 = __importDefault(require("crypto"));
const dotenv_1 = __importDefault(require("dotenv"));
const mongoose_1 = __importDefault(require("mongoose"));
const event_1 = __importDefault(require("../models/event"));
const eventAttendee_1 = __importDefault(require("../models/eventAttendee"));
const eventStaff_1 = __importDefault(require("../models/eventStaff"));
const user_1 = __importDefault(require("../models/user"));
dotenv_1.default.config();
const password = 'QA-Events-Password-2026!';
const tokenHash = (token) => crypto_1.default.createHash('sha256').update(token).digest('hex');
const main = async () => {
    await mongoose_1.default.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/urlshortener');
    try {
        const hashedPassword = await bcrypt_1.default.hash(password, 10);
        const users = await Promise.all([
            ['qa-event-owner@shortly.local', 'QA Event Owner'],
            ['qa-event-manager@shortly.local', 'QA Event Manager'],
            ['qa-event-staff@shortly.local', 'QA Event Staff'],
            ['qa-event-guest@shortly.local', 'QA Event Guest'],
        ].map(([email, username]) => user_1.default.findOneAndUpdate({ email }, { $set: { email, username, password: hashedPassword } }, { upsert: true, new: true, setDefaultsOnInsert: true })));
        const [owner, manager, staff, guest] = users;
        const now = Date.now();
        const eventSpecs = [
            { slug: 'qa-event-draft', title: 'QA Draft Event', status: 'draft', registrationOpen: false, startsAt: new Date(now + 14 * 86400000) },
            { slug: 'qa-event-capacity-one', title: 'QA Capacity One', status: 'published', registrationOpen: true, startsAt: new Date(now + 7 * 86400000), capacity: 1 },
            { slug: 'qa-event-cancelled', title: 'QA Cancelled Event', status: 'cancelled', registrationOpen: false, startsAt: new Date(now + 10 * 86400000), cancelledAt: new Date() },
        ];
        for (const spec of eventSpecs) {
            const event = await event_1.default.findOneAndUpdate({ slug: spec.slug }, { $set: { organizerId: owner._id, description: `Deterministic fixture for ${spec.title}`, timezone: 'Africa/Lagos', location: 'QA Hall', ...spec } }, { upsert: true, new: true, setDefaultsOnInsert: true });
            await eventAttendee_1.default.deleteMany({ eventId: event._id });
            await eventStaff_1.default.deleteMany({ eventId: event._id });
            if (spec.slug === 'qa-event-capacity-one') {
                const token = 'qa-capacity-ticket-token';
                const attendee = await eventAttendee_1.default.create({ eventId: event._id, name: 'Checked In Guest', email: guest.email, ticketCode: 'EVT-QACHECK1', ticketTokenHash: tokenHash(token), checkedInAt: new Date(), checkedInBy: staff._id });
                await event_1.default.updateOne({ _id: event._id }, { $set: { registeredCount: 1 } });
                await eventStaff_1.default.create([{ eventId: event._id, email: manager.email, role: 'manager', status: 'active', invitedBy: owner._id }, { eventId: event._id, email: staff.email, role: 'checkin_staff', status: 'active', invitedBy: owner._id }]);
                void attendee;
            }
            else {
                await event_1.default.updateOne({ _id: event._id }, { $set: { registeredCount: 0 } });
            }
        }
        console.log('Event QA seed complete.');
        console.log(`Users: ${users.map((user) => user.email).join(', ')}`);
        console.log(`Password: ${password}`);
    }
    finally {
        await mongoose_1.default.disconnect();
    }
};
main().catch((error) => { console.error('Event QA seed failed:', error); process.exitCode = 1; });
