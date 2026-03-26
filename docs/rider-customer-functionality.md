# Rider ↔ Customer Functionality: Lifecycle Audit & Fix Plan

**Date:** 2026-03-26
**Scope:** Full order lifecycle — customer creates order → rider completes delivery
**Status:** Pre-fix audit. Nothing in this doc has been implemented yet.

---

## Executive Summary

The complete delivery loop is broken in **silent failure mode**. The rider believes they placed a bid (the frontend swallows the SQL error), the customer waits on "Finding Rider" seeing 0 bids, and even if bids worked, a systemic UUID mismatch (`profile.id` vs `riders.id`) would prevent the rider from ever being accepted, navigating, or completing delivery. Real-time tracking listens to a table that does not exist. Counter-offers fail at the RLS layer before any code runs.

Six categories of root-cause failure:

1. **Broken SQL** — `place_bid` upsert uses invalid `ON CONFLICT ON CONSTRAINT` syntax for a partial index
2. **Missing RPCs** — `accept_bid`, `complete_delivery`, `counter_bid` do not exist
3. **UUID identity crisis** — All rider-side screens pass `profile.id` (auth UUID) where RPCs expect `riders.id` (rider table UUID)
4. **Wrong table subscribed** — Customer app listens to `rider_locations` table; actual data is in `riders.current_lat/lng` and `rider_location_logs`
5. **RLS blocks direct mutations** — `bids` table has no `INSERT`/`UPDATE` policies for customers; counter-offer raw inserts always fail
6. **Realtime subquery trap** — `chat_messages` and `order_status_history` RLS policies use subqueries, which Supabase Realtime cannot evaluate

---

## Lifecycle Map & Issue Index

| Step | Action | Root Cause | Severity |
|---|---|---|---|
| 1 | Customer creates order | Cash orders debit wallet unconditionally | 🔴 Critical |
| 1 | Customer creates order | Wallet debit + order creation not atomic | 🟡 Major |
| 2 | Rider places bid | `ON CONFLICT ON CONSTRAINT` invalid on partial index → RPC crashes every time | 🔴 Fatal |
| 2 | Rider places bid | Frontend silently swallows the exact error string → rider thinks bid succeeded | 🔴 Fatal |
| 3 | Customer sees bids | `place_bid` always fails → 0 bids ever appear | 🔴 Fatal (downstream) |
| 3 | Customer sees bids | Realtime INSERT handler queries `profile_id` but should query `id` on riders table | 🔴 Critical |
| 3 | Customer sees bids | Realtime UPDATE filter hides `'countered'` bids from list | 🟡 Major |
| 4 | Customer sends counter | No `counter_bid` RPC exists; raw insert blocked by bids RLS (no INSERT policy for customers) | 🔴 Critical |
| 4 | Customer sends counter | `parent_bid_id` column does not exist in bids table | 🔴 Critical |
| 4 | Rider sends counter | `place_bid` upsert is semantically identical to original bid — no counter distinction | 🟡 Major |
| 5 | Customer accepts bid | `accept_bid` RPC does not exist → acceptance always throws | 🔴 Fatal |
| 5 | Rider sees acceptance | `waiting-for-customer` compares `order.rider_id` (riders.id) against `profile.id` (auth UUID) → never matches | 🔴 Critical |
| 6 | Rider navigates to pickup | `update_rider_location` receives `profile.id` not `riders.id` → UPDATE finds 0 rows | 🔴 Critical |
| 6 | Rider navigates to pickup | ETA is `Math.random()` — not calculated | 🟠 Minor |
| 7 | Customer sees live tracking | App subscribes to `rider_locations` table — this table does not exist in schema | 🔴 Fatal |
| 7 | Customer sees live tracking | Actual location stored in `riders.current_lat/lng` and `rider_location_logs` | 🔴 Fatal |
| 7 | Customer sees live tracking | No polling fallback if realtime fails | 🟡 Major |
| 8 | Rider arrives at pickup | `confirm-arrival.tsx` skips `arrived_pickup` → goes directly to `in_transit` | 🟡 Major |
| 9 | Rider navigates to dropoff | Same `profile.id` bug as step 6 | 🔴 Critical |
| 10 | OTP verification | `verify_delivery_code` receives `profile.id` → RPC throws "order not assigned to you" | 🔴 Fatal |
| 10 | POD photo upload | `uri:` object not converted to Blob → fails on Android | 🟡 Major |
| 10 | OTP input | `maxLength={2}` on each digit box | 🟠 Minor |
| 11 | Delivery complete | `complete_delivery` RPC does not exist | 🔴 Fatal |
| 11 | Delivery complete | Same `profile.id` mismatch even if RPC existed | 🔴 Critical |
| 11 | Rider rating | Rating submitted in UI state only — never written to `ratings` table | 🟡 Major |
| 11 | Customer receipt | "View Digital Receipt" is a no-op (empty handler) | 🟠 Minor |
| — | Chat (realtime) | `chat_messages` RLS uses subquery → Supabase Realtime cannot deliver events | 🔴 Critical |
| — | Order history (realtime) | `order_status_history` RLS uses subquery → same Realtime blockage | 🔴 Critical |

