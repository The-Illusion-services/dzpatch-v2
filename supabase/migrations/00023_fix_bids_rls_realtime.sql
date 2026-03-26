-- ============================================================
-- DZpatch V2.0 — Fix bids RLS for Supabase Realtime
-- Migration: 00023_fix_bids_rls_realtime.sql
--
-- The subquery pattern in bids_select_customer blocks Realtime.
-- This migration ensures the SECURITY DEFINER helper from 00021
-- is in place and the policy uses it, not a subquery.
-- ============================================================

-- Ensure helper function exists (idempotent)
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

-- Drop old subquery-based policy and replace with helper function
DROP POLICY IF EXISTS bids_select_customer ON bids;
CREATE POLICY bids_select_customer ON bids FOR SELECT
USING (get_order_customer_id(order_id) = auth.uid());

-- Verify
DO $$
BEGIN
    RAISE NOTICE 'bids_select_customer policy now uses get_order_customer_id() — Realtime should work.';
END;
$$;
