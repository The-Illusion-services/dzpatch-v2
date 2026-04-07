# DZpatch V2 — Functionality Audit

Combined findings from Claude, Codex, and Gemini audits.
Issues marked ✅ when fixed.

---

## VERDICT

| Question | Answer |
|----------|--------|
| Can a user order? | Yes, but price consistency is broken and wallet debit is unsafe on expiry |
| Can they negotiate back and forth? | No — rider accept-counter loops, thread isolation is broken |
| Can they complete delivery? | Mostly on happy path, but cash commission is critically wrong |

---

## P0 — Launch Blockers (Fix Before Any Real Testing)

### 1. complete_delivery — Cash commission inserts wrong amount
**Source**: Gemini
**File**: `supabase/migrations/` (complete_delivery RPC)
**Problem**: For cash orders, `outstanding_balances` inserts `v_order.final_price` (e.g. ₦2,000) instead of `v_commission` (e.g. ₦300). After every cash delivery, the rider's debt spikes to the full trip price. `place_bid` then immediately locks them out via `is_commission_locked`.
**User impact**: Rider completes a ₦2,000 cash delivery. Platform thinks they owe ₦2,000. Rider is locked out of the app permanently after 2 deliveries. Platform also never credits its own wallet for cash trips — 100% digital revenue loss on every cash order.

### 2. complete_delivery — Platform wallet never credited on cash trips
**Source**: Gemini
**File**: `supabase/migrations/` (complete_delivery RPC)
**Problem**: `v_platform_wallet` is only credited inside the `payment_method = 'wallet'` block. Cash trips produce zero platform ledger credit.
**User impact**: Platform operates at a total digital loss on all cash deliveries. Financial reporting is wrong from day one.

### 3. Rider "Accept" on customer counter-offer loops instead of matching
**Source**: Codex
**File**: `app/(rider)/counter-offer.tsx` lines 184, 206
**Problem**: When a rider taps "Accept" on a customer counter-offer, the app calls `send_rider_counter_offer` again and routes rider back to "waiting for customer" instead of calling `accept_bid` to finalize the match.
**User impact**: Both sides believe they agreed on a price. App keeps asking for one more action. Negotiation loops forever. Order never matches.

### 4. place_bid — Latest migration stripped commission-lock and KYC checks
**Source**: Codex
**File**: `supabase/migrations/20260403210000_extend_bid_expiry_15min.sql` line 5 vs `20260403104500_supabase_local_rpc_auth_fixes.sql` lines 42, 51
**Problem**: The later `place_bid` definition only checks `is_online`. The earlier guarded version that checked commission-lock and KYC approval was overwritten.
**User impact**: Riders who owe unpaid commissions or haven't completed KYC can still enter the marketplace and bid on jobs. Core business integrity compromised.

### 5. create-order — RPC result shape ambiguous
**Source**: Claude
**File**: `app/(customer)/create-order.tsx`
**Problem**: `create_order` RPC result handled with `result?.order_id ?? data`. If RPC returns raw UUID string, navigation fires with wrong orderId or never fires at all.
**User impact**: Customer submits order, nothing happens. No error, no navigation. App appears broken.

### 6. navigate-to-dropoff — Missing p_changed_by in RPC call
**Source**: Claude
**File**: `app/(rider)/navigate-to-dropoff.tsx`
**Problem**: `update_order_status` call for `arrived_dropoff` missing `p_changed_by` param. Call fails silently. Status never updates.
**User impact**: Rider confirms arrival at dropoff. Customer tracking stays on "Rider in transit". Both sides wait for each other indefinitely.

### 7. finding-rider — navigatingRef never resets on back navigation
**Source**: Claude
**File**: `app/(customer)/finding-rider.tsx`
**Problem**: `navigatingRef.current` only reset on mount. Back navigation from live-bidding leaves it permanently `true`. `goToBidding()` blocked forever.
**User impact**: Customer goes back from live-bidding. New bids arrive but screen never moves. Must kill app to recover.

### 8. waiting-response — Customer screen tracks whole order, not one thread
**Source**: Codex
**File**: `app/(customer)/waiting-response.tsx` lines 116, 183, 272
**Problem**: Reads latest 3 bids for the entire order. Any expired or rejected bid from any rider can trigger navigation or screen state change.
**User impact**: Negotiating with Rider A, Rider B's stale expired bid kicks customer out of the thread or navigates to wrong screen.

### 9. accept_bid — No insufficient funds check when counter-offer price is higher
**Source**: Gemini
**File**: `supabase/migrations/` (accept_bid RPC)
**Problem**: If customer accepts a higher counter-offer (e.g. original ₦1,000, accepted ₦1,500), `debit_wallet` is called for the ₦500 difference. If wallet has insufficient funds, the entire transaction crashes with an unhandled exception.
**User impact**: Customer tries to accept a rider's price. App throws an obscure error. Customer has no idea they need to top up. Order never matches.