---

## Phase 1 — Fix the SQL & Create Missing RPCs
*Nothing else can be fixed until these migrations run. All frontend work blocks on Phase 1.*

### 1.1 — Fix `place_bid` Upsert SQL (🔴 Fatal)

**Migration:** `00025_fix_place_bid_conflict.sql`

The current migration 00024 uses:
```sql
ON CONFLICT ON CONSTRAINT idx_bids_one_pending_per_rider
```
`idx_bids_one_pending_per_rider` is a **partial unique index**, not a named constraint. PostgreSQL's `ON CONFLICT ON CONSTRAINT` only works with named constraints (e.g., primary keys, unique constraints created with `CONSTRAINT` keyword). For partial indexes, the column inference syntax must be used instead:

```sql
-- WRONG (current):
ON CONFLICT ON CONSTRAINT idx_bids_one_pending_per_rider

-- CORRECT:
ON CONFLICT (order_id, rider_id) WHERE status = 'pending'
DO UPDATE SET amount = EXCLUDED.amount, expires_at = NOW() + INTERVAL '2 minutes'
```

Also **remove the frontend error-swallowing** in `app/(rider)/job-details.tsx` that ignores errors containing `'idx_bids_one_pending_per_rider'`.

---

### 1.2 — Create `accept_bid` RPC (🔴 Fatal)

**Migration:** `00026_accept_bid_rpc.sql`

`app/(customer)/live-bidding.tsx` calls `supabase.rpc('accept_bid', ...)` — this RPC does not exist.

```sql
CREATE OR REPLACE FUNCTION accept_bid(
  p_bid_id UUID,
  p_customer_id UUID
) RETURNS UUID -- returns order_id
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_bid bids%ROWTYPE;
  v_order orders%ROWTYPE;
BEGIN
  SELECT * INTO v_bid FROM bids WHERE id = p_bid_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bid not found'; END IF;
  IF v_bid.status != 'pending' THEN RAISE EXCEPTION 'Bid is no longer pending'; END IF;

  SELECT * INTO v_order FROM orders WHERE id = v_bid.order_id FOR UPDATE;
  IF v_order.customer_id != p_customer_id THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF v_order.status != 'pending' THEN RAISE EXCEPTION 'Order is no longer open'; END IF;

  -- Accept this bid
  UPDATE bids SET status = 'accepted' WHERE id = p_bid_id;
  -- Reject all other pending bids on this order
  UPDATE bids SET status = 'rejected'
    WHERE order_id = v_bid.order_id AND id != p_bid_id AND status = 'pending';
  -- Match the order to the rider
  UPDATE orders SET status = 'matched', rider_id = v_bid.rider_id, final_price = v_bid.amount
    WHERE id = v_bid.order_id;
  -- Notify rider
  INSERT INTO notifications (user_id, type, title, body, data)
  SELECT p.id, 'order_update', 'Bid Accepted', 'Customer accepted your offer.',
    jsonb_build_object('order_id', v_bid.order_id)
  FROM riders r JOIN profiles p ON p.id = r.profile_id WHERE r.id = v_bid.rider_id;

  RETURN v_bid.order_id;
END; $$;
```

