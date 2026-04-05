# Supabase-Backed Tests

These tests are intended to run against a real Supabase test environment.

They should verify:

- auth behavior
- RLS behavior
- RPC correctness
- storage policy behavior
- realtime behavior
- edge-function behavior
- multi-step application flows

This suite is intentionally separated from the fast local tests under `__tests__/integration` and `__tests__/phase1`.

Suggested usage later:

- `test` for fast local tests
- `test:supabase` for real backend tests
- `test:all` for both

Do not point these tests at production.
