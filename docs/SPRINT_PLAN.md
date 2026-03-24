# DZpatch V2.0 — Phase & Sprint Plan
# THE NORTH STAR

## Overview

- **3 Phases**, **12 Sprints**
- Each sprint = ~1 week of focused work
- Phase 1 = MVP (customer + rider complete a delivery end-to-end)
- Phase 2 = Operations (fleet management + admin dashboard)
- Phase 3 = Growth (referrals, analytics, merchant features)

**Rule:** Nothing ships until the sprint before it is stable.

**Design Rule:** Every sprint lists the screens needed.
You design them, hand them over, we build them. No design = no build.

---

## PHASE 1: Core Delivery Loop (Sprints 0–7)

> Goal: A customer can create an order, a rider can accept and deliver it,
> money moves correctly, and both sides can track it in real time.

---

### Sprint 0: Foundation
**Status: COMPLETE ✓**

- [x] Feature Spec (SPEC_V2.md)
- [x] Database Schema — 26 tables (00001_core_schema.sql) — APPLIED
- [x] RPC Functions — 15 RPCs (00002_rpc_functions.sql) — APPLIED
- [x] RLS Policies — 70+ policies (00003_rls_policies.sql) — APPLIED
- [x] Realtime Channel Map (docs/06_realtime_channel_map.md)
- [x] Edge Function Map (docs/07_edge_function_map.md)
- [x] Sprint Plan (this document)
- [x] Customer app UI/UX designs (39 screens) — IN HAND

---

### Sprint 1: Project Setup + Design System + Customer Auth
**Status: COMPLETE ✓**

#### Design needed (ALREADY IN HAND ✓):
| Screen Name | File |
|---|---|
| Splash screen | updated_splash_screen_dzpatch |
| Onboarding 1 — Fast Delivery | onboarding_fast_delivery_minimal |
| Onboarding 2 — Real-Time Tracking | onboarding_real_time_tracking_minimal |
| Onboarding 3 — Secure Payments | onboarding_secure_payments_minimal |
| Login / Sign Up | login_sign_up_refined_elegance |
| OTP Verification | otp_verification_minimal_elegance |
| Forgot Password | forgot_password_minimal_elegance |
| Reset Password | reset_password_minimal_elegance |
| Reset Success | reset_success_minimal_elegance |

#### Build tasks:
- [x] Install core dependencies (supabase-js, zustand, expo-secure-store, expo-image)
- [x] Supabase client config (lib/supabase.ts)
- [x] Environment variables (.env — SUPABASE_URL, SUPABASE_ANON_KEY)
- [x] TypeScript types generated from Supabase schema (types/database.ts)
- [x] Clean out Expo boilerplate
- [x] Theme constants — colors, typography, spacing, shadows (constants/theme.ts)
- [x] Base components:
  - Button (primary, secondary, outline, ghost)
  - Input (text, phone, password, with labels + errors)
  - Card (elevated, flat)
  - Avatar
  - Badge / StatusBadge
  - Toast / notification overlay
  - Skeleton loader
- [x] Splash screen
- [x] Onboarding carousel (3 screens)
- [x] Login / Sign Up screen
- [x] OTP Verification screen
- [x] Forgot Password screen
- [x] Reset Password screen
- [x] Reset Success screen
- [x] Supabase Auth — phone OTP (signInWithOtp)
- [x] Auth store (Zustand) — session, user, profile, role, loading
- [x] Expo Router layout: (auth)/ group, root layout with role-based redirect
- [x] Role-based routing: after login → detect role → correct app
- [x] Auto-redirect: authenticated → home, unauthenticated → onboarding
- [x] handle_new_user trigger verified + fixed (00004_fix_handle_new_user.sql)

---

### Sprint 2: Customer Home + Order Creation
**Status: COMPLETE ✓**