---

### 1.3 — Create `counter_bid` RPC + `parent_bid_id` Column (🔴 Critical)

**Migration:** `00027_counter_bid_rpc.sql`

Two problems: (a) no `parent_bid_id` column exists, (b) no RPC exists, (c) bids table has no INSERT/UPDATE RLS for customers.

```sql
-- Add column
ALTER TABLE bids ADD COLUMN IF NOT EXISTS parent_bid_id UUID REFERENCES bids(id);

-- Create RPC (SECURITY DEFINER bypasses RLS — no need to add customer INSERT policy)
CREATE OR REPLACE FUNCTION send_counter_offer(
  p_bid_id UUID,
  p_customer_id UUID,
  p_amount NUMERIC
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_bid bids%ROWTYPE;
  v_new_bid_id UUID;
BEGIN
  SELECT * INTO v_bid FROM bids WHERE id = p_bid_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bid not found'; END IF;
  IF v_bid.status != 'pending' THEN RAISE EXCEPTION 'Bid is no longer pending'; END IF;

  -- Validate customer owns the order
  IF NOT EXISTS (SELECT 1 FROM orders WHERE id = v_bid.order_id AND customer_id = p_customer_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_amount <= 0 THEN RAISE EXCEPTION 'Counter amount must be positive'; END IF;

  -- Mark original bid as countered
  UPDATE bids SET status = 'countered' WHERE id = p_bid_id;

  -- Insert counter bid (replaces pending safely via conflict)
  INSERT INTO bids (order_id, rider_id, amount, status, parent_bid_id, expires_at)
  VALUES (v_bid.order_id, v_bid.rider_id, p_amount, 'pending', p_bid_id, NOW() + INTERVAL '2 minutes')
  ON CONFLICT (order_id, rider_id) WHERE status = 'pending'
  DO UPDATE SET amount = EXCLUDED.amount, parent_bid_id = EXCLUDED.parent_bid_id, expires_at = EXCLUDED.expires_at
  RETURNING id INTO v_new_bid_id;

  -- Notify rider
  INSERT INTO notifications (user_id, type, title, body, data)
  SELECT p.id, 'order_update', 'Counter Offer', 'Customer sent a counter offer.',
    jsonb_build_object('order_id', v_bid.order_id, 'bid_id', v_new_bid_id, 'amount', p_amount)
  FROM riders r JOIN profiles p ON p.id = r.profile_id WHERE r.id = v_bid.rider_id;

  RETURN v_new_bid_id;
END; $$;
```

---

### 1.4 — Create `verify_delivery_code` + `complete_delivery` RPCs (🔴 Fatal)

**Migration:** `00028_complete_delivery_rpc.sql`

Neither RPC exists. Both are called in `delivery-completion.tsx`.

