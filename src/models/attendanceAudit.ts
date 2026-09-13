import mongoose, { Document, Schema } from 'mongoose';

export type AttendanceAction = 'check_in' | 'check_in_reversal';

export interface IAttendanceAudit extends Document {
  eventId: mongoose.Types.ObjectId;
  attendeeId: mongoose.Types.ObjectId;
  action: AttendanceAction;
  actorId: mongoose.Types.ObjectId;
  ticketCode: string;
  createdAt: Date;
}

const attendanceAuditSchema = new Schema<IAttendanceAudit>({
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
  attendeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'EventAttendee', required: true, index: true },
  action: { type: String, enum: ['check_in', 'check_in_reversal'], required: true },
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  ticketCode: { type: String, required: true },
}, { timestamps: { createdAt: true, updatedAt: false } });

const AttendanceAudit = mongoose.model<IAttendanceAudit>('AttendanceAudit', attendanceAuditSchema);
export default AttendanceAudit;