#### Design needed (ALREADY IN HAND ✓):
| Screen Name | File |
|---|---|
| Home | home_refined_elegance_v3 |
| Create Order | create_order_unified_form |
| Saved Addresses | saved_addresses |
| Add New Address | add_new_address |

#### Build tasks:
- [x] Home screen (greeting, active delivery card, "Send a Package" CTA)
- [x] Bottom tab bar (Home, Deliveries, Wallet, Profile)
- [x] Deliveries tab screen (filter by All/Active/Completed/Cancelled)
- [x] Wallet tab screen (balance card, transaction list)
- [x] Profile tab screen (menu, sign out, KYC badge)
- [x] Create Order form:
  - Pickup + dropoff address inputs (Google Places ready — key needed)
  - Recipient name + phone
  - Package category selector (loads from DB, fallback to 4 defaults)
  - Size selector (Small, Medium, Large) with multiplier pricing
  - Delivery code toggle
  - Promo code input + Apply button (validates against promo_codes table)
  - Live price breakdown (delivery fee + service tax + total)
  - "Find Rider" CTA → calls create_order RPC
- [x] Order Tracking screen (real-time status timeline, rider card, cancel)
- [x] Saved Addresses screen (list, edit, delete, set default)
- [x] Add New Address screen (label selector, default toggle)
- [x] Pricing preview (pricing_rules query before order creation)
- [x] Promo code validation (promo_codes query)
- [x] Saved addresses CRUD
- [x] Supabase Realtime subscription on order status updates

**Note:** Google Places lat/lng coords use Lagos default until `EXPO_PUBLIC_GOOGLE_PLACES_KEY` is configured.
**New dependency:** react-native-google-places-autocomplete (installed)

> 📋 **Phase 1 Test Checkpoint** — After Sprint 2:
> Run `npm test` to confirm all Phase 1 sprint 1+2 tests pass before proceeding.
> Tests: `__tests__/phase1/sprint1/` + `__tests__/phase1/sprint2/`
> Current coverage: 95 tests, 6 suites — all passing.

---

### Sprint 3: Negotiation Engine + Finding Rider
**Status: COMPLETE ✓**

**Goal:** After order creation, customer sees bids in real time and accepts one.

#### Design needed (ALREADY IN HAND ✓):
| Screen Name | File |
|---|---|
| Finding Rider | finding_rider |
| Live Bidding Pool | live_bidding_pool |
| Counter Offer Modal | counter_offer_modal |
| Waiting for Response | waiting_for_response |

#### Build tasks:
- [x] Finding Rider screen (pulse radar animation, order summary, countdown, cancel)
- [x] Live Bidding Pool screen:
  - "LIVE" animated ping indicator
  - Countdown timer (order.expires_at)
  - Rider bid cards (avatar, name, rating, trips, vehicle, amount)
  - "Best Value" badge on lowest bid
  - Accept / Negotiate actions per bid
  - Live activity feed (real-time updates)
  - Realtime: bids INSERT + UPDATE subscriptions
- [x] Counter Offer modal (bottom sheet, comparison row, 20% min rule, validation)
- [x] Waiting for Response screen (hourglass spin, shimmer bar, offer timeline, cancel & search again)
- [x] Realtime: `order:{id}:bids` subscription (new bids → bidding pool)
- [x] Realtime: `order:{id}:status` subscription (matched → tracking)
- [x] create_order RPC → finding-rider navigation wired
- [x] accept_bid RPC call
- [x] Bid counter-offer via bids table (parent_bid_id pattern)
- [x] Countdown timer UI on both finding-rider and live-bidding screens

> 📋 **Phase 1 Test Checkpoint** — After Sprint 3:
> Run `npm test` to confirm all Phase 1 sprint 1–3 tests pass.
> Current coverage: 122 tests, 7 suites — all passing.

---

### Sprint 4: Live Tracking + Chat + Delivery Completion
**Goal:** Customer tracks rider live, chats, receives delivery, rates rider.

