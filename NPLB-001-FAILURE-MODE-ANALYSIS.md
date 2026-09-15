# NPLB-001 — Failure-mode analysis for the paid billing journey

**Status:** Draft for review  
**Date:** 2026-09-14  
**Scope:** Current Shortly paid subscription journey only  
**Implementation gate:** No billing code ticket starts until this document is reviewed, comments are resolved in writing, and the status is changed to **Agreed**.

## Purpose and decision rule

This document describes what the running system does when checkout, verification, recurring billing, failed payment, or cancellation is duplicated, delayed, interrupted, or answered unexpectedly by Paystack.

The system must not describe a state as safe merely because repeating the same update usually leaves the same visible value. For each operation we distinguish:

- **At-most-once:** the operation may be attempted once and a missing attempt is not automatically recovered.
- **At-least-once:** the operation may be delivered more than once and must be safe to repeat.
- **Exactly-once:** not assumed at a network boundary. If a flow appears exactly-once, that must be proved by a durable unique key and an atomic state transition.

The current implementation has some repeat-safe document updates, but it does not yet have a durable event ledger, inbox, outbox, or reconciliation worker. Therefore it is not crash-safe or fully idempotent.

## System facts and sources of truth

### Local sources of truth

- `Subscription` in MongoDB is the local billing record. It is unique per user by `userId` and has sparse unique provider references for `paystackReference` and `paystackSubscriptionCode` (`src/models/subscription.ts`).
- `User.plan` and `User.subscriptionStatus` are denormalized entitlements used by the application. They are updated separately from `Subscription` by `syncUserPlan` or direct `User.updateOne` calls.
- The local subscription status values are `pending`, `active`, `non-renewing`, `attention`, `cancelled`, and `failed`.
- There is currently no local record of a Paystack webhook event ID, transaction ID, delivery attempt, processing status, or replay cursor.

### Provider source of truth

- Paystack owns the provider transaction, charge, recurring subscription, amount, currency, plan code, customer code, subscription code, and payment outcome.
- A signed Paystack webhook is the provider push message. It is accepted at `POST /api/billing/webhook` after HMAC-SHA512 validation over the raw request body (`src/app.ts`, `src/controller/billingController.ts`).
- The browser callback is not trusted as proof of payment. `GET /api/billing/verify/:reference` calls Paystack's transaction verification endpoint before activating a subscription.

### Current state transition summary

```text
no local subscription
        |
        | local upsert before transaction initialize
        v
pending ---- initialize failure ----> failed
   |
   | successful verification or charge.success
   v
active ---- user cancellation accepted ----> non-renewing
   |                                             |
   | invoice.payment_failed                       | subscription.disable
   v                                             v
attention                                   cancelled / free entitlement
```

The summary hides important split-write and ordering windows. Those are documented below and are not considered closed.

## Flow 1 — Checkout initialization

**Entry point:** authenticated `POST /api/billing/initialize`  
**Code:** `initializeSubscription` in `src/controller/billingController.ts`  
**Provider call:** `POST https://api.paystack.co/transaction/initialize`

### 1. Source of truth and where it lives

The requested plan is accepted only if it is `pro` or `business`. The server reads the user from MongoDB, derives the amount/currency/plan code from server-side configuration, creates a local Paystack reference, and upserts the user's `Subscription` as `pending` before calling Paystack.

The local `Subscription` is the source of truth for the checkout attempt and contains the reference Paystack must return. Paystack is the source of truth for whether that reference was actually initialized or paid.

### 2. Writes, provider calls, and crash windows

1. **Read `User.findById`.**
   - Crash before or during the read: no local state changes; the client receives an error if the process survives. Recovery is a user retry.
   - Crash after the read: no billing write has happened yet.

2. **Read `Subscription.findOne({ userId })`.**
   - Crash before or during the read: no local state changes; retry is safe.
   - A recent `pending` subscription blocks a new attempt for 30 minutes. This is a local time-based guard, not proof that Paystack did not accept a prior request.

3. **Write `Subscription.findOneAndUpdate(..., { upsert: true })` to set `pending`.**
   - Crash before the write: no local checkout record exists; no provider call has happened.
   - Crash during the write: MongoDB determines whether the write committed. The client may not know. A later retry may see `pending` and be blocked, or may create a new attempt after the guard expires.
   - Crash after the write: the local record is `pending`, but no provider request has necessarily been made.

