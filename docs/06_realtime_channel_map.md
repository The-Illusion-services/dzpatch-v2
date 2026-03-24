# DZpatch V2.0 — Realtime Channel Map

## Overview

Supabase Realtime uses PostgreSQL's `NOTIFY/LISTEN` via WebSocket channels.
Every active delivery spawns multiple subscriptions. This document defines
**every channel**, its naming convention, who subscribes, and cleanup rules.

---

## Channel Naming Convention

All channels follow: `{entity}:{id}:{stream}`

Examples:
- `order:abc123:status` — order status changes
- `order:abc123:location` — rider location during this order
- `order:abc123:chat` — chat messages for this order
- `order:abc123:bids` — incoming bids for this order

This makes channels deterministic, debuggable, and easy to clean up.

---

## Channel Definitions

### 1. Order Status Updates

| Field | Value |
|---|---|
| **Channel** | `order:{orderId}:status` |
| **Table** | `orders` |
| **Event** | `UPDATE` on `status` column |
| **Filter** | `id=eq.{orderId}` |
| **Subscribers** | Customer (order owner), Assigned Rider |
| **Subscribe when** | Customer: after order created. Rider: after bid accepted |
| **Unsubscribe when** | Order reaches `completed` or `cancelled` |
| **Payload used** | `status`, `rider_id`, `matched_at`, `delivered_at` |

**Client usage:**
```typescript
supabase.channel(`order:${orderId}:status`)
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'orders',
    filter: `id=eq.${orderId}`
  }, (payload) => {
    // Update local order state
  })
  .subscribe()
```

---

### 2. Rider Location (Live Tracking)

| Field | Value |
|---|---|
| **Channel** | `order:{orderId}:location` |
| **Table** | `rider_location_logs` |
| **Event** | `INSERT` |
| **Filter** | `order_id=eq.{orderId}` |
| **Subscribers** | Customer (tracking screen) |
| **Subscribe when** | Order status is `pickup_en_route`, `arrived_pickup`, `in_transit`, `arrived_dropoff` |
| **Unsubscribe when** | Order reaches `delivered`, `completed`, or `cancelled` |
| **Payload used** | `location` (lat/lng), `speed`, `heading`, `recorded_at` |

**Note:** High frequency — rider sends location every 5-10 seconds during active trip.
Consider throttling UI updates to every 2-3 seconds to avoid excessive re-renders.

---

### 3. Incoming Bids (Negotiation)

| Field | Value |
|---|---|
| **Channel** | `order:{orderId}:bids` |
| **Table** | `bids` |
| **Event** | `INSERT` and `UPDATE` |
| **Filter** | `order_id=eq.{orderId}` |
| **Subscribers** | Customer (finding-rider screen) |
| **Subscribe when** | Order created with status `pending` |
| **Unsubscribe when** | Order status changes from `pending` (bid accepted or expired) |
| **Payload used** | `id`, `rider_id`, `amount`, `status` |

**Customer sees:** "3 riders are bidding" → list of offers → accept one.

---

### 4. Bid Status (Rider's View)

| Field | Value |
|---|---|
| **Channel** | `bid:{bidId}:status` |
| **Table** | `bids` |
| **Event** | `UPDATE` |
| **Filter** | `id=eq.{bidId}` |
| **Subscribers** | Rider (awaiting-response screen) |
| **Subscribe when** | Rider places a bid |
| **Unsubscribe when** | Bid status changes to `accepted`, `rejected`, or `expired` |
| **Payload used** | `status` |

**Rider sees:** "Waiting for customer..." → accepted/rejected.

---

### 5. Chat Messages

| Field | Value |
|---|---|
| **Channel** | `order:{orderId}:chat` |
| **Table** | `chat_messages` |
| **Event** | `INSERT` |
| **Filter** | `order_id=eq.{orderId}` |
| **Subscribers** | Customer + Assigned Rider |
| **Subscribe when** | Order status is `matched` through `delivered` |
| **Unsubscribe when** | Order reaches `completed` or `cancelled` |
| **Payload used** | `id`, `sender_id`, `message`, `created_at` |