---

## P1 — Will Surface in First Real Test Run

### 10. waiting-response — Counter-offer detection uses fragile modulo logic
**Source**: Claude
**File**: `app/(customer)/waiting-response.tsx`
**Problem**: Uses `negotiation_round % 2 !== 0` to detect rider counter. Misfires depending on round number. Wrong UI state shown.
**User impact**: Customer makes counter-offer, rider responds, customer's screen shows wrong state. Negotiation dies silently.

### 11. Timer mismatch — UI shows 5 mins, backend expires at 15 mins
**Source**: Codex
**Files**: `constants/timing.ts` line 2, `app/(customer)/waiting-response.tsx` line 34, `supabase/migrations/20260403210000_extend_bid_expiry_15min.sql` line 46
**Problem**: UI countdown shows 5 minutes. Backend keeps bids alive for 15 minutes. Customer thinks offer is dead and leaves.
**User impact**: Customer abandons valid negotiation 10 minutes early. Rider's counter-offer is still alive but customer is gone.

### 12. Price mismatch — Frontend multipliers don't match backend
**Source**: Codex
**Files**: `app/(customer)/create-order.tsx` lines 42, 267, `supabase/migrations/20260403154405_fix_pricing_and_negotiation.sql` line 29
**Problem**: Frontend size multipliers are 1.3/1.6, backend charges 1.5/2.0.
**User impact**: Customer shown one price, charged another. Trust destroyed on first order.

### 13. Expired orders — No automatic wallet refund on expiry
**Source**: Gemini
**File**: `supabase/migrations/` (cancel_expired_orders / cron job)
**Problem**: If customer searches for rider and order expires with no match, there is no system to automatically refund the wallet debit. `cancel_expired_orders` updates status to expired but does not call `cancel_order` or `credit_wallet`.
**User impact**: Customer pays for a delivery that never happened. Money gone. Support ticket filed. Chargeback risk.

### 14. waiting-for-customer — Poll race condition
**Source**: Claude
**File**: `app/(rider)/waiting-for-customer.tsx`
**Problem**: 5-second `setInterval` has no debounce or stale-closure guard. Multiple intervals fire simultaneously on delayed navigation.
**User impact**: Rider sends bid. Navigation fires twice. Back button breaks. Possible duplicate state updates.

### 15. job-details — riderId undefined on fast mount
**Source**: Claude
**File**: `app/(rider)/job-details.tsx`
**Problem**: Auth store hydrates async. If rider opens screen before store is ready, `riderId` is undefined. `handleAccept` returns silently.
**User impact**: Rider taps "Accept Job" early. Nothing happens. No feedback. Job claimed by someone else.

### 16. active-order-tracking — riderName empty on fast delivery
**Source**: Claude
**File**: `app/(customer)/active-order-tracking.tsx`
**Problem**: `riderProfile` may not be loaded by the time order reaches `delivered`. `riderName` param passed as empty string.
**User impact**: Rating screen shows blank rider name. Unpolished. Customer may skip rating.

### 17. delivery-completion — Silent arrived_dropoff failure
**Source**: Claude
**File**: `app/(rider)/delivery-completion.tsx`
**Problem**: Auto-update `in_transit` → `arrived_dropoff` only logs `console.warn` on failure. Rider proceeds regardless.
**User impact**: Rider thinks delivery is on track. Customer tracking stuck on "in transit". Payment may not trigger correctly.

---

## P2 — Edge Cases, Visible to Real Users

### 18. OTP lockout — 1-hour penalty too punitive, no override
**Source**: Gemini + Codex
**File**: `supabase/migrations/` (verify_delivery_code RPC)
**Problem**: 3 wrong code attempts = 1-hour lockout. No customer override, no admin reset from app.
**User impact**: Customer gives wrong code by mistake. Rider locked out for 1 hour at customer's gate with the package. Cannot take new jobs. Massive rider churn.

### 19. POD not enforced server-side
**Source**: Codex
**File**: `app/(rider)/delivery-completion.tsx` line 203, `supabase/migrations/20260403104500_supabase_local_rpc_auth_fixes.sql` lines 382, 433
**Problem**: UI requires POD photo but backend accepts `p_pod_photo_url` as nullable and never rejects missing POD.
**User impact**: Delivery can be marked complete without photo. Disputes become impossible to resolve. Fraud risk.

### 20. Job map — Wrong pickup coordinates shown to riders
**Source**: Codex
**File**: `app/(rider)/index.tsx` lines 65, 77
**Problem**: Screen expects `pickup_lat/pickup_lng` but `get_nearby_orders` RPC doesn't return those fields. Falls back to wrong/null coordinates.
**User impact**: Riders see jobs pinned in wrong location. Misjudge distance. Place bad bids. Accept jobs too far away.