4. **Provider call: Paystack transaction initialize.**
   - Crash before the call: the local record remains `pending` with a reference that Paystack has never seen.
   - Crash or timeout during the call: Paystack may have accepted and created a transaction while Shortly receives no response. The catch block then attempts `Subscription.updateOne({ userId, paystackReference: reference }, { status: 'failed' })`.
   - Crash before that failure write: the record remains `pending` even though Paystack may have accepted the transaction.
   - Failure write succeeds after Paystack accepted the transaction: local state becomes `failed` while a usable Paystack checkout may still exist. A user retry can create a second reference and potentially a second charge. **This is a high-severity money/reconciliation window.**
   - Provider response succeeds, but the process crashes before sending the HTTP response: the transaction exists at Paystack and local state remains `pending`. The browser may retry or the user may abandon the first checkout.
   - Provider response is malformed or missing required fields: the code treats it as an initialization failure and attempts to mark the local record `failed`; no schema-level validation proves that `authorization_url`, `access_code`, and `reference` are present before the response is returned.

5. **Write `Subscription.updateOne(..., status: 'failed')` on provider-call failure.**
   - Crash before/during the write: status may remain `pending`.
   - Crash after the write: status is `failed`, but there is no durable record explaining whether Paystack received the request or whether a reconciliation check is required.

6. **HTTP response to the browser.**
   - The successful response contains Paystack's authorization URL, access code, and reference. A response loss does not reverse the provider transaction.
   - The error response is `502` for most provider failures and `503` for missing configuration or an invalid plan setup. The client cannot distinguish “Paystack rejected it” from “Paystack accepted it but the response was lost.”

### 3. Duplicate or missing delivery and effect

- The initialize request is **at-least-once from the user's perspective**: a browser retry can repeat it after a timeout. The local 30-minute pending guard normally returns `409`, but after the guard expires a new reference can be created.
- Paystack transaction initialization itself is not protected by a local idempotency record beyond the generated reference. Reusing the same reference is not implemented because a retry creates a new reference.
- A missing response can mean either no provider transaction or a provider transaction that exists but is not visible locally as successful. Money can be charged once while the user sees failure and retries.
- There is no attendee record in this paid subscription flow, so checkout does not create an attendee or ticket. Any future paid-attendee flow must not copy this failure behavior.

### 4. Recovery owner and method

**Current owner:** the user/browser retries; application logs record the failure. There is no automatic reconciliation owner for a locally `pending` or `failed` reference.

**Required owner after hardening:** a billing worker or operator-owned reconciliation process must query Paystack for every unresolved reference. It must classify the reference as not found, initialized but unpaid, paid, or unknown; then transition the local record using a durable audit trail. A retry must reuse the same business checkout attempt or explicitly expire it before a new reference can be created.

### 5. Provider unavailable, slow, or unexpected

- `paystackRequest` has a 15-second timeout. A timeout is ambiguous: Paystack may be down, slow, or may have completed the request before the response was lost.
- Non-2xx or Paystack `{ status: false }` responses become a generic error. The provider message is only used to classify configuration/plan errors; detailed provider state is not persisted.
- Missing secret or missing configured plan code returns `503` before a local `pending` write.
- An unexpected success payload can be returned as if checkout is usable unless the browser later fails. Response shape validation is an open gap.

### 6. User cancels mid-checkout

- Closing or abandoning the Paystack authorization page does not send a cancellation signal to Shortly. The local record remains `pending` until a provider failure marks it `failed` or the 30-minute guard expires.
- Calling Shortly's cancel endpoint while the record is still `pending` returns `409` because no `paystackSubscriptionCode` and `paystackEmailToken` exist yet.
- If the user abandons checkout after Paystack accepted the transaction, the provider transaction may remain payable or later become expired while the local record remains ambiguous.
- **Decision required:** define a checkout-expiry/reconciliation policy before changing code. Options are: reconcile and expire abandoned references, allow a new attempt only after provider verification, or add an explicit pending-checkout cancellation state.

## Flow 2 — Browser verification after checkout

**Entry point:** authenticated `GET /api/billing/verify/:reference`  
**Code:** `verifySubscription` in `src/controller/billingController.ts`  
**Provider call:** `GET https://api.paystack.co/transaction/verify/:reference`

