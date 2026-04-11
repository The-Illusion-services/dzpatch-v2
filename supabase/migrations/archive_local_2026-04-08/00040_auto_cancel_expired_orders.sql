-- ============================================================
-- DZpatch V2.0 — Sprint 1: Auto-cancel expired orders
-- Migration: 00040_auto_cancel_expired_orders.sql
--
-- PROBLEM: Orders with expires_at in the past stay in 'pending'
-- forever if no rider matches. Riders keep seeing ghost orders.
-- Customer is stuck on finding-rider screen.
--
-- FIX:
-- 1. Create cancel_expired_orders() function
-- 2. Schedule it via pg_cron every 5 minutes (if available)
--    OR provide manual call instructions if pg_cron not enabled.
--
-- NOTE: Supabase projects on Pro+ plan have pg_cron available.
-- If not available, call cancel_expired_orders() from an Edge
-- Function on a scheduled trigger.
-- ============================================================

-- ── 1. cancel_expired_orders function ─────────────────────────
CREATE OR REPLACE FUNCTION cancel_expired_orders()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_expired_ids UUID[];
    v_count       INT;
    v_order_id    UUID;
    v_customer_id UUID;
BEGIN
    -- Collect all expired pending orders
    SELECT ARRAY_AGG(id) INTO v_expired_ids
    FROM orders
    WHERE status = 'pending'
      AND expires_at IS NOT NULL
      AND expires_at < NOW();

    IF v_expired_ids IS NULL OR ARRAY_LENGTH(v_expired_ids, 1) = 0 THEN
        RETURN 0;
    END IF;

    -- Cancel each and notify customer
    FOREACH v_order_id IN ARRAY v_expired_ids LOOP
        SELECT customer_id INTO v_customer_id FROM orders WHERE id = v_order_id;

        UPDATE orders
        SET status     = 'cancelled',
            updated_at = NOW()
        WHERE id = v_order_id;

        INSERT INTO order_status_history (order_id, old_status, new_status, changed_by)
        VALUES (v_order_id, 'pending', 'cancelled', NULL);

        -- Refund wallet payment if applicable
        PERFORM refund_cancelled_order(v_order_id);

        -- Notify customer
        INSERT INTO notifications (user_id, type, title, body, data)
        VALUES (
            v_customer_id,
            'order_update',
            'Order Expired',
            'No rider was found for your order within the time limit. You have been refunded.',
            jsonb_build_object('order_id', v_order_id, 'reason', 'no_rider_found')
        );

        -- Also reject all open bids on this order
        UPDATE bids SET status = 'rejected', updated_at = NOW()
        WHERE order_id = v_order_id AND status = 'pending';
    END LOOP;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN ARRAY_LENGTH(v_expired_ids, 1);
END;
$$;

GRANT EXECUTE ON FUNCTION cancel_expired_orders() TO service_role;

-- ── 2. Helper: refund_cancelled_order ─────────────────────────
-- Refunds wallet payment when an order is cancelled (if not already refunded)
CREATE OR REPLACE FUNCTION refund_cancelled_order(p_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order      orders%ROWTYPE;
    v_wallet_id  UUID;
    v_refund_ref TEXT;
BEGIN
    SELECT * INTO v_order FROM orders WHERE id = p_order_id;
    IF NOT FOUND THEN RETURN; END IF;

    -- Only refund wallet orders that haven't already been refunded
    IF v_order.payment_method != 'wallet' THEN RETURN; END IF;
    IF v_order.final_price IS NULL OR v_order.final_price <= 0 THEN RETURN; END IF;

    -- Check if a refund transaction already exists for this order
    IF EXISTS (
        SELECT 1 FROM transactions
        WHERE reference LIKE 'REFUND-' || p_order_id::TEXT || '%'
    ) THEN
        RETURN; -- Already refunded
    END IF;

    SELECT id INTO v_wallet_id
    FROM wallets WHERE owner_type = 'customer' AND owner_id = v_order.customer_id;

    IF v_wallet_id IS NULL THEN RETURN; END IF;

    v_refund_ref := 'REFUND-' || p_order_id::TEXT;

    PERFORM credit_wallet(
        v_wallet_id,
        v_order.final_price,
        'refund',
        v_refund_ref,
        'Refund: order expired — no rider found',
        p_order_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION refund_cancelled_order(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION refund_cancelled_order(UUID) TO authenticated;

-- ── 3. Schedule via pg_cron (if available on your Supabase plan) ──
-- Uncomment the block below if you have pg_cron enabled:
--
-- SELECT cron.schedule(
--     'cancel-expired-orders',
--     '*/5 * * * *',  -- every 5 minutes
--     $$SELECT cancel_expired_orders();$$
-- );
--
-- To check if pg_cron is available:
--   SELECT * FROM pg_extension WHERE extname = 'pg_cron';
--
-- If pg_cron is NOT available:
-- Call cancel_expired_orders() from a Supabase Edge Function
-- on a scheduled cron trigger (Dashboard → Edge Functions → Schedule).
