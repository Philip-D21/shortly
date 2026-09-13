import mongoose, { Document, Schema } from 'mongoose';

export type EventStaffRole = 'manager' | 'checkin_staff';
export type EventStaffStatus = 'pending' | 'active' | 'revoked';

export interface IEventStaff extends Document {
  eventId: mongoose.Types.ObjectId;
  email: string;
  role: EventStaffRole;
  status: EventStaffStatus;
  invitationTokenHash?: string;
  invitedBy: mongoose.Types.ObjectId;
  expiresAt?: Date;
  acceptedAt?: Date;
  revokedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const eventStaffSchema = new Schema<IEventStaff>({
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
  email: { type: String, required: true, lowercase: true, trim: true, index: true },
  role: { type: String, enum: ['manager', 'checkin_staff'], required: true },
  status: { type: String, enum: ['pending', 'active', 'revoked'], default: 'pending', index: true },
  invitationTokenHash: { type: String, sparse: true, unique: true },
  invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  expiresAt: Date,
  acceptedAt: Date,
  revokedAt: Date,
}, { timestamps: true });

eventStaffSchema.index({ eventId: 1, email: 1 }, { unique: true });

const EventStaff = mongoose.model<IEventStaff>('EventStaff', eventStaffSchema);
export default EventStaff;