```sql
-- Verify OTP
CREATE OR REPLACE FUNCTION verify_delivery_code(
  p_order_id UUID,
  p_rider_id UUID,  -- expects riders.id
  p_code TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_order orders%ROWTYPE;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;

  -- Validate rider assignment (order.rider_id is riders.id)
  IF v_order.rider_id != p_rider_id THEN
    RAISE EXCEPTION 'This order is not assigned to you';
  END IF;

  RETURN v_order.delivery_code = p_code;
END; $$;

-- Complete delivery
CREATE OR REPLACE FUNCTION complete_delivery(
  p_order_id UUID,
  p_rider_id UUID,  -- expects riders.id
  p_pod_photo_url TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_order orders%ROWTYPE;
  v_rider riders%ROWTYPE;
  v_commission NUMERIC;
  v_earnings NUMERIC;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF v_order.rider_id != p_rider_id THEN RAISE EXCEPTION 'Not assigned to you'; END IF;
  IF v_order.status != 'arrived_dropoff' THEN
    RAISE EXCEPTION 'Order must be at arrived_dropoff status (current: %)', v_order.status;
  END IF;

  SELECT * INTO v_rider FROM riders WHERE id = p_rider_id;
  v_commission := ROUND(v_order.final_price * v_rider.commission_rate / 100, 2);
  v_earnings := v_order.final_price - v_commission;

  -- Mark delivered
  UPDATE orders SET status = 'delivered', pod_photo_url = p_pod_photo_url,
    delivered_at = NOW() WHERE id = p_order_id;

  -- Credit rider wallet
  PERFORM credit_wallet(
    (SELECT wallet_id FROM wallets WHERE owner_id = v_rider.profile_id AND owner_type = 'rider'),
    v_earnings,
    'delivery_earning',
    'Delivery earnings for order ' || p_order_id
  );

  -- Track commission owed
  UPDATE riders SET
    unpaid_commission = unpaid_commission + v_commission,
    is_commission_locked = CASE WHEN unpaid_commission + v_commission >= 2 * (
      SELECT AVG(commission_rate) FROM riders WHERE id = p_rider_id
    ) THEN true ELSE is_commission_locked END
  WHERE id = p_rider_id;

  RETURN jsonb_build_object(
    'rider_earnings', v_earnings,
    'commission', v_commission,
    'final_price', v_order.final_price
  );
END; $$;
```

---

### 1.5 — Fix Cash Order Wallet Debit (🔴 Critical)

**Migration:** `00029_fix_cash_order_debit.sql`

`create_order` RPC debits wallet unconditionally. Wrap the debit:

```sql
IF p_payment_method = 'wallet' THEN
  PERFORM debit_wallet(v_wallet_id, v_final_price, 'order_payment', ...);
END IF;
```

---

### 1.6 — Fix Realtime Tracking Table (🔴 Fatal)

**Migration:** `00030_fix_rider_location_realtime.sql`

The customer app subscribes to a table called `rider_locations` — **this table does not exist**. Location data is stored in:
- `riders.current_lat`, `riders.current_lng` (live position)
- `rider_location_logs` (history)

Two options:
- **Option A (preferred):** Create a `rider_locations` view or actual table that the `update_rider_location` RPC writes to, so the existing channel subscription works
- **Option B:** Update `active-order-tracking.tsx` to subscribe to the `riders` table filtering on `id = order.rider_id`

**Recommended: Option A** — create a `rider_locations` table that the RPC writes to (keeps frontend channel names consistent with `06_realtime_channel_map.md`):

```sql
CREATE TABLE IF NOT EXISTS rider_locations (
  rider_id UUID PRIMARY KEY REFERENCES riders(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  order_id UUID REFERENCES orders(id),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: customer can read for their matched order
CREATE POLICY "customers_read_matched_rider_location"
ON rider_locations FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM orders o
    WHERE o.rider_id = rider_locations.rider_id
    AND o.customer_id = auth.uid()
    AND o.status IN ('pickup_en_route','arrived_pickup','in_transit','arrived_dropoff')
  )
);

-- Riders can upsert own location
CREATE POLICY "riders_upsert_own_location"
ON rider_locations FOR ALL
USING (
  EXISTS (SELECT 1 FROM riders r WHERE r.id = rider_locations.rider_id AND r.profile_id = auth.uid())
);

ALTER TABLE rider_locations ENABLE ROW LEVEL SECURITY;
-- Add to Supabase Realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE rider_locations;
```

Also update `update_rider_location` RPC to INSERT/UPDATE into `rider_locations` instead of (or in addition to) `riders`.

---

### 1.7 — Fix Realtime Subquery in `chat_messages` + `order_status_history` RLS (🔴 Critical)