### 1. Source of truth and where it lives

The server first finds the user's local `Subscription` by `userId` and `paystackReference`. Paystack's verification response is the source of truth for transaction reference, status, amount, and currency. The local `Subscription` becomes `active` only after those checks pass.

`Subscription` and `User` are separate local records. The subscription write is the billing record; the user write is the entitlement projection.

### 2. Writes, provider calls, and crash windows

1. **Read `Subscription.findOne`.**
   - Crash before/during the read: no local state changes; retry is safe.
   - No record returns `404`; this may occur if initialization did not commit or the client supplied a reference belonging to another user.

2. **Terminal-state read gate.**
   - `active`, `non-renewing`, `attention`, and `cancelled` return immediately without contacting Paystack.
   - This prevents ordinary duplicate verification calls, but it also means an `active` subscription whose user projection is stale is not repaired by a later verification retry.

3. **Provider call: Paystack transaction verify.**
   - Crash before/during the call: no local writes occur; status remains `pending` or `failed`. The user can retry.
   - Timeout after Paystack has recorded a successful payment: the local status remains unchanged; a later verification can recover it.
   - Provider returns success with a mismatched reference, non-success status, wrong amount, or wrong currency: no write occurs and the endpoint returns `402`.
   - Provider returns an unexpected shape or throws: no write occurs and the endpoint returns `502`.

4. **Write `subscription.save()` setting `active`, `lastPaymentAt`, and `paystackCustomerCode`.**
   - Crash before/during the write: local subscription may remain `pending`; a later verification can retry.
   - Crash after the write: the subscription is `active`, but the user entitlement may not yet be active.

5. **Write `User.updateOne` setting `plan` and `subscriptionStatus: 'active'`.**
   - Crash before/during the write: billing record says active, user projection may still say free/pending. The application can deny or grant the wrong limits depending on which record it reads.
   - Crash after the write: both local records are active.
   - There is no transaction tying the subscription write and user update together and no repair step after the first write.

6. **HTTP response.**
   - Crash after both writes but before the response: the user sees an error and may retry. The terminal-state gate then returns the existing subscription without rechecking or repairing the user projection.

### 3. Duplicate or missing delivery and effect

- Verification is **at-least-once** because the browser can retry after a timeout or lost response.
- Sequential duplicate verification after `active` is repeat-safe at the endpoint level because the terminal-state gate returns without another provider call.
- Concurrent verification requests can both call Paystack and both attempt the two writes. They do not create two local subscriptions, but they are not protected by a per-reference processing key.
- There is no Paystack webhook requirement for this flow; a missing browser callback can leave the user pending even if payment succeeded until the user returns or support triggers verification.
- The verification endpoint does not check Paystack plan code or provider customer/subscription fields. The webhook path performs plan-code validation for recurring events; verification currently validates reference, status, amount, and currency only.

### 4. Recovery owner and method

**Current owner:** the browser retries; support would have to call verification or inspect Paystack and MongoDB manually. No scheduled repair exists for `Subscription=active` with `User` not active.

**Required owner after hardening:** a billing reconciliation worker should repair the entitlement projection from the subscription record and provider verification. The repair must be safe to run repeatedly and must emit a correlation ID and audit result.

### 5. Provider unavailable, slow, or unexpected

The 15-second provider timeout leaves the local status unchanged, which is safer than marking payment failed, but the user receives a generic `502`. A provider success followed by a response timeout is recovered only if the browser retries or a future reconciliation job finds it.

### 6. User cancels mid-verification

- If the user cancels before verification reaches Paystack, no local write occurs.
- If the user cancels while verification is in flight, ordering is undefined relative to the cancellation flow. Verification can activate the subscription before or after cancellation writes.
- If verification writes `active` and cancellation then succeeds, the later cancellation event should move the record to `non-renewing` or `cancelled`; if the cancellation event is lost, the local state can remain active incorrectly.
- A product rule is required for a payment that succeeds while the user is attempting cancellation: cancellation stops future renewals; it does not currently refund the successful transaction.

## Flow 3 — Recurring successful charge

**Entry point:** signed Paystack `charge.success` webhook  
**Code:** `paystackWebhook` and `processWebhookEvent`  
**Provider delivery:** Paystack sends the message to `POST /api/billing/webhook`

