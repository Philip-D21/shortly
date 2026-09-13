import Event from '../models/event';
import EventAttendee from '../models/eventAttendee';

/** Backfills fields added after the original event release without touching attendee records. */
export const backfillEventFields = async (): Promise<void> => {
  const events = await Event.find({ $or: [{ registeredCount: { $exists: false } }, { status: { $exists: false } }, { registrationOpen: { $exists: false } }] }).select('_id status registrationOpen registeredCount');
  for (const event of events) {
    const update: Record<string, unknown> = {};
    if (event.status === undefined) update.status = 'published';
    if (event.registrationOpen === undefined) update.registrationOpen = true;
    if (event.registeredCount === undefined) {
      update.registeredCount = await EventAttendee.countDocuments({ eventId: event._id, status: { $ne: 'cancelled' } });
    }
    if (Object.keys(update).length) await Event.updateOne({ _id: event._id }, { $set: update });
  }
};
