# DZpatch V2 - Test Gap Build Plan

**Date:** 2026-04-02  
**Purpose:** Break remaining test work into practical phases so the team can build toward full test coverage for everything in DZpatch that is realistically testable.

## Goal

By the end of these phases, DZpatch should have:

- strong pure-logic coverage
- strong screen/state helper coverage
- strong backend contract coverage
- strong integration coverage for money, delivery, storage, and identity flows
- explicit security and PII authorization verification
- a repeatable release smoke-test pack

## Coverage Principles

Not everything needs the same test type.

- Pure logic: fast unit tests
- Screen behavior/state rules: helper tests or component tests
- Backend contracts: RPC/edge-function integration tests
- Cross-system flows: end-to-end or staging smoke tests
- Security and PII: explicit authorization tests plus staging verification

## Phase 1 - Lock Down Core Money and Delivery

**Goal:** Prove the highest-risk flows cannot silently break.

### Build these tests

- `payment-initialize -> payment-webhook -> credit_wallet` happy path
- duplicate webhook replay does not double-credit
- malformed webhook payload fails safely
- webhook with missing `wallet_id` fails safely
- unknown webhook event is ignored safely
- failed transfer webhook updates withdrawal correctly
- reversed transfer webhook updates withdrawal correctly
- wallet funding UI waits for backend confirmation before success
- funding timeout shows retryable state
- wallet-paid order debits customer exactly once
- wallet-paid completion credits rider exactly once
- cash-paid completion creates `outstanding_balances`
- commission + rider net always equals final price
- rider payout uses `profile_id` wallet ownership
- delivery cannot complete before code verification
- correct code resets failed attempts
- wrong code increments attempts
- third wrong attempt locks completion
- lock expires correctly
- POD upload path matches storage rules
- POD upload failure blocks completion cleanly
- completion works with private storage path or signed access

### Suggested outputs

- backend integration tests for payment/webhook flow
- delivery completion integration tests
- edge-function failure-path tests

### Exit criteria

- money movement and completion paths are covered end to end
- duplicate payment and duplicate completion risks are tested

---

## Phase 2 - Rider Identity, Wallet, and Account Maintenance

**Goal:** Prove rider operations work against the real schema and identity model.

### Build these tests

- rider documents query uses `riderId`
- first document upload inserts correctly
- re-upload updates correctly
- latest document fetch returns expected row
- document upload failure shows usable error
- document path stays under allowed storage prefix
- rider bank account create works with `riderId`
- rider bank account update works with existing row id
- rider withdraw reads correct wallet
- rider withdraw reads correct default bank
- invalid `profile.id` usage in rider maintenance flows is rejected
- withdraw request path handles missing bank gracefully
- withdraw request handles insufficient balance correctly

### Suggested outputs

- rider maintenance integration tests
- storage-policy tests for documents
- wallet/withdraw contract tests

### Exit criteria

- rider self-service flows work with real IDs and real storage rules

---

## Phase 3 - Orders, Negotiation, and Pricing UX

**Goal:** Prove order creation and bidding behavior is correct and low-friction.

### Build these tests

- create order with wallet payment blocks on insufficient balance
- create order with cash payment bypasses wallet guardrail
- promo code recalculates total correctly
- invalid promo code does not corrupt pricing state
- quick counter controls respect customer minimum floor
- rider quick bid chips apply increments/decrements correctly
- rider market average control sets expected value
- round 1 to 2 counter-offer works
- round 2 to 3 counter-offer works
- round 3 further counter-offers are blocked
- final-round messaging is correct
- rider take-home breakdown shows correct gross, commission, net
- customer low-balance warning appears before submission

### Suggested outputs

- order form tests
- bidding workflow tests
- screen helper tests for quick actions and pricing summaries

### Exit criteria

- order creation and negotiation logic is covered from both customer and rider perspectives

---

## Phase 4 - Tracking, Maps, Realtime, and Status Accuracy

**Goal:** Prove the “live” product surfaces behave truthfully and recover safely.

### Build these tests

- tracking query includes required coordinates
- rider home uses real pickup coordinates
- navigation screens do not fall back to hardcoded coordinates
- missing coordinates fail gracefully
- stale location label appears after threshold
- stale location clears when updates resume
- customer sees last-updated state when rider signal goes quiet
- realtime order status subscription updates state correctly
- customer receives accepted bid update in realtime
- rider receives counter-offer update in realtime
- duplicate subscriptions are not created on re-render
- subscription cleanup occurs on unmount
- polling fallback does not conflict with realtime
- expired order state appears correctly in finding-rider flow

