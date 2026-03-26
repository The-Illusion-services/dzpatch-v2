# DZpatch v2

On-demand delivery app for Nigeria. Customers book riders, riders bid on jobs, packages move.

This is a ground-up rewrite of v1 — cleaner architecture, better database design, and a proper Supabase backend.

---

## What it does

Customers open the app, enter a pickup and dropoff address, and book a delivery. Riders nearby see the job, place a bid, and the customer accepts. The rider collects the package and delivers it while the customer tracks live on a map.

Payments go through Paystack (card, bank transfer, USSD) or cash on delivery. Riders earn from each job minus a platform commission. Wallets are built-in for both sides.

---

## Tech stack

- React Native + Expo 54 (SDK 54)
- Expo Router (file-based navigation)
- Supabase — PostgreSQL, Auth, Realtime, Edge Functions, Storage
- Paystack — wallet funding and rider payouts
- Google Maps + Places API
- Zustand for auth state
- Jest + Testing Library for tests

---

## Project structure

```
app/
  (auth)/          Login, OTP, password reset
  (customer)/      All customer screens
supabase/
  migrations/      All database migrations, numbered sequentially
  functions/       Edge functions (payment-initialize, payment-webhook)
store/             Zustand stores
lib/               Supabase client setup
types/             Database types
constants/         Theme, colors, spacing
__tests__/         Test suites by sprint
```

---

## Getting started

**Prerequisites:** Node 18+, Expo CLI, Android Studio or Xcode

```bash
npm install
```

Copy `.env.example` to `.env` and fill in your keys:

```
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY=
GOOGLE_MAPS_API_KEY=
```

Start the dev server:

```bash
npx expo start
```

---

## Database

All migrations live in `supabase/migrations/` and are numbered `00001`, `00002`, etc. Apply them in order using the Supabase SQL Editor. Never edit a migration that has already been applied — add a new one instead.

Current migrations:
- `00001` — Core schema: 26 tables, 17 enums, 40+ indexes
- `00002` — RPC functions (create_order, cancel_order, credit_wallet, etc.)
- `00003` — RLS policies
- `00004` — Fix handle_new_user trigger
- `00005` — Nullable phone/email on profiles
- `00006` — Fix trigger search_path
- `00007` — Cash payment method on orders
- `00008` — Fix order_status_history column name
- `00009` — saved_addresses: is_default, latitude, longitude columns
- `00010` — Storage bucket: `documents` (private, 10MB limit, image/PDF) + RLS policies for rider uploads and admin review

---

## Edge Functions

Deploy from the `supabase/functions/` directory:

- `payment-initialize` — Creates a Paystack transaction and returns the authorization URL. Called by the app when a user taps Fund Wallet.
- `payment-webhook` — Receives Paystack webhooks, verifies the HMAC signature, and credits the wallet via the `credit_wallet` RPC.

Set `PAYSTACK_SECRET_KEY` in your Supabase project's Edge Function secrets before deploying.

---

## Testing

```bash
npm test
```

242 tests across 10 suites covering auth, ordering, tracking, payments, wallet, and notifications.

---

## Build phases

**Phase 1 (current)** — Customer ordering, rider matching, delivery, payments, chat, notifications

**Phase 2** — Fleet management, admin dashboard, B2B features

**Phase 3** — Referral program, merchant booking, virtual accounts, fraud detection

---

## Supabase project

Project ref: `fgegxqtynigdceuxjnxd` (ap-southeast-2)

The v1 codebase lives separately at `c:\Dev\dzpatch-mobile` and is not touched.
