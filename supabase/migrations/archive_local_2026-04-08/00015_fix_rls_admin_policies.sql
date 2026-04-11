-- ============================================================
-- DZpatch V2.0 — Fix: RLS infinite recursion via admin policies
-- Migration: 00015_fix_rls_admin_policies.sql
--
-- Problem: is_admin() queries profiles → profiles_select_admin
-- calls is_admin() → queries profiles → infinite loop.
-- Error: 42P17 "infinite recursion detected in policy for
-- relation riders" (and profiles).
--
-- Fix: Replace all is_admin() policy checks with a direct JWT
-- claim check: (auth.jwt()->'user_metadata'->>'role') = 'admin'
-- This reads from the JWT token in memory — no table lookup,
-- no recursion possible.
-- ============================================================

-- ── profiles ──────────────────────────────────────────────────
DROP POLICY IF EXISTS profiles_select_admin ON profiles;
DROP POLICY IF EXISTS profiles_update_admin ON profiles;

CREATE POLICY profiles_select_admin ON profiles
    FOR SELECT USING (
        (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
    );

CREATE POLICY profiles_update_admin ON profiles
    FOR UPDATE USING (
        (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
    );

-- ── riders ────────────────────────────────────────────────────
DROP POLICY IF EXISTS riders_select_admin ON riders;
DROP POLICY IF EXISTS riders_update_admin ON riders;

CREATE POLICY riders_select_admin ON riders
    FOR SELECT USING (
        (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
    );

CREATE POLICY riders_update_admin ON riders
    FOR UPDATE USING (
        (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
    );

-- ── orders (if is_admin used there too) ───────────────────────
DROP POLICY IF EXISTS orders_select_admin ON orders;
DROP POLICY IF EXISTS orders_update_admin ON orders;

CREATE POLICY orders_select_admin ON orders
    FOR SELECT USING (
        (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
    );

CREATE POLICY orders_update_admin ON orders
    FOR UPDATE USING (
        (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
    );

-- ── wallets ───────────────────────────────────────────────────
DROP POLICY IF EXISTS wallets_select_admin ON wallets;

CREATE POLICY wallets_select_admin ON wallets
    FOR SELECT USING (
        (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
    );

-- ── transactions ──────────────────────────────────────────────
DROP POLICY IF EXISTS transactions_select_admin ON transactions;

CREATE POLICY transactions_select_admin ON transactions
    FOR SELECT USING (
        (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
    );
