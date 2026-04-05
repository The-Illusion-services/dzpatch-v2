# DZpatch V2 - Supabase-Backed Test Plan

**Date:** 2026-04-02  
**Purpose:** Define the real Supabase-backed test layer for DZpatch so we can verify auth, RLS, RPCs, storage, realtime, edge functions, and full delivery/payment flows against a real backend environment.

## Current Status

### Built So Far

- [x] Supabase test suite folder structure created under `__tests__/supabase`
- [x] Base helper files created
- [x] Test env/client wiring implemented
- [x] Seed helper implemented for stable test identities
- [x] Cleanup helper implemented for scenario teardown/reset
- [x] Factory helper implemented for reusable order-flow setup
- [x] `__tests__/supabase/rpc/orders.test.ts` converted from scaffold to real test file
- [x] `__tests__/supabase/rpc/bids-negotiation.test.ts` converted from scaffold to real test file
- [x] `__tests__/supabase/rpc/delivery-code.test.ts` converted from scaffold to real test file
- [x] `__tests__/supabase/rpc/complete-delivery.test.ts` converted from scaffold to real test file
- [x] `__tests__/supabase/rpc/cancel-order.test.ts` converted from scaffold to real test file
- [x] `__tests__/supabase/rpc/withdrawals.test.ts` converted from scaffold to real test file
- [x] `__tests__/supabase/rpc/wallets-and-transactions.test.ts` converted from scaffold to real test file
- [x] `__tests__/supabase/rpc/ratings-and-reviews.test.ts` converted from scaffold to real test file
- [x] `__tests__/supabase/auth/auth-bootstrap.test.ts` converted from scaffold to real test file
- [x] `__tests__/supabase/rls/profiles-and-identity.test.ts` converted from scaffold to real test file
- [x] `__tests__/supabase/rls/saved-addresses.test.ts` converted from scaffold to real test file
- [x] `__tests__/supabase/rls/chat-and-contact.test.ts` converted from scaffold to real test file
- [x] `__tests__/supabase/storage/rider-documents.test.ts` converted from scaffold to real test file
- [x] `__tests__/supabase/realtime/rider-location.test.ts` converted from scaffold to real test file
- [x] `__tests__/supabase/edge-functions/payment-flows.test.ts` converted from scaffold to real test file
- [x] `__tests__/supabase/scenarios/full-delivery-loop.test.ts` converted from scaffold to real test file
- [x] All `it.todo(...)` placeholders removed from `__tests__/supabase`
- [ ] Supabase-backed tests actually run against a configured test stack

### 12 Implementation Batches

- [x] 1. Core RPC money + delivery foundations
- [x] 2. Cancel + refund + withdrawals
- [x] 3. Auth bootstrap + profile/RLS basics
- [x] 4. Saved addresses + customer data RLS
- [x] 5. Chat/contact authorization
- [x] 6. Rider identity + bank/documents
- [x] 7. Storage policy tests
- [x] 8. Realtime + rider location
- [x] 9. Edge functions
- [x] 10. Ratings + notifications
- [ ] 11. Admin/elevated access
- [x] 12. Full scenario/E2E backend flows

## What This Means

These tests are different from pure helper/unit tests.

- helper tests ask: "does our local logic return the right value?"
- Supabase-backed tests ask: "does the real backend actually do the right thing?"

That means these tests should hit:

- real Supabase auth sessions
- real tables and RLS policies
- real RPC functions
- real storage policies
- real realtime subscriptions where practical
- real edge functions where practical

## Goals

By the end of this work, DZpatch should be able to prove:

- auth and role setup works correctly
- users can only access the data they are supposed to access
- money movement is correct and idempotent
- order and bid state transitions work in the real schema
- delivery code protection works under real database behavior
- rider location, chat, and contact access obey real policy rules
- storage rules prevent document/path abuse
- edge functions behave safely on success and failure paths

## Recommended Test Structure

Suggested new test area:

```text
__tests__/
  supabase/
    auth/
    rls/
    rpc/
    storage/
    realtime/
    edge-functions/
    scenarios/
```

Suggested support files:

```text
__tests__/supabase/_helpers/
  client.ts
  seed.ts
  cleanup.ts
  sessions.ts
  factories.ts
```

## Environment Assumptions

These tests should run against a dedicated test Supabase stack, not production.

Minimum requirements:

- local Supabase stack or isolated remote test project
- deterministic seed users
- deterministic seed wallets
- deterministic seed rider/customer/admin accounts
- reset or cleanup strategy between tests
- service-role access only for test setup and teardown
- normal user tokens for authorization assertions

## Seed Identities We Should Have

Use at least these seeded identities:

- `customer@test.com`
- `rider@test.com`
- `rider2@test.com`
- `fleet@test.com`
- `admin@test.com`

Use them to test:

- own access
- matched access
- unrelated-user denial
- admin override behavior

## Phase 1 - Highest Value First

These should be implemented before the rest.

