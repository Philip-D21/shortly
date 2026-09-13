"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.planFromPaystackCode = exports.isPaidPlan = exports.getPlans = void 0;
const paidPlan = (id, name, amount, monthlyLinks, monthlyCustomAliases, envKey, amountEnvKey) => {
    const configuredPlanCode = process.env[envKey];
    const paystackPlanCode = configuredPlanCode && !/replace_me|your_|example/i.test(configuredPlanCode)
        ? configuredPlanCode
        : undefined;
    return {
        id,
        name,
        amount: positiveInteger(process.env[amountEnvKey], amount),
        currency: 'NGN',
        interval: 'monthly',
        monthlyLinks,
        monthlyCustomAliases,
        paystackPlanCode,
    };
};
const getPlans = () => ({
    free: {
        id: 'free',
        name: 'Free',
        amount: 0,
        currency: 'NGN',
        interval: 'monthly',
        monthlyLinks: 50,
        monthlyCustomAliases: 1,
    },
    pro: paidPlan('pro', 'Pro', 800_000, 1_000, 100, 'PAYSTACK_PRO_PLAN_CODE', 'PAYSTACK_PRO_AMOUNT'),
    business: paidPlan('business', 'Business', 2_500_000, 10_000, 1_000, 'PAYSTACK_BUSINESS_PLAN_CODE', 'PAYSTACK_BUSINESS_AMOUNT'),
});
exports.getPlans = getPlans;
const isPaidPlan = (value) => value === 'pro' || value === 'business';
exports.isPaidPlan = isPaidPlan;
const planFromPaystackCode = (planCode) => {
    if (!planCode)
        return null;
    const plans = (0, exports.getPlans)();
    if (plans.pro.paystackPlanCode === planCode)
        return 'pro';
    if (plans.business.paystackPlanCode === planCode)
        return 'business';
    return null;
};
exports.planFromPaystackCode = planFromPaystackCode;
const positiveInteger = (value, fallback) => {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
};