### 1. Source of truth and where it lives

Paystack is the source of truth for the recurring charge event, amount, currency, plan code, payment time, customer code, and subscription code. The local `Subscription` is selected by the original reference or recurring subscription code, then updated. `User` is the entitlement projection.

The webhook is mounted with `express.raw` before JSON parsing so the HMAC is calculated over the unmodified body. That protects authenticity, but it does not provide durability or deduplication.

### 2. Writes, provider calls, and crash windows

1. **Signature validation and JSON parse.**
   - Crash before validation: no write; if no `200` is sent, Paystack may retry.
   - Invalid signature returns `401`; invalid JSON returns `400`. No billing write occurs.

2. **HTTP acknowledgement `res.sendStatus(200)`.**
   - The current code acknowledges the event before any database read or write. This is the primary unclosed crash window.
   - Crash before acknowledgement: Paystack may redeliver.
   - Acknowledgement succeeds, then process crashes before `Subscription.findOne`: the event is lost unless Paystack independently redelivers.
   - Acknowledgement succeeds, then any later read/write fails: the event is logged and lost from the application’s point of view. Paystack believes delivery succeeded.

3. **Read `Subscription.findOne` by reference or subscription code.**
   - Crash before/during the read after `200`: the event is lost.
   - No matching subscription returns without a durable unresolved-event record. A valid charge can therefore have no local entitlement effect.

4. **Validation of amount, currency, plan, and terminal cancellation status.**
   - Mismatch returns without a write after the event was already acknowledged. This is safe against applying an unexpected charge but unsafe operationally because no quarantine or review record exists.
   - A missing provider plan code is accepted by `isMatchingPaystackPlan`; an unexpected omitted field is therefore not always rejected.

5. **Write `subscription.save()` setting `active`, `lastPaymentAt`, and customer code.**
   - Crash before/during the write after `200`: event is lost and local state may remain stale.
   - Crash after the write: the subscription is active, but the user projection may still be stale.

6. **Write `User.updateOne` through `syncUserPlan`.**
   - Crash before/during the write after `200`: subscription says active while user entitlement may not; no automatic repair exists.
   - Crash after the write: both local records reflect active.

### 3. Duplicate or missing delivery and effect

- Paystack webhook delivery is **at-least-once in the provider model**, so the same event can arrive twice seconds apart or much later. It can also arrive zero times from Shortly's point of view if the request is acknowledged and processing is lost.
- A duplicate `charge.success` does not create a second local subscription or charge the card again. It finds the same subscription and repeats `save()` and `User.updateOne`.
- If `paid_at` is absent, duplicate processing changes `lastPaymentAt` to a new `Date()` each time. Even with `paid_at`, concurrent updates are not guarded by an event key.
- A missing event leaves the previous local plan/status in place. A successful renewal can therefore be missing from `lastPaymentAt`; a failed or cancelled state may also remain when the provider has moved on.
- A late `charge.success` can reactivate an `attention` subscription because only `non-renewing` and `cancelled` are excluded. A late `invoice.payment_failed` can then overwrite an active subscription. Event ordering is not enforced.

### 4. Recovery owner and method

**Current owner:** nobody owns recovery automatically. The only current action is an application log line after processing fails. Paystack redelivery is not reliable once Shortly has returned `200`.

**Required owner after hardening:** the webhook ingress must persist a unique provider event/transaction record before acknowledgement. A billing worker owns processing, retries pending/failed records, and marks completion atomically. A startup sweep must replay records left in `received` or `processing`. An operator can quarantine mismatches rather than silently dropping them.

### 5. Provider unavailable, slow, or unexpected

Paystack is not called by Shortly during this flow. The provider delivery itself can be delayed, duplicated, malformed, or absent. The handler currently returns `200` before database work, so a database outage is converted into a lost provider message rather than a retryable delivery failure.

### 6. User cancels mid-renewal