**Migration:** `00031_fix_realtime_rls_subqueries.sql`

Supabase Realtime cannot evaluate RLS policies that contain subqueries (`WHERE order_id IN (SELECT ...)`). The `bids` table was fixed in migration 00023 using a `SECURITY DEFINER` helper function. The same fix must be applied to:

- `chat_messages` — customer + rider select policies
- `order_status_history` — customer + rider select policies

Pattern (reuse existing `get_order_customer_id` helper or create equivalent):

```sql
-- Replace subquery-based policy:
-- USING (order_id IN (SELECT id FROM orders WHERE customer_id = auth.uid()))

-- With helper-function-based policy:
-- USING (get_order_customer_id(order_id) = auth.uid())
-- or
-- USING (get_order_rider_profile_id(order_id) = auth.uid())
```

---

## Phase 2 — Systemic `rider_id` Identity Fix
*The single biggest source of silent failures across the entire rider app.*

### Root Cause

The system has two different UUIDs for every rider:
- `profiles.id` = auth UUID (returned by `auth.uid()`, stored in `profile.id` on the frontend)
- `riders.id` = rider table UUID (used as FK in `orders.rider_id`, `bids.rider_id`, all delivery RPCs)

Every rider-side screen currently passes `profile.id` to RPCs expecting `riders.id`. The fix is to fetch `riders.id` **once on login** and store it in the auth store.

### 2.1 — Add `riderId` to Auth Store

**File:** `store/auth.store.ts`

After a rider profile loads successfully (`role === 'rider'`), run:
```typescript
const { data } = await supabase
  .from('riders')
  .select('id')
  .eq('profile_id', profile.id)
  .single();
set({ riderId: data?.id ?? null });
```

Add `riderId: string | null` to the store state and `clearRiderId` to the logout action.

### 2.2 — Replace `profile.id` with `riderId` in All Rider Screens

| File | Call Site | Fix |
|---|---|---|
| `app/(rider)/navigate-to-pickup.tsx` | `update_rider_location` → `p_rider_id` | Use `riderId` |
| `app/(rider)/navigate-to-dropoff.tsx` | `update_rider_location` → `p_rider_id` | Use `riderId` |
| `app/(rider)/delivery-completion.tsx` | `verify_delivery_code` + `complete_delivery` → `p_rider_id` | Use `riderId` |
| `app/(rider)/confirm-arrival.tsx` | `update_order_status` (if passes profile.id) | Use `riderId` |
| `app/(rider)/waiting-for-customer.tsx` | Realtime filter + `order.rider_id === profile.id` comparison | Compare against `riderId` |
| `app/(rider)/trip-complete.tsx` | Rating insert `rider_id` field | Use `riderId` |
| `app/(rider)/earnings.tsx` | Wallet subscription filter | Use `riderId` |
| `app/(rider)/job-details.tsx` | `place_bid` → `p_rider_id` | Use `riderId` |
| `app/(rider)/counter-offer.tsx` | `place_bid` → `p_rider_id` | Use `riderId` |

---

## Phase 3 — Frontend Screen Fixes
*Screens fixed after Phase 1 RPCs exist and Phase 2 riderId is in store.*

### 3A — `app/(customer)/live-bidding.tsx`

- **Bid acceptance:** Replace `supabase.rpc('accept_bid', ...)` call to pass `{ p_bid_id, p_customer_id: profile.id }` matching the new RPC signature
- **Realtime INSERT handler:** Fix rider profile lookup — query `riders` table with `.eq('id', payload.new.rider_id)`, then join to `profiles` for name/avatar
- **Realtime UPDATE filter:** Do not remove bids with `status = 'countered'` — only hide `'rejected'` bids

### 3B — `app/(customer)/counter-offer.tsx`

- Replace raw `.update()` + `.insert()` with `supabase.rpc('send_counter_offer', { p_bid_id, p_customer_id: profile.id, p_amount })`
- Remove all manual bid status manipulation
- Navigate to `waiting-response` on success

