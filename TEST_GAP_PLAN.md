# Test Gap Plan

This document outlines the required tests to close the testing gap for the dzpatch-v2 project, categorized by priority.

## Priority 0 (P0) - Critical Paths

### Money & Payments
**Target Files:** `supabase/functions/payment-webhook/index.ts`, `lib/wallet-funding.ts`, `store/app-data.store.ts`
**Proposed Test Files:** `__tests__/integration/payments/webhook.test.ts`, `__tests__/integration/payments/wallet-funding.test.ts`, `__tests__/integration/payments/order-transactions.test.ts`
- `payment-initialize -> payment-webhook -> credit_wallet` happy path
- duplicate Paystack webhook replay does not double-credit
- webhook with missing `wallet_id` fails safely and logs clearly
- webhook with unknown event type is ignored safely
- webhook with malformed payload returns correct error
- failed transfer webhook marks withdrawal correctly
- reversed transfer webhook marks withdrawal correctly
- wallet funding UI waits for backend confirmation before success
- wallet funding timeout shows retryable state
- wallet-paid order debits customer exactly once
- wallet-paid order completion credits rider exactly once
- cash-paid order completion creates `outstanding_balances` record
- commission + rider net always equals final price
- rider payout goes to wallet owned by `profile_id`, not `riders.id`
- refund path for cancelled wallet-paid order is idempotent

### Delivery Completion
**Target Files:** `app/(rider)/delivery-completion.tsx`, `store/app-data.store.ts`
**Proposed Test Files:** `__tests__/integration/delivery/completion-flow.test.tsx`
- delivery cannot complete before delivery code verification
- correct delivery code succeeds and resets failed attempts
- wrong delivery code increments failed attempts
- third wrong code locks further attempts
- locked code cannot be retried before expiry
- POD upload path matches storage policy prefix
- POD upload failure blocks completion cleanly
- completion works with private storage path or signed access, not public URL
- completion still succeeds when commission is zero
- completion fails safely when rider wallet is missing

### PII / Authorization & Role Coverage Matrix
**Target Files:** `app/(customer)/order-details.tsx`, `app/(rider)/job-details.tsx`, `supabase/migrations/*_rls_policies.sql`
**Proposed Test Files:** `__tests__/integration/security/pii-auth.test.ts`, `__tests__/integration/security/role-routing.test.ts`

**End-to-End Role Routing Matrix:**
- `customer` role logs in -> lands on `/(customer)`
- `rider` role logs in -> lands on `/(rider)`
- `fleet_manager` role logs in -> lands safely on fallback or shows error (until implemented)
- `admin` role logs in -> lands safely on fallback or shows error (until implemented)
- unauthenticated user -> redirected to `/(auth)/login`
- missing `full_name` -> redirected to `/(auth)/onboarding`

**Authorization Matrix:**
- matched rider can fetch matched customer contact details
- unmatched rider cannot fetch customer contact details
- matched customer can fetch assigned rider contact details
- unrelated customer cannot fetch another rider’s contact details
- rider chat only exposes contact for active/matched order
- customer chat only exposes contact for assigned rider
- order details screens do not leak phone numbers before match
- direct `profiles` reads for phone data are blocked where they should be
- authorized RPC/view returns only minimum fields needed
- admin-only fields remain hidden from customer/rider clients

## Priority 1 (P1) - High Value Flows

### Rider Identity / Maintenance
**Target Files:** `app/(rider)/documents-management.tsx`, `app/(rider)/bank-account-settings.tsx`, `store/rider-signup.store.ts`
**Proposed Test Files:** `__tests__/integration/rider/identity-maintenance.test.tsx`
- rider documents query uses `riderId`
- rider documents insert path works for first upload
- rider documents update path works for re-upload
- rider documents list returns latest document correctly
- rider bank account create works with `riderId`
- rider bank account update works with existing record id
- rider withdraw reads wallet correctly
- rider withdraw reads default bank correctly
- invalid `profile.id` use in rider maintenance flows is rejected by tests
- document upload failure shows usable error state

### Order Creation / Negotiation
**Target Files:** `app/(customer)/create-order.tsx`, `app/(customer)/live-bidding.tsx`, `app/(rider)/job-details.tsx`
**Proposed Test Files:** `__tests__/integration/orders/negotiation.test.tsx`
- create order with wallet payment blocks when balance is insufficient
- create order with cash payment bypasses wallet guardrail
- promo code recalculates total correctly
- invalid promo code does not mutate pricing state
- counter-offer round 1 -> 2 works
- counter-offer round 2 -> 3 works
- counter-offer round 3 is blocked
- customer quick counter buttons respect minimum allowed
- rider quick bid chips apply correct increments/decrements
- rider “market avg” control sets listed price correctly
- negotiation screen shows correct final-round messaging

