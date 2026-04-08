-- Fix RLS policies that reference user_metadata (user-writable, insecure).
-- Replace with app_metadata (service-role-only, safe for security checks).
--
-- Note: spatial_ref_sys (PostGIS system table) is owned by supabase_admin and
-- cannot be altered here. The Supabase linter flags it but it is a known
-- false positive — the table contains only coordinate reference system
-- definitions and has no sensitive data. No action needed.

-- ---------------------------------------------------------------------------
-- 1. profiles — admin policies
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "profiles_select_admin" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_admin" ON public.profiles;

CREATE POLICY "profiles_select_admin" ON public.profiles
    FOR SELECT USING (
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    );

CREATE POLICY "profiles_update_admin" ON public.profiles
    FOR UPDATE USING (
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    );

-- ---------------------------------------------------------------------------
-- 3. riders — admin policies
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "riders_select_admin" ON public.riders;
DROP POLICY IF EXISTS "riders_update_admin" ON public.riders;

CREATE POLICY "riders_select_admin" ON public.riders
    FOR SELECT USING (
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    );

CREATE POLICY "riders_update_admin" ON public.riders
    FOR UPDATE USING (
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    );

-- ---------------------------------------------------------------------------
-- 4. orders — admin policies + orders_select_pending
-- orders_select_pending gated riders by user_metadata.role = 'rider'.
-- Riders are identified by having a row in the riders table (profile_id match),
-- not by a JWT claim — so this policy should use EXISTS instead of a metadata check.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "orders_select_admin" ON public.orders;
DROP POLICY IF EXISTS "orders_update_admin" ON public.orders;
DROP POLICY IF EXISTS "orders_select_pending" ON public.orders;

CREATE POLICY "orders_select_admin" ON public.orders
    FOR SELECT USING (
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    );

CREATE POLICY "orders_update_admin" ON public.orders
    FOR UPDATE USING (
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    );

CREATE POLICY "orders_select_pending" ON public.orders
    FOR SELECT USING (
        status = 'pending'
        AND EXISTS (
            SELECT 1 FROM public.riders WHERE profile_id = auth.uid()
        )
    );

-- ---------------------------------------------------------------------------
-- 5. wallets — admin policy
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "wallets_select_admin" ON public.wallets;

CREATE POLICY "wallets_select_admin" ON public.wallets
    FOR SELECT USING (
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    );

-- ---------------------------------------------------------------------------
-- 6. transactions — admin policy
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "transactions_select_admin" ON public.transactions;

CREATE POLICY "transactions_select_admin" ON public.transactions
    FOR SELECT USING (
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    );