### 3C — `app/(customer)/active-order-tracking.tsx`

- Update realtime channel to subscribe to the `rider_locations` table (now exists after Phase 1.6)
- Filter: `rider_id=eq.${order.rider_id}` (where `order.rider_id` is a riders.id UUID — set correctly by `accept_bid` RPC)
- Add 10s polling fallback: if no realtime update in 15s, fetch `rider_locations` via `.select().eq('rider_id', order.rider_id).single()`
- Fix Polyline: null-guard `order.dropoff_lat` / `order.dropoff_lng`; hide polyline if coordinates missing
- Pass `deliveryTime` to `delivery-success` screen: `Math.round((Date.now() - new Date(order.created_at).getTime()) / 60000)` minutes

### 3D — `app/(customer)/finding-rider.tsx`

- Add `navigatingRef` to prevent poll and realtime both triggering navigation
- Add `cancelledRef` to prevent double-cancel on expiry timeout
- Label dummy rider map pins as illustrative: show "Searching for nearby riders..." subtitle

### 3E — `app/(rider)/delivery-completion.tsx`

- Replace `profile.id` with `riderId` from store (Phase 2)
- Fix OTP digit inputs: `maxLength={1}` on each box
- Fix POD upload for Android: `const blob = await fetch(podPhotoUri).then(r => r.blob())` before passing to Supabase Storage
- Add null guard: `if (!uploadData?.path) throw new Error('Upload failed')`
- Add user-visible error for wrong OTP code (when `verify_delivery_code` returns `false`)
- Check `documents` bucket RLS: rider must have INSERT access to `pod/` folder

### 3F — `app/(rider)/trip-complete.tsx`

- Wire star rating to `supabase.from('ratings').upsert({ order_id, rider_id: riderId, rated_by: riderId, ratee_id: customerId, score }, { onConflict: 'order_id' })`
- Pull `customerId` from navigation params (passed from `delivery-completion`)

### 3G — `app/(customer)/delivery-success.tsx`

- Accept `deliveryTime` param from `active-order-tracking.tsx` and display it
- Wire "View Digital Receipt" button → `router.push({ pathname: '/(customer)/order-details', params: { orderId } })`

### 3H — `app/(rider)/confirm-arrival.tsx` + `navigate-to-pickup.tsx`

Verify and enforce correct status sequence:
```
pending → matched → pickup_en_route → arrived_pickup → in_transit → arrived_dropoff → delivered
```
- `navigate-to-pickup.tsx` "Arrived" button → `update_order_status('arrived_pickup')`
- `confirm-arrival.tsx` "Package Picked Up" button → `update_order_status('in_transit')`
- Ensure neither screen skips a step

---

## Phase 4 — Polish & Hardening

### 4A — ETA Calculation
- `navigate-to-pickup.tsx` + `navigate-to-dropoff.tsx`: replace `Math.random()` ETA with `Math.ceil(order.distance_km / 30 * 60)` (30km/h urban average)

### 4B — `update_order_status` Authorization Check
**Migration:** `00032_authorize_order_status_update.sql`
- Add validation: `auth.uid()` must match `orders.customer_id` OR be the `profile_id` of the rider in `orders.rider_id`

### 4C — Realtime Reconnect Guard in `finding-rider.tsx`
- If subscription returns `CHANNEL_ERROR`, fall back to poll-only mode and show a subtle "Live updates unavailable" indicator

### 4D — Verify Counter-Offer Notification Deep Link
- Confirm `send_counter_offer` notification `data` payload includes `bid_id` so rider push notification can deep-link to `job-details` screen

### 4E — Supabase Dashboard Checks (Manual Verification)
1. Run `SELECT * FROM pg_indexes WHERE indexname = 'idx_bids_one_pending_per_rider'` — confirm it is an index, not a constraint
2. Check Realtime logs for `"joined multiple times"` warnings — ensure `removeChannel` is called in every `useEffect` cleanup
3. Check Storage `documents` bucket policies — confirm riders have INSERT access to `pod/` path