#### Design needed (ALREADY IN HAND ✓):
| Screen Name | File |
|---|---|
| Active Order Tracking | active_order_tracking |
| In-App Chat | in_app_chat_floating_header |
| Cancel Order Modal | cancel_order_modal |
| Booking Success | booking_success |
| Delivery Success | delivery_success |
| Driver Rating & Review | driver_rating_review |

#### Build tasks:
- [ ] Active Order Tracking screen:
  - Live map with rider pin
  - Estimated arrival time
  - Status progress bar
  - Rider info card (name, rating, vehicle)
  - Share Tracking button
  - Cancel Order button
- [ ] In-App Chat screen (floating header, message bubbles, text input)
- [ ] Cancel Order modal (reason selection, penalty warning)
- [ ] Booking Success screen
- [ ] Delivery Success screen
- [ ] Driver Rating & Review screen (1-5 stars, optional review)
- [ ] Realtime: `order:{id}:location` (rider GPS → map pin)
- [ ] Realtime: `order:{id}:chat` (messages)
- [ ] Realtime: `order:{id}:status` (status bar progression)
- [ ] cancel_order RPC
- [ ] rate_rider RPC
- [ ] Delivery code display (customer shows to rider)

**New dependency:** react-native-maps (or expo-maps)

---

### Sprint 5: Wallet + Payments
**Goal:** Customer can fund wallet, view transactions, withdraw.

#### Design needed (ALREADY IN HAND ✓):
| Screen Name | File |
|---|---|
| Wallet | wallet_system |
| Fund Wallet | fund_wallet |
| Withdraw Funds | withdraw_funds |

#### Build tasks:
- [ ] Wallet screen (balance card, Fund/Withdraw buttons, transaction list)
- [ ] Transaction list (filterable: All, Income, Spending)
- [ ] Fund Wallet screen (amount input, Paystack checkout)
- [ ] Withdraw Funds screen (amount, bank selector, confirm)
- [ ] Edge Function: payment/initialize (Paystack transaction init)
- [ ] Paystack WebView checkout
- [ ] Edge Function: payment/webhook (Paystack webhook receiver)
- [ ] request_withdrawal RPC
- [ ] Wallet balance + transactions query

**New dependency:** react-native-webview

---

### Sprint 6: Order History + Profile + Notifications
**Goal:** Customer can view past orders, manage profile, see notifications.

#### Design needed (ALREADY IN HAND ✓):
| Screen Name | File |
|---|---|
| Order History | order_history_list_view |
| Order Details | order_details_view |
| Profile & Settings | profile_settings |
| Notifications | notifications |
| Global UI Overlays | global_ui_overlays_notifications_context |

#### Build tasks:
- [ ] Order History screen (filterable list: Active, Completed, Cancelled)
- [ ] Order Details screen (timeline, map, receipt, rider info)
- [ ] Profile & Settings screen (avatar, edit, password, notifications, privacy, logout, delete)
- [ ] Notifications screen (read/unread list, tap to navigate)
- [ ] Global overlays (toast, in-app notification banners)
- [ ] Orders query with filters + search
- [ ] Profile update
- [ ] Notifications query + mark as read
- [ ] Realtime: `user:{id}:notifications`
- [ ] Expo push token registration → profiles.push_token
- [ ] Edge Function: notifications/push

**New dependency:** expo-notifications

---

### Sprint 7: Rider App (Complete)
**Goal:** Rider can sign up, go online, receive orders, bid, deliver, earn.

> ⚠️ DESIGN CHECKPOINT: Rider app UI designs must be ready before this sprint starts.
> Use the screen list below to create designs. Same design language as customer app.

