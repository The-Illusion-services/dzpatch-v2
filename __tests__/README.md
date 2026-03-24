# DZpatch V2 — Test Suite

## Structure

```
__tests__/
  phase1/
    sprint1/   — Auth, design system, UI components
    sprint2/   — Home, order creation, saved addresses
    sprint3/   — Bidding engine, realtime
    sprint4/   — Live tracking, chat, delivery completion
    sprint5/   — Wallet, payments
    sprint6/   — Order history, profile, notifications
    sprint7/   — Rider app
  phase2/
    sprint8/   — Fleet management
    sprint9/   — Admin dashboard
    sprint10/  — Admin config, disputes
  phase3/
    sprint11/  — Referrals, business insights
    sprint12/  — Advanced features
  utils/       — Shared test helpers and mocks
```

## Rule

**After every phase, all tests for that phase must pass before moving to the next.**

Run all tests:        `npm test`
Run with coverage:    `npm run test:coverage`
Watch mode:           `npm run test:watch`
Run one phase:        `npm test -- --testPathPattern=phase1`
Run one sprint:       `npm test -- --testPathPattern=sprint1`
