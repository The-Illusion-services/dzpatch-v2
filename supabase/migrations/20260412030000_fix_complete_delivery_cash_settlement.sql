-- Ensure complete_delivery preserves cash-order commission settlement.
-- Staging was completing cash deliveries successfully without writing the
-- outstanding_balances row or platform cash commission transaction.

CREATE OR REPLACE FUNCTION public.complete_delivery(
    p_order_id      UUID,
    p_rider_id      UUID,
    p_pod_photo_url TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_order           orders%ROWTYPE;
    v_rider           riders%ROWTYPE;
    v_commission      NUMERIC;
    v_delivery_price  NUMERIC;
    v_rider_earnings  NUMERIC;
    v_rider_wallet    UUID;
    v_platform_wallet UUID;
BEGIN
    SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found';
    END IF;

    IF v_order.status != 'arrived_dropoff' THEN
        RAISE EXCEPTION 'Order must be in arrived_dropoff status (current: %)', v_order.status;
    END IF;

    IF NOT COALESCE(v_order.delivery_code_verified, FALSE) THEN
        RAISE EXCEPTION 'Delivery code must be verified before completing delivery';
    END IF;

    IF p_pod_photo_url IS NULL OR TRIM(p_pod_photo_url) = '' THEN
        RAISE EXCEPTION 'Proof-of-delivery photo is required to complete a delivery';
    END IF;

    SELECT * INTO v_rider FROM riders WHERE id = p_rider_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Rider not found';
    END IF;

    IF v_order.rider_id != p_rider_id THEN
        RAISE EXCEPTION 'Rider is not assigned to this order';
    END IF;

    SELECT id INTO v_platform_wallet
    FROM wallets
    WHERE owner_type = 'platform'
      AND owner_id = '00000000-0000-0000-0000-000000000001'::uuid
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_platform_wallet IS NULL THEN
        RAISE EXCEPTION 'Platform wallet not found - cannot complete delivery without a revenue ledger';
    END IF;

    v_delivery_price := COALESCE(v_order.final_price, 0) - COALESCE(v_order.vat_amount, 0);

    IF COALESCE(v_order.platform_commission_amount, 0) > 0 THEN
        v_commission := v_order.platform_commission_amount;
    ELSE
        v_commission := ROUND(
            v_delivery_price * (COALESCE(v_order.platform_commission_rate, 15.0) / 100.0),
            2
        );
    END IF;

    v_rider_earnings := COALESCE(v_order.final_price, 0) - v_commission;

    UPDATE orders
    SET status        = 'delivered',
        pod_photo_url = p_pod_photo_url,
        updated_at    = NOW()
    WHERE id = p_order_id;

    INSERT INTO order_status_history (order_id, old_status, new_status, changed_by)
    VALUES (p_order_id, 'arrived_dropoff', 'delivered', auth.uid());

    IF v_order.payment_method = 'wallet' THEN
        SELECT id INTO v_rider_wallet
        FROM wallets
        WHERE owner_type = 'rider'
          AND owner_id = v_rider.profile_id
        ORDER BY created_at DESC
        LIMIT 1;

        IF v_rider_wallet IS NOT NULL AND v_rider_earnings > 0 THEN
            PERFORM credit_wallet(
                v_rider_wallet,
                v_rider_earnings,
                'credit',
                'EARN-' || p_order_id::TEXT,
                'Delivery earnings',
                p_order_id
            );
        END IF;

        IF v_commission > 0 THEN
            PERFORM credit_wallet(
                v_platform_wallet,
                v_commission,
                'commission_credit',
                'COMM-' || p_order_id::TEXT,
                'Platform commission',
                p_order_id
            );
        END IF;
    ELSIF v_order.payment_method = 'cash' THEN
        IF v_commission > 0 THEN
            INSERT INTO outstanding_balances (customer_id, order_id, rider_id, amount)
            VALUES (v_order.customer_id, p_order_id, p_rider_id, v_commission)
            ON CONFLICT (order_id) DO NOTHING;

            PERFORM credit_wallet(
                v_platform_wallet,
                v_commission,
                'commission_credit',
                'COMM-CASH-' || p_order_id::TEXT,
                'Platform commission (cash order)',
                p_order_id
            );
        END IF;
    END IF;

    INSERT INTO notifications (user_id, type, title, body, data)
    VALUES (
        v_rider.profile_id,
        'order_update',
        'Delivery Completed',
        'Great job! Your earnings have been added to your wallet.',
        jsonb_build_object(
            'order_id', p_order_id,
            'earnings', v_rider_earnings,
            'commission', v_commission
        )
    );

    RETURN jsonb_build_object(
        'rider_earnings',      v_rider_earnings,
        'platform_commission', v_commission,
        'delivery_price',      v_delivery_price,
        'payment_method',      v_order.payment_method
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.complete_delivery(uuid, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.complete_delivery(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_delivery(uuid, uuid, text) TO service_role;
