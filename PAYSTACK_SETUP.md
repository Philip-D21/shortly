# Paystack subscription setup

Shortly uses Paystack-hosted checkout for recurring monthly subscriptions. Secret keys are only used by the Express API.

## 1. Create the plans

In the Paystack dashboard, create two monthly NGN plans:

| Tier | Default amount | Amount in kobo |
| --- | ---: | ---: |
| Pro | ₦8,000/month | `800000` |
| Business | ₦25,000/month | `2500000` |

Copy each generated `PLN_...` code. If you choose different prices, set the corresponding amount variables below so the UI, quota service, and payment verification use the same values.

## 2. Configure the API

Copy `.env.example` to `.env` and set:

```env
FRONTEND_URL=http://127.0.0.1:3000
PAYSTACK_SECRET_KEY=sk_test_...
PAYSTACK_PRO_PLAN_CODE=PLN_...
PAYSTACK_PRO_AMOUNT=800000
PAYSTACK_BUSINESS_PLAN_CODE=PLN_...
PAYSTACK_BUSINESS_AMOUNT=2500000
```

Never place `PAYSTACK_SECRET_KEY` in the Next.js environment or expose it as a `NEXT_PUBLIC_` value.

## 3. Configure the webhook

Set the Paystack webhook URL to:

```text
https://your-api.example.com/api/billing/webhook
```

The URL must be public and HTTPS in production. The handler verifies `x-paystack-signature` with HMAC-SHA512 before accepting an event. Use Paystack test mode and a tunnel or staging URL for end-to-end testing.

## 4. Configure the Vite app

Set `VITE_BACKEND_URL` in `my-url-shortener/.env` to the Express origin. Locally it defaults to `http://localhost:4400`.

## Checkout lifecycle

1. The authenticated browser requests `POST /api/billing/initialize` with `pro` or `business`.
2. Express selects the configured plan and asks Paystack for a hosted checkout URL.
3. Paystack returns the customer to `/billing/callback`.
4. Express verifies the transaction directly with Paystack before enabling the tier.
5. Signed webhooks keep renewals, payment failures, and cancellations synchronized.