---

### 6. Notifications (Per-User)

| Field | Value |
|---|---|
| **Channel** | `user:{userId}:notifications` |
| **Table** | `notifications` |
| **Event** | `INSERT` |
| **Filter** | `user_id=eq.{userId}` |
| **Subscribers** | The user themselves (all roles) |
| **Subscribe when** | App launch (after auth) |
| **Unsubscribe when** | App logout or app killed |
| **Payload used** | `type`, `title`, `body`, `data` |

**This is the only "always-on" channel.** All others are scoped to active orders.

---

### 7. Rider Job Feed (Nearby Orders)

| Field | Value |
|---|---|
| **Channel** | `orders:pending` |
| **Table** | `orders` |
| **Event** | `INSERT` (new orders) and `UPDATE` (order taken/expired) |
| **Filter** | `status=eq.pending` |
| **Subscribers** | Online riders |
| **Subscribe when** | Rider goes online |
| **Unsubscribe when** | Rider goes offline or accepts an order |
| **Payload used** | `id`, `pickup_address`, `dynamic_price`, `suggested_price` |

**Note:** This broadcasts ALL pending orders. The client filters by distance
using the rider's local GPS. The `get_nearby_orders` RPC handles the initial
load; realtime handles new orders appearing while the rider is browsing.

---

### 8. Fleet Rider Status (Fleet Manager)

| Field | Value |
|---|---|
| **Channel** | `fleet:{fleetId}:riders` |
| **Table** | `riders` |
| **Event** | `UPDATE` on `is_online`, `current_location` |
| **Filter** | `fleet_id=eq.{fleetId}` |
| **Subscribers** | Fleet manager (live map screen) |
| **Subscribe when** | Fleet manager opens rider map |
| **Unsubscribe when** | Fleet manager leaves map screen |
| **Payload used** | `id`, `is_online`, `current_location` |

---

### 9. SOS Alerts (Admin)

| Field | Value |
|---|---|
| **Channel** | `admin:sos` |
| **Table** | `sos_alerts` |
| **Event** | `INSERT` |
| **Filter** | none (all SOS alerts) |
| **Subscribers** | Admin users |
| **Subscribe when** | Admin app launch |
| **Unsubscribe when** | Admin logout |
| **Payload used** | `id`, `user_id`, `order_id`, `location`, `created_at` |

---

## Lifecycle Rules

### Subscribe
- Create channel on screen mount or state transition
- Always check if channel already exists before creating (prevent duplicates)

### Unsubscribe
- Remove channel on screen unmount
- Remove channel when order reaches terminal state (`completed`, `cancelled`)
- Remove ALL order channels together (status + location + chat + bids)

### Cleanup Pattern
```typescript
// On order completion or cancellation:
const cleanupOrder = (orderId: string) => {
  supabase.removeChannel(supabase.channel(`order:${orderId}:status`))
  supabase.removeChannel(supabase.channel(`order:${orderId}:location`))
  supabase.removeChannel(supabase.channel(`order:${orderId}:chat`))
  supabase.removeChannel(supabase.channel(`order:${orderId}:bids`))
}
```

### Error Handling
- If a channel subscription fails, retry with exponential backoff (1s, 2s, 4s, max 30s)
- If disconnected, Supabase client auto-reconnects — channels resume automatically
- On app foreground (from background), verify all active channels are still connected

---

## Channel Count Per Scenario

| Scenario | Active Channels |
|---|---|
| Customer idle (no active order) | 1 (notifications) |
| Customer with active order | 4 (notifications + order status + location + chat) |
| Customer finding rider | 3 (notifications + order status + bids) |
| Rider idle (online, browsing) | 2 (notifications + pending orders feed) |
| Rider on active delivery | 4 (notifications + order status + chat + bid status) |
| Fleet manager on map | 2 (notifications + fleet riders) |
| Admin dashboard | 2 (notifications + SOS alerts) |

**Max channels per user at any time: 4** — this is well within Supabase limits.
