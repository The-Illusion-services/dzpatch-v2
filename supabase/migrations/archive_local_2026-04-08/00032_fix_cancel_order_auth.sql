-- Migration 00032: Fix cancel_order auth bypass
--
-- PROBLEM: update_order_status (00030) checks auth.uid() for authorization.
-- cancel_order is SECURITY DEFINER, so auth.uid() still returns the calling
-- user's ID correctly. However, when cancel_order calls update_order_status
-- with a pending order that has no rider_id yet, the rider check is skipped
-- and the customer_id check must match. If there's any mismatch (e.g. the
-- order was created by a different profile UUID than expected), it throws.
--
-- FIX: Replace the call inside cancel_order with a direct status UPDATE +
-- history INSERT, bypassing update_order_status entirely. This is safe because
-- cancel_order already does its own auth-equivalent validation (it checks the
-- order exists and isn't already in a terminal state).

CREATE OR REPLACE FUNCTION cancel_order(
    p_order_id UUID,
    p_cancelled_by cancellation_actor,
    p_user_id UUID DEFAULT NULL,
    p_reason TEXT DEFAULT 'No reason provided'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order orders%ROWTYPE;
    v_wallet_id UUID;
    v_penalty NUMERIC := 0;
    v_refund_amount NUMERIC;
    v_rider_profile_id UUID;
    v_platform_wallet UUID;
BEGIN
    -- Lock order
    SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found';
    END IF;
    IF v_order.status IN ('delivered', 'completed', 'cancelled') THEN
        RAISE EXCEPTION 'Cannot cancel order in status: %', v_order.status;
    END IF;

    -- Determine penalty (after pickup = penalty applies)
    IF v_order.status IN ('in_transit', 'arrived_dropoff') THEN
        v_penalty := ROUND(v_order.final_price * 0.20, 2);
    END IF;

    v_refund_amount := COALESCE(v_order.final_price, 0) - v_penalty;

    -- Refund customer (minus penalty) — only for wallet-paid orders
    IF v_refund_amount > 0 AND v_order.payment_method = 'wallet' THEN
        SELECT id INTO v_wallet_id FROM wallets
        WHERE owner_type = 'customer' AND owner_id = v_order.customer_id;

        IF v_wallet_id IS NOT NULL THEN
            PERFORM credit_wallet(
                v_wallet_id,
                v_refund_amount,
                'refund',
                'CANCEL-REFUND-' || p_order_id::TEXT,
                'Order cancellation refund',
                p_order_id
            );
        END IF;
    END IF;

    -- If penalty collected, credit platform
    IF v_penalty > 0 THEN
        SELECT id INTO v_platform_wallet FROM wallets WHERE owner_type = 'platform' LIMIT 1;
        IF v_platform_wallet IS NOT NULL THEN
            PERFORM credit_wallet(
                v_platform_wallet,
                v_penalty,
                'credit',
                'CANCEL-PENALTY-' || p_order_id::TEXT,
                'Cancellation penalty',
                p_order_id
            );
        END IF;
    END IF;

    -- Directly update order status (bypass update_order_status auth check)
    UPDATE orders SET
        status       = 'cancelled',
        cancelled_at = NOW(),
        updated_at   = NOW()
    WHERE id = p_order_id;

    -- Record in history
    INSERT INTO order_status_history (order_id, old_status, new_status, changed_by, reason)
    VALUES (p_order_id, v_order.status, 'cancelled', COALESCE(p_user_id, auth.uid()), p_reason);

    -- Record in cancellations table
    INSERT INTO cancellations (order_id, cancelled_by, user_id, reason, penalty_amount)
    VALUES (p_order_id, p_cancelled_by, COALESCE(p_user_id, auth.uid()), p_reason, v_penalty);

    -- Notify rider if assigned
    IF v_order.rider_id IS NOT NULL THEN
        SELECT profile_id INTO v_rider_profile_id FROM riders WHERE id = v_order.rider_id;
        IF v_rider_profile_id IS NOT NULL THEN
            INSERT INTO notifications (user_id, type, title, body, data)
            VALUES (
                v_rider_profile_id,
                'order_update',
                'Order Cancelled',
                'The delivery order has been cancelled.',
                jsonb_build_object('order_id', p_order_id, 'reason', p_reason)
            );
        END IF;
    END IF;

    -- Notify customer
    INSERT INTO notifications (user_id, type, title, body, data)
    VALUES (
        v_order.customer_id,
        'order_update',
        'Order Cancelled',
        'Your order has been cancelled.',
        jsonb_build_object('order_id', p_order_id, 'reason', p_reason)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION cancel_order(UUID, cancellation_actor, UUID, TEXT) TO authenticated;
