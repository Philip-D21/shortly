"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPaymentReference = exports.isMatchingPaystackPlan = exports.isValidPaystackSignature = exports.paystackWebhook = exports.cancelSubscription = exports.getCurrentSubscription = exports.verifySubscription = exports.initializeSubscription = exports.listPlans = void 0;
const crypto_1 = __importDefault(require("crypto"));
const validator_1 = __importDefault(require("validator"));
const user_1 = __importDefault(require("../models/user"));
const subscription_1 = __importDefault(require("../models/subscription"));
const plans_1 = require("../config/plans");
const PAYSTACK_API_URL = 'https://api.paystack.co';
const paystackRequest = async (path, options = {}) => {
    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey)
        throw new Error('PAYSTACK_SECRET_KEY is not configured');
    const response = await fetch(`${PAYSTACK_API_URL}${path}`, {
        ...options,
        headers: {
            Authorization: `Bearer ${secretKey}`,
            'Content-Type': 'application/json',
            ...options.headers,
        },
        signal: AbortSignal.timeout(15_000),
    });
    const payload = (await response.json());
    if (!response.ok || !payload.status) {
        throw new Error(payload.message || 'Paystack request failed');
    }
    return payload.data;
};
const listPlans = (_req, res) => {
    const plans = Object.values((0, plans_1.getPlans)()).map(({ paystackPlanCode, ...plan }) => ({
        ...plan,
        available: plan.id === 'free' || Boolean(paystackPlanCode),
    }));
    res.status(200).json({ plans });
};
exports.listPlans = listPlans;
const initializeSubscription = async (req, res) => {
    try {
        const userId = req.user?.id;
        const { plan: requestedPlan } = req.body;
        if (!(0, plans_1.isPaidPlan)(requestedPlan)) {
            res.status(400).json({ message: 'Choose either the pro or business plan' });
            return;
        }
        const user = await user_1.default.findById(userId);
        if (!user) {
            res.status(404).json({ message: 'User not found' });
            return;
        }
        const emailDomain = user.email.split('@')[1]?.toLowerCase();
        if (!validator_1.default.isEmail(user.email) ||
            !emailDomain ||
            emailDomain === 'localhost' ||
            emailDomain.endsWith('.local')) {
            res.status(400).json({
                message: 'Add a valid email address to your profile before starting checkout.',
            });
            return;
        }
        const plans = (0, plans_1.getPlans)();
        const plan = plans[requestedPlan];
        if (!process.env.PAYSTACK_SECRET_KEY || !plan.paystackPlanCode) {
            res.status(503).json({ message: 'Payments are not configured for this plan yet' });
            return;
        }
        const current = await subscription_1.default.findOne({ userId });
        if (current &&
            (['active', 'non-renewing', 'attention'].includes(current.status) ||
                (current.status === 'pending' && Date.now() - current.updatedAt.getTime() < 30 * 60 * 1000))) {
            res.status(409).json({
                message: 'You already have a subscription. Cancel it before changing plans.',
            });
            return;
        }
        const reference = (0, exports.createPaymentReference)();
        await subscription_1.default.findOneAndUpdate({ userId }, {
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
        }, { upsert: true, new: true, runValidators: true });
        try {
            const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
            const data = await paystackRequest('/transaction/initialize', {
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
        }
        catch (error) {
            await subscription_1.default.updateOne({ userId, paystackReference: reference }, { status: 'failed' });
            throw error;
        }
    }
    catch (error) {
        console.error('Subscription initialization failed:', error.message || error);
        const providerMessage = String(error.message || '');
        if (/plan not found|PAYSTACK_SECRET_KEY is not configured/i.test(providerMessage)) {
            res.status(503).json({ message: 'Payments are not configured correctly. Verify the Paystack secret key and plan code.' });
            return;
        }
        res.status(502).json({ message: 'Unable to start checkout. Please try again.' });
    }
};
exports.initializeSubscription = initializeSubscription;
const verifySubscription = async (req, res) => {
    try {
        const userId = req.user?.id;
        const { reference } = req.params;
        const subscription = await subscription_1.default.findOne({ userId, paystackReference: reference });
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
        const transaction = await paystackRequest(`/transaction/verify/${encodeURIComponent(reference)}`);
        if (transaction.reference !== reference ||
            transaction.status !== 'success' ||
            Number(transaction.amount) !== subscription.amount ||
            transaction.currency !== subscription.currency) {
            res.status(402).json({ message: 'Payment has not been completed' });
            return;
        }
        subscription.status = 'active';
        subscription.lastPaymentAt = transaction.paid_at ? new Date(transaction.paid_at) : new Date();
        subscription.paystackCustomerCode = transaction.customer?.customer_code;
        await subscription.save();
        await user_1.default.updateOne({ _id: userId }, { plan: subscription.plan, subscriptionStatus: 'active' });
        res.status(200).json({
            message: 'Subscription activated',
            subscription: publicSubscription(subscription),
        });
    }
    catch (error) {
        console.error('Subscription verification failed:', error.message || error);
        res.status(502).json({ message: 'Unable to verify payment. Please try again.' });
    }
};
exports.verifySubscription = verifySubscription;
const getCurrentSubscription = async (req, res) => {
    const userId = req.user?.id;
    const subscription = await subscription_1.default.findOne({ userId });
    res.status(200).json({
        subscription: subscription ? publicSubscription(subscription) : null,
    });
};
exports.getCurrentSubscription = getCurrentSubscription;
const cancelSubscription = async (req, res) => {
    try {
        const userId = req.user?.id;
        const subscription = await subscription_1.default.findOne({ userId });
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
        await user_1.default.updateOne({ _id: userId }, { subscriptionStatus: 'non-renewing' });
        res.status(200).json({
            message: 'Your subscription will not renew',
            subscription: publicSubscription(subscription),
        });
    }
    catch (error) {
        console.error('Subscription cancellation failed:', error.message || error);
        res.status(502).json({ message: 'Unable to cancel subscription. Please try again.' });
    }
};
exports.cancelSubscription = cancelSubscription;
const paystackWebhook = async (req, res) => {
    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    const signature = req.header('x-paystack-signature');
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
    if (!secretKey || !signature || !(0, exports.isValidPaystackSignature)(rawBody, signature, secretKey)) {
        res.status(401).json({ message: 'Invalid webhook signature' });
        return;
    }
    let payload;
    try {
        payload = JSON.parse(rawBody.toString('utf8'));
    }
    catch {
        res.status(400).json({ message: 'Invalid webhook payload' });
        return;
    }
    // Acknowledge valid events first. All handlers below are idempotent document updates.
    res.sendStatus(200);
    try {
        await processWebhookEvent(payload.event, payload.data);
    }
    catch (error) {
        console.error('Paystack webhook processing failed:', error.message || error);
    }
};
exports.paystackWebhook = paystackWebhook;
const processWebhookEvent = async (event, data) => {
    if (event === 'charge.success') {
        const recurringSubscriptionCode = data?.subscription_code || data?.subscription?.subscription_code;
        const subscription = await subscription_1.default.findOne({
            $or: [
                { paystackReference: data.reference },
                ...(recurringSubscriptionCode
                    ? [{ paystackSubscriptionCode: recurringSubscriptionCode }]
                    : []),
            ],
        });
        if (!subscription)
            return;
        if (Number(data.amount) !== subscription.amount ||
            data.currency !== subscription.currency ||
            !(0, exports.isMatchingPaystackPlan)(data.plan?.plan_code, subscription.paystackPlanCode) ||
            ['non-renewing', 'cancelled'].includes(subscription.status))
            return;
        subscription.status = 'active';
        subscription.lastPaymentAt = data.paid_at ? new Date(data.paid_at) : new Date();
        subscription.paystackCustomerCode = data.customer?.customer_code;
        await subscription.save();
        await syncUserPlan(subscription.userId, subscription.plan, 'active');
        return;
    }
    const subscriptionCode = data?.subscription_code || data?.subscription?.subscription_code;
    let subscription = subscriptionCode
        ? await subscription_1.default.findOne({ paystackSubscriptionCode: subscriptionCode })
        : null;
    if (!subscription && event === 'subscription.create') {
        const user = data.customer?.email
            ? await user_1.default.findOne({ email: String(data.customer.email).toLowerCase() })
            : null;
        const plan = (0, plans_1.planFromPaystackCode)(data.plan?.plan_code);
        if (!user || !plan || plan === 'free')
            return;
        subscription = await subscription_1.default.findOne({ userId: user._id });
    }
    if (!subscription)
        return;
    if (event === 'subscription.create') {
        if (subscription.paystackPlanCode !== data.plan?.plan_code)
            return;
        subscription.status = 'active';
        subscription.paystackSubscriptionCode = data.subscription_code;
        subscription.paystackEmailToken = data.email_token;
        subscription.paystackCustomerCode = data.customer?.customer_code;
        subscription.nextPaymentDate = data.next_payment_date
            ? new Date(data.next_payment_date)
            : undefined;
        await subscription.save();
        await syncUserPlan(subscription.userId, subscription.plan, 'active');
    }
    else if (event === 'subscription.not_renew') {
        subscription.status = 'non-renewing';
        await subscription.save();
        await syncUserPlan(subscription.userId, subscription.plan, 'non-renewing');
    }
    else if (event === 'subscription.disable') {
        subscription.status = 'cancelled';
        subscription.cancelledAt = new Date();
        await subscription.save();
        await syncUserPlan(subscription.userId, 'free', 'cancelled');
    }
    else if (event === 'invoice.payment_failed') {
        subscription.status = 'attention';
        await subscription.save();
        await syncUserPlan(subscription.userId, subscription.plan, 'attention');
    }
};
const syncUserPlan = async (userId, plan, status) => {
    await user_1.default.updateOne({ _id: userId }, { plan, subscriptionStatus: status });
};
const publicSubscription = (subscription) => ({
    plan: subscription.plan,
    status: subscription.status,
    amount: subscription.amount,
    currency: subscription.currency,
    nextPaymentDate: subscription.nextPaymentDate,
    lastPaymentAt: subscription.lastPaymentAt,
    cancelledAt: subscription.cancelledAt,
});
const isValidPaystackSignature = (body, signature, secret) => {
    const expected = crypto_1.default.createHmac('sha512', secret).update(body).digest('hex');
    const expectedBuffer = Buffer.from(expected, 'utf8');
    const signatureBuffer = Buffer.from(signature, 'utf8');
    return (expectedBuffer.length === signatureBuffer.length &&
        crypto_1.default.timingSafeEqual(expectedBuffer, signatureBuffer));
};
exports.isValidPaystackSignature = isValidPaystackSignature;
const isMatchingPaystackPlan = (providerPlanCode, configuredPlanCode) => !providerPlanCode || providerPlanCode === configuredPlanCode;
exports.isMatchingPaystackPlan = isMatchingPaystackPlan;
const createPaymentReference = () => `shortly-${Date.now()}-${crypto_1.default.randomBytes(10).toString('hex')}`;
exports.createPaymentReference = createPaymentReference;
