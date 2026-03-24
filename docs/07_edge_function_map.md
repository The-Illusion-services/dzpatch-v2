# DZpatch V2.0 — Edge Function Map

## Overview

Edge Functions run server-side on Supabase (Deno). They handle operations
that **cannot** be done client-side:

1. **Third-party API calls** (Paystack, push notifications) — secrets stay server-side
2. **Scheduled jobs** (expire stale orders, expire bids)
3. **Webhook receivers** (Paystack payment confirmations)
4. **Complex orchestration** (multi-step operations that need retries)

Most business logic lives in **RPCs** (00002). Edge Functions are the glue
between the outside world and the database.

---

## Function Map

### 1. `payment/webhook` — Paystack Webhook Handler

| Field | Value |
|---|---|
| **Trigger** | HTTP POST from Paystack |
| **Path** | `/functions/v1/payment-webhook` |
| **Auth** | Paystack signature verification (X-Paystack-Signature header) |
| **Purpose** | Process payment confirmations, credit customer wallets |

**Flow:**
1. Verify Paystack webhook signature using secret key
2. Extract `event` type and `data.reference`
3. If `charge.success`:
   - Look up pending payment by reference
   - Call `credit_wallet()` RPC with the reference (idempotent)
   - Return 200
4. If duplicate reference → `credit_wallet` returns existing transaction (no double-credit)
5. Return 200 for all events (Paystack retries on non-200)

**Secrets needed:** `PAYSTACK_SECRET_KEY`

---

### 2. `payment/initialize` — Initialize Paystack Transaction

| Field | Value |
|---|---|
| **Trigger** | Client calls this before opening Paystack checkout |
| **Path** | `/functions/v1/payment-initialize` |
| **Auth** | Supabase JWT (authenticated user) |
| **Purpose** | Create Paystack transaction server-side, return authorization URL |

