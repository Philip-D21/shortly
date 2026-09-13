"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const crypto_1 = __importDefault(require("crypto"));
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const billingController_1 = require("../controller/billingController");
(0, node_test_1.default)('Paystack webhook signatures are validated against the raw body', () => {
    const secret = 'sk_test_unit_test';
    const body = Buffer.from(JSON.stringify({ event: 'subscription.create', data: { id: 1 } }));
    const signature = crypto_1.default.createHmac('sha512', secret).update(body).digest('hex');
    strict_1.default.equal((0, billingController_1.isValidPaystackSignature)(body, signature, secret), true);
    strict_1.default.equal((0, billingController_1.isValidPaystackSignature)(Buffer.from('{}'), signature, secret), false);
    strict_1.default.equal((0, billingController_1.isValidPaystackSignature)(body, 'invalid', secret), false);
});
(0, node_test_1.default)('recurring webhook events cannot change a subscription to another configured plan', () => {
    strict_1.default.equal((0, billingController_1.isMatchingPaystackPlan)(undefined, 'PLN_pro'), true);
    strict_1.default.equal((0, billingController_1.isMatchingPaystackPlan)('PLN_pro', 'PLN_pro'), true);
    strict_1.default.equal((0, billingController_1.isMatchingPaystackPlan)('PLN_business', 'PLN_pro'), false);
});
(0, node_test_1.default)('payment references satisfy Paystack reference constraints', () => {
    const reference = (0, billingController_1.createPaymentReference)();
    strict_1.default.equal(reference.length <= 50, true);
    strict_1.default.match(reference, /^[A-Za-z0-9.=\-]+$/);
});
