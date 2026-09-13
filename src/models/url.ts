import mongoose, { Document, Schema } from 'mongoose';

export interface IUrl extends Document {
  shortUrl: string;
  longUrl: string;
  shortId: string;
  clicks: number;
  userId: mongoose.Types.ObjectId | null;
  customUrl: string | null;
  qrCodeDataUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const urlSchema = new Schema<IUrl>(
  {
    shortUrl: {
      type: String,
      required: [true, 'Please provide short Url'],
    },
    longUrl: {
      type: String,
      required: [true, 'Please provide long url'],
    },
    shortId: {
      type: String,
      required: [true, 'Please provide the short id'],
      unique: true,
      index: true,
    },
    clicks: {
      type: Number,
      default: 0,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    customUrl: {
      type: String,
      unique: true,
      sparse: true,
      default: null,
    },
    qrCodeDataUrl: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

const Url = mongoose.model<IUrl>('Url', urlSchema);
export default Url;
