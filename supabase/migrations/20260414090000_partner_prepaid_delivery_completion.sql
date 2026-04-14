-- Partner-linked deliveries are prepaid by the partner during the staging
-- integration. Completion must not create cash outstanding balances; Dzpatch
-- completion is the delivered source of truth for Foodhunt after pickup.

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
    v_order              orders%ROWTYPE;
    v_rider              riders%ROWTYPE;
    v_partner_delivery   partner_deliveries%ROWTYPE;
    v_is_partner_delivery BOOLEAN := FALSE;
    v_commission         NUMERIC;
    v_delivery_price     NUMERIC;
    v_rider_earnings     NUMERIC;
    v_rider_wallet       UUID;
    v_platform_wallet    UUID;
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

    SELECT * INTO v_partner_delivery
    FROM partner_deliveries
    WHERE dzpatch_order_id = p_order_id
    FOR UPDATE;

    v_is_partner_delivery := FOUND;

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
        delivered_at  = NOW(),
        pod_photo_url = p_pod_photo_url,
        updated_at    = NOW()
    WHERE id = p_order_id;

    INSERT INTO order_status_history (order_id, old_status, new_status, changed_by)
    VALUES (p_order_id, 'arrived_dropoff', 'delivered', auth.uid());

    SELECT id INTO v_rider_wallet
    FROM wallets
    WHERE owner_type = 'rider'
      AND owner_id = v_rider.profile_id
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_order.payment_method = 'wallet' OR v_is_partner_delivery THEN
        IF v_rider_wallet IS NOT NULL AND v_rider_earnings > 0 THEN
            PERFORM credit_wallet(
                v_rider_wallet,
                v_rider_earnings,
                'credit',
                'EARN-' || p_order_id::TEXT,
                CASE
                    WHEN v_is_partner_delivery THEN 'Partner delivery earnings'
                    ELSE 'Delivery earnings'
                END,
                p_order_id,
                jsonb_build_object(
                    'partner_delivery_id', CASE WHEN v_is_partner_delivery THEN v_partner_delivery.id ELSE NULL END,
                    'settlement_mode', CASE WHEN v_is_partner_delivery THEN 'partner_prepaid_staging' ELSE 'wallet' END
                )
            );
        END IF;

        IF v_commission > 0 THEN
            PERFORM credit_wallet(
                v_platform_wallet,
                v_commission,
                'commission_credit',
                CASE
                    WHEN v_is_partner_delivery THEN 'COMM-PARTNER-' || p_order_id::TEXT
                    ELSE 'COMM-' || p_order_id::TEXT
                END,
                CASE
                    WHEN v_is_partner_delivery THEN 'Platform commission (partner prepaid staging)'
                    ELSE 'Platform commission'
                END,
                p_order_id,
                jsonb_build_object(
                    'partner_delivery_id', CASE WHEN v_is_partner_delivery THEN v_partner_delivery.id ELSE NULL END,
                    'settlement_mode', CASE WHEN v_is_partner_delivery THEN 'partner_prepaid_staging' ELSE 'wallet' END
                )
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

    IF v_is_partner_delivery THEN
        UPDATE partner_deliveries
        SET status = 'delivered',
            delivery_code_status = 'used',
            completed_at = COALESCE(completed_at, NOW()),
            updated_at = NOW()
        WHERE id = v_partner_delivery.id;
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
            'commission', v_commission,
            'partner_delivery_id', CASE WHEN v_is_partner_delivery THEN v_partner_delivery.id ELSE NULL END
        )
    );

    RETURN jsonb_build_object(
        'rider_earnings',      v_rider_earnings,
        'platform_commission', v_commission,
        'delivery_price',      v_delivery_price,
        'payment_method',      v_order.payment_method,
        'partner_delivery',    v_is_partner_delivery,
        'settlement_mode',     CASE WHEN v_is_partner_delivery THEN 'partner_prepaid_staging' ELSE v_order.payment_method END
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.complete_delivery(uuid, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.complete_delivery(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_delivery(uuid, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.get_price_quote(
    p_pickup_lat double precision,
    p_pickup_lng double precision,
    p_dropoff_lat double precision,
    p_dropoff_lng double precision,
    p_package_size text DEFAULT 'small',
    p_promo_code text DEFAULT NULL,
    p_service_area_id uuid DEFAULT NULL
)
RETURNS TABLE(
    distance_km double precision,
    delivery_fee numeric,
    vat_amount numeric,
    discount_amount numeric,
    total_price numeric,
    surge_multiplier numeric,
    promo_applied boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_pickup_point geography;
    v_dropoff_point geography;
    v_distance_km numeric;
    v_delivery_fee numeric;
    v_vat_amount numeric;
    v_discount_amount numeric := 0;
    v_total_price numeric;
    v_size_multiplier numeric := 1.0;
    v_promo_id uuid;
    v_pricing pricing_rules%ROWTYPE;
    v_effective_surge numeric := 1.0;
    v_promo_applied boolean := false;
BEGIN
    IF p_pickup_lat IS NULL OR p_pickup_lng IS NULL OR p_dropoff_lat IS NULL OR p_dropoff_lng IS NULL THEN
        RAISE EXCEPTION 'Pickup and dropoff coordinates are required';
    END IF;

    IF p_package_size = 'medium' THEN
        v_size_multiplier := 1.5;
    ELSIF p_package_size = 'large' THEN
        v_size_multiplier := 2.0;
    END IF;

    v_pickup_point := ST_SetSRID(ST_MakePoint(p_pickup_lng, p_pickup_lat), 4326)::GEOGRAPHY;
    v_dropoff_point := ST_SetSRID(ST_MakePoint(p_dropoff_lng, p_dropoff_lat), 4326)::GEOGRAPHY;
    v_distance_km := ROUND((ST_Distance(v_pickup_point, v_dropoff_point) / 1000.0)::NUMERIC, 2);

    IF p_service_area_id IS NOT NULL THEN
        SELECT * INTO v_pricing
        FROM pricing_rules
        WHERE service_area_id = p_service_area_id
            AND is_active = TRUE
        LIMIT 1;
    END IF;

    IF v_pricing.id IS NOT NULL THEN
        v_effective_surge := GREATEST(1, LEAST(COALESCE(v_pricing.surge_multiplier, 1), 5));
        v_delivery_fee := ROUND(
            (v_pricing.base_rate + (v_distance_km * v_pricing.per_km_rate)) * v_effective_surge * v_size_multiplier,
            2
        );
        IF v_delivery_fee < v_pricing.min_price THEN
            v_delivery_fee := v_pricing.min_price;
        END IF;
        IF v_pricing.max_price IS NOT NULL AND v_delivery_fee > v_pricing.max_price THEN
            v_delivery_fee := v_pricing.max_price;
        END IF;
        v_delivery_fee := CEIL(v_delivery_fee / 100.0) * 100.0;
        v_vat_amount := ROUND(v_delivery_fee * (v_pricing.vat_percentage / 100.0), 2);
    ELSE
        v_effective_surge := 1.0;
        v_delivery_fee := CEIL(ROUND((500 + (v_distance_km * 100)) * v_size_multiplier, 2) / 100.0) * 100.0;
        v_vat_amount := ROUND(v_delivery_fee * 0.075, 2);
    END IF;

    IF p_promo_code IS NOT NULL AND NULLIF(BTRIM(p_promo_code), '') IS NOT NULL THEN
        SELECT id INTO v_promo_id
        FROM promo_codes
        WHERE code = UPPER(TRIM(p_promo_code))
            AND is_active = TRUE
            AND starts_at <= NOW()
            AND (expires_at IS NULL OR expires_at > NOW())
            AND (max_uses IS NULL OR used_count < max_uses)
            AND (v_delivery_fee + v_vat_amount) >= min_order_amount;

        IF v_promo_id IS NOT NULL THEN
            SELECT CASE
                WHEN discount_type = 'percentage' THEN
                    LEAST(ROUND(v_delivery_fee * (discount_value / 100.0), 2), COALESCE(max_discount_amount, v_delivery_fee))
                ELSE LEAST(discount_value, v_delivery_fee)
            END
            INTO v_discount_amount
            FROM promo_codes
            WHERE id = v_promo_id;
            v_promo_applied := TRUE;
        END IF;
    END IF;

    v_total_price := GREATEST(v_delivery_fee + v_vat_amount - v_discount_amount, 0);

    RETURN QUERY
    SELECT
        v_distance_km::FLOAT,
        v_delivery_fee,
        v_vat_amount,
        v_discount_amount,
        v_total_price,
        v_effective_surge,
        v_promo_applied;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_price_quote(double precision, double precision, double precision, double precision, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_price_quote(double precision, double precision, double precision, double precision, text, text, uuid) TO service_role;
