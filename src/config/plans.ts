export type PlanTier = 'free' | 'pro' | 'business';

export interface PlanDefinition {
  id: PlanTier;
  name: string;
  amount: number;
  currency: 'NGN';
  interval: 'monthly';
  monthlyLinks: number;
  monthlyCustomAliases: number;
  paystackPlanCode?: string;
}

const paidPlan = (
  id: Exclude<PlanTier, 'free'>,
  name: string,
  amount: number,
  monthlyLinks: number,
  monthlyCustomAliases: number,
  envKey: 'PAYSTACK_PRO_PLAN_CODE' | 'PAYSTACK_BUSINESS_PLAN_CODE',
  amountEnvKey: 'PAYSTACK_PRO_AMOUNT' | 'PAYSTACK_BUSINESS_AMOUNT'
): PlanDefinition => {
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

export const getPlans = (): Record<PlanTier, PlanDefinition> => ({
  free: {
    id: 'free',
    name: 'Free',
    amount: 0,
    currency: 'NGN',
    interval: 'monthly',
    monthlyLinks: 50,
    monthlyCustomAliases: 1,
  },
  pro: paidPlan(
    'pro',
    'Pro',
    800_000,
    1_000,
    100,
    'PAYSTACK_PRO_PLAN_CODE',
    'PAYSTACK_PRO_AMOUNT'
  ),
  business: paidPlan(
    'business',
    'Business',
    2_500_000,
    10_000,
    1_000,
    'PAYSTACK_BUSINESS_PLAN_CODE',
    'PAYSTACK_BUSINESS_AMOUNT'
  ),
});

export const isPaidPlan = (value: unknown): value is 'pro' | 'business' =>
  value === 'pro' || value === 'business';

export const planFromPaystackCode = (planCode?: string): PlanTier | null => {
  if (!planCode) return null;
  const plans = getPlans();
  if (plans.pro.paystackPlanCode === planCode) return 'pro';
  if (plans.business.paystackPlanCode === planCode) return 'business';
  return null;
};

const positiveInteger = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
};
