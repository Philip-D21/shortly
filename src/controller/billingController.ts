import crypto from 'crypto';
import { Request, Response } from 'express';
import validator from 'validator';
import User from '../models/user';
import Subscription, { SubscriptionStatus } from '../models/subscription';
import { getPlans, isPaidPlan, planFromPaystackCode, PlanTier } from '../config/plans';

const PAYSTACK_API_URL = 'https://api.paystack.co';

interface PaystackResponse<T = any> {
  status: boolean;
  message: string;
  data: T;
}

const paystackRequest = async <T>(path: string, options: RequestInit = {}): Promise<T> => {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey) throw new Error('PAYSTACK_SECRET_KEY is not configured');

  const response = await fetch(`${PAYSTACK_API_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
    signal: AbortSignal.timeout(15_000),
  });
  const payload = (await response.json()) as PaystackResponse<T>;

  if (!response.ok || !payload.status) {
    throw new Error(payload.message || 'Paystack request failed');
  }

  return payload.data;
};

export const listPlans = (_req: Request, res: Response): void => {
  const plans = Object.values(getPlans()).map(({ paystackPlanCode, ...plan }) => ({
    ...plan,
    available: plan.id === 'free' || Boolean(paystackPlanCode),
  }));
  res.status(200).json({ plans });
};

export const initializeSubscription = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    const { plan: requestedPlan } = req.body;
    if (!isPaidPlan(requestedPlan)) {
      res.status(400).json({ message: 'Choose either the pro or business plan' });
      return;
    }

    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    const emailDomain = user.email.split('@')[1]?.toLowerCase();
    if (
      !validator.isEmail(user.email) ||
      !emailDomain ||
      emailDomain === 'localhost' ||
      emailDomain.endsWith('.local')
    ) {
      res.status(400).json({
        message: 'Add a valid email address to your profile before starting checkout.',
      });
      return;
    }

    const plans = getPlans();
    const plan = plans[requestedPlan];
    if (!process.env.PAYSTACK_SECRET_KEY || !plan.paystackPlanCode) {
      res.status(503).json({ message: 'Payments are not configured for this plan yet' });
      return;
    }

    const current = await Subscription.findOne({ userId });
    if (
      current &&
      (['active', 'non-renewing', 'attention'].includes(current.status) ||
        (current.status === 'pending' && Date.now() - current.updatedAt.getTime() < 30 * 60 * 1000))
    ) {
      res.status(409).json({
        message: 'You already have a subscription. Cancel it before changing plans.',
      });
      return;
    }

    const reference = createPaymentReference();
    await Subscription.findOneAndUpdate(
      { userId },
      {
        $set: {
          plan: requestedPlan,
          status: 'pending',
          amount: plan.amount,
          currency: plan.currency,
          paystackReference: reference,
          paystackPlanCode: plan.paystackPlanCode,
        },
        $unset: {
          paystackSubscriptionCode: 1,
          paystackEmailToken: 1,
          cancelledAt: 1,
        },
      },
      { upsert: true, new: true, runValidators: true }
    );

    try {
      const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
      const data = await paystackRequest<{
        authorization_url: string;
        access_code: string;
        reference: string;
      }>('/transaction/initialize', {
        method: 'POST',
        body: JSON.stringify({
          email: user.email,
          amount: String(plan.amount),
          plan: plan.paystackPlanCode,
          reference,
          callback_url: `${frontendUrl}/billing/callback`,
          metadata: {
            userId: String(user._id),
            plan: requestedPlan,
          },
        }),
      });

      res.status(200).json({
        authorizationUrl: data.authorization_url,
        accessCode: data.access_code,
        reference: data.reference,
      });
    } catch (error) {
      await Subscription.updateOne({ userId, paystackReference: reference }, { status: 'failed' });
      throw error;
    }
  } catch (error: any) {
    console.error('Subscription initialization failed:', error.message || error);
    const providerMessage = String(error.message || '');
    if (/plan not found|PAYSTACK_SECRET_KEY is not configured/i.test(providerMessage)) {
      res.status(503).json({ message: 'Payments are not configured correctly. Verify the Paystack secret key and plan code.' });
      return;
    }
    res.status(502).json({ message: 'Unable to start checkout. Please try again.' });
  }
};

export const verifySubscription = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    const { reference } = req.params;
    const subscription = await Subscription.findOne({ userId, paystackReference: reference });
    if (!subscription) {
      res.status(404).json({ message: 'Subscription checkout not found' });
      return;
    }

    if (['active', 'non-renewing', 'attention', 'cancelled'].includes(subscription.status)) {
      res.status(200).json({
        message: 'Subscription status is already up to date',
        subscription: publicSubscription(subscription),
      });
      return;
    }

    const transaction = await paystackRequest<any>(
      `/transaction/verify/${encodeURIComponent(reference)}`
    );
    if (
      transaction.reference !== reference ||
      transaction.status !== 'success' ||
      Number(transaction.amount) !== subscription.amount ||
      transaction.currency !== subscription.currency
    ) {
      res.status(402).json({ message: 'Payment has not been completed' });
      return;
    }

    subscription.status = 'active';
    subscription.lastPaymentAt = transaction.paid_at ? new Date(transaction.paid_at) : new Date();
    subscription.paystackCustomerCode = transaction.customer?.customer_code;
    await subscription.save();
    await User.updateOne(
      { _id: userId },
      { plan: subscription.plan, subscriptionStatus: 'active' }
    );

    res.status(200).json({
      message: 'Subscription activated',
      subscription: publicSubscription(subscription),
    });
  } catch (error: any) {
    console.error('Subscription verification failed:', error.message || error);
    res.status(502).json({ message: 'Unable to verify payment. Please try again.' });
  }
};

export const getCurrentSubscription = async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).user?.id;
  const subscription = await Subscription.findOne({ userId });
  res.status(200).json({
    subscription: subscription ? publicSubscription(subscription) : null,
  });
};

export const cancelSubscription = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    const subscription = await Subscription.findOne({ userId });
    if (!subscription?.paystackSubscriptionCode || !subscription.paystackEmailToken) {
      res.status(409).json({ message: 'No cancellable subscription was found' });
      return;
    }

    await paystackRequest('/subscription/disable', {
      method: 'POST',
      body: JSON.stringify({
        code: subscription.paystackSubscriptionCode,
        token: subscription.paystackEmailToken,
      }),
    });
    subscription.status = 'non-renewing';
    subscription.cancelledAt = new Date();
    await subscription.save();
    await User.updateOne({ _id: userId }, { subscriptionStatus: 'non-renewing' });

    res.status(200).json({
      message: 'Your subscription will not renew',
      subscription: publicSubscription(subscription),
    });
  } catch (error: any) {
    console.error('Subscription cancellation failed:', error.message || error);
    res.status(502).json({ message: 'Unable to cancel subscription. Please try again.' });
  }
};

export const paystackWebhook = async (req: Request, res: Response): Promise<void> => {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  const signature = req.header('x-paystack-signature');
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');

  if (!secretKey || !signature || !isValidPaystackSignature(rawBody, signature, secretKey)) {
    res.status(401).json({ message: 'Invalid webhook signature' });
    return;
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    res.status(400).json({ message: 'Invalid webhook payload' });
    return;
  }

  // Acknowledge valid events first. All handlers below are idempotent document updates.
  res.sendStatus(200);

  try {
    await processWebhookEvent(payload.event, payload.data);
  } catch (error: any) {
    console.error('Paystack webhook processing failed:', error.message || error);
  }
};

const processWebhookEvent = async (event: string, data: any): Promise<void> => {
  if (event === 'charge.success') {
    const recurringSubscriptionCode =
      data?.subscription_code || data?.subscription?.subscription_code;
    const subscription = await Subscription.findOne({
      $or: [
        { paystackReference: data.reference },
        ...(recurringSubscriptionCode
          ? [{ paystackSubscriptionCode: recurringSubscriptionCode }]
          : []),
      ],
    });
    if (!subscription) return;
    if (
      Number(data.amount) !== subscription.amount ||
      data.currency !== subscription.currency ||
      !isMatchingPaystackPlan(data.plan?.plan_code, subscription.paystackPlanCode) ||
      ['non-renewing', 'cancelled'].includes(subscription.status)
    ) return;
    subscription.status = 'active';
    subscription.lastPaymentAt = data.paid_at ? new Date(data.paid_at) : new Date();
    subscription.paystackCustomerCode = data.customer?.customer_code;
    await subscription.save();
    await syncUserPlan(subscription.userId, subscription.plan, 'active');
    return;
  }

  const subscriptionCode = data?.subscription_code || data?.subscription?.subscription_code;
  let subscription = subscriptionCode
    ? await Subscription.findOne({ paystackSubscriptionCode: subscriptionCode })
    : null;

  if (!subscription && event === 'subscription.create') {
    const user = data.customer?.email
      ? await User.findOne({ email: String(data.customer.email).toLowerCase() })
      : null;
    const plan = planFromPaystackCode(data.plan?.plan_code);
    if (!user || !plan || plan === 'free') return;
    subscription = await Subscription.findOne({ userId: user._id });
  }
  if (!subscription) return;

  if (event === 'subscription.create') {
    if (subscription.paystackPlanCode !== data.plan?.plan_code) return;
    subscription.status = 'active';
    subscription.paystackSubscriptionCode = data.subscription_code;
    subscription.paystackEmailToken = data.email_token;
    subscription.paystackCustomerCode = data.customer?.customer_code;
    subscription.nextPaymentDate = data.next_payment_date
      ? new Date(data.next_payment_date)
      : undefined;
    await subscription.save();
    await syncUserPlan(subscription.userId, subscription.plan, 'active');
  } else if (event === 'subscription.not_renew') {
    subscription.status = 'non-renewing';
    await subscription.save();
    await syncUserPlan(subscription.userId, subscription.plan, 'non-renewing');
  } else if (event === 'subscription.disable') {
    subscription.status = 'cancelled';
    subscription.cancelledAt = new Date();
    await subscription.save();
    await syncUserPlan(subscription.userId, 'free', 'cancelled');
  } else if (event === 'invoice.payment_failed') {
    subscription.status = 'attention';
    await subscription.save();
    await syncUserPlan(subscription.userId, subscription.plan, 'attention');
  }
};

const syncUserPlan = async (
  userId: any,
  plan: PlanTier,
  status: SubscriptionStatus | 'cancelled'
): Promise<void> => {
  await User.updateOne({ _id: userId }, { plan, subscriptionStatus: status });
};

const publicSubscription = (subscription: any) => ({
  plan: subscription.plan,
  status: subscription.status,
  amount: subscription.amount,
  currency: subscription.currency,
  nextPaymentDate: subscription.nextPaymentDate,
  lastPaymentAt: subscription.lastPaymentAt,
  cancelledAt: subscription.cancelledAt,
});

export const isValidPaystackSignature = (
  body: Buffer,
  signature: string,
  secret: string
): boolean => {
  const expected = crypto.createHmac('sha512', secret).update(body).digest('hex');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const signatureBuffer = Buffer.from(signature, 'utf8');
  return (
    expectedBuffer.length === signatureBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, signatureBuffer)
  );
};

export const isMatchingPaystackPlan = (
  providerPlanCode: unknown,
  configuredPlanCode: string
): boolean => !providerPlanCode || providerPlanCode === configuredPlanCode;

export const createPaymentReference = (): string =>
  `shortly-${Date.now()}-${crypto.randomBytes(10).toString('hex')}`;