- [x] `create_order` wallet-paid happy path
- [x] `create_order` cash-paid happy path
- [x] `place_bid` happy path
- [x] `send_counter_offer` round enforcement
- [x] `accept_bid` happy path
- [x] `verify_delivery_code` wrong-attempt and lock flow
- [x] `complete_delivery` wallet-paid settlement
- [x] `complete_delivery` cash-paid settlement
- [x] `cancel_order` auth and refund behavior
- [x] `request_withdrawal` happy path and insufficient-balance path
- [x] payment webhook idempotency
- [x] rider location RLS and realtime access

## Full Inventory

### 1. Auth and User Bootstrap

- new auth user creates `profiles` row
- rider signup creates linked `riders` row
- wallet auto-creation runs for customer
- wallet auto-creation runs for rider
- authenticated user can read own profile
- authenticated user cannot read another profile directly
- admin role can read admin-allowed records

### 2. Profiles, Riders, and Identity

- rider can read own rider row
- rider can update own rider row
- customer cannot update rider row
- customer can only read assigned rider details in allowed contexts
- rider document insert uses correct rider identity
- rider bank insert/update uses correct rider identity
- `profile.id` vs `riders.id` mismatches are rejected

### 3. Saved Addresses

- customer can create own saved address
- customer can update own saved address
- customer can delete own saved address
- customer cannot read another user's saved addresses

### 4. Pricing and Promo Codes

- active pricing rule is readable
- inactive pricing rule is hidden from normal users
- valid promo can be selected
- expired promo is rejected
- minimum-order promo threshold is enforced
- promo usage count increments correctly

### 5. Orders

- customer can create order for self only
- customer cannot create order for another customer id
- customer can read own orders
- assigned rider can read assigned order
- unrelated customer cannot read another customer's order
- order creation inserts status-history row
- order creation sets delivery code
- order creation sets expiry time

### 6. Bids and Negotiation

- rider can place bid on pending order
- rider cannot place bid on expired order
- rider cannot place bid when commission-locked
- customer can read bids for own order
- rider can read own bids
- unrelated user cannot read bids
- counter-offer chain preserves parent/child linkage
- rounds 1 to 2 works
- rounds 2 to 3 works
- round 4 is blocked
- rider can withdraw own bid
- non-owner cannot withdraw another rider bid
- accepting one bid rejects competing bids

### 7. Order Status and Delivery Lifecycle

- authorized rider can move `matched -> pickup_en_route`
- unauthorized rider cannot update order status
- customer cannot spoof rider-only transitions
- `arrived_pickup -> in_transit` works
- `in_transit -> arrived_dropoff` works if used
- `complete_delivery` fails in invalid status
- `complete_delivery` fails for unassigned rider
- `complete_delivery` fails when code not verified
- `complete_delivery` succeeds when code verified
- status history rows are inserted correctly

### 8. Delivery Code Security

- correct code verifies successfully
- wrong code increments attempts
- third wrong attempt locks the order
- locked order rejects later attempts until expiry
- expired lock allows retry
- only assigned rider can verify code
- only correct delivery-stage statuses allow verification

### 9. Wallets and Transactions

- wallet owner can read own wallet
- wallet owner can read own transactions
- unrelated user cannot read another wallet
- balance cannot go below zero
- `credit_wallet` inserts transaction correctly
- `debit_wallet` inserts transaction correctly
- duplicate `reference` does not double-apply
- wallet-paid order debits once
- refund credits once
- rider completion payout credits once
- platform commission credit is inserted once
- rider wallet lookup uses `riders.profile_id`

### 10. Withdrawals

- owner can request withdrawal from own wallet
- user cannot request withdrawal from another wallet
- insufficient balance rejects request
- missing bank account rejects request
- successful withdrawal creates `withdrawals` row
- webhook `transfer.success` sets completed state
- webhook `transfer.failed` sets rejected state
- webhook `transfer.reversed` sets rejected state

### 11. Cancellations

- customer can cancel own eligible order
- unrelated customer cannot cancel the order
- refund applies only for wallet-paid orders
- refund runs once only
- cancellation row records actor and reason
- expired auto-cancel only affects expired pending orders

### 12. Chat and Contact Authorization

- matched customer can read/send chat messages
- matched rider can read/send chat messages
- unrelated user cannot read/send chat
- chat `read_at` update allowed only for participant
- matched customer can access rider contact in allowed context
- matched rider can access customer contact in allowed context
- pre-match order views do not leak phone numbers

### 13. Notifications

- user can read own notifications
- user cannot read another user's notifications
- order creation notification fires
- bid acceptance notification fires
- delivery completion notification fires
- duplicate events do not duplicate notifications where idempotency is required

### 14. Ratings and Reviews

- customer can submit rider review for completed order
- rider can submit customer rating if intended
- rating before completion is blocked
- rating score outside allowed range is blocked
- one rating per order is enforced
- rider average rating trigger updates aggregate correctly

### 15. Rider Location and Realtime