- If cancellation changes the local record to `non-renewing` before `charge.success` is processed, the charge event is ignored by the current guard. The money may still have been charged by Paystack; the code does not refund it.
- If `charge.success` is processed first, it sets the subscription active and updates the user; cancellation then needs to win through the provider cancellation call and subsequent provider event.
- If the provider has already charged when the user requests cancellation, cancellation normally applies to future renewals, not the already completed charge. The product must make that rule visible.
- If `subscription.disable` is delivered late or never, local state can remain `non-renewing` instead of `cancelled/free`.
- **High-severity ordering gap:** there is no provider event sequence or transaction-level compare-and-set preventing an old success event from overwriting a newer cancellation state.

## Flow 4 — Failed payment

**Entry point:** signed Paystack `invoice.payment_failed` webhook  
**Code:** `processWebhookEvent` branch for `invoice.payment_failed`

### 1. Source of truth and where it lives

Paystack owns the failed invoice/payment outcome. The local `Subscription` should represent the billing state as `attention`; `User.subscriptionStatus` is the entitlement projection. The current code identifies the subscription only by `subscription_code` or its nested equivalent.

### 2. Writes, provider calls, and crash windows

1. **Signature validation, parse, and early `200`.**
   - The same raw-body checks apply as for `charge.success`.
   - The event is acknowledged before the subscription lookup and before either write. Any crash after `200` can lose the failure message.

2. **Read `Subscription.findOne({ paystackSubscriptionCode })`.**
   - Crash after `200`: event is lost.
   - Missing subscription: the handler returns without a quarantine record. The provider may show a failed payment while Shortly still shows the prior local state.

3. **Write `subscription.save()` setting `attention`.**
   - Crash before/during: local subscription may remain active and continue granting paid limits.
   - Crash after: subscription is `attention`, but user projection may still be active.

4. **Write `User.updateOne` through `syncUserPlan`.**
   - Crash before/during: user and subscription disagree.
   - Crash after: both records show attention.

There is no provider call by Shortly to retrieve more failure detail, retry a charge, or confirm the final invoice state in this path.

### 3. Duplicate or missing delivery and effect

- The webhook is **at-least-once** and may arrive twice or never be applied locally.
- A duplicate normally repeats the same `attention` write and user projection update. It does not create money movement.
- A missing event leaves the subscription active or at its previous status, so an unpaid renewal can continue to receive paid entitlements.
- A later successful `charge.success` can move the subscription back to active. Because there is no event ordering or event ledger, a delayed failure can arrive after that success and move it back to attention.

### 4. Recovery owner and method

**Current owner:** none beyond Paystack's delivery attempt and logs. A user cannot repair a failed recurring payment through the current cancellation endpoint.

**Required owner after hardening:** the billing worker owns retrying the event and reconciling the subscription with Paystack. The product policy must define grace period, entitlement behavior while `attention`, and how a later successful charge clears the attention state.

### 5. Provider unavailable, slow, or unexpected

The provider has already sent a message, so the local dependency risk is Shortly's database/process availability. An unknown subscription code, missing `subscription_code`, or malformed payload is silently ignored after `200`. These should become durable rejected/quarantined records.

### 6. User cancels mid-failure handling

- If the user cancels while a failure event is being processed, either cancellation or attention can be the last writer. `subscription.disable` should ultimately set `cancelled` and the user to `free`, but a missing or reordered event can leave a disagreement.
- If the user cancels after a failed renewal, cancellation stops future renewal attempts; it does not recover the failed invoice or refund a previous successful charge.

## Flow 5 — Cancellation

**User entry point:** authenticated `POST /api/billing/cancel`  
**Provider call:** `POST https://api.paystack.co/subscription/disable`  
**Provider follow-up:** `subscription.not_renew` and/or `subscription.disable` webhooks

### 1. Source of truth and where it lives

Paystack owns whether the recurring subscription is disabled and whether another renewal can occur. The local record is the application projection. The direct cancellation endpoint currently writes `non-renewing`; a later `subscription.disable` webhook writes `cancelled` and changes the user's plan to `free`.

### 2. Writes, provider calls, and crash windows

1. **Read `Subscription.findOne({ userId })`.**
   - Crash before/during: no local change; user can retry.
   - Missing provider subscription code or email token returns `409`; this is expected for pending checkout and for subscriptions whose `subscription.create` event was lost.