### Suggested outputs

- realtime integration tests
- map helper tests
- tracking subscription tests

### Exit criteria

- live tracking and realtime behavior are test-backed rather than assumed

---

## Phase 5 - PII, Authorization, and Security Hardening

**Goal:** Prove sensitive data is exposed only in the intended contexts.

### Build these tests

- matched rider can fetch matched customer contact details
- unmatched rider cannot fetch customer contact details
- matched customer can fetch assigned rider contact details
- unrelated customer cannot fetch another rider’s contact details
- chat/contact flows expose only minimum authorized fields
- order details do not leak phone numbers before match
- direct profile reads are blocked where they should be
- authorized RPC/view returns minimum required fields only
- customer cannot cancel another customer’s order
- rider cannot update another rider’s order status
- unauthorized dispute creation is blocked
- delivery code brute-force lock cannot be bypassed
- wallet debit cannot push balance below zero
- commission-locked rider cannot place bids
- storage paths cannot escape allowed rider prefix

### Suggested outputs

- authorization tests against RPC/view contract
- negative access tests
- security regression pack

### Exit criteria

- PII exposure risk is explicitly tested
- release does not depend on “it seemed to work in manual testing”

---

## Phase 6 - Customer and Rider UX Regression Pack

**Goal:** Stabilize the user experience across normal, partial, and failure states.

### Build these tests

- important screens render with partial/null backend data
- loading states show while async data is pending
- error states show understandable messages
- success states do not promise backend guarantees that do not exist
- wallet transaction filters classify transactions correctly
- cancellation reason display is consistent
- delivery success screen handles missing optional data
- rider waiting-for-customer timeout withdraws safely
- trip-complete totals match payout math
- customer call button only appears when authorized phone exists
- rider call button only appears when authorized phone exists
- one-hand quick controls remain usable on small screens

### Suggested outputs

- UI regression tests
- screen-state tests
- selected component tests

### Exit criteria

- major user-facing flows handle null, empty, pending, and failure states predictably

---

## Phase 7 - Storage, Notifications, Jobs, and Release Operations

**Goal:** Cover the operational systems around the product, not just the core screens.

### Build these tests

- rider document upload accepts allowed file types
- invalid file types are rejected
- oversized file is rejected
- signed/private retrieval works for protected assets
- auto-cancel expired orders affects only expired pending orders
- auto-cancel refund runs once only
- delivery/rating notifications fire once
- rating trigger runs only for completed orders
- release smoke script verifies required env/config values
- secrets/config absence fails fast with actionable output

### Suggested outputs

- job/trigger tests
- storage validation tests
- release smoke test pack

### Exit criteria

- the surrounding operational systems are covered well enough for production support

---

## Phase 8 - Full End-to-End Scenario Pack

**Goal:** Build the highest-confidence flows the team can run repeatedly before releases.

### Build these scenarios

- customer funds wallet, creates wallet-paid order, rider accepts, delivery completes
- customer creates cash-paid order, rider completes, outstanding balance is recorded
- rider uploads required docs, updates bank account, submits withdrawal request
- negotiation reaches final round and blocks further counters correctly
- stale rider location shows degraded tracking state and recovers when fresh updates return
- matched customer/rider can contact each other, unrelated users cannot
- duplicate webhook replay after successful funding does not alter wallet balance

### Suggested outputs

- end-to-end scenario suite
- staging smoke checklist derived from these flows

### Exit criteria

- the highest-value business journeys are repeatable and release-gated

---

## Recommended Order

Build in this order:

1. Phase 1
2. Phase 2
3. Phase 5
4. Phase 4
5. Phase 3
6. Phase 6
7. Phase 7
8. Phase 8

Why:

- money and delivery failures are the costliest
- identity and authorization issues are the riskiest after that
- realtime and UX become more valuable once the system is proven safe

## What “Done” Looks Like

DZpatch can be considered fully tested, as far as it is realistically testable, when:

- core RPCs and edge functions have contract and integration tests
- money and delivery flows are covered end to end
- rider/customer identity and maintenance flows are covered
- realtime/tracking flows are covered
- PII and authorization rules are explicitly tested
- storage and operational jobs are tested
- a release smoke pack exists and is run before production pushes

## Final Note

Some concerns can only be fully proven in staging or production-like environments:

- Supabase RLS behavior
- storage bucket policy behavior
- realtime channel behavior
- deployed edge-function webhook handling

So the final testing strategy should always include both:

- automated test suites in the repo
- a small but disciplined staging smoke run before release