### 21. Customer phone number exposed before match
**Source**: Codex
**File**: `app/(rider)/job-details.tsx` lines 64, 262
**Problem**: Customer contact details visible on job-details screen before rider accepts the job.
**User impact**: Customer privacy exposed to all riders who browse the job. Privacy policy violation risk.

### 22. live-bidding — Realtime drops customer counter bids
**Source**: Claude
**File**: `app/(customer)/live-bidding.tsx`
**Problem**: `normalizeBidRow()` returns null for even `negotiation_round` values. Customer counter rounds silently dropped by realtime handler.
**User impact**: Customer makes counter-offer. Live-bidding screen looks frozen. Customer thinks no riders are responding. Cancels order.

### 23. counter-offer (customer) — negotiationRound param unguarded
**Source**: Claude
**File**: `app/(customer)/counter-offer.tsx`
**Problem**: If `negotiationRound` param missing, `currentRound` defaults incorrectly. Accept/counter button logic breaks.
**User impact**: Deep in negotiation, wrong button shown. Customer can't accept or counter.

### 24. counter-offer (rider) — Wrong prefill when responding to customer counter
**Source**: Claude
**File**: `app/(rider)/counter-offer.tsx`
**Problem**: Prefill uses market price instead of customer's counter amount when `isCustomerCounter` is false.
**User impact**: Rider has no reference for what customer offered. Places uninformed counter.

### 25. delivery-success — profile.id unguarded before dispute insert
**Source**: Claude
**File**: `app/(customer)/delivery-success.tsx`
**Problem**: `profile.id` used directly without null check in dispute insert.
**User impact**: Customer tries to report issue. App crashes. Dispute never filed.

---

## P3 — Minor / Performance

### 26. active-order-tracking — useEffect over-dependency causes channel churn
**Source**: Claude
**File**: `app/(customer)/active-order-tracking.tsx`
**Problem**: `riderProfile?.full_name` in realtime useEffect deps. Channel re-subscribes on every profile update.
**User impact**: Rider location pin flickers on customer map. Worse on slow networks.

### 27. No surge price warning on order retry
**Source**: Gemini
**Problem**: If order expires and customer creates a new one, surge pricing may kick in. Customer charged more for a retry with no warning.
**User impact**: Customer frustrated by price increase on second attempt with no explanation.

---

---

## FINANCIAL AUDIT — Money Flows, Commission, Ledger Integrity

---

## FIN-P0 — Critical Financial Bugs (Fix Before Any Real Money Flows)

### F1. complete_delivery — Commission uses rider rate, not snapshotted order amount
**Source**: Claude financial audit
**File**: `supabase/migrations/20260402221649_remote_schema.sql` lines 588-589
**Problem**: `complete_delivery()` calculates commission as `riders.commission_rate * final_price`. It should use `orders.platform_commission_amount` which was snapshotted at order creation. If rider's commission rate changed, or differs from the platform rate, every delivery produces wrong earnings splits.
**User impact**: Platform loses revenue on every delivery. Rider is under or overpaid depending on which rate wins. Ledger is wrong from day one.

### F2. complete_delivery — Commission calculated on VAT-inclusive price
**Source**: Claude financial audit
**File**: `supabase/migrations/20260402221649_remote_schema.sql` line 589
**Problem**: `v_commission = final_price * commission_rate`. But `final_price` includes VAT. Commission should only apply to the delivery fee, not the tax component.
**Example**: ₦1,000 delivery + ₦75 VAT = ₦1,075 final. 10% commission = ₦107.50, but should be ₦100. Rider underpaid ₦7.50 per order.
**User impact**: Rider systematically underpaid on every order. Platform overcollects commission on tax. Compounds with scale.

### F3. payment-webhook — Failed withdrawal does not refund wallet
**Source**: Claude financial audit
**File**: `supabase/functions/payment-webhook/index.ts` lines 64-80
**Problem**: When Paystack transfer fails (`transfer.failed` / `transfer.reversed`), webhook updates withdrawal status to 'rejected' but does NOT call `credit_wallet()` to restore the funds. Wallet was already debited when withdrawal was requested.
**User impact**: Rider requests ₦5,000 withdrawal. Transfer fails. Rider's wallet balance stays at ₦3,000 (already debited). ₦2,000 gone permanently with no recourse. Rider cannot re-request because they have no balance. Catastrophic trust issue.

