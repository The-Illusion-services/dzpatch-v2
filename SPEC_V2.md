# DZpatch: Comprehensive Feature Specification (V2.0)

---

## PHASE 1: The Core Engine (Skeleton & Stability)

**Objective:** A flawless, frictionless delivery loop. If these fail, the business fails.

---

### 1. Customer Application (Mobile)

#### 1.1 Authentication & Profile
- Phone number login via OTP
- Profile management (name, password, KYC ID upload)
- Saved addresses ("Home", "Work") with use-count tracking
- Account deletion and privacy settings

#### 1.2 Order Creation & Pricing
- Google Places autocomplete for pickup/dropoff
- Package details (category, size, notes)
- Dynamic distance-based pricing engine (base + per-km + VAT)
- Promo code input with real-time validation

#### 1.3 The Negotiation Engine ⚠️ High Risk
- Customer inputs "Suggested Price" or accepts dynamic price
- System broadcasts order to nearby riders
- Real-time UI showing incoming counter-offers
- Accept, Reject, or Timeout states
- Timeout auto-cancels the broadcast after configurable window

#### 1.4 Active Tracking & Communication
- Real-time "Finding Rider" matchmaking screen
- Live map view of rider location (Supabase Realtime / WebSocket)
- Order status progression: `pending → matched → pickup_en_route → arrived_pickup → in_transit → arrived_dropoff → delivered → cancelled`
- In-app chat with assigned rider
- Push notifications at every major status transition

#### 1.5 Payments & Wallet
- Integrated digital wallet (Paystack funding via card/bank transfer)
- Wallet balance and transaction history
- Fund withdrawal to external bank account
- Secure order creation: wallet balance validated atomically before order is placed

#### 1.6 Delivery Completion
- Delivery code verification (OTP provided to rider at handoff)
- Post-delivery rating (1–5 stars) with optional review text

#### 1.7 Order Management
- Filterable list of past and active orders with search
- Individual order detail view (timeline, map, receipt)
- Cancel order with reason selection (before rider pickup only; penalties apply after)

#### 1.8 Notifications
- Push notifications for: order accepted, rider en route, rider arrived, delivery complete, promo/marketing
- In-app notification center with read/unread state

---

### 2. Rider Application (Mobile)

#### 2.1 Authentication & Onboarding (Strict)
- Multi-step signup: Personal info → Phone OTP → Vehicle info → Document uploads (license, insurance, plate photo)
- Fleet selection: independent rider OR join fleet via code
- Bank account linking for payouts
- Admin approval gate: rider cannot go online until documents are verified

#### 2.2 Job Feed & Bidding (Negotiation Receiver)
- Map view of nearby pending orders
- Receive broadcasted offers with distance/duration estimates
- Bidding system: Accept at listed price, Decline, or Counter-offer
- "Awaiting Response" state while customer reviews counter-offer

#### 2.3 Delivery Flow State Machine (Multi-Step Wizard)
- **Step 1:** Navigate to pickup (map routing)
- **Step 2:** Confirm arrival at pickup (auto-geofence detection OR manual override with "Force Arrival" option)
- **Step 3:** Navigate to dropoff (map routing)
- **Step 4:** Delivery completion requires BOTH:
  - OTP verification (delivery code from customer)
  - Photo Proof of Delivery (POD) capture

#### 2.4 Tracking & State Management
- Online/Offline toggle
- Continuous background GPS tracking during active trips
- **Critical:** Offline queue for location and status updates — syncs with server timestamps on reconnection
- Arrival detection via geofence radius

#### 2.5 Earnings & Financial Controls
- Real-time earnings tracking and trip history
- Wallet balance and withdrawal initiation
- Commission deduction visibility (rider sees gross → commission → net)
- **Commission-Lock System:** Automated block preventing order acceptance when rider owes platform beyond bad-debt threshold (with grace period)

#### 2.6 Order Cancellation
- Cancel before pickup with reason selection
- Cancellation penalties tracked (repeated cancellations flag the account)

#### 2.7 Safety & Communication
- Emergency SOS alert (one-tap distress trigger to Admin)
- In-app chat with customer during active delivery
- Push notifications for new offers, order updates, payment confirmations

---

### 3. Payments & Wallet (Shared Infrastructure)

> This is not a separate app — it's the financial backbone shared by all roles.

- **Wallet per role:** Customer, Rider, and Fleet each have independent wallets
- **Funding:** Paystack integration (card, bank transfer)
- **Withdrawals:** Bank payout requests with KYC verification
- **Transaction types:** credit, debit, commission_credit, commission_debit, withdrawal, refund, adjustment
- **Idempotent payment processing:** Paystack webhook handling with reference deduplication to prevent double-credits
- **Atomic operations:** All wallet mutations use database-level transactions (no application-level balance checks)

