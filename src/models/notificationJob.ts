import mongoose, { Document, Schema } from 'mongoose';

export type NotificationJobType = 'ticket' | 'ticket_resend' | 'event_update' | 'event_cancelled' | 'reminder' | 'staff_invitation';
export type NotificationJobStatus = 'queued' | 'processing' | 'accepted' | 'failed' | 'cancelled';

export interface INotificationJob extends Document {
  eventId?: mongoose.Types.ObjectId;
  attendeeId?: mongoose.Types.ObjectId;
  recipientEmail: string;
  type: NotificationJobType;
  status: NotificationJobStatus;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  attempts: number;
  nextAttemptAt: Date;
  providerMessageId?: string;
  lastError?: string;
  acceptedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const notificationJobSchema = new Schema<INotificationJob>({
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', index: true },
  attendeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'EventAttendee', index: true },
  recipientEmail: { type: String, required: true, lowercase: true, trim: true },
  type: { type: String, enum: ['ticket', 'ticket_resend', 'event_update', 'event_cancelled', 'reminder', 'staff_invitation'], required: true },
  status: { type: String, enum: ['queued', 'processing', 'accepted', 'failed', 'cancelled'], default: 'queued', index: true },
  idempotencyKey: { type: String, required: true, unique: true },
  payload: { type: Schema.Types.Mixed, required: true },
  attempts: { type: Number, default: 0 },
  nextAttemptAt: { type: Date, default: Date.now, index: true },
  providerMessageId: String,
  lastError: String,
  acceptedAt: Date,
}, { timestamps: true });

const NotificationJob = mongoose.model<INotificationJob>('NotificationJob', notificationJobSchema);
export default NotificationJob;
