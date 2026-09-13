import crypto from 'crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPaymentReference,
  isMatchingPaystackPlan,
  isValidPaystackSignature,
} from '../controller/billingController';

test('Paystack webhook signatures are validated against the raw body', () => {
  const secret = 'sk_test_unit_test';
  const body = Buffer.from(JSON.stringify({ event: 'subscription.create', data: { id: 1 } }));
  const signature = crypto.createHmac('sha512', secret).update(body).digest('hex');

  assert.equal(isValidPaystackSignature(body, signature, secret), true);
  assert.equal(isValidPaystackSignature(Buffer.from('{}'), signature, secret), false);
  assert.equal(isValidPaystackSignature(body, 'invalid', secret), false);
});

test('recurring webhook events cannot change a subscription to another configured plan', () => {
  assert.equal(isMatchingPaystackPlan(undefined, 'PLN_pro'), true);
  assert.equal(isMatchingPaystackPlan('PLN_pro', 'PLN_pro'), true);
  assert.equal(isMatchingPaystackPlan('PLN_business', 'PLN_pro'), false);
});

test('payment references satisfy Paystack reference constraints', () => {
  const reference = createPaymentReference();
  assert.equal(reference.length <= 50, true);
  assert.match(reference, /^[A-Za-z0-9.=\-]+$/);
});
