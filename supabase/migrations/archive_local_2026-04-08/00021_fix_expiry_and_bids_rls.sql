-- ============================================================
-- DZpatch V2.0 — Fix order expiry + bids RLS for customer realtime
-- Migration: 00021_fix_expiry_and_bids_rls.sql
--
-- 1. Direct UPDATE on the live create_order function body
--    to change expiry from 10 minutes -> 2 hours.
--    Previous DO-block patches (00018, 00019) may have failed
--    due to whitespace mismatch in pg_get_functiondef output.
--
-- 2. Fix bids_select_customer policy — the subquery join
--    pattern blocks Supabase Realtime delivery of new bids
--    to the customer. Replace with a direct column check using
--    a SECURITY DEFINER helper function.
-- ============================================================

-- ── 1. Fix create_order expiry ────────────────────────────────────────────

-- Directly update the expires_at line in the live function.
-- pg_get_functiondef normalises whitespace so we match all variants.
DO $$
DECLARE
    v_src TEXT;
    v_oid OID;
BEGIN
    SELECT oid INTO v_oid
    FROM pg_proc
    WHERE proname = 'create_order'
      AND pronamespace = 'public'::regnamespace;

    IF v_oid IS NULL THEN
        RAISE EXCEPTION 'create_order not found';
    END IF;

    SELECT pg_get_functiondef(v_oid) INTO v_src;

    -- Replace every interval variant that means "10 minutes"
    v_src := regexp_replace(v_src, 'INTERVAL\s+''10\s+minutes?''', 'INTERVAL ''2 hours''', 'gi');

    EXECUTE v_src;
    RAISE NOTICE 'create_order expiry updated to 2 hours';
END;
$$;

-- Verify
DO $$
DECLARE
    v_src TEXT;
BEGIN
    SELECT pg_get_functiondef(oid) INTO v_src
    FROM pg_proc
    WHERE proname = 'create_order' AND pronamespace = 'public'::regnamespace;

    IF v_src LIKE '%10 minutes%' OR v_src LIKE '%10minutes%' THEN
        RAISE WARNING 'create_order still contains 10 minutes — manual fix required';
    ELSE
        RAISE NOTICE 'Verified: create_order expiry is no longer 10 minutes';
    END IF;
END;
$$;

-- ── 2. Fix bids_select_customer for Realtime ─────────────────────────────

-- Helper: returns the customer_id for the given order, bypassing RLS.
-- Used only in bids policy so the subquery doesn't recurse.
CREATE OR REPLACE FUNCTION get_order_customer_id(p_order_id UUID)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE v_customer_id UUID;
BEGIN
    SELECT customer_id INTO v_customer_id FROM orders WHERE id = p_order_id;
    RETURN v_customer_id;
END;
$$;

-- Replace the old subquery-based policy with the helper function
DROP POLICY IF EXISTS bids_select_customer ON bids;
CREATE POLICY bids_select_customer ON bids FOR SELECT
USING (get_order_customer_id(order_id) = auth.uid());
