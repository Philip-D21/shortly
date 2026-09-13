import test from 'node:test';
import assert from 'node:assert/strict';
import { getPlans, isPaidPlan, planFromPaystackCode } from '../config/plans';

test('plan definitions expose enforceable monthly limits', () => {
  const plans = getPlans();
  assert.equal(plans.free.monthlyLinks, 50);
  assert.ok(plans.pro.monthlyLinks > plans.free.monthlyLinks);
  assert.ok(plans.business.monthlyLinks > plans.pro.monthlyLinks);
});

test('paid plan input uses a server-side allowlist', () => {
  assert.equal(isPaidPlan('pro'), true);
  assert.equal(isPaidPlan('business'), true);
  assert.equal(isPaidPlan('free'), false);
  assert.equal(isPaidPlan('enterprise'), false);
});

test('Paystack codes map back to the configured product tier', () => {
  const previous = process.env.PAYSTACK_PRO_PLAN_CODE;
  process.env.PAYSTACK_PRO_PLAN_CODE = 'PLN_test_pro';
  assert.equal(planFromPaystackCode('PLN_test_pro'), 'pro');
  assert.equal(planFromPaystackCode('PLN_unknown'), null);
  if (previous === undefined) delete process.env.PAYSTACK_PRO_PLAN_CODE;
  else process.env.PAYSTACK_PRO_PLAN_CODE = previous;
});