**Flow:**
1. Validate JWT, get user ID
2. Receive `amount` and `email` from request body
3. Generate unique reference: `FUND-{uuid}`
4. Call Paystack Initialize Transaction API
5. Return `{ authorization_url, reference }` to client
6. Client opens WebView with authorization_url
7. On completion, Paystack webhook (Function #1) handles the credit

**Why server-side:** Paystack secret key must never be in the client app.

**Secrets needed:** `PAYSTACK_SECRET_KEY`

---

### 3. `payment/transfer` — Process Withdrawal (Admin-triggered)

| Field | Value |
|---|---|
| **Trigger** | Admin approves a withdrawal request |
| **Path** | `/functions/v1/payment-transfer` |
| **Auth** | Supabase JWT (admin role verified) |
| **Purpose** | Initiate bank transfer via Paystack |

**Flow:**
1. Validate JWT, verify admin role
2. Receive `withdrawal_id` from request body
3. Fetch withdrawal record (amount, bank details, recipient code)
4. If no Paystack recipient code → create transfer recipient first
5. Initiate Paystack transfer
6. Update withdrawal record with `paystack_transfer_code`
7. Update withdrawal status to `processing`
8. Paystack sends `transfer.success` / `transfer.failed` webhook → handled by Function #1

**Secrets needed:** `PAYSTACK_SECRET_KEY`

---

### 4. `notifications/push` — Send Push Notification

| Field | Value |
|---|---|
| **Trigger** | Database trigger on `notifications` table INSERT |
| **Path** | `/functions/v1/notifications-push` |
| **Auth** | Internal (database webhook) |
| **Purpose** | Send Expo push notification when a notification record is created |

**Flow:**
1. Receive notification record from database webhook
2. Fetch user's `push_token` from `profiles`
3. If token exists, send via Expo Push API:
   ```json
   {
     "to": "ExponentPushToken[xxx]",
     "title": "Rider En Route",
     "body": "Your rider is heading to pickup",
     "data": { "order_id": "abc123" }
   }
   ```
4. Update `notifications.is_pushed = true`
5. If token invalid (DeviceNotRegistered), clear the push_token from profiles

**Secrets needed:** None (Expo push is free, no API key needed for basic usage)

**Database webhook setup:**
```sql
-- In Supabase Dashboard → Database → Webhooks
-- Table: notifications
-- Events: INSERT
-- URL: {SUPABASE_URL}/functions/v1/notifications-push
-- Headers: Authorization: Bearer {SERVICE_ROLE_KEY}
```

---

### 5. `orders/expire` — Expire Stale Orders & Bids

| Field | Value |
|---|---|
| **Trigger** | Cron schedule (every 1 minute) |
| **Path** | `/functions/v1/orders-expire` |
| **Auth** | Internal (cron) |
| **Purpose** | Cancel orders past their `expires_at` and expire stale bids |

**Flow:**
1. Find orders where `status = 'pending'` AND `expires_at < NOW()`
2. For each: call `cancel_order()` RPC with `cancelled_by = 'system'`
3. Find bids where `status = 'pending'` AND `expires_at < NOW()`
4. Update to `status = 'expired'`
5. Log count of expired orders and bids

**Cron setup:**
```sql
-- In Supabase Dashboard → Database → Extensions → pg_cron
SELECT cron.schedule(
  'expire-stale-orders',
  '* * * * *',  -- every minute
  $$SELECT net.http_post(
    url := 'https://{PROJECT_REF}.supabase.co/functions/v1/orders-expire',
    headers := '{"Authorization": "Bearer {SERVICE_ROLE_KEY}"}'::jsonb
  );$$
);
```

**Alternative:** Use pg_cron directly with SQL instead of an Edge Function:
```sql
SELECT cron.schedule(
  'expire-stale-orders',
  '* * * * *',
  $$
    UPDATE orders SET status = 'cancelled', cancelled_at = NOW()
    WHERE status = 'pending' AND expires_at < NOW();

    UPDATE bids SET status = 'expired'
    WHERE status = 'pending' AND expires_at < NOW();
  $$
);
```
The direct SQL approach is simpler and avoids the HTTP round-trip.
We'll use this unless we need to add refund logic to expiration.

---

### 6. `orders/delivery-code` — Regenerate Delivery Code

| Field | Value |
|---|---|
| **Trigger** | Customer requests new delivery code (lost/forgotten) |
| **Path** | `/functions/v1/orders-delivery-code` |
| **Auth** | Supabase JWT (order owner) |
| **Purpose** | Generate new 6-digit OTP for an active order |

**Flow:**
1. Validate JWT, get user ID
2. Receive `order_id` from request body
3. Verify user is the order's customer
4. Verify order is in active state (`in_transit`, `arrived_dropoff`)
5. Generate new 6-digit code
6. Update `orders.delivery_code`, reset `delivery_code_verified = false`
7. Return new code to customer
8. Send push notification to customer with new code

**Why Edge Function instead of RPC:** Could be an RPC. Edge Function allows
rate limiting (max 3 regenerations per order) without a DB column.

---

## Function Summary

| # | Function | Trigger | External API | Secrets |
|---|---|---|---|---|
| 1 | `payment/webhook` | Paystack POST | None (receiver) | `PAYSTACK_SECRET_KEY` |
| 2 | `payment/initialize` | Client request | Paystack API | `PAYSTACK_SECRET_KEY` |
| 3 | `payment/transfer` | Admin action | Paystack API | `PAYSTACK_SECRET_KEY` |
| 4 | `notifications/push` | DB webhook | Expo Push API | None |
| 5 | `orders/expire` | Cron (1 min) | None | None |
| 6 | `orders/delivery-code` | Client request | None | None |

---

## Secrets Management

Store in Supabase Dashboard → Edge Functions → Secrets:

| Secret | Used By |
|---|---|
| `PAYSTACK_SECRET_KEY` | Functions 1, 2, 3 |
| `PAYSTACK_PUBLIC_KEY` | Client-side only (in .env, not a secret) |

---

## Deployment Order

1. **`payment/webhook`** — needed before any payment testing
2. **`payment/initialize`** — needed for wallet funding flow
3. **`notifications/push`** — needed once we have push tokens
4. **`orders/expire`** — needed once orders are being created
5. **`payment/transfer`** — needed for withdrawal processing
6. **`orders/delivery-code`** — nice-to-have, not blocking

---

## What Stays as RPCs (NOT Edge Functions)

These are already handled by database RPCs and do NOT need Edge Functions:

| Operation | Why RPC is sufficient |
|---|---|
| `create_order` | Pure DB logic (pricing, wallet debit, insert) |
| `place_bid` / `accept_bid` | Pure DB logic (validation, wallet adjustment) |
| `update_order_status` | Pure DB logic (state machine, notifications insert) |
| `complete_delivery` | Pure DB logic (commission distribution, stats update) |
| `cancel_order` | Pure DB logic (refund, penalty, status change) |
| `rate_rider` | Pure DB logic (insert rating, update average) |
| `toggle_rider_online` | Pure DB logic (update flag + location) |
| `update_rider_location` | Pure DB logic (update + log insert) |
| `get_nearby_orders` | Pure DB logic (PostGIS spatial query) |
| `trigger_sos` | Pure DB logic (insert alert + admin notifications) |

**Rule of thumb:** If it touches only the database → RPC. If it calls an external API or needs a secret → Edge Function.
