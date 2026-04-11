-- ============================================================
-- DZpatch V2.0 — Fix Realtime RLS subquery patterns
-- Migration: 00028_fix_realtime_rls_subqueries.sql
--
-- PROBLEM: Supabase Realtime (postgres_changes) evaluates RLS policies
-- to decide whether to deliver a row change event to a subscriber.
-- Policies that use subqueries (e.g. WHERE order_id IN (SELECT ...))
-- cause Realtime to fail silently — events are not delivered.
--
-- Migration 00023 already fixed the bids table using the
-- get_order_customer_id() SECURITY DEFINER helper.
--
-- This migration applies the same fix to:
--   - chat_messages (customer SELECT + rider SELECT)
--   - order_status_history (customer SELECT + rider SELECT)
--
-- Pattern: replace subquery-based USING clause with a call to a
-- SECURITY DEFINER helper function that bypasses RLS internally.
-- ============================================================

-- ── Helper: get profile_id of the rider assigned to an order ─
-- (mirrors get_order_customer_id but for the rider side)
CREATE OR REPLACE FUNCTION get_order_rider_profile_id(p_order_id UUID)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
    v_profile_id UUID;
BEGIN
    SELECT r.profile_id INTO v_profile_id
    FROM orders o
    JOIN riders r ON r.id = o.rider_id
    WHERE o.id = p_order_id;
    RETURN v_profile_id;
END;
$$;

-- Ensure get_order_customer_id exists (created in 00023, but safe to re-create)
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

-- ── chat_messages ─────────────────────────────────────────────

-- Drop old policies that use subqueries
DROP POLICY IF EXISTS "chat_select_customer" ON chat_messages;
DROP POLICY IF EXISTS "chat_select_rider"    ON chat_messages;
DROP POLICY IF EXISTS "chat_insert_customer" ON chat_messages;
DROP POLICY IF EXISTS "chat_insert_rider"    ON chat_messages;
-- Also drop any alternate naming conventions
DROP POLICY IF EXISTS "customers_read_chat"  ON chat_messages;
DROP POLICY IF EXISTS "riders_read_chat"     ON chat_messages;
DROP POLICY IF EXISTS "customers_send_chat"  ON chat_messages;
DROP POLICY IF EXISTS "riders_send_chat"     ON chat_messages;

-- Customer: read messages on their orders
CREATE POLICY "chat_select_customer"
    ON chat_messages
    FOR SELECT
    USING (
        get_order_customer_id(order_id) = auth.uid()
    );

-- Rider: read messages on orders assigned to them
CREATE POLICY "chat_select_rider"
    ON chat_messages
    FOR SELECT
    USING (
        get_order_rider_profile_id(order_id) = auth.uid()
    );

-- Customer: send messages on their own orders
CREATE POLICY "chat_insert_customer"
    ON chat_messages
    FOR INSERT
    WITH CHECK (
        sender_id = auth.uid()
        AND get_order_customer_id(order_id) = auth.uid()
    );

-- Rider: send messages on their assigned orders
CREATE POLICY "chat_insert_rider"
    ON chat_messages
    FOR INSERT
    WITH CHECK (
        sender_id = auth.uid()
        AND get_order_rider_profile_id(order_id) = auth.uid()
    );

-- Admin: read all
DROP POLICY IF EXISTS "chat_select_admin" ON chat_messages;
CREATE POLICY "chat_select_admin"
    ON chat_messages
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.role = 'admin' AND p.is_active = TRUE
        )
    );

-- ── order_status_history ──────────────────────────────────────

DROP POLICY IF EXISTS "status_history_select_customer" ON order_status_history;
DROP POLICY IF EXISTS "status_history_select_rider"    ON order_status_history;
DROP POLICY IF EXISTS "status_history_select_admin"    ON order_status_history;
-- Also drop any alternate naming conventions
DROP POLICY IF EXISTS "customers_read_status_history"  ON order_status_history;
DROP POLICY IF EXISTS "riders_read_status_history"     ON order_status_history;

-- Customer: read history of their own orders
CREATE POLICY "status_history_select_customer"
    ON order_status_history
    FOR SELECT
    USING (
        get_order_customer_id(order_id) = auth.uid()
    );

-- Rider: read history of orders assigned to them
CREATE POLICY "status_history_select_rider"
    ON order_status_history
    FOR SELECT
    USING (
        get_order_rider_profile_id(order_id) = auth.uid()
    );

-- Admin: read all
CREATE POLICY "status_history_select_admin"
    ON order_status_history
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.role = 'admin' AND p.is_active = TRUE
        )
    );
