"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.backfillEventFields = void 0;
const event_1 = __importDefault(require("../models/event"));
const eventAttendee_1 = __importDefault(require("../models/eventAttendee"));
/** Backfills fields added after the original event release without touching attendee records. */
const backfillEventFields = async () => {
    const events = await event_1.default.find({ $or: [{ registeredCount: { $exists: false } }, { status: { $exists: false } }, { registrationOpen: { $exists: false } }] }).select('_id status registrationOpen registeredCount');
    for (const event of events) {
        const update = {};
        if (event.status === undefined)
            update.status = 'published';
        if (event.registrationOpen === undefined)
            update.registrationOpen = true;
        if (event.registeredCount === undefined) {
            update.registeredCount = await eventAttendee_1.default.countDocuments({ eventId: event._id, status: { $ne: 'cancelled' } });
        }
        if (Object.keys(update).length)
            await event_1.default.updateOne({ _id: event._id }, { $set: update });
    }
};
exports.backfillEventFields = backfillEventFields;