### F4. complete_delivery (cash orders) — outstanding_balances inserts full trip price instead of commission
**Source**: Gemini + Claude financial audit
**File**: `supabase/migrations/` (complete_delivery RPC)
**Problem**: For cash orders, `outstanding_balances` records `v_order.final_price` (e.g. ₦2,000) as the debt instead of `v_commission` (e.g. ₦300). `place_bid` checks `is_commission_locked` against outstanding balances — after 2 cash deliveries, every rider gets locked out permanently.
**User impact**: Rider completes a ₦2,000 cash job. Platform thinks they owe ₦2,000. After 2 jobs the rider is commission-locked and can no longer bid. All cash riders effectively banned after their second delivery.

### F5. complete_delivery (cash orders) — Platform wallet never credited
**Source**: Gemini + Claude financial audit
**File**: `supabase/migrations/` (complete_delivery RPC)
**Problem**: Platform wallet credit only happens inside the `payment_method = 'wallet'` block. Cash trips produce zero platform ledger credit. No revenue trail exists for cash deliveries.
**User impact**: Platform operates at 100% digital revenue loss on all cash orders. Financial reporting is wrong. Cannot audit cash revenue.

### F6. Platform wallet missing — silently skipped, no exception raised
**Source**: Claude financial audit
**File**: `supabase/migrations/20260402221649_remote_schema.sql` lines 500, 612
**Problem**: Both `cancel_order()` and `complete_delivery()` query for the platform wallet but silently skip all credits if it returns NULL. No error raised, no fallback.
**User impact**: If platform wallet doesn't exist (e.g. fresh environment, seed failure), all cancellation penalties and commissions are silently discarded. Platform earns nothing and has no way of knowing.

### F7. Expired orders — no automatic wallet refund
**Source**: Gemini
**File**: `supabase/migrations/` (cancel_expired_orders / cron)
**Problem**: If customer pays via wallet and no rider is found before order expires, the cron job updates status to 'expired' but does not call `cancel_order` or `credit_wallet`. Wallet debit from order creation is never reversed.
**User impact**: Customer pays ₦2,000 for a delivery. No rider found. Order expires. ₦2,000 gone permanently. Customer files complaint. High chargeback risk.

---

## FIN-P1 — High Priority Financial Issues

### F8. accept_bid — Commission rate defaults to 10% instead of 15% when NULL
**Source**: Claude financial audit
**File**: `supabase/migrations/20260403200000_fix_accept_bid_cash_payment.sql` line 81
**Problem**: `COALESCE(v_order.platform_commission_rate, 10)` — if `platform_commission_rate` is NULL, commission recalculated at 10% instead of the intended 15%.
**User impact**: On negotiated orders where rate is NULL, platform loses 5% commission per delivery.

### F9. accept_bid — No insufficient funds check before charging extra on higher counter-offer
**Source**: Gemini + Claude
**File**: `supabase/migrations/20260403200000_fix_accept_bid_cash_payment.sql`
**Problem**: If customer accepts a higher bid (e.g. original ₦1,000, accepted ₦1,500), `debit_wallet()` is called for the ₦500 difference. If customer doesn't have ₦500, the entire transaction crashes with an unhandled exception. No pre-check, no friendly error.
**User impact**: Customer tries to accept rider's price. App throws obscure error. Customer has no idea they need to top up. Order never matches. Rider waiting for nothing.

### F10. mark_cash_paid — No UI integration in rider app
**Source**: Claude financial audit
**File**: Entire codebase — no call to `mark_cash_paid()` RPC found in any rider screen
**Problem**: Cash orders create `outstanding_balances` records. The `mark_cash_paid()` RPC exists and is correct. But there is no button or flow in the rider app to call it.
**User impact**: Rider completes cash delivery. Outstanding balance stays open forever. Commission-lock timer ticks. Rider gets locked out despite having paid. No way to settle.

### F11. create_order — suggested_price overwritten with dynamic_price
**Source**: Claude financial audit
**File**: `supabase/migrations/20260406010000_phase4_phase5_truth_and_quote.sql` line 364
**Problem**: `suggested_price` column is set to `v_dynamic_price` instead of `p_suggested_price`. Customer's suggested price input is discarded.
**User impact**: Riders never see customer's suggested price — only the system dynamic price. Negotiation context is lost. Riders bid blind without customer's anchor price.

### F12. Commission rate — three conflicting values across the system
**Source**: Claude financial audit
**Files**: Multiple
**Problem**: Commission rate exists in 3 places with different values:
- `orders.platform_commission_rate` = 15% (at creation)
- `riders.commission_rate` = 10% (default, used in complete_delivery)
- `app/(rider)/earnings.tsx` line 46 = hardcoded 18%

No single source of truth. Each layer uses a different number.
**User impact**: Rider sees 18% deducted on earnings screen. Backend actually deducts 10%. What's recorded in ledger is 15%. Every stakeholder sees a different number. Disputes guaranteed.

---

