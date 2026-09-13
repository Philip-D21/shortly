import mongoose, { Document, Schema } from 'mongoose';

export interface IEvent extends Document {
  organizerId: mongoose.Types.ObjectId;
  title: string;
  description?: string;
  slug: string;
  startsAt: Date;
  endsAt?: Date;
  location?: string;
  capacity?: number;
  registrationDeadline?: Date;
  timezone: string;
  status: 'draft' | 'published' | 'cancelled';
  registrationOpen: boolean;
  registeredCount: number;
  cancelledAt?: Date;
  cancelledBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const eventSchema = new Schema<IEvent>({
  organizerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 160 },
  description: { type: String, trim: true, maxlength: 4000 },
  slug: { type: String, required: true, unique: true, index: true },
  startsAt: { type: Date, required: true },
  endsAt: Date,
  location: { type: String, trim: true, maxlength: 300 },
  capacity: { type: Number, min: 1 },
  registrationDeadline: Date,
  timezone: { type: String, default: 'Africa/Lagos', trim: true, maxlength: 80 },
  status: { type: String, enum: ['draft', 'published', 'cancelled'], default: 'published', index: true },
  registrationOpen: { type: Boolean, default: true, index: true },
  registeredCount: { type: Number, default: 0, min: 0 },
  cancelledAt: Date,
  cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

const Event = mongoose.model<IEvent>('Event', eventSchema);
export default Event;
