import mongoose, { Document, Schema } from 'mongoose';

export interface IClick extends Document {
  urlId: mongoose.Types.ObjectId;
  createdAt: Date;
  visitorHash?: string;
  referrer?: string;
  userAgent?: string;
}

const clickSchema = new Schema<IClick>({
  urlId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Url',
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  visitorHash: { type: String, index: true },
  referrer: { type: String, maxlength: 2048 },
  userAgent: { type: String, maxlength: 1024 },
});

const Click = mongoose.model<IClick>('Click', clickSchema);
export default Click;