#### Design needed (TO BE CREATED before Sprint 7):
| Screen Name | Description |
|---|---|
| **Auth & Onboarding** | |
| rider_splash | Rider-specific splash/welcome screen |
| rider_onboarding | Brief onboarding (2-3 screens: earn money, flexible hours, join fleet) |
| rider_signup_personal | Step 1: Full name, email, phone |
| rider_signup_otp | OTP verification |
| rider_signup_vehicle | Step 2: Vehicle type, make, model, year, plate, color |
| rider_signup_documents | Step 3: Upload license, insurance, plate photo |
| rider_signup_fleet | Step 4: Join fleet via code (optional) or go independent |
| rider_signup_bank | Step 5: Bank account details |
| rider_signup_review | Review all info before submitting |
| rider_pending_approval | "Under Review" waiting screen (admin gate) |
| **Home & Job Feed** | |
| rider_home | Map view, online/offline toggle, nearby order pins |
| rider_order_card | Order preview card (distance, price, package type, pickup area) |
| rider_order_detail | Full order detail before accepting/bidding |
| **Bidding Flow** | |
| rider_bid_input | Enter counter-offer amount |
| rider_awaiting_response | "Waiting for customer response" screen |
| rider_bid_rejected | Bid was rejected screen |
| **Delivery Flow** | |
| rider_navigate_pickup | Step 1: Map navigation to pickup |
| rider_confirm_arrival_pickup | Step 2: Arrival confirmation (geofence auto or manual button) |
| rider_navigate_dropoff | Step 3: Map navigation to dropoff |
| rider_delivery_completion | Step 4: Enter delivery code + capture POD photo |
| rider_trip_complete | Delivery complete, earnings shown |
| **Earnings & Wallet** | |
| rider_earnings | Trips count, gross earnings, commission, net — weekly/monthly |
| rider_wallet | Balance, Fund/Withdraw buttons, transaction list |
| rider_withdraw | Withdrawal request form |
| **Profile & Settings** | |
| rider_profile | Name, rating, vehicle, online stats |
| rider_settings_vehicle | Edit vehicle info |
| rider_settings_documents | View/reupload documents |
| rider_settings_bank | Edit bank account |
| rider_settings_security | Change password |
| rider_commission_locked | Locked screen with debt amount + how to unlock |
| rider_sos | SOS confirmation modal (before trigger) |
| rider_chat | In-app chat with customer (same style as customer chat) |

#### Build tasks:
**7a. Auth & Onboarding**
- [ ] Rider splash + onboarding screens
- [ ] Multi-step signup (personal → OTP → vehicle → documents → fleet → bank → review)
- [ ] Document upload to Supabase Storage
- [ ] Admin approval gate ("Pending Verification" screen with status polling)
- [ ] Bank account setup (rider_bank_accounts table)

**7b. Home + Job Feed**
- [ ] Home screen with map + online/offline toggle
- [ ] Nearby orders displayed as map pins + list
- [ ] get_nearby_orders RPC call
- [ ] Realtime: `orders:pending` subscription
- [ ] toggle_rider_online RPC

**7c. Bidding Flow**
- [ ] Order detail screen (full info before bidding)
- [ ] Accept at listed price
- [ ] Counter-offer input
- [ ] Awaiting response screen
- [ ] Realtime: `bid:{id}:status` subscription

**7d. Delivery Flow**
- [ ] Step 1: Navigate to pickup (map routing)
- [ ] Step 2: Arrival confirmation (geofence or manual override)
- [ ] Step 3: Navigate to dropoff (map routing)
- [ ] Step 4: Delivery code entry + POD photo capture
- [ ] Trip complete screen (earnings breakdown)
- [ ] update_order_status RPC (each step)
- [ ] verify_delivery_code RPC
- [ ] complete_delivery RPC
- [ ] Background GPS: update_rider_location RPC (every 5-10s)
- [ ] Offline queue for location updates (sync on reconnect)

**7e. Earnings + Wallet**
- [ ] Earnings summary screen (reuse wallet components from Sprint 5)
- [ ] Wallet screen
- [ ] Withdrawal request

