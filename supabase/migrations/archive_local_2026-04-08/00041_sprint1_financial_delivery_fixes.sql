-- ============================================================
-- DZpatch V2.0 - Sprint 1 financial and delivery risk fixes
--
-- Fixes:
-- 1. complete_delivery rider wallet lookup must use riders.profile_id
--    because rider wallets are owned by auth/profile ids, not riders.id
-- 2. keep cash outstanding_balance behavior while restoring correct
--    payout crediting for wallet-paid orders
-- ============================================================

CREATE OR REPLACE FUNCTION complete_delivery(
    p_order_id      UUID,
    p_rider_id      UUID,
    p_pod_photo_url TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order           orders%ROWTYPE;
    v_rider           riders%ROWTYPE;
    v_commission_rate NUMERIC;
    v_commission      NUMERIC;
    v_rider_earnings  NUMERIC;
    v_rider_wallet    UUID;
    v_platform_wallet UUID;
BEGIN
    SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
    IF v_order.status != 'arrived_dropoff' THEN
        RAISE EXCEPTION 'Order must be in arrived_dropoff status (current: %)', v_order.status;
    END IF;

    IF NOT COALESCE(v_order.delivery_code_verified, FALSE) THEN
        RAISE EXCEPTION 'Delivery code must be verified before marking complete';
    END IF;

    SELECT * INTO v_rider FROM riders WHERE id = p_rider_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Rider not found'; END IF;
    IF v_order.rider_id != p_rider_id THEN
        RAISE EXCEPTION 'Rider is not assigned to this order';
    END IF;

    v_commission_rate := COALESCE(v_rider.commission_rate, 0.10);
    v_commission      := ROUND(COALESCE(v_order.final_price, 0) * v_commission_rate, 2);
    v_rider_earnings  := COALESCE(v_order.final_price, 0) - v_commission;

    UPDATE orders SET
        status        = 'delivered',
        pod_photo_url = COALESCE(p_pod_photo_url, pod_photo_url),
        updated_at    = NOW()
    WHERE id = p_order_id;

    INSERT INTO order_status_history (order_id, old_status, new_status, changed_by)
    VALUES (p_order_id, 'arrived_dropoff', 'delivered', auth.uid());

    IF v_order.payment_method = 'wallet' THEN
        SELECT id INTO v_rider_wallet FROM wallets
        WHERE owner_type = 'rider' AND owner_id = v_rider.profile_id;

        IF v_rider_wallet IS NOT NULL AND v_rider_earnings > 0 THEN
            PERFORM credit_wallet(
                v_rider_wallet, v_rider_earnings, 'credit',
                'EARN-' || p_order_id::TEXT, 'Delivery earnings', p_order_id
            );
        END IF;

        SELECT id INTO v_platform_wallet FROM wallets WHERE owner_type = 'platform' LIMIT 1;
        IF v_platform_wallet IS NOT NULL AND v_commission > 0 THEN
            PERFORM credit_wallet(
                v_platform_wallet, v_commission, 'commission_credit',
                'COMM-' || p_order_id::TEXT, 'Platform commission', p_order_id
            );
        END IF;
    ELSIF v_order.payment_method = 'cash' THEN
        INSERT INTO outstanding_balances (customer_id, order_id, rider_id, amount)
        VALUES (v_order.customer_id, p_order_id, p_rider_id, v_order.final_price)
        ON CONFLICT (order_id) DO NOTHING;
    END IF;

    INSERT INTO notifications (user_id, type, title, body, data)
    VALUES (
        v_order.customer_id,
        'order_update',
        'Order Delivered!',
        'Your package has been delivered successfully.',
        jsonb_build_object('order_id', p_order_id)
    );

    RETURN jsonb_build_object(
        'rider_earnings', v_rider_earnings,
        'commission',     v_commission,
        'final_price',    v_order.final_price,
        'payment_method', v_order.payment_method
    );
END;
$$;

GRANT EXECUTE ON FUNCTION complete_delivery(UUID, UUID, TEXT) TO authenticated;
