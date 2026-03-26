# DZpatch V2.0 Audit Report: Phases 1–7

**Date of Audit:** March 2026
**Scope:** Phases 1 through 7 (Sprint 0–6 foundational + customer app, Sprint 7 Rider App frontend logic, backend schema, and Edge Functions)

## Executive Summary
This audit evaluated the execution of Phases 1 through 7 against best practices, security standards, and scalability requirements. The codebase contains significant technical debt, architectural bottlenecks, critical security flaws, and severe omissions in real-time functionality and background processing. The reported testing metrics do not accurately reflect the project's stability or readiness for production. 

The following is a detailed, strictly critical assessment of the areas requiring immediate remediation before proceeding to Phase 2.

---

## 1. Security & Credentials
*   **Exposed API Keys (Critical Risk):** A severe security vulnerability exists in the order creation screen (`app/(customer)/create-order.tsx`). The Google Places API key is hardcoded directly into the frontend source files in plain text. This must be migrated to a secure environment variable (`process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY`).
*   **Hardcoded Native API Keys (`app.json`):** Beyond the frontend files, the Google Maps API key is also statically committed into `app.json` under `android.config.googleMaps.apiKey` and `ios.config.googleMapsApiKey`. This must be extracted and injected securely during the EAS build process to prevent exposing the key in source control.
*   **Missing Background Location Entitlements:** The `expo-location` plugin is currently configured *only* with the `locationWhenInUsePermission`. It entirely lacks the required `locationAlwaysAndWhenInUsePermission`, the `isIosBackgroundLocationEnabled` flag, and the Android `ACCESS_BACKGROUND_LOCATION` permission. Without these, the operating systems will explicitly block the Rider app from tracking background location, rendering the delivery tracking system non-functional.

---

## 2. Frontend React/Expo Architecture
*   **State Management Vulnerabilities:** A static analysis of the frontend codebase reveals nearly 60 linting warnings across both the Customer and Rider applications, predominantly related to improperly managed React hooks. Component side-effects (`useEffect`) are frequently missing their required dependencies. In a production environment, this leads to "stale closures," causing screens to freeze, data to stop updating, or components to render outdated information.
*   **Hardcoded Colors & Theme Violations:** There are over 100 instances of hardcoded hex colors (e.g., `color: '#0040e0'`) injected directly into React Native `StyleSheet` objects across the `app` directory. This bypasses the centralized `constants/theme.ts` file, creating technical debt and rendering the app incapable of supporting dark mode or systemic brand changes without manual, file-by-file refactoring.
*   **Suboptimal Asset Rendering:** The application relies on the native `Image` component from `react-native` rather than the highly optimized `expo-image` package for rendering assets and documents. This omission results in missing out on crucial memory caching, lazy loading, and transition animations, which will bloat the app's memory footprint as more images are loaded.
*   **Authentication Routing Flash (UX Flaw):** In `app/_layout.tsx`, the root layout dispatches the authentication initialization but immediately renders the navigation stack without waiting for the initialization to complete. Returning users will experience a "flash" of the login/onboarding screen before the SecureStore retrieves their session and abruptly redirects them to the authenticated home screen.
*   **Missing Performance Memoization:** Complex user interfaces, such as the order creation form and live bidding screens, lack rendering optimizations (`useMemo`, `useCallback`). The app is prone to over-rendering, which will drain battery life and cause stuttering animations on lower-end devices.

---

## 3. Sprint 7 (Rider App) Specific Architecture Flaws
The Rider App introduces severe architectural omissions that conflict with the `SPRINT_PLAN.md` requirements and jeopardize the core delivery loop.

*   **Missing Real-Time Infrastructure (Critical Flaw):** The sprint plan mandates real-time subscriptions for pending orders (`orders:pending`) and bids (`bid:{id}:status`). However, the implementation lacks `supabase.channel` usage in the Rider workspace. Instead, the `app/(rider)/index.tsx` screen relies on HTTP polling (`NEARBY_REFRESH_INTERVAL = 20_000`) to fetch orders. Polling every 20 seconds scales extremely poorly, causing latency in bid acceptance and generating heavy, redundant read operations on the backend.
*   **Background Location Tracking Deficit:** The sprint specified background GPS updates (`update_rider_location` RPC every 5-10s) and an offline queue. The codebase only implements **foreground** location tracking (`requestForegroundPermissionsAsync` and `watchPositionAsync`). If the rider backgrounds the app or locks their phone, location updates will halt entirely.

