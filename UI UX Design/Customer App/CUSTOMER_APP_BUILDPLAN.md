# DZPatch Customer App — Build Plan

> **Design System Reference:** `stitch_dzpatch/omniroute_precision/DESIGN.md`
> **Screen Designs:** `stitch_dzpatch/[screen-name]/screen.png` + `code.html`
> **Audit Date:** 2026-03-23
> **Overall Readiness:** ~75% functional, ~30% design-compliant

---

## Design System Tokens (apply everywhere)

| Token | Value |
|-------|-------|
| Primary (navy) | `#000d22` |
| Secondary (blue) | `#0040e0` |
| Surface base | `#f7fafc` |
| Surface container low | `#f1f4f6` |
| Surface container lowest (cards) | `#ffffff` |
| Dark focus block | `#0a2342` |
| Urgent/orange | `#e66100` |
| Headline font | Manrope |
| Body font | Inter |
| Border rule | **NO 1px borders** — use background shifts |
| Card separation | spacing scale 4 (0.9rem) between items |
| Page margin | spacing scale 12 (2.75rem) |
| Primary button | filled `#0040e0`, `xl` roundedness, no border |
| Input focus | 2px animated bottom bar in `#ffdbcb` |
| Glassmorphism | `surface_container_lowest` @ 70% opacity + 20px blur |

---

## Phase 0 — Foundation (do first, unblocks everything)

> These are structural fixes. Nothing renders correctly without them.

- [ ] **0.1** Fix `app/(customer)/_layout.tsx` — declare ALL screens:
  - home, make-order, finding-rider, track-order, tracking
  - orders/index, orders/all, orders/[id]
  - wallet/index, wallet/fund, wallet/withdraw
  - profile/edit, profile/change-password, profile/referral, profile/support, profile/notifications, profile/privacy, profile/upload-id, profile/invite, profile/delete
  - chat, rate-rider, delivery-success, address-search, address-list, address-confirm
  - book/[merchantId], analytics

- [ ] **0.2** Create `constants/theme.ts` — export all design tokens (colors, fonts, spacing, radius) as a single source of truth

- [ ] **0.3** Fix `address-confirm.tsx` map bug — use lat/lng from route params instead of hardcoded Calabar coords

- [ ] **0.4** Remove `make-order/details.tsx` (superseded by `make-order/index.tsx`) — eliminate route ambiguity

- [ ] **0.5** Persist notification preferences in `profile/notifications.tsx` to Supabase `profiles` table instead of local state

---

## Phase 1 — Onboarding & Auth

> Design refs: `onboarding_fast_delivery_minimal`, `onboarding_real_time_tracking_minimal`, `onboarding_secure_payments_minimal`, `login_sign_up_refined_elegance`, `otp_verification_minimal_elegance`, `forgot_password_minimal_elegance`, `reset_password_minimal_elegance`, `reset_success_minimal_elegance`, `updated_splash_screen_dzpatch`

- [ ] **1.1** `CustomSplashScreen.tsx` — redesign to match `updated_splash_screen_dzpatch` (navy bg, logo centered, no border)
- [ ] **1.2** Create `app/(auth)/onboarding.tsx` — 3-slide carousel (Fast Delivery, Real-Time Tracking, Secure Payments), Skip + Next + Get Started buttons
- [ ] **1.3** Redesign `app/(auth)/login.tsx` — match `login_sign_up_refined_elegance` (Manrope headline, Inter body, `#0040e0` CTA, no borders, animated input focus bar)
- [ ] **1.4** Redesign `app/(auth)/signup.tsx` — same design system as login
- [ ] **1.5** Redesign `app/(auth)/verify-otp.tsx` — match `otp_verification_minimal_elegance`
- [ ] **1.6** Redesign `app/(auth)/forgot-password.tsx` — match `forgot_password_minimal_elegance`
- [ ] **1.7** Redesign `app/(auth)/reset-password.tsx` — match `reset_password_minimal_elegance`
- [ ] **1.8** Redesign `app/(auth)/reset-success.tsx` — match `reset_success_minimal_elegance`

---

## Phase 2 — Home & Order Creation

> Design refs: `home_refined_elegance_v3`, `create_order_unified_form`, `add_new_address`, `saved_addresses`

- [ ] **2.1** Redesign `app/(customer)/home.tsx` — match `home_refined_elegance_v3`:
  - Greeting + avatar top-left, notification bell top-right
  - GPS location chip below header
  - Large "Send a Package" CTA card (navy bg, white text)
  - Active orders section (conditional) with status pills + rider card
  - Scrollable for multiple active orders

- [ ] **2.2** Redesign `app/(customer)/make-order/index.tsx` — match `create_order_unified_form`:
  - FROM/TO address inputs with autocomplete overlay
  - Recipient name + phone
  - Package type selector (modal)
  - Package size selector
  - Delivery code toggle
  - Promo code input
  - Dynamic pricing summary (visible once filled)
  - Single CTA: "Find Rider — ₦[Price]"

