-- ============================================================
-- DZpatch V2.0 — Add authorization check to update_order_status
-- Migration: 00030_authorize_order_status_update.sql
--
-- PROBLEM: update_order_status RPC (00002) performs no caller
-- validation. Any authenticated user can call it with any order_id
-- and any status, effectively hijacking any order in the system.
--
-- FIX: Add a check that the caller (auth.uid()) is either:
--   (a) the customer who created the order, OR
--   (b) the profile of the rider assigned to the order
--
-- The only exception is system/admin calls where p_changed_by is
-- passed as a known admin profile_id — we allow those through if
-- the caller's role is admin.
--
-- Note: update_order_status is SECURITY DEFINER so it runs as the
-- function owner (postgres). We use auth.uid() to get the caller.
-- ============================================================

CREATE OR REPLACE FUNCTION update_order_status(
    p_order_id   UUID,
    p_new_status order_status,
    p_changed_by UUID    DEFAULT NULL,
    p_reason     TEXT    DEFAULT NULL,
    p_metadata   JSONB   DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order          orders%ROWTYPE;
    v_caller_id      UUID;
    v_rider_profile  UUID;
    v_caller_role    user_role;
    v_valid_caller   BOOLEAN := FALSE;
BEGIN
    -- Identify caller
    v_caller_id := auth.uid();

    SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found';
    END IF;

    -- Check caller authorization:
    --   1. Customer who owns the order
    --   2. Rider assigned to the order (match via riders.profile_id)
    --   3. Admin role
    IF v_caller_id = v_order.customer_id THEN
        v_valid_caller := TRUE;
    END IF;

    IF NOT v_valid_caller AND v_order.rider_id IS NOT NULL THEN
        SELECT r.profile_id INTO v_rider_profile
        FROM riders r WHERE r.id = v_order.rider_id;
        IF v_rider_profile = v_caller_id THEN
            v_valid_caller := TRUE;
        END IF;
    END IF;

    IF NOT v_valid_caller THEN
        SELECT role INTO v_caller_role FROM profiles WHERE id = v_caller_id;
        IF v_caller_role = 'admin' THEN
            v_valid_caller := TRUE;
        END IF;
    END IF;

    -- Allow NULL caller for internal/cron calls (cancel_expired_orders, etc.)
    IF v_caller_id IS NULL THEN
        v_valid_caller := TRUE;
    END IF;

    IF NOT v_valid_caller THEN
        RAISE EXCEPTION 'Unauthorized: you are not a participant in this order';
    END IF;

    -- Enforce state machine
    IF NOT (
        (v_order.status = 'pending'          AND p_new_status IN ('matched',          'cancelled')) OR
        (v_order.status = 'matched'          AND p_new_status IN ('pickup_en_route',  'cancelled')) OR
        (v_order.status = 'pickup_en_route'  AND p_new_status IN ('arrived_pickup',   'cancelled')) OR
        (v_order.status = 'arrived_pickup'   AND p_new_status IN ('in_transit',       'cancelled')) OR
        (v_order.status = 'in_transit'       AND p_new_status IN ('arrived_dropoff',  'cancelled')) OR
        (v_order.status = 'arrived_dropoff'  AND p_new_status IN ('delivered',        'cancelled')) OR
        (v_order.status = 'delivered'        AND p_new_status = 'completed')
    ) THEN
        RAISE EXCEPTION 'Invalid status transition: % → %', v_order.status, p_new_status;
    END IF;

    -- Apply transition
    UPDATE orders SET
        status       = p_new_status,
        picked_up_at = CASE WHEN p_new_status = 'in_transit'       THEN NOW() ELSE picked_up_at END,
        delivered_at = CASE WHEN p_new_status = 'delivered'        THEN NOW() ELSE delivered_at END,
        cancelled_at = CASE WHEN p_new_status = 'cancelled'        THEN NOW() ELSE cancelled_at END,
        updated_at   = NOW()
    WHERE id = p_order_id;

    -- Record history
    INSERT INTO order_status_history (order_id, old_status, new_status, changed_by, reason, metadata)
    VALUES (p_order_id, v_order.status, p_new_status, COALESCE(p_changed_by, v_caller_id), p_reason, p_metadata);

    -- Notify relevant parties
    IF v_order.customer_id IS NOT NULL THEN
        INSERT INTO notifications (user_id, type, title, body, data)
        VALUES (
            v_order.customer_id,
            'order_update',
            'Order Update',
            'Your order status has changed to: ' || p_new_status,
            jsonb_build_object('order_id', p_order_id, 'status', p_new_status)
        );
    END IF;

    IF v_order.rider_id IS NOT NULL AND v_rider_profile IS NOT NULL THEN
        INSERT INTO notifications (user_id, type, title, body, data)
        VALUES (
            v_rider_profile,
            'order_update',
            'Order Update',
            'Order status changed to: ' || p_new_status,
            jsonb_build_object('order_id', p_order_id, 'status', p_new_status)
        );
    END IF;
END;
$$;
