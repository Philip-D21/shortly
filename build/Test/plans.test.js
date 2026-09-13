"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const plans_1 = require("../config/plans");
(0, node_test_1.default)('plan definitions expose enforceable monthly limits', () => {
    const plans = (0, plans_1.getPlans)();
    strict_1.default.equal(plans.free.monthlyLinks, 50);
    strict_1.default.ok(plans.pro.monthlyLinks > plans.free.monthlyLinks);
    strict_1.default.ok(plans.business.monthlyLinks > plans.pro.monthlyLinks);
});
(0, node_test_1.default)('paid plan input uses a server-side allowlist', () => {
    strict_1.default.equal((0, plans_1.isPaidPlan)('pro'), true);
    strict_1.default.equal((0, plans_1.isPaidPlan)('business'), true);
    strict_1.default.equal((0, plans_1.isPaidPlan)('free'), false);
    strict_1.default.equal((0, plans_1.isPaidPlan)('enterprise'), false);
});
(0, node_test_1.default)('Paystack codes map back to the configured product tier', () => {
    const previous = process.env.PAYSTACK_PRO_PLAN_CODE;
    process.env.PAYSTACK_PRO_PLAN_CODE = 'PLN_test_pro';
    strict_1.default.equal((0, plans_1.planFromPaystackCode)('PLN_test_pro'), 'pro');
    strict_1.default.equal((0, plans_1.planFromPaystackCode)('PLN_unknown'), null);
    if (previous === undefined)
        delete process.env.PAYSTACK_PRO_PLAN_CODE;
    else
        process.env.PAYSTACK_PRO_PLAN_CODE = previous;
});
