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
**Status: COMPLETE ✓**

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
- [x] Active Order Tracking screen (`active-order-tracking.tsx`):
  - Real MapView (react-native-maps + Google Maps, app.json configured)
  - Bouncing rider marker, drop-off pin, dashed Polyline route
  - Realtime rider location updates from `rider_locations` table
  - Status timeline (5 steps), ETA status pill
  - Rider info card (name, rating, vehicle plate, call + chat buttons)
  - Cancel button → cancel-order-modal
  - Auto-navigates to delivery-success on `delivered`/`completed`
- [x] In-App Chat screen (`chat.tsx`):
  - Floating header card (rider avatar, vehicle, status chip, call button)
  - Message bubbles (rider left, customer right in blue)
  - System notification support
  - Realtime INSERT subscription on `chat_messages`
  - KeyboardAvoidingView, multiline input, send button
- [x] Cancel Order modal (`cancel-order-modal.tsx`):
  - Bottom sheet overlay, 5 pre-set reasons
  - Radio button selection, confirm/keep buttons
  - Calls `cancel_order` RPC with reason + `cancelled_by: customer`
  - Routes to home on success
- [x] Booking Success screen (`booking-success.tsx`):
  - Scale-in + ping ring animation on success icon
  - Order ID, amount paid, pickup/dropoff address card
  - Real-time tracking promo block
  - CTA → finding-rider (starts rider search)
- [x] Delivery Success screen (`delivery-success.tsx`):
  - Animated package box (scale + tilt) with floating check badge
  - Final price + delivery time stats
  - Receipt link, Rate Rider + Done buttons
- [x] Driver Rating & Review screen (`driver-rating.tsx`):
  - 5-star tap rating with label (Poor → Excellent!)
  - Feedback tag chips (multi-select: Fast, Safe Driver, Polite, etc.)
  - Freeform review textarea
  - Tip selection (₦200 / ₦500 / ₦1000 / Other custom)
  - Calls `submit_review` RPC
- [x] Navigation wired: create-order → booking-success → finding-rider → live-bidding → active-order-tracking → delivery-success → driver-rating
- [x] cancel-order-modal wired into order-tracking + active-order-tracking
- [x] react-native-maps installed, Google Maps API key in app.json

> 📋 **Phase 1 Test Checkpoint** — After Sprint 4:
> Current coverage: 168 tests, 8 suites — all passing.

---

### Sprint 5: Wallet + Payments
**Status: COMPLETE ✓**

**Goal:** Customer can fund wallet, view transactions, withdraw.

#### Design needed (ALREADY IN HAND ✓):
| Screen Name | File |
|---|---|
| Wallet | wallet_system |
| Fund Wallet | fund_wallet |
| Withdraw Funds | withdraw_funds |

#### Build tasks:
- [x] Wallet screen (dark navy balance card, Fund/Withdraw buttons, realtime balance, filter tabs)
- [x] Transaction list (filterable: All, Income, Spending, Pending) with realtime INSERT subscription
- [x] Fund Wallet screen (amount input, quick amount chips, payment method selection, Paystack WebView)
- [x] Withdraw Funds screen (amount, bank picker, account number, fee notice, `request_withdrawal` RPC)
- [x] Edge Function: `payment-initialize` (server-side Paystack transaction init, JWT auth)
- [x] Paystack WebView checkout (opens authorization_url from Edge Function)
- [x] Edge Function: `payment-webhook` (HMAC-SHA512 signature verification, `credit_wallet` RPC, transfer events)
- [x] `request_withdrawal` RPC called from withdraw screen
- [x] Wallet balance + transactions query (by wallet owner_id + owner_type)
- [x] Realtime: `wallets` UPDATE + `transactions` INSERT subscriptions
- [x] Registered `fund-wallet` + `withdraw` in `_layout.tsx`

**New dependency:** react-native-webview

> 📋 **Phase 1 Test Checkpoint** — After Sprint 5:
> Current coverage: 204 tests, 9 suites — all passing.

---

### Sprint 6: Order History + Profile + Notifications
**Status: COMPLETE ✓**

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
- [x] Order History screen (filterable list: All, Active, Completed, Cancelled)
- [x] Order Details screen (5-step timeline, rider card, payment summary, route card)
- [x] Profile screen rewrite (avatar initials, KYC badge, full menu, all nav wired)
- [x] Notifications screen (grouped: Order Updates, Promos, System; mark all read; realtime INSERT)
- [x] Orders query with filters (customer_id, ordered by created_at desc, limit 50)
- [x] Notifications query + mark as read (individual + mark all read)
- [x] Realtime: `user:{id}:notifications` INSERT subscription
- [x] Registered order-history, order-details, notifications in `_layout.tsx`

> 📋 **Phase 1 Test Checkpoint** — After Sprint 6:
> Current coverage: 242 tests, 10 suites — all passing.

---

### Sprint 7: Rider App (Complete)
**Goal:** Rider can sign up, go online, receive orders, bid, deliver, earn.