## FIN-P2 — Medium Priority Financial Issues

### F13. OTP lockout — 1-hour penalty too punitive, no override path
**Source**: Gemini (also in main list as #18)
**File**: `supabase/migrations/` (verify_delivery_code RPC)
**Problem**: 3 wrong code attempts = 1-hour lockout. No customer override. No admin reset from app.
**Financial impact**: Rider can't complete delivery. Can't take new jobs for 1 hour. Lost earnings. High rider churn.

### F14. No surge price warning on order retry
**Source**: Gemini
**Problem**: If order expires and customer creates a new one, surge pricing may have kicked in. Customer charged more with no explanation.
**User impact**: Customer retries after failed match. Charged higher price silently. Feels like a scam.

### F15. Promo code race condition — double application possible
**Source**: Claude financial audit
**File**: `supabase/migrations/20260406010000_phase4_phase5_truth_and_quote.sql` lines 323-325
**Problem**: `used_count` incremented without serialization. On concurrent order submissions with same promo code, both could pass the validity check before either increments the count.
**User impact**: Promo code with 1-use limit can be applied twice simultaneously. Revenue leakage on promotions.

### F16. Withdrawal — no explicit fee deduction logic
**Source**: Claude financial audit
**File**: `app/(rider)/rider-withdraw.tsx`
**Problem**: UI shows withdrawal fee but the `request_withdrawal` RPC debits the full amount without a separate fee line item in transactions. Fee deduction is implicit and not auditable.
**User impact**: Rider can't see a clear breakdown of what was deducted as fee vs what they received. Transparency issue.

---

## LOCATION & TRACKING AUDIT

---

## LOC-P0 — Launch Blockers

### L1. Background tracking — rider map freezes when phone is locked
**Source**: Gemini location audit
**Files**: `app/(rider)/navigate-to-pickup.tsx`, `app/(rider)/navigate-to-dropoff.tsx`
**Problem**: Location updates rely on JavaScript `setInterval` + `Location.watchPositionAsync()`. React Native suspends JS execution when the app is backgrounded or the phone is locked. Rider locks phone, drives to pickup — location updates stop entirely.
**User impact**: Customer sees rider frozen on map for the entire trip. Immediate panic, cancelled orders, support calls. This is the single most visible UX failure in the app.
**Fix required**: Implement `expo-task-manager` + `Location.startLocationUpdatesAsync()` to register a headless background task that wakes the OS to transmit coordinates even when the phone is locked.

### L2. RLS blocks customers from seeing bidding riders on the map
**Source**: Gemini location audit
**Files**: `supabase/migrations/` (RLS policy `customers_read_active_rider_location`)
**Problem**: The policy only allows a customer to read a rider's location if the order status is exactly `pickup_en_route`, `arrived_pickup`, `in_transit`, or `arrived_dropoff`. During the search and negotiation phases (`pending`), RLS returns 0 rows.
- `finding-rider.tsx` queries for nearby riders to show on map — returns empty. Customer stares at a blank map.
- `live-bidding.tsx` tries to show customer where bidding riders are — blocked. Customer negotiates completely blind, has no idea if rider is 1km or 10km away.
**User impact**: Core bidding UX is broken. Customer cannot make informed decisions during negotiation. Empty map during search makes the app look broken.
**Fix required**: Update RLS policy to allow customers to view locations of riders who are actively bidding on their pending orders (join through `bids` table), not only confirmed orders.

---

## LOC-P1 — High Priority

### L3. Batching bug — first customer loses tracking if rider accepts two orders
**Source**: Gemini location audit
**File**: `supabase/migrations/` (`get_rider_location_customer_id` function)
**Problem**: The function uses `LIMIT 1` to find which customer is allowed to track a rider. If a rider ever accepts two deliveries simultaneously (batching), the first customer immediately loses tracking access and their map goes black.
**User impact**: First customer in a batched delivery loses live tracking mid-trip with no explanation.

---

## LOC-P2 — Performance / Scale

### L4. Location pings are unbatched DB writes — will not scale
**Source**: Gemini location audit
**File**: `app/(rider)/index.tsx`
**Problem**: Location watcher fires every 10 seconds or 20 meters. Each trigger calls `update_rider_location` RPC directly against Postgres — an unbatched POST on every ping. At 1,000 riders, this is 100–200 heavy DB writes per second continuously.
**User impact**: No impact at small scale. At growth, maxes connection pool, spikes DB CPU, causes failed reads for customers. Architecture will need rework before scaling.
**Fix options**: Debounce frontend (only send if position changed significantly), or route through Supabase Broadcast/Realtime instead of hard-writing every ping to Postgres.

---

## SECURITY, AUTH, SUPPORT & REALTIME AUDIT

---

## SEC-P0 - Critical Security Findings

### S1. Rider onboarding can self-upgrade account role and KYC state
**Source**: Gemini security audit
**Files**: `app/(rider-auth)/signup-review.tsx`, `supabase/migrations/` (`profiles_update_own`)
**Problem**: Rider signup updates the user's own `profiles` row to `{ role: 'rider', kyc_status: 'pending' }` from the client. Gemini found that the `profiles_update_own` RLS policy is effectively unrestricted, with no `WITH CHECK` blocking sensitive fields like `role`, `kyc_status`, or `is_banned`.
**User impact**: A malicious user can tamper with the request and attempt `{ role: 'admin', kyc_status: 'approved' }` or otherwise bypass the intended approval flow. This is an existential privilege-escalation risk if the policy is as permissive as Gemini found.
**Fix required**: Lock `profiles_update_own` down to safe self-service fields only. Move all `role`, `kyc_status`, ban state, and approval mutations behind admin-only RPCs or Edge Functions.

### S2. Pending-order access is too broad for riders before match
**Source**: Codex
**Files**: `supabase/migrations/20260402221649_remote_schema.sql`, `app/(rider)/job-details.tsx`
**Problem**: The `orders_select_pending` policy exposes pending orders broadly to riders, and the rider job details screen directly selects `customer:customer_id(full_name, phone)` before a rider is matched to the order.
**User impact**: Customer phone numbers and other order details can leak before match. Any future sensitive columns added to `orders` become exposed through the same policy.
**Fix required**: Replace broad rider reads on `orders` with a dedicated safe RPC/view for discovery that returns only the minimum data required to bid.

### S3. Delivery code appears readable to the rider who is supposed to verify it
**Source**: Codex
**Files**: `supabase/migrations/20260402221649_remote_schema.sql`, `app/(customer)/active-order-tracking.tsx`
**Problem**: `orders.delivery_code` is stored on the same row that matched riders can read through broad order access. That undermines the purpose of a customer-held secret verification code.
**User impact**: A rider who can read the raw code can verify delivery without the customer actually providing it at handoff.
**Fix required**: Move delivery-code verification behind a server-only contract, or store only a hashed code in the readable order row.

### S4. Sensitive SECURITY DEFINER RPCs still have overly broad grants
**Source**: Codex
**Files**: `supabase/migrations/20260402221649_remote_schema.sql`, `supabase/migrations/20260406000000_sprint_1_1_auth_hardening.sql`, `supabase/migrations/20260406010000_phase4_phase5_truth_and_quote.sql`
**Problem**: Several sensitive functions still have `GRANT ALL ... TO "anon"` in the remote schema snapshot, including `accept_bid`, `cancel_order`, `complete_delivery`, `place_bid`, `update_order_status`, `verify_delivery_code`, and `get_nearby_orders`. `get_nearby_orders` also lacks an explicit `auth.uid()` ownership check for `p_rider_id`.
**User impact**: Attack surface is much larger than necessary. If a valid rider UUID is known, `get_nearby_orders` can expose customer-facing order data without proving the caller owns that rider profile.
**Fix required**: Revoke `anon` from rider/customer RPCs by default and add explicit caller ownership checks to every `SECURITY DEFINER` function.

---

## SEC-P1 - High Priority Product & Auth Findings

### S5. Cancel order flow hides the 20% late-cancel penalty
**Source**: Gemini security audit
**File**: `app/(customer)/cancel-order-modal.tsx`
**Problem**: The backend `cancel_order` RPC applies a 20% penalty for late customer cancellation, but the modal never tells the user that a fee will be deducted.
**User impact**: Customer expects a full refund, receives less money back, and immediately loses trust. This is chargeback and support-ticket fuel.
**Fix required**: Query the order status before confirmation and show a clear warning whenever a penalty applies.

### S6. update_order_status is participant-based, not actor-based
**Source**: Codex
**Files**: `supabase/migrations/20260402221649_remote_schema.sql`, `app/(rider)/navigate-to-pickup.tsx`, `app/(rider)/navigate-to-dropoff.tsx`, `app/(rider)/confirm-arrival.tsx`
**Problem**: `update_order_status` checks whether the caller is a participant in the order, but it does not strongly restrict which participant may perform which transition.
**User impact**: A participant can potentially drive the state machine through transitions that should belong only to rider/admin or customer/admin actors.
**Fix required**: Enforce actor-by-transition rules in the RPC itself, not just valid status sequences.

### S7. Disputes are both under-protected and under-built
**Source**: Gemini + Codex
**Files**: `app/(customer)/delivery-success.tsx`, `app/(customer)/order-details.tsx`, `supabase/migrations/20260402221649_remote_schema.sql`
**Problem**: Customers can insert disputes directly, but there is no customer UI to track dispute status. Gemini also noted no duplicate guard, while Codex found the `disputes_insert_own` policy only checks `raised_by = auth.uid()` and does not tie the dispute to actual order participation.
**User impact**: Users can spam repeated disputes for the same order, and malicious users may be able to create disputes on unrelated orders if they know an order ID.
**Fix required**: Add a unique constraint on `(order_id, raised_by)`, move creation behind an authorization RPC, and build a basic "My Disputes" support surface.

### S8. Rider onboarding can leave accounts in broken partial states
**Source**: Codex
**File**: `app/(rider-auth)/signup-review.tsx`
**Problem**: The screen updates `profiles`, inserts `riders`, uploads docs, inserts `rider_documents`, and inserts `rider_bank_accounts` step by step from the client. If any step fails mid-flight, the account can be left half-converted.
**User impact**: Customer accounts can become stuck as incomplete riders, approval queues get noisy, and auth routing becomes unpredictable.
**Fix required**: Move rider application submission into one transactional server-side RPC and only flip role/approval state from that trusted path.

---

## SEC-P2 - Stability, Cost & Lifecycle Findings

### S9. Realtime channels do not recover from silent socket failure
**Source**: Gemini security audit
**Files**: `hooks/use-app-state-channels.ts`, multiple `app/` screens using `supabase.channel(...)`
**Problem**: AppState pause/resume is handled, and cleanup is generally correct, but most `.subscribe()` calls do not watch for `CHANNEL_ERROR`, `TIMED_OUT`, or `CLOSED` and do not recreate dead channels.
**User impact**: If the connection drops while the app remains foregrounded, bids, chat, and order updates can silently stop until the user force-restarts the app.
**Fix required**: Add subscribe status callbacks and automatic reconnect with backoff for terminal channel states.

### S10. Notifications are only "live in-app", not true device notifications
**Source**: Gemini + Codex
**Files**: `app/_layout.tsx`, `hooks/use-push-notification-registration.ts`, `app/(customer)/notifications.tsx`, `supabase/migrations/`
**Problem**: The app stores one `push_token` on `profiles` and shows in-app notifications through Realtime, but there is no backend dispatch path sending OS-level push notifications. The frontend notification type model also drifts from backend-created types like `delivery_code` and `new_bid`.
**User impact**: Locked phones never buzz for important events, stale tokens accumulate, and some notification types may not deep-link correctly.
**Fix required**: Add backend push dispatch, move to a per-device token table, and centralize notification type contracts across backend and frontend.

### S11. Auth bootstrap can stack duplicate auth listeners
**Source**: Codex
**Files**: `store/auth.store.ts`, `app/_layout.tsx`, `app/(auth)/login.tsx`, `app/(auth)/otp.tsx`
**Problem**: `initialize()` registers `onAuthStateChange` every time it runs, and it is called from more than one place.
**User impact**: Duplicate profile fetches, racey redirects, avoidable reads, and harder auth/session debugging.
**Fix required**: Make auth initialization idempotent and register one auth subscription for the app lifecycle.

### S12. Approval, rejection, and route guard edges are under-handled
**Source**: Codex
**Files**: `app/(auth)/splash.tsx`, `app/(customer)/_layout.tsx`, `app/(rider-auth)/pending-approval.tsx`
**Problem**: Unknown roles tend to fall back to customer routing, and pending approval only actively handles `approved`, not rejection/resubmission/support recovery.
**User impact**: Edge-case users can land in the wrong surface or get stuck in a dead-end holding state.
**Fix required**: Add explicit route guards for customer surfaces and handle rejected/resubmit rider states intentionally.

---

## Status
- **Total issues**: 58
- **P0 (Launch blockers)**: **22**
- **P1 (First test run)**: **17**
- **P2 (Edge cases / lifecycle gaps)**: **17**
- **P3 / Scale**: **2**
- **Fixed**: 0
- **Pending**: 58

---

## Sprint Plan

### Sprint 1 — Financial Integrity *(DB migrations only)*
Fix money flows before anything else. Wrong numbers = broken business from day one.

| # | Issue | Status |
|---|-------|--------|
| F1 | complete_delivery — commission uses rider rate not snapshot | ✅ |
| F2 | complete_delivery — commission on VAT-inclusive price | ✅ |
| F3 | payment-webhook — failed withdrawal does not refund wallet | ✅ |
| F4 | complete_delivery (cash) — outstanding_balances inserts full price | ✅ |
| F5 | complete_delivery (cash) — platform wallet never credited | ✅ |
| F6 | Platform wallet missing — silently skipped | ✅ |
| F7 | Expired orders — no automatic wallet refund | ✅ |
| F8 | accept_bid — commission defaults to 10% not 15% | ✅ |
| F9 | accept_bid — no insufficient funds check on higher counter | ✅ |
| F10 | mark_cash_paid — no UI integration in rider app | ⬜ |
| F11 | create_order — suggested_price overwritten with dynamic_price | ✅ |
| F12 | Commission rate — three conflicting values across system | ✅ |

---

### Sprint 2 — Core Flow Unblocked *(Frontend)*
The full order → match → deliver loop must work end to end.

| # | Issue | Status |
|---|-------|--------|
| 1 | complete_delivery — cash commission inserts wrong amount | ⬜ |
| 2 | complete_delivery — platform wallet never credited on cash | ⬜ |
| 3 | Rider "Accept" on customer counter loops instead of matching | ⬜ |
| 4 | place_bid — commission-lock and KYC checks stripped | ⬜ |
| 5 | create-order — RPC result shape ambiguous | ⬜ |
| 6 | navigate-to-dropoff — missing p_changed_by in RPC call | ⬜ |
| 7 | finding-rider — navigatingRef never resets on back nav | ⬜ |
| 8 | waiting-response — tracks whole order not one thread | ⬜ |
| 9 | accept_bid — no insufficient funds check on higher counter | ⬜ |

---

### Sprint 3 — Negotiation Correctness *(Frontend)*
Bidding/counter-offer is the product's core mechanic — must be airtight.

| # | Issue | Status |
|---|-------|--------|
| 10 | waiting-response — fragile modulo counter-offer detection | ⬜ |
| 11 | Timer mismatch — UI 5 min vs backend 15 min | ⬜ |
| 12 | Price mismatch — frontend multipliers don't match backend | ⬜ |
| 22 | live-bidding — realtime drops customer counter bids | ⬜ |
| 23 | counter-offer (customer) — negotiationRound param unguarded | ⬜ |
| 24 | counter-offer (rider) — wrong prefill on customer counter | ⬜ |

---

### Sprint 4 — Security Hardening *(DB migrations + Edge Functions)*
Must be done before any real users or real money touches the system.

| # | Issue | Status |
|---|-------|--------|
| S1 | Rider onboarding can self-upgrade role and KYC state | ⬜ |
| S2 | Pending-order access too broad — customer data exposed | ⬜ |
| S3 | Delivery code readable by the rider verifying it | ⬜ |
| S4 | SECURITY DEFINER RPCs have overly broad anon grants | ⬜ |
| S5 | Cancel order hides 20% late-cancel penalty | ⬜ |
| S6 | update_order_status is participant-based not actor-based | ⬜ |
| S7 | Disputes under-protected and under-built | ⬜ |
| S8 | Rider onboarding can leave accounts in broken partial state | ⬜ |

---

### Sprint 5 — Stability & Edge Cases *(Frontend + DB)*
Polish for real-world resilience — surfaces on first real test run.

| # | Issue | Status |
|---|-------|--------|
| 13 | Expired orders — no automatic wallet refund on expiry | ⬜ |
| 14 | waiting-for-customer — poll race condition | ⬜ |
| 15 | job-details — riderId undefined on fast mount | ⬜ |
| 16 | active-order-tracking — riderName empty on fast delivery | ⬜ |
| 17 | delivery-completion — silent arrived_dropoff failure | ⬜ |
| 18 | OTP lockout — 1-hour penalty too punitive, no override | ⬜ |
| 19 | POD not enforced server-side | ⬜ |
| 20 | Job map — wrong pickup coordinates shown to riders | ⬜ |
| 21 | Customer phone exposed before match | ⬜ |
| 25 | delivery-success — profile.id unguarded before dispute insert | ⬜ |
| 26 | active-order-tracking — useEffect over-dependency channel churn | ⬜ |
| 27 | No surge price warning on order retry | ⬜ |
| F13 | OTP lockout financial impact | ⬜ |
| F14 | No surge price warning on retry | ⬜ |
| F15 | Promo code race condition — double application possible | ⬜ |
| F16 | Withdrawal — no explicit fee deduction logic | ⬜ |

---

### Sprint 6 — Rebuild Sprint *(Native + Realtime + Auth)*
All rebuild-requiring changes batched here. One final EAS build at the end.

| # | Issue | Status |
|---|-------|--------|
| L1 | Background tracking — rider map freezes when phone locked | ⬜ |
| L2 | RLS blocks customers from seeing bidding riders on map | ⬜ |
| L3 | Batching bug — first customer loses tracking | ⬜ |
| L4 | Location pings are unbatched DB writes — will not scale | ⬜ |
| S9 | Realtime channels do not recover from silent socket failure | ⬜ |
| S10 | Notifications are only live in-app, not device notifications | ⬜ |
| S11 | Auth bootstrap can stack duplicate auth listeners | ⬜ |
| S12 | Approval/rejection route guard edges under-handled | ⬜ |