- [ ] **2.3** Redesign `app/(customer)/address-search.tsx` — match `add_new_address`:
  - Search bar with clear button
  - Current location row (GPS icon)
  - Recent searches from AsyncStorage
  - Fetch user's actual saved addresses (not hardcoded Home/Work)

- [ ] **2.4** Redesign `app/(customer)/address-list.tsx` — match `saved_addresses`:
  - List with default badge
  - Long-press to set default
  - Swipe to delete
  - Add New Address button at bottom

- [ ] **2.5** Fix `app/(customer)/address-confirm.tsx` map (from Phase 0.3) + redesign UI

---

## Phase 3 — Bidding & Finding Rider

> Design refs: `finding_rider`, `live_bidding_pool`, `counter_offer_modal`, `waiting_for_response`

- [ ] **3.1** Redesign `app/(customer)/finding-rider.tsx` — match `finding_rider`:
  - Radar/pulse animation on map
  - "Riders viewed" counter
  - Search stage progress bar
  - Real rider bids from Supabase (replace dummy data)
  - Rider offer cards (avatar, name, rating, vehicle, ETA, bid price)
  - No-riders timeout state with "Try Again" / "Adjust Price"

- [ ] **3.2** Add Live Bidding Pool UI to finding-rider — match `live_bidding_pool`:
  - Multiple bid cards, countdown timer per bid
  - Accept / Decline / Negotiate actions

- [ ] **3.3** Add Counter-Offer Modal — match `counter_offer_modal`:
  - Numeric input for customer's counter price
  - Submit Counter-Offer button

- [ ] **3.4** Add Waiting for Response state — match `waiting_for_response`:
  - Spinner / pulse while awaiting rider's counter-offer response
  - Cancel counter-offer option

---

## Phase 4 — Active Tracking & Delivery Lifecycle

> Design refs: `active_order_tracking`, `delivery_success`, `driver_rating_review`, `cancel_order_modal`

- [ ] **4.1** Redesign `app/(customer)/track-order.tsx` — match `active_order_tracking`:
  - Live map with moving rider icon (Supabase realtime — already wired)
  - Order status timeline (4 steps, kinetic tracker gradient bar)
  - Rider details card (glassmorphism overlay on map)
  - ETA + distance
  - Call Rider, Chat, SOS, Share Tracking Link buttons
  - Cancel Order modal with reasons

- [ ] **4.2** Redesign `app/(customer)/delivery-success.tsx` — match `delivery_success`:
  - Confetti/celebration animation
  - "Delivery Completed!" headline (Manrope display-md)
  - Order ID, rider info, final price
  - Backdrop map with delivery pin
  - Rate Rider / Report Issue / Done buttons

- [ ] **4.3** Redesign `app/(customer)/rate-rider.tsx` — match `driver_rating_review`:
  - 5-star component
  - Feedback tags (chips, full roundedness)
  - Comment text area
  - Issue reporting modal

- [ ] **4.4** Verify cancel order modal — match `cancel_order_modal`:
  - Reasons list (radio buttons)
  - Confirm Cancellation button

---

## Phase 5 — Orders History

> Design refs: `order_history_list_view`, `order_details_view`

- [ ] **5.1** Redesign `app/(customer)/orders/index.tsx` — match `order_history_list_view`:
  - Search bar (by ID, location, date)
  - Tab filter: All / Active / Completed / Cancelled
  - Order cards: status badge (color-coded), date, pickup/dropoff timeline dots, order ID, price
  - Empty state
  - Business Insights upsell banner at bottom
  - Infinite scroll

- [ ] **5.2** Redesign `app/(customer)/orders/[id].tsx` — match `order_details_view`:
  - Status banner (icon + title + date/time)
  - Rider details card
  - Route card (pickup/dropoff timeline)
  - Payment breakdown
  - Call / Text Driver buttons
  - Track Order & View Code (if active)
  - Cancel (if pending) / Report Dispute (if completed)

---

## Phase 6 — Wallet & Payments

> Design refs: `wallet_system`, `fund_wallet`, `withdraw_funds`

- [ ] **6.1** Redesign `app/(customer)/wallet/index.tsx` — match `wallet_system`:
  - Balance prominently displayed (Manrope display-md)
  - Credit/Debit filter tabs
  - Transaction list (no dividers, background shift separation)
  - Fund Wallet + Withdraw buttons

- [ ] **6.2** Redesign `app/(customer)/wallet/fund.tsx` — match `fund_wallet`:
  - Quick amount chips (₦1k, ₦2k, ₦5k, ₦10k, ₦20k, ₦50k)
  - Custom amount input (animated focus bar)
  - Gateway fee display
  - Pay button