### Maps / Tracking
**Target Files:** `app/(customer)/order-tracking.tsx`, `app/(rider)/navigate-to-pickup.tsx`, `app/(rider)/navigate-to-dropoff.tsx`
**Proposed Test Files:** `__tests__/integration/maps/tracking.test.tsx`
- customer tracking query includes dropoff/pickup coordinates needed for route rendering
- rider home uses real pickup coordinates, not hashed placeholders
- navigation screens do not fall back to hardcoded coordinates
- stale location label appears after threshold
- stale location label clears when fresh update arrives
- customer sees last-updated timestamp when rider goes quiet
- realtime subscription reconnect path works after disconnect
- polling fallback does not duplicate or corrupt tracking state
- tracking screen handles missing rider location gracefully
- map marker rendering handles null coordinates safely

### Realtime
**Target Files:** `hooks/use-app-state-channels.ts`, `app/(customer)/finding-rider.tsx`
**Proposed Test Files:** `__tests__/integration/realtime/subscriptions.test.tsx`
- customer receives accepted bid update in realtime
- rider receives counter-offer update in realtime
- order status subscription updates screens correctly
- cleanup/unsubscribe happens on unmount
- duplicate subscriptions are not created on re-render
- polling fallback does not fight realtime updates
- expired order update is reflected in customer finding-rider flow

### Security / Abuse
**Target Files:** `supabase/migrations/*`, `app/(rider)/delivery-completion.tsx`
**Proposed Test Files:** `__tests__/integration/security/abuse-prevention.test.ts`
- delivery code brute-force lock cannot be bypassed by retry timing
- webhook idempotency survives concurrent duplicate requests
- wallet debit cannot push balance below zero
- rider with commission lock cannot place bids
- customer cannot cancel someone else’s order
- rider cannot update order status for someone else’s order
- unauthorized users cannot create/modify disputes for unrelated orders
- SQL functions reject invalid actor ids cleanly
- storage paths cannot escape allowed rider prefix

## Priority 2 (P2) - Edge Cases & UX Details

### Customer Experience
**Target Files:** `app/(customer)/*`
**Proposed Test Files:** `__tests__/integration/customer/ux.test.tsx`
- low-balance warning appears before wallet-paid submission
- top-up CTA from low-balance state routes correctly
- active order tracking status labels match backend states
- cancellation reason is displayed consistently after cancel
- delivery success screen handles missing optional data
- chat screen handles empty message history
- customer can call assigned rider only when phone exists
- wallet transaction filters show correct categories
- wallet pending states are labeled clearly

### Rider Experience
**Target Files:** `app/(rider)/*`
**Proposed Test Files:** `__tests__/integration/rider/ux.test.tsx`
- rider job details show gross, commission, and estimated net correctly
- rider counter-offer screen shows estimated take-home correctly
- rider cannot bid below minimum valid threshold
- rider waiting-for-customer timeout path withdraws pending bid safely
- rider trip complete screen totals match payout math
- rider can call customer only when authorized phone is available
- rider offline/online transitions affect available jobs correctly
- rider home empty state behaves correctly with no nearby jobs

### Storage / Files
**Target Files:** `app/(rider)/documents-management.tsx`, `supabase/migrations/*`
**Proposed Test Files:** `__tests__/integration/storage/file-uploads.test.tsx`
- rider document upload accepts expected mime/file types
- invalid file type is rejected gracefully
- oversized file is rejected gracefully
- storage path for driver docs is stable and deterministic
- signed URL generation works for private asset retrieval if used
- missing bucket/policy failure surfaces actionable error

### Admin / Ops
**Target Files:** `supabase/functions/*`, `scripts/*`
**Proposed Test Files:** `__tests__/integration/admin/ops.test.ts`
- auto-cancel expired orders job cancels only expired pending orders
- auto-cancel refund runs only once
- notifications/triggers for delivery completion fire once
- rating trigger runs for completed orders only
- release smoke test script validates core env/config presence

## Priority 3 (P3) - UI Regression

### UI Regression
**Target Files:** `components/ui/*`, `app/*`
**Proposed Test Files:** `__tests__/integration/ui/regression.test.tsx`
- important screens render without crashing with partial/null backend data
- loading states show while async data is pending
- error states render understandable copy
- success states do not claim guarantees backend does not make
- one-hand quick actions remain accessible on smaller screens

## Next Steps

1. Implement **PII authorization tests** (`__tests__/integration/security/pii-auth.test.ts`)
2. Implement **real payment/webhook integration tests** (`__tests__/integration/payments/webhook.test.ts`)
3. Implement **storage-policy integration tests for documents and POD**
4. Implement **realtime/tracking integration tests**
5. Implement **delivery completion end-to-end tests**