**7f. Profile + Settings + Safety**
- [ ] Vehicle, document, bank account management
- [ ] Commission-lock screen
- [ ] SOS button (trigger_sos RPC)
- [ ] In-app chat (same component as customer, Sprint 4)

**New dependencies:** expo-location, expo-camera, expo-image-picker

---

## PHASE 1 MILESTONE: End-to-End Delivery

After Sprint 7, this flow works completely:
```
Customer funds wallet → Creates order → Riders see it on map →
Rider bids → Customer accepts → Rider navigates to pickup →
Rider arrives → Rider picks up package → Rider navigates to dropoff →
Customer gives delivery code → Rider enters code + takes POD photo →
Money distributed (platform + fleet + rider) → Customer rates rider
```

**Hard gate: If this loop has a single critical bug, do NOT proceed to Phase 2.**

---

## PHASE 2: Operations & B2B (Sprints 8–10)

> Goal: Fleet managers can manage riders. Admins can govern the platform.

---

### Sprint 8: Fleet Management App
**Goal:** Fleet manager can onboard, manage riders, track earnings, message team.

> ⚠️ DESIGN CHECKPOINT: Fleet app UI designs must be ready before this sprint starts.

#### Design needed (TO BE CREATED before Sprint 8):
| Screen Name | Description |
|---|---|
| **Auth & Setup** | |
| fleet_welcome | Welcome / value prop for fleet managers |
| fleet_signup | Fleet manager account creation |
| fleet_otp | OTP verification |
| fleet_profile_setup | Fleet name, logo, banking details |
| fleet_code_display | Generated fleet code for sharing with riders |
| **Dashboard** | |
| fleet_dashboard | Today's earnings, active riders, total deliveries, commission earned |
| **Riders** | |
| fleet_riders_list | List of all fleet riders (online/offline badge, vehicle, rating) |
| fleet_rider_detail | Individual rider: trips, earnings, documents, vehicle, status |
| fleet_invite_rider | Share fleet code screen |
| **Live Map** | |
| fleet_live_map | Map showing all online fleet riders with real-time location pins |
| **Earnings & Wallet** | |
| fleet_earnings | Weekly summary, per-rider breakdown, commission history |
| fleet_wallet | Fleet balance, Fund/Withdraw buttons, transaction list |
| fleet_withdraw | Withdrawal request |
| **Messaging** | |
| fleet_messages_list | Conversation list (1-on-1 + broadcast threads) |
| fleet_message_thread | Individual chat with a rider |
| fleet_broadcast | Compose broadcast message to all riders |
| **Settings** | |
| fleet_settings_commission | Set commission type (percentage/flat) and rate |
| fleet_settings_payout | Payout schedule configuration |
| fleet_settings_profile | Edit fleet name, logo, banking |
| fleet_settings_notifications | Notification preferences |

#### Build tasks:
- [ ] Fleet auth flow (signup, OTP, profile setup)
- [ ] Fleet code generation + display
- [ ] Fleet dashboard (earnings, active riders, delivery count)
- [ ] Rider directory (list + detail view)
- [ ] Remove rider from fleet
- [ ] Live map (Realtime: `fleet:{id}:riders`)
- [ ] Fleet earnings + wallet (reuse wallet components)
- [ ] Commission configuration
- [ ] 1-on-1 messaging with riders
- [ ] Broadcast messaging to all fleet riders
- [ ] Payout schedule settings
- [ ] Fleet notification preferences

---

### Sprint 9: Admin Dashboard (Web)
**Goal:** Admin can monitor the platform, verify riders, process withdrawals.

> **Decision point (before Sprint 9):** Expo Web (shared RN codebase) vs. Next.js (purpose-built web app).
> Recommendation: Next.js — admin dashboard is table-heavy, filter-heavy, not mobile-first.