- rider can update own location
- another rider cannot overwrite someone else's location
- matched customer can read assigned rider location
- unrelated customer cannot read rider location
- bids realtime works under current RLS helpers
- chat realtime works under current RLS helpers
- order status realtime works under current RLS helpers

### 16. Storage

- rider can upload only inside `rider-docs/{auth.uid()}/...`
- rider cannot upload outside own prefix
- rider can read own stored documents
- rider cannot read another rider's private documents
- admin can read allowed protected rider docs
- POD upload path obeys storage policy rules
- signed access works for protected assets
- path traversal attempts fail

### 17. Edge Functions

- `payment-initialize` requires auth
- `payment-initialize` rejects wallet not owned by caller
- `payment-initialize` returns valid authorization payload
- `payment-webhook` rejects invalid signature
- `payment-webhook` rejects malformed JSON safely
- `payment-webhook` ignores unknown event safely
- `payment-webhook` credits wallet once only
- `payment-webhook` updates withdrawal states correctly

### 18. Commission Lock and Rider Restrictions

- commission-locked rider cannot place new bids
- unlocked rider can place bids again
- commission snapshot on order remains stable after later config changes

### 19. Admin and Elevated Access

- admin can read admin-allowed customer data
- admin can read admin-allowed rider data
- admin can read admin-allowed order/transaction data
- non-admin cannot use admin-only access paths
- admin actions log correctly if implemented

### 20. Cross-Flow Scenario Tests

These are the most "real application" tests.

- customer signs in, funds wallet, creates order, rider bids, customer accepts, rider verifies code, delivery completes, balances change correctly
- customer creates cash-paid order, rider completes, outstanding balance is created
- negotiation reaches final round and blocks next counter
- customer cancels wallet-paid order and refund runs once
- rider uploads docs, adds bank account, requests withdrawal, webhook settles withdrawal
- matched customer and rider can chat/contact; unrelated users cannot

## Suggested Initial Files

Suggested first wave of real test files:

```text
__tests__/supabase/rpc/order-create.test.ts
__tests__/supabase/rpc/bids-negotiation.test.ts
__tests__/supabase/rpc/delivery-code.test.ts
__tests__/supabase/rpc/complete-delivery.test.ts
__tests__/supabase/rpc/cancel-order.test.ts
__tests__/supabase/rpc/withdrawal.test.ts
__tests__/supabase/storage/rider-documents.test.ts
__tests__/supabase/rls/contact-and-chat.test.ts
__tests__/supabase/realtime/rider-location.test.ts
__tests__/supabase/edge-functions/payment-webhook.test.ts
__tests__/supabase/scenarios/full-delivery-loop.test.ts
```

## Recommended Rollout Order

1. auth bootstrap and seeded sessions
2. order creation wallet/cash
3. bidding and negotiation rounds
4. accept bid and match flow
5. delivery code verification and lock
6. complete delivery wallet/cash settlement
7. cancel and refund
8. withdrawals and payout settlement
9. chat/contact authorization
10. storage policy tests
11. rider location and realtime policy tests
12. ratings and notifications
13. full end-to-end Supabase-backed scenarios

## Suggested Environment Setup

Recommended safest options:

- Option A: a brand-new hosted Supabase project used only for tests
- Option B: a local Supabase stack started with the Supabase CLI, which runs via Docker

Recommended process:

1. create a separate test Supabase project or local stack
2. apply all migrations there
3. set test-only env vars:
   - `SUPABASE_TEST_URL`
   - `SUPABASE_TEST_ANON_KEY`
   - `SUPABASE_TEST_SERVICE_ROLE_KEY`
   - `SUPABASE_TEST_PASSWORD`
4. seed fake test users/data only
5. point Supabase-backed tests to that environment

Important rule:

- never point this suite at production
- avoid pointing it at your main day-to-day Supabase project unless that project is intentionally disposable and isolated for testing

## Docker Note

Yes, Docker is a good option here.

If you use local Supabase via the Supabase CLI, Docker is what powers the local database/auth/storage stack underneath. On Windows, this usually means installing Docker Desktop first, then using the Supabase CLI locally.

## Running the Full Suite

Yes, it is possible to run:

- the existing 300+ tests already in the repo
- the current `__tests__/integration` phase tests
- the future Supabase-backed tests

But for that to work well, the suite should be split into categories:

- fast unit/helper tests
- app integration tests
- Supabase-backed tests

Recommended script shape:

```json
{
  "test": "jest --watchAll=false",
  "test:integration": "jest --watchAll=false __tests__/integration",
  "test:supabase": "jest --watchAll=false __tests__/supabase",
  "test:all": "npm run test && npm run test:supabase"
}
```

If the Supabase-backed tests are slower or require local services, they should usually run:

- in CI
- before release
- before deploying schema or edge-function changes

while fast unit/helper tests still run constantly during day-to-day work.

## Recommended Rule

Do not replace fast tests with Supabase-backed tests.

Keep both:

- fast tests for logic and UI confidence
- Supabase-backed tests for real backend truth

That combination gives the best safety without making every feedback loop slow.