---

## 4. TypeScript Strictness & Compilation Failures
*   **Failing Type Checks:** Running `npx tsc --noEmit` fails with **105 errors across 37 files**. The project is currently not type-safe.
*   **RPC Misalignments:** The arguments passed to Supabase RPCs (e.g., `update_order_status`, `complete_delivery`, and `toggle_rider_online`) do not map to the generated Supabase `Database` types (`TS2345`). The frontend assumes it is passing correct variables, but the TypeScript definitions disagree, introducing high risk of runtime crashes.
*   **Excessive `any` Casting:** There are over 20 instances across the authentication and functional screens where error objects are blindly cast to `any` (`catch (err: any)`). This bypasses TypeScript's safety nets and prevents robust error handling.

---

## 5. Cost Reduction & Database Scalability
To prepare for scale and prevent severe cost inflation, the following operational bottlenecks must be addressed:

*   **Database Over-Fetching (`select('*')` Anti-Pattern):** There are at least 9 explicit instances across the app (in high-traffic screens like `order-tracking`, `deliveries`, `create-order`, and `rider-chat`) where `supabase.from('table').select('*')` is used instead of specifically declaring the needed columns. This over-fetching will drastically slow down the app over cellular networks and increase Supabase egress bandwidth bills.
*   **Database Read Optimization (Pricing Rules):** The application currently queries the Supabase database for `pricing_rules` every time the order creation screen is opened. Because platform pricing rarely changes minute-to-minute, this incurs massive, unnecessary database read costs. This data must be cached in memory upon application startup and refreshed periodically.
*   **Google Maps API Inflation:** The address search functionality utilizes the `react-native-google-places-autocomplete` library, which fires an API request on every single keystroke by default. Without strict input delays (debouncing) and session-based token grouping, a user typing a 20-character address will cost the platform 20 separate API billing requests instead of 1.
*   **WebSocket Connection Overhead:** The real-time tracking and chat features establish independent connection channels (`supabase.channel()`) for every screen in the Customer App. As user concurrency grows, this will rapidly exhaust the database's connection pool limits. The application should multiplex real-time connections and explicitly pause them when the `AppState` goes to the background.

---

## 6. Quality Assurance & Testing Discrepancy
*   **Misleading Metrics:** The project documentation (`SPRINT_PLAN.md`) explicitly cites "Current coverage: 242 tests, 10 suites — all passing" by the end of Sprint 6.
*   **Actual Coverage Reality:** An automated coverage audit (`jest --coverage`) reveals that the actual statement test coverage of the business logic is under **2%**. The `app/` directory currently has **0% test coverage**. Furthermore, there are zero tests written for Sprint 7 (Rider App). The 242 passing tests are superficial and do not validate actual user journeys. Relying on these metrics to proceed to Phase 2 is highly dangerous.

---

## 7. Immediate Action Plan (Stabilization Sprint)
Halt the progression into Sprint 8 (Fleet Management). Dedicate a localized "Stabilization Sprint" to execute the following strictly corrective actions:

1.  **Security & Configuration:** Move all hardcoded API keys into `.env` files and properly configure `app.json` for background location tracking on iOS and Android.
2.  **Rider Real-Time & Tracking:** Replace the Rider App's HTTP polling mechanism with `supabase.channel` real-time listeners and implement proper background location tracking using `expo-location`'s background tasks.
3.  **Type Safety & Hooks:** Resolve the 105 TypeScript compilation errors (specifically the RPC payload misalignments) and fix the ~60 React Hook dependency warnings to prevent stale closures.
4.  **UI/UX Refactoring:** Replace all hardcoded hex colors with the `constants/theme.ts` variables, replace `Image` with `expo-image`, and implement a blocking splash screen to fix the authentication routing flash.
5.  **Cost Optimization:** Replace `select('*')` with targeted columns, implement debouncing/session tokens on Google Places inputs, and cache static database queries like `pricing_rules`.
6.  **Testing:** Write true integration tests (`@testing-library/react-native`) for the complete End-to-End delivery loop (Customer Order -> Rider Acceptance -> Delivery).