---

## PHASE 2: The Expansion Layer (B2B & Operations)

**Objective:** Scaling operations, platform governance, and fleet-based logistics.

---

### 4. Fleet Management Application (Web/Mobile)

#### 4.1 Fleet Onboarding
- Fleet profile setup (name, logo, banking details)
- Fleet code generation for rider invitations
- Join model: Riders join via code; fleet manager can remove riders (no pre-approval gate)

#### 4.2 Live Oversight
- Live map tracking all online fleet riders
- Rider directory with status indicators (online/offline, vehicle type, rating, trips completed)
- Per-rider detail view with earnings breakdown

#### 4.3 Financial Management
- Consolidated fleet wallet balance
- Weekly earnings summary
- Configurable commission structure:
  - Percentage split (e.g., fleet takes 10% of rider earnings)
  - Flat rate per delivery
- Fleet-level withdrawal management

#### 4.4 Communication
- 1-on-1 messaging with individual riders
- Fleet-wide broadcast messages

#### 4.5 Settings & Configuration
- Commission rate management
- Rider pay structure configuration
- Payout schedule
- Notification preferences

---

### 5. Admin Dashboard (Web)

#### 5.1 Global Overview
- Real-time metrics: active users, active deliveries, daily revenue
- Pending counts: verifications, withdrawals, support tickets

#### 5.2 Verification & Compliance
- KYC document approval queue (Rider + Fleet)
- User management directory (view, ban, suspend, flag)

#### 5.3 Financial Control & Resolution
- Withdrawal processing queue (Approve / Reject)
- Dispute resolution center (view chat logs, GPS history, POD photos)
- Refund management

#### 5.4 Platform Configuration
- Service area management (enable/disable cities)
- Delivery categories and package types
- Dynamic pricing rules (base rate, per-km rate, surge multiplier)
- Commission rate configuration (platform-level)
- Promo code creation and campaign management

#### 5.5 Safety & Monitoring
- SOS / Emergency alert monitoring center
- Simple admin action log (who did what, when) — not a full audit system

---

## PHASE 3: Advanced Growth & Edge

**Objective:** User acquisition, advanced integrations, and operational intelligence. Do not build until Phase 1 + 2 are stable.

| Feature | Complexity | Notes |
|---|---|---|
| Referral Program | Low | Invite friends, earn credits. Consider pulling into late Phase 2. |
| Business Insights | Medium | Analytics dashboard for high-volume customer accounts |
| Direct Merchant Booking | High | "Pay & Ship" magic links for social media vendors |
| Virtual Accounts | High | Dedicated bank accounts for instant wallet top-ups (provider-dependent) |
| Automated Fraud Detection | High | Ghost ride detection, anomalous GPS patterns |
| Scheduled Deliveries | Medium | Book deliveries for a future time slot |
| Multi-stop Deliveries | High | Single order with multiple dropoff points |

---

## ARCHITECTURAL BOTTLENECKS (The Danger Zones)

These are the areas most likely to cause production incidents. Each needs dedicated design attention.

### 1. The Delivery State Machine
The rider's 4-step wizard combined with the customer's negotiation UI creates massive state overlap. The order status must be the **single source of truth** in the database, with all clients reacting to state changes — never driving them independently.

### 2. Offline Synchronization
Storing GPS and status updates locally when a rider loses connectivity, then reconciling with server timestamps on reconnection. Requires:
- Monotonic sequence numbering on queued events
- Server-side deduplication
- "Last write wins" with timestamp comparison for status updates

### 3. Financial Concurrency
Wallet top-ups, commission deductions, pricing calculations, and withdrawals happening simultaneously. Requires:
- All wallet mutations via database RPCs with `SELECT ... FOR UPDATE` row locking
- No application-level balance reads before writes
- Idempotent Paystack webhook processing with reference-based deduplication

### 4. Real-time Channel Lifecycle
Each active delivery spawns multiple realtime subscriptions (rider location, order status, chat). At scale:
- Channels must be deterministically named (e.g., `order:{id}:location`)
- Subscriptions must be cleaned up on delivery completion or app backgrounding
- Stale channels cause memory leaks and phantom updates

### 5. Payment Webhook Reliability
Paystack webhooks can fail, retry, or arrive out of order. The system must:
- Process each payment reference exactly once (idempotency key)
- Handle webhooks arriving before or after the client-side redirect
- Reconcile pending payments on app launch