2. **Provider call: Paystack subscription disable.**
   - Crash before the call: local state remains unchanged; provider has not been asked to disable.
   - Crash or timeout during the call: Paystack may have disabled future renewals while Shortly receives no response. The endpoint returns `502` and local state may remain active.
   - Provider rejects because the subscription is already disabled, expired, or the token is invalid: no local write occurs; the user sees `502` and recovery is manual.
   - Provider accepts and returns an unexpected response: the current helper only checks the generic Paystack success envelope; it does not validate the returned subscription state.

3. **Write `subscription.save()` setting `non-renewing` and `cancelledAt`.**
   - Crash before/during: provider may already be disabled while local status remains active.
   - Crash after: local subscription is non-renewing, but the user projection may still say active.

4. **Write `User.updateOne` setting `subscriptionStatus: 'non-renewing'`.**
   - Crash before/during: subscription and user disagree.
   - Crash after: both local records show non-renewing.

5. **Webhook `subscription.not_renew`.**
   - The handler acknowledges before reading/writing, then writes `subscription.save()` to `non-renewing` and calls `User.updateOne`.
   - The same crash windows as recurring success apply to both writes.

6. **Webhook `subscription.disable`.**
   - The handler acknowledges before reading/writing, then writes `subscription.save()` to `cancelled` with a new `cancelledAt`, and calls `User.updateOne` to set `free/cancelled`.
   - If the event is lost after `200`, the local record may remain non-renewing or active even though Paystack has disabled it.

### 3. Duplicate or missing delivery and effect

- The direct cancel request is **at-least-once from the user's perspective**. A lost response can lead the user to retry the provider disable call.
- Duplicate disable calls may receive a provider error or “already disabled” response; the current code does not treat that response as a confirmed terminal state.
- `subscription.not_renew` and `subscription.disable` webhooks are **at-least-once**. Duplicate `not_renew` writes the same status. Duplicate `disable` repeats the cancellation write and changes `cancelledAt` each time; there is no event key or first-cancellation timestamp protection.
- A missing `subscription.not_renew` leaves the local state active unless the direct endpoint write succeeded. A missing `subscription.disable` leaves the local state non-renewing and may continue to show a paid plan longer than intended.
- A late `charge.success` can race with cancellation. The current guard blocks it only after the local status is already `non-renewing` or `cancelled`; it does not consult provider event order.

### 4. Recovery owner and method

**Current owner:** the user retries the cancel request; Paystack may redeliver webhooks; there is no durable cancellation reconciliation.

**Required owner after hardening:** the billing worker should reconcile a cancellation request against Paystack, treat “already disabled” as an idempotent success after verification, and process provider events through the same durable inbox as all other billing events. A cancellation state must record whether it means “stop future renewals” or “fully ended,” and the user projection must be repairable from that state.

### 5. Provider unavailable, slow, or unexpected

The 15-second timeout makes cancellation ambiguous. Retrying can be safe only if the provider operation is keyed by the same subscription and “already disabled” is verified as success. Without that verification, the user may see a failure even though renewal has been stopped, or may retry while a renewal is racing.

### 6. User cancels mid-renewal

- **Before Paystack charges:** a successful disable should prevent the next renewal; the final local state depends on the direct write and follow-up webhook.
- **While Paystack charges:** either charge or disable can win at the provider. The system must not promise a refund unless a refund operation exists; the current code has no refund path.
- **After Paystack charges but before Shortly receives `charge.success`:** cancellation may mark local state non-renewing while the provider has a successful charge. The charge event is then ignored by the current guard, so the local record can fail to capture the payment time/customer update.
- **After Shortly processes `charge.success`:** cancellation should transition to non-renewing and eventually cancelled, but a lost webhook can leave user and subscription state stale.
- **Required product decision:** define the boundary between “cancel renewal” and “refund current charge,” and define which state wins when charge and disable events are concurrent.

## Cross-flow gaps that are not closed

These are explicit acceptance gaps, not hidden assumptions.

### Critical / high severity