> ⚠️ DESIGN CHECKPOINT: Admin dashboard UI designs needed before this sprint.
> Admin UI can be functional/clean — no need for the same polish level as mobile apps.
> Use a component library (shadcn/ui recommended for Next.js).

#### Screens needed (functional, not pixel-perfect):
| Screen Name | Description |
|---|---|
| admin_login | Admin login (email + password, separate from mobile auth) |
| admin_dashboard | Real-time metrics: active users, active deliveries, daily revenue, pending counts |
| admin_users | User directory (customers, riders, fleets) with search, filter, ban/suspend actions |
| admin_user_detail | Full user profile, order history, wallet, documents |
| admin_verification_queue | KYC document review queue (photo viewer, approve/reject with reason) |
| admin_orders | Order monitoring list with status filter |
| admin_order_detail | Full order detail (route, status timeline, chat log, GPS history, POD) |
| admin_withdrawals | Withdrawal queue (pending, processing, completed) with approve/reject |
| admin_sos | Active SOS alerts with user info and location |
| admin_action_log | Chronological log of admin actions |

#### Build tasks:
- [ ] Next.js project setup (or Expo Web decision)
- [ ] Supabase client for web (same project, admin role)
- [ ] Admin login (email/password, role verified server-side)
- [ ] Dashboard overview (real-time metrics via Supabase)
- [ ] User management (search, filter by role, ban, suspend)
- [ ] User detail view
- [ ] KYC document verification queue (approve/reject documents → rider_documents update)
- [ ] Withdrawal processing queue (approve → triggers payment/transfer Edge Function)
- [ ] Order monitoring list
- [ ] Order detail (chat log, GPS history, POD photo)
- [ ] SOS alert center (Realtime: `admin:sos`)
- [ ] Admin action logging (admin_action_logs table)

---

### Sprint 10: Admin Configuration + Disputes
**Goal:** Admin can configure the platform and resolve disputes.

#### Screens needed:
| Screen Name | Description |
|---|---|
| admin_service_areas | List of cities, enable/disable toggle, add new |
| admin_categories | Package category management (add, edit, reorder, disable) |
| admin_pricing | Per-city pricing rules (base rate, per-km, VAT, surge, min/max) |
| admin_commission | Platform commission rate configuration |
| admin_promos | Promo code list with usage stats |
| admin_promo_create | Create new promo code (type, value, limits, expiry) |
| admin_disputes | Dispute list (open, investigating, resolved) |
| admin_dispute_detail | Full dispute: order info, chat logs, GPS history, POD, resolution tools |
| admin_refunds | Refund management linked to disputes/cancellations |

#### Build tasks:
- [ ] Service area management (enable/disable cities)
- [ ] Package categories management (CRUD)
- [ ] Pricing rules configuration (per city)
- [ ] Platform commission rate configuration
- [ ] Promo code creation + campaign management
- [ ] Dispute list + detail view
- [ ] Dispute resolution (view evidence, mark resolved, trigger refund)
- [ ] Refund management (manual credit_wallet call)

---

## PHASE 2 MILESTONE: Platform Governance

After Sprint 10:
- Fleet managers can recruit riders, track them live, earn commission
- Admins can verify riders, process withdrawals, resolve disputes
- Platform pricing, service areas, and promos are fully configurable

---

## PHASE 3: Growth & Edge (Sprints 11–12)

> Goal: User acquisition and advanced features. Only after Phase 1+2 are stable.

---

### Sprint 11: Referral Program + Business Insights
**Goal:** Users can invite friends, earn credits. Business accounts get analytics.

#### Design needed (TO BE CREATED before Sprint 11 — customer app additions):
| Screen Name | File / Description |
|---|---|
| Business Analytics Dashboard | business_analytics_dashboard (already in hand) |
| Business Insights Upsell | business_insights_upsell (already in hand) |
| Referral screen | New: invite link, referral code, credits earned, how it works |
| Referral success | New: confirmation after friend completes first delivery |

