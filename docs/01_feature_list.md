DZpatch: Comprehensive Feature Specification (V2.0)
PHASE 1: The Core Engine (Skeleton & Stability)
Objective: A flawless, frictionless delivery loop. If these fail, the business fails.
1. Customer Application (Mobile)
Authentication & Profile: Phone number login via OTP. Profile management (name, password, KYC ID upload). Saved addresses.
Order Creation & Pricing: Google Places autocomplete. Dynamic distance-based pricing engine (base + per-km + VAT). Promo code input with real-time validation.
The Negotiation Engine ⚠️ (High Risk): Customer inputs "Suggested Price". System broadcasts to nearby riders. Real-time UI for incoming counter-offers. Accept/Reject/Timeout states.
Active Tracking & Communication: Live map view of rider location (Supabase Realtime). Order status progression (pending → matched → pickup_en_route → arrived_pickup → in_transit → arrived_dropoff → delivered → cancelled). In-app chat.
Notifications: Push notifications for major status transitions (matched, arriving, delivered).
Payments & Wallet (Atomic): Integrated digital wallet (Paystack). Wallet balance validated atomically before order placement.
Delivery Completion: OTP delivery code verification at handoff. Post-delivery rating/review.
Order Management: Order history. Cancel order flow (with pre-pickup vs. post-pickup penalty logic).
2. Rider Application (Mobile)
Authentication & Onboarding (Strict): Multi-step signup. Document uploads (license, insurance). Admin approval gate: Cannot go online until verified. Bank account linking.
Job Feed & Bidding: Map view of nearby orders. Receive broadcasted offers. Bidding system (Accept, Decline, Counter-offer).
Delivery Flow State Machine:
Step 1: Navigate to pickup.
Step 2: Confirm arrival (Auto-geofence OR manual override).
Step 3: Navigate to dropoff.
Step 4: Delivery completion requires BOTH OTP verification AND Photo Proof of Delivery (POD).
Tracking & State Management: Online/Offline toggle. Continuous background GPS. Offline queue for location/status updates (syncs on reconnection).
Earnings & Financial Controls: Real-time earnings. Commission-Lock System (blocks orders if cash debt exceeds threshold).
Safety: Emergency SOS alert. In-app chat with customer.
3. Payments & Wallet (Shared Infrastructure)
Architecture: Independent wallets for Customer, Rider, and Fleet.
Funding & Withdrawals: Paystack integration. Bank payout requests.
Idempotent Processing: Paystack webhook handling with strict reference deduplication to prevent double-credits.
Atomic Operations: All wallet mutations use database-level transactions with row locking. No application-level reads before writes.
PHASE 2: The Expansion Layer (B2B & Operations)
Objective: Scaling operations, platform governance, and fleet logistics.
4. Fleet Management Application (Web/Mobile)
Fleet Onboarding: Profile setup. Fleet code generation for rider invitations. (Open join via code, manager can remove).
Live Oversight: Live map tracking fleet riders. Rider directory (online status, rating).
Financial Management: Consolidated fleet wallet. Configurable commission structure (Percentage vs. Flat rate). Fleet-level withdrawals.
5. Admin Dashboard (Web)
Overview & Compliance: Real-time metrics. KYC document approval queue (Rider + Fleet). User management (ban, suspend).
Financial Control: Withdrawal processing. Dispute resolution (chat logs, GPS history, POD photos). Refund management.
Platform Configuration: Service area management (cities). Dynamic pricing rules. Commission rates. Promo campaigns.
Monitoring: SOS alert center. Admin action log.
PHASE 3: Advanced Growth & Edge
Objective: Postpone until V1 and V2 are stable and generating revenue.
Referral Program: (Strictly Phase 3 due to high risk of wallet fraud).
Automated Fraud Detection: Ghost ride detection, anomalous GPS patterns.
Business Insights: Analytics dashboard for B2B customers.
Direct Merchant Booking: "Pay & Ship" magic links.
Virtual Accounts: Dedicated bank accounts for instant top-ups.