#### Design needed (ALREADY IN HAND ✓):
| Screen Name | File |
|---|---|
| **Auth & Onboarding** | |
| Rider Splash Screen | `UI UX Design/Rider App/rider_splash_screen/code.html` |
| Onboarding 1 — Earn Money | `UI UX Design/Rider App/onboarding_earn_money/code.html` |
| Onboarding 2 — Flexible Hours | `UI UX Design/Rider App/onboarding_flexible_hours/code.html` |
| Onboarding 3 — Join Fleet | `UI UX Design/Rider App/onboarding_join_fleet/code.html` |
| Sign Up — Personal Details | `UI UX Design/Rider App/rider_sign_up_personal_details/code.html` |
| Sign Up — OTP Verification | `UI UX Design/Rider App/rider_sign_up_otp_verification/code.html` |
| Sign Up — Vehicle Details | `UI UX Design/Rider App/rider_sign_up_compact_vehicle_details/code.html` |
| Sign Up — Document Uploads | `UI UX Design/Rider App/rider_sign_up_document_uploads/code.html` |
| Sign Up — Bank Details | `UI UX Design/Rider App/rider_sign_up_bank_details/code.html` |
| Sign Up — Review Application | `UI UX Design/Rider App/rider_sign_up_review_application/code.html` |
| Pending Approval | `UI UX Design/Rider App/rider_sign_up_pending_approval/code.html` |
| **Home & Job Feed** | |
| Home — Map & Status | `UI UX Design/Rider App/rider_home_map_status/code.html` |
| Job Preview Card | `UI UX Design/Rider App/job_preview_card/code.html` |
| Job Details & Bidding | `UI UX Design/Rider App/job_details_bidding/code.html` |
| **Bidding Flow** | |
| Enter Counter Offer | `UI UX Design/Rider App/enter_counter_offer/code.html` |
| Waiting for Customer | `UI UX Design/Rider App/waiting_for_customer/code.html` |
| Bid Declined | `UI UX Design/Rider App/bid_declined/code.html` |
| **Delivery Flow** | |
| Navigate to Pickup | `UI UX Design/Rider App/navigate_to_pickup_simplified/code.html` |
| Confirm Arrival at Pickup | `UI UX Design/Rider App/confirm_arrival_at_pickup/code.html` |
| Navigate to Drop-off | `UI UX Design/Rider App/navigate_to_drop_off/code.html` |
| Delivery Completion | `UI UX Design/Rider App/delivery_completion/code.html` |
| Trip Complete | `UI UX Design/Rider App/trip_complete/code.html` |
| **Earnings & Wallet** | |
| Earnings Dashboard | `UI UX Design/Rider App/rider_earnings_dashboard/code.html` |
| Wallet | `UI UX Design/Rider App/rider_wallet/code.html` |
| Withdraw Funds | `UI UX Design/Rider App/withdraw_funds/code.html` |
| **Profile & Settings** | |
| Rider Profile | `UI UX Design/Rider App/rider_profile/code.html` |
| Edit Vehicle Info | `UI UX Design/Rider App/edit_vehicle_info/code.html` |
| Documents Management | `UI UX Design/Rider App/documents_management/code.html` |
| Bank Account Settings | `UI UX Design/Rider App/bank_account_settings/code.html` |
| Security — Change Password | `UI UX Design/Rider App/security_change_password/code.html` |
| Account Locked — Commission Owed | `UI UX Design/Rider App/account_locked_commission_owed/code.html` |
| SOS Safety Modal | `UI UX Design/Rider App/sos_safety_modal/code.html` |
| Chat with Customer | `UI UX Design/Rider App/chat_with_customer/code.html` |

> ℹ️ **Note:** No `rider_signup_fleet` screen in designs — fleet join step either folded into `rider_sign_up_review_application` or handled post-approval. Confirm before building step 7a.

#### Build tasks:
**7a. Auth & Onboarding** ✓ COMPLETE
- [x] Rider splash + onboarding screens
- [x] Multi-step signup (personal → OTP → vehicle → documents → bank → review)
- [x] Document upload to Supabase Storage (expo-image-picker + Supabase Storage)
- [x] Admin approval gate ("Pending Verification" screen with 30s polling)
- [x] Bank account setup (rider_bank_accounts table)

**7b. Home + Job Feed**
- [ ] Home screen with map + online/offline toggle
- [ ] Nearby orders displayed as map pins + list
  > 🗺️ **Customer home map note:** Currently shows placeholder MapView with 5 dummy 🛵 rider pins. Replace in Sprint 7 with real rider locations from `rider_locations` table via `get_nearby_orders` RPC / Realtime subscription.
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

> 📌 **Pricing rules note:** The `pricing_rules` table columns (`base_rate`, `per_km_rate`, `vat_percentage`, `surge_multiplier`, `min_price`, `max_price`) must be fully editable from the `admin_pricing` screen. Changes apply immediately to new orders. Current fallback pricing in dev: ₦500 base + ₦100/km + 7.5% VAT.

#### Screens needed:
| Screen Name | Description |
|---|---|
| admin_service_areas | List of cities, enable/disable toggle, add new |
| admin_categories | Package category management (add, edit, reorder, disable) |
| admin_pricing | Per-city pricing rules (base rate, per-km, VAT, surge, min/max) — **must be editable** |
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
| Sprint 7 | **Rider app (33 screens)** | ✅ IN HAND |
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
| Rider App | 33 | ✅ All designed |
| Fleet App | 17 | ⏳ Need before Sprint 8 |
| Admin Dashboard | 19 | ⏳ Need before Sprint 9 (functional OK) |
| **Total** | **104** | |

---

## Start Here

**Sprint 7** is next — Rider App (Complete). Say "go" when ready.