- [ ] **6.3** Redesign `app/(customer)/wallet/withdraw.tsx` — match `withdraw_funds`:
  - Amount input
  - Bank selector dropdown (40+ banks)
  - Account number input
  - Validation feedback
  - Withdraw button

---

## Phase 7 — Profile, Settings & Support

> Design refs: `profile_settings`, `support_center`, `notifications`

- [ ] **7.1** Create/redesign profile index screen — match `profile_settings`:
  - Avatar + name + email at top
  - Menu list items (no dividers, background shift):
    - Address Management → address-list
    - Wallet → wallet/index
    - Account Management → profile/edit
    - Notifications → profile/notifications
    - Support → profile/support
    - Referrals → profile/referral
    - Privacy → profile/privacy
  - Edit Profile button
  - Logout (with confirmation)

- [ ] **7.2** Redesign `app/(customer)/profile/support.tsx` — match `support_center`:
  - FAQ accordion categories
  - Live chat button → chat.tsx
  - Call Support / WhatsApp quick links
  - Submit Issue form

- [ ] **7.3** Redesign `app/notifications/index.tsx` — match `notifications` design:
  - Notification list with type icons (order, wallet, promo, message)
  - Unread indicators
  - Swipe to delete
  - Mark All as Read

- [ ] **7.4** Redesign `app/(customer)/chat.tsx` — match `in_app_chat_floating_header` + `live_support_chat`:
  - Header: Rider name, avatar, Active Order pill, Call icon
  - Scrollable message bubbles (sent right, received left)
  - Timestamps + read receipts
  - Text input + Send + Attach Image

---

## Phase 8 — Analytics & Merchant Booking

> Design refs: `business_analytics_dashboard`, `business_insights_upsell`, `merchant_checkout_updated_phone`, `booking_success`

- [ ] **8.1** Redesign `app/(customer)/analytics.tsx` — match `business_analytics_dashboard`:
  - Upsell state for regular users (lock icon, Switch to Business CTA)
  - Business state: Period toggle (Week/Month/Year), summary stat cards, bar chart, Quick Insights text cards

- [ ] **8.2** Redesign `app/(customer)/book/[merchantId].tsx` — match `merchant_checkout_updated_phone`:
  - Security header ("DZPatch")
  - Merchant identity card
  - Amount input (editable or locked)
  - Delivery address + note + email fields
  - Order total
  - Pay button (Paystack)

- [ ] **8.3** Create booking success screen — match `booking_success`:
  - Confirmation illustration
  - "Download App & Track" upsell CTA

---

## Phase 9 — Global UI & Polish

> Design refs: `global_ui_overlays_notifications_context`

- [ ] **9.1** `OfflineBanner.tsx` — persistent top banner, auto-hides when online
- [ ] **9.2** Toast system — consistent bottom toasts across all screens (replace Alert.alert() calls)
- [ ] **9.3** Global error boundary wrapping all screens
- [ ] **9.4** Loading skeletons consistent design across all list/data screens
- [ ] **9.5** Verify all assets exist (`home_delivery_box_v2.png`, confetti, logo)
- [ ] **9.6** Accessibility audit — ensure all interactive elements have labels
- [ ] **9.7** Test dark mode across all redesigned screens

---

## Phase 10 — QA & Stability

- [ ] **10.1** Fix auth token refresh in long-running screens (track-order.tsx, chat.tsx)
- [ ] **10.2** Wire `/(merchant)/dashboard` reference in home.tsx or remove
- [ ] **10.3** Verify chat.tsx is reachable (add to layout, test from track-order)
- [ ] **10.4** Verify rate-rider.tsx navigation from delivery-success.tsx
- [ ] **10.5** Run full test suite — `npx jest --config jest.config.cjs`
- [ ] **10.6** Smoke test complete user journey: signup → create order → find rider → track → complete → rate

---

## Screen Count Summary

| Phase | Screens | Status |
|-------|---------|--------|
| 0 — Foundation | 5 fixes | Blocking |
| 1 — Onboarding & Auth | 8 screens | Redesign |
| 2 — Home & Order Creation | 5 screens | Redesign |
| 3 — Bidding & Finding Rider | 4 screens | Rebuild |
| 4 — Tracking & Delivery | 4 screens | Redesign |
| 5 — Orders History | 2 screens | Redesign |
| 6 — Wallet | 3 screens | Redesign |
| 7 — Profile & Support | 4 screens | Redesign/Create |
| 8 — Analytics & Merchant | 3 screens | Redesign |
| 9 — Global UI | 7 tasks | Polish |
| 10 — QA | 6 tasks | Testing |
| **Total** | **51 tasks** | |

---

## How We Work

1. You say **"build Phase X"** or **"build Phase X task Y"**
2. I read the existing screen + the matching `screen.png` design + `code.html`
3. I rewrite the screen to match the design system
4. I mark tasks complete as we go
5. Each phase is independently shippable

> Start with **Phase 0** — it's a prerequisite for everything else.