1. **Webhook acknowledgement before durable persistence.** A valid event can be lost after `200` and before any read/write. Options: persist an inbox record before acknowledgement; return a retryable non-2xx until durable acceptance; or use a provider-supported delivery/reconciliation mechanism. Preferred option: durable inbox before `200` plus worker replay.
2. **Checkout provider acceptance versus local failure.** A timeout or crash can mark a Paystack-created transaction failed, allowing a second checkout and possible double charge. Options: reconcile the original reference before allowing a new attempt; use a provider-supported idempotency key if available; or make the user/support resolve the original transaction before retry. Preferred option: reconciliation gate keyed by the original reference.
3. **Split subscription and user writes.** `Subscription.save()` can succeed while `User.updateOne` fails. Options: MongoDB transaction; durable entitlement projection/outbox; or a repair worker that treats `Subscription` as the billing source of truth. Preferred option: transaction where available plus replayable projection repair.
4. **No webhook event identity or processing ledger.** Duplicate messages cannot be distinguished from a new message, and concurrent deliveries can race. Options: unique provider event ID; if Paystack event IDs are insufficient, unique `(event type, transaction/reference, provider timestamp or event ID)` with a quarantine path for collisions. Preferred option: unique provider event record and atomic processing state.
5. **No recovery for missing or ignored events.** Missing success, failure, or cancellation events can leave entitlements wrong indefinitely. Options: scheduled Paystack reconciliation; operator-triggered reconciliation; or both. Preferred option: scheduled reconciliation with an operator quarantine queue.

### Medium severity

6. **Out-of-order events can overwrite newer state.** A late failure can overwrite active, or a late success can be ignored after cancellation without recording the conflict. Options: provider event ordering/version if available; compare-and-set state transitions; store provider timestamps and reject older transitions; quarantine ambiguous ordering. Preferred option: retain every event and apply an explicit transition matrix with provider-time ordering and conflict review.
7. **Missing provider fields are not consistently rejected.** The recurring plan check accepts an absent provider plan code, and webhook payloads are not schema-validated. Options: strict schema validation and quarantine; tolerate documented provider variants but record the omission. Preferred option: strict required fields for money/state changes.
8. **Terminal-state verification can hide a stale user projection.** An active subscription returns early even if `User` was not updated. Options: always reconcile the user projection on terminal reads; or run projection repair asynchronously. Preferred option: repair projection on read and through a worker.
9. **Cancellation semantics are incomplete.** The code stops renewal but has no refund operation and no explicit pending-checkout cancellation state. Options: document “future renewals only”; add refund workflow later; add checkout expiry/cancel state. This remains a product decision before implementation.

## Agreed transition and delivery rules for implementation

These are proposed rules for review, not code behavior yet:

1. Paystack messages are treated as at-least-once and possibly out-of-order.
2. No provider event is acknowledged as accepted until its identity and payload are durably stored.
3. A duplicate provider event returns success after finding the stored completed event; it performs no second money or entitlement side effect.
4. A stored `received` or `processing` event is replayable after timeout, process crash, or restart.
5. `Subscription` is the billing source of truth; `User` is a rebuildable entitlement projection.
6. Every state transition must have an allowed-from-state rule and a conflict/quarantine outcome.
7. A successful provider charge must never be treated as a refund or reversed merely because the user requested cancellation afterward.
8. A checkout retry must resolve the previous ambiguous reference before creating a new charge attempt.
9. Email, notifications, and other side effects are outside this ticket, but any later ticket must use an outbox/idempotency key tied to the billing event.

## Review and agreement record

### Reviewers

- **Author:** Daudu
- **Engineering review:** Adaeze
- **Product/requirements review:** Naledi

### Review gate

- [ ] Adaeze confirms the five flows and all current writes/provider calls are represented.
- [ ] Naledi confirms cancellation, grace-period, refund, and entitlement semantics.
- [ ] Daudu resolves every review comment in this document or records the accepted decision.
- [ ] Review status is changed from **Draft for review** to **Agreed**.
- [ ] Any code ticket linked to this sprint points to the agreed revision.

### Review comments

Record comments and decisions here. Do not delete the original concern; mark it resolved with the decision and date.

- _Pending initial review._

## Code basis inspected

- `src/controller/billingController.ts`: initialization, verification, cancellation, webhook acknowledgement, event handlers, provider calls, and local writes.
- `src/app.ts`: raw-body webhook registration before JSON parsing and webhook route placement.
- `src/models/subscription.ts`: local status values and unique subscription/provider-reference constraints.
- `src/config/plans.ts`: server-side paid-plan and Paystack plan-code mapping.
- `src/route/billing.ts`: current authenticated billing endpoints.

This document intentionally does not define the production runbook, escalation rota, or implementation changes. Those belong to later tickets after this failure-mode analysis is agreed.
