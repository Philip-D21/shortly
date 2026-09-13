import mongoose, { Document, Schema } from 'mongoose';
import { PlanTier } from '../config/plans';

export type SubscriptionStatus =
  | 'pending'
  | 'active'
  | 'non-renewing'
  | 'attention'
  | 'cancelled'
  | 'failed';

export interface ISubscription extends Document {
  userId: mongoose.Types.ObjectId;
  plan: Exclude<PlanTier, 'free'>;
  status: SubscriptionStatus;
  amount: number;
  currency: string;
  paystackReference?: string;
  paystackPlanCode: string;
  paystackCustomerCode?: string;
  paystackSubscriptionCode?: string;
  paystackEmailToken?: string;
  nextPaymentDate?: Date;
  lastPaymentAt?: Date;
  cancelledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const subscriptionSchema = new Schema<ISubscription>(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    plan: { type: String, enum: ['pro', 'business'], required: true },
    status: {
      type: String,
      enum: ['pending', 'active', 'non-renewing', 'attention', 'cancelled', 'failed'],
      default: 'pending',
    },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'NGN' },
    paystackReference: { type: String, sparse: true, unique: true },
    paystackPlanCode: { type: String, required: true },
    paystackCustomerCode: String,
    paystackSubscriptionCode: { type: String, sparse: true, unique: true },
    paystackEmailToken: String,
    nextPaymentDate: Date,
    lastPaymentAt: Date,
    cancelledAt: Date,
  },
  { timestamps: true }
);

const Subscription = mongoose.model<ISubscription>('Subscription', subscriptionSchema);
export default Subscription;
