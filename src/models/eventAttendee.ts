import mongoose, { Document, Schema } from 'mongoose';

export interface IEventAttendee extends Document {
  eventId: mongoose.Types.ObjectId;
  name: string;
  email: string;
  ticketCode: string;
  ticketTokenHash: string;
  status: 'registered' | 'checked_in' | 'cancelled';
  emailId?: string;
  checkedInAt?: Date;
  checkedInBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const attendeeSchema = new Schema<IEventAttendee>({
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 160 },
  email: { type: String, required: true, lowercase: true, trim: true },
  ticketCode: { type: String, required: true, unique: true, index: true },
  ticketTokenHash: { type: String, required: true, unique: true, index: true },
  status: { type: String, enum: ['registered', 'checked_in', 'cancelled'], default: 'registered' },
  checkedInAt: Date,
  emailId: String,
}, { timestamps: true });
attendeeSchema.index({ eventId: 1, email: 1 }, { unique: true });

const EventAttendee = mongoose.model<IEventAttendee>('EventAttendee', attendeeSchema);
export default EventAttendee;