#### Build tasks:
- [ ] Referral system (referral codes, credit on first delivery)
- [ ] Referral screen + success screen
- [ ] Business analytics dashboard
- [ ] Business insights upsell screen

---

### Sprint 12: Advanced Features
**Goal:** Merchant booking, scheduled deliveries, fraud detection.

#### Design needed (TO BE CREATED — mix of in-hand and new):
| Screen Name | File / Description |
|---|---|
| Support Center | support_center (already in hand) |
| Live Support Chat | live_support_chat (already in hand) |
| Merchant Checkout (mobile) | merchant_checkout_updated_phone (already in hand) |
| Merchant Checkout (desktop) | merchant_checkout_desktop_version (already in hand) |
| Booking Success (desktop) | booking_success_desktop_version (already in hand) |
| Omniroute | omniroute_precision (already in hand) |
| Scheduled Delivery | New: date/time picker on order creation |
| Virtual Account Setup | New: dedicated bank account provisioning |

#### Build tasks:
- [ ] Support center + live support chat
- [ ] Direct merchant booking ("Pay & Ship" magic links — no app needed)
- [ ] Merchant checkout flow (mobile + desktop)
- [ ] Scheduled deliveries (date/time picker on order creation)
- [ ] Virtual accounts (provider-dependent integration)
- [ ] Automated fraud detection (ghost ride patterns, anomalous GPS)

---

## Dependency Installation Schedule

| Sprint | New Dependencies |
|---|---|
| 1 | @supabase/supabase-js, zustand, expo-secure-store, expo-image |
| 2 | react-native-google-places-autocomplete |
| 3 | (none) |
| 4 | react-native-maps (or expo-maps) |
| 5 | react-native-webview |
| 6 | expo-notifications |
| 7 | expo-location, expo-camera, expo-image-picker |
| 8 | (none — reuses existing) |
| 9 | Next.js (if separate web app) or expo web deps |
| 10 | (none) |
| 11 | (none) |
| 12 | (TBD based on virtual account provider) |

---

## Design Checkpoint Summary

| Before Sprint | Designs Needed For | Status |
|---|---|---|
| Sprint 1 | Customer auth + onboarding (9 screens) | ✅ IN HAND |
| Sprint 2 | Customer home + order creation (4 screens) | ✅ IN HAND |
| Sprint 3 | Negotiation engine (4 screens) | ✅ IN HAND |
| Sprint 4 | Tracking + chat + completion (6 screens) | ✅ IN HAND |
| Sprint 5 | Wallet + payments (3 screens) | ✅ IN HAND |
| Sprint 6 | History + profile + notifications (5 screens) | ✅ IN HAND |
| Sprint 7 | **Rider app (29 screens)** | ⏳ CREATE BEFORE SPRINT 7 |
| Sprint 8 | **Fleet app (17 screens)** | ⏳ CREATE BEFORE SPRINT 8 |
| Sprint 9 | **Admin dashboard (10 screens — functional)** | ⏳ CREATE BEFORE SPRINT 9 |
| Sprint 10 | **Admin config + disputes (9 screens — functional)** | ⏳ CREATE BEFORE SPRINT 10 |
| Sprint 11 | Referral + business insights (2 new + 2 in hand) | ⏳ CREATE BEFORE SPRINT 11 |
| Sprint 12 | Advanced features (2 new + 6 in hand) | ⏳ CREATE BEFORE SPRINT 12 |

---

## Screen Count Summary

| App | Screens | Status |
|---|---|---|
| Customer App | 39 | ✅ All designed |
| Rider App | 29 | ⏳ Need before Sprint 7 |
| Fleet App | 17 | ⏳ Need before Sprint 8 |
| Admin Dashboard | 19 | ⏳ Need before Sprint 9 (functional OK) |
| **Total** | **104** | |

---

## Start Here

**Sprint 4** is next — Live Tracking + Chat + Delivery Completion. Say "go" when ready.