---

## Migration Sequence

| # | File | What It Fixes |
|---|---|---|
| 00025 | `fix_place_bid_conflict.sql` | Broken `ON CONFLICT` SQL → bids can now be inserted |
| 00026 | `accept_bid_rpc.sql` | Bid acceptance → order matched atomically |
| 00027 | `counter_bid_rpc.sql` | Counter-offer RPC + `parent_bid_id` column |
| 00028 | `complete_delivery_rpc.sql` | OTP verification + delivery finalization + earnings |
| 00029 | `fix_cash_order_debit.sql` | Cash orders no longer debit wallet |
| 00030 | `fix_rider_location_realtime.sql` | `rider_locations` table created; RLS + realtime |
| 00031 | `fix_realtime_rls_subqueries.sql` | Chat + order history realtime fixed |
| 00032 | `authorize_order_status_update.sql` | Status update RPC validates caller |

---

## Critical Files

| File | Phase | Change |
|---|---|---|
| `supabase/migrations/00025–00032` | 1 | All backend fixes |
| `store/auth.store.ts` | 2 | Add `riderId` field |
| `app/(rider)/navigate-to-pickup.tsx` | 2+3 | `riderId` fix + ETA calc |
| `app/(rider)/navigate-to-dropoff.tsx` | 2+3 | `riderId` fix + ETA calc |
| `app/(rider)/delivery-completion.tsx` | 2+3 | `riderId` fix + OTP fix + POD blob fix |
| `app/(rider)/waiting-for-customer.tsx` | 2 | Compare `riderId` not `profile.id` |
| `app/(rider)/job-details.tsx` | 2 | Pass `riderId` to `place_bid`; remove error swallowing |
| `app/(rider)/counter-offer.tsx` | 2 | Pass `riderId` to `place_bid` |
| `app/(rider)/trip-complete.tsx` | 3 | Wire rating to `ratings` table |
| `app/(customer)/counter-offer.tsx` | 3 | Replace raw inserts with `send_counter_offer` RPC |
| `app/(customer)/live-bidding.tsx` | 3 | `accept_bid` RPC + realtime INSERT fix + UPDATE filter |
| `app/(customer)/active-order-tracking.tsx` | 3 | Subscribe to `rider_locations`; polling fallback |
| `app/(customer)/finding-rider.tsx` | 3 | Race condition + dummy pin labels |
| `app/(customer)/delivery-success.tsx` | 3 | `deliveryTime` param + receipt navigation |
| `app/(rider)/confirm-arrival.tsx` | 3 | Status sequence fix |

---

## End-to-End Verification Checklist

- [ ] Wallet-funded order: wallet debits on creation
- [ ] Cash order: wallet NOT debited
- [ ] Rider places bid: bid row inserted in database (verify via SQL)
- [ ] Customer sees bid appear in real-time with correct rider name + avatar
- [ ] Customer sends counter-offer: rider receives push notification; counter amount shown
- [ ] Rider accepts customer counter: `waiting-for-customer` navigates away on match
- [ ] Customer accepts rider bid: both sides navigate to active tracking screens
- [ ] Rider location updates every 10s and customer map marker moves
- [ ] Rider "Arrived at pickup" sets `arrived_pickup` status, then "Picked up" sets `in_transit`
- [ ] Customer map + status bar reflects each status change without refresh
- [ ] Rider arrives at dropoff: OTP entry works, correct code accepted, wrong code rejected
- [ ] POD photo uploads successfully on Android and iOS
- [ ] `complete_delivery` RPC fires: rider wallet credited, commission recorded
- [ ] Customer sees `delivery-success` with correct final price and delivery duration
- [ ] Rider sees `trip-complete` with correct earnings breakdown
- [ ] Rider submits rating: row saved to `ratings` table
- [ ] Chat messages appear in real-time for both parties
- [ ] "View Digital Receipt" navigates to order-details screen