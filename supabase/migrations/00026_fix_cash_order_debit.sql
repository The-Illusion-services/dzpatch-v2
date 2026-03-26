-- ============================================================
-- DZpatch V2.0 — Fix cash order wallet debit
-- Migration: 00026_fix_cash_order_debit.sql
--
-- PROBLEM: create_order (00022) calls debit_wallet unconditionally,
-- even when p_payment_method = 'cash'. Cash orders should not debit
-- the customer wallet at creation time — payment is collected by the
-- rider at delivery.
--
-- FIX: Wrap the debit_wallet call inside IF p_payment_method = 'wallet'.
-- All other logic (pricing, order record, status history, notification)
-- remains identical to 00022.
-- ============================================================

CREATE OR REPLACE FUNCTION create_order(
    p_customer_id UUID,
    p_pickup_address TEXT,
    p_pickup_lat FLOAT,
    p_pickup_lng FLOAT,
    p_pickup_contact_name TEXT DEFAULT NULL,
    p_pickup_contact_phone TEXT DEFAULT NULL,
    p_dropoff_address TEXT DEFAULT NULL,
    p_dropoff_lat FLOAT DEFAULT NULL,
    p_dropoff_lng FLOAT DEFAULT NULL,
    p_dropoff_contact_name TEXT DEFAULT NULL,
    p_dropoff_contact_phone TEXT DEFAULT NULL,
    p_category_id UUID DEFAULT NULL,
    p_package_size package_size DEFAULT 'small',
    p_package_description TEXT DEFAULT NULL,
    p_package_notes TEXT DEFAULT NULL,
    p_suggested_price NUMERIC DEFAULT NULL,
    p_promo_code TEXT DEFAULT NULL,
    p_service_area_id UUID DEFAULT NULL,
    p_payment_method TEXT DEFAULT 'wallet'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order_id UUID;
    v_pickup_point GEOGRAPHY;
    v_dropoff_point GEOGRAPHY;
    v_distance_km NUMERIC;
    v_dynamic_price NUMERIC;
    v_vat_amount NUMERIC;
    v_final_price NUMERIC;
    v_delivery_code TEXT;
    v_wallet_id UUID;
    v_reference TEXT;
    v_promo_id UUID;
    v_discount_amount NUMERIC := 0;
    v_pricing pricing_rules%ROWTYPE;
    v_platform_commission_rate NUMERIC := 15.00;
    v_platform_commission_amount NUMERIC;
    v_expires_at TIMESTAMPTZ;
BEGIN
    -- Validate required dropoff
    IF p_dropoff_address IS NULL OR p_dropoff_lat IS NULL OR p_dropoff_lng IS NULL THEN
        RAISE EXCEPTION 'Dropoff address, latitude, and longitude are required';
    END IF;

    -- Validate payment method
    IF p_payment_method NOT IN ('wallet', 'cash') THEN
        RAISE EXCEPTION 'Invalid payment method: %. Must be wallet or cash.', p_payment_method;
    END IF;

    -- Build PostGIS points
    v_pickup_point := ST_SetSRID(ST_MakePoint(p_pickup_lng, p_pickup_lat), 4326)::GEOGRAPHY;
    v_dropoff_point := ST_SetSRID(ST_MakePoint(p_dropoff_lng, p_dropoff_lat), 4326)::GEOGRAPHY;

    -- Calculate distance in km
    v_distance_km := ROUND((ST_Distance(v_pickup_point, v_dropoff_point) / 1000.0)::NUMERIC, 2);

    -- Get pricing rules for service area
    IF p_service_area_id IS NOT NULL THEN
        SELECT * INTO v_pricing
        FROM pricing_rules
        WHERE service_area_id = p_service_area_id AND is_active = TRUE
        LIMIT 1;
    END IF;

    -- Calculate dynamic price
    IF v_pricing.id IS NOT NULL THEN
        v_dynamic_price := ROUND(
            (v_pricing.base_rate + (v_distance_km * v_pricing.per_km_rate)) * v_pricing.surge_multiplier,
            2
        );
        IF v_dynamic_price < v_pricing.min_price THEN
            v_dynamic_price := v_pricing.min_price;
        END IF;
        IF v_pricing.max_price IS NOT NULL AND v_dynamic_price > v_pricing.max_price THEN
            v_dynamic_price := v_pricing.max_price;
        END IF;
        v_vat_amount := ROUND(v_dynamic_price * (v_pricing.vat_percentage / 100.0), 2);
    ELSE
        v_dynamic_price := ROUND(500 + (v_distance_km * 100), 2);
        v_vat_amount := ROUND(v_dynamic_price * 0.075, 2);
    END IF;

    -- Validate and apply promo code
    IF p_promo_code IS NOT NULL THEN
        SELECT id INTO v_promo_id
        FROM promo_codes
        WHERE code = UPPER(TRIM(p_promo_code))
            AND is_active = TRUE
            AND starts_at <= NOW()
            AND (expires_at IS NULL OR expires_at > NOW())
            AND (max_uses IS NULL OR used_count < max_uses)
            AND (v_dynamic_price + v_vat_amount) >= min_order_amount;

        IF v_promo_id IS NOT NULL THEN
            SELECT
                CASE
                    WHEN discount_type = 'percentage' THEN
                        LEAST(
                            ROUND(v_dynamic_price * (discount_value / 100.0), 2),
                            COALESCE(max_discount_amount, v_dynamic_price)
                        )
                    ELSE
                        LEAST(discount_value, v_dynamic_price)
                END
            INTO v_discount_amount
            FROM promo_codes
            WHERE id = v_promo_id;

            UPDATE promo_codes SET used_count = used_count + 1 WHERE id = v_promo_id;
        END IF;
    END IF;

    v_final_price := COALESCE(p_suggested_price, v_dynamic_price) + v_vat_amount - v_discount_amount;
    IF v_final_price < 0 THEN
        v_final_price := 0;
    END IF;

    v_platform_commission_amount := ROUND(v_final_price * (v_platform_commission_rate / 100.0), 2);

    v_delivery_code := LPAD(FLOOR(RANDOM() * 1000000)::TEXT, 6, '0');
    v_expires_at := NOW() + INTERVAL '2 hours';

    -- WALLET PAYMENT: debit customer wallet at order creation
    -- CASH PAYMENT:   no debit now — rider collects at delivery
    IF p_payment_method = 'wallet' THEN
        SELECT id INTO v_wallet_id
        FROM wallets
        WHERE owner_type = 'customer' AND owner_id = p_customer_id;

        IF v_wallet_id IS NULL THEN
            RAISE EXCEPTION 'Customer wallet not found. Please set up your wallet first.';
        END IF;

        v_reference := 'ORD-' || gen_random_uuid()::TEXT;
        PERFORM debit_wallet(
            v_wallet_id,
            v_final_price,
            'debit',
            v_reference,
            'Payment for delivery order'
        );
    END IF;

    -- Create the order
    INSERT INTO orders (
        customer_id, status,
        pickup_address, pickup_location, pickup_contact_name, pickup_contact_phone,
        dropoff_address, dropoff_location, dropoff_contact_name, dropoff_contact_phone,
        category_id, package_size, package_description, package_notes,
        distance_km, dynamic_price, suggested_price, final_price, vat_amount,
        platform_commission_rate, platform_commission_amount,
        fleet_commission_rate, fleet_commission_amount, rider_net_amount,
        promo_code_id, discount_amount,
        payment_method, delivery_code, expires_at, service_area_id
    )
    VALUES (
        p_customer_id, 'pending',
        p_pickup_address, v_pickup_point, p_pickup_contact_name, p_pickup_contact_phone,
        p_dropoff_address, v_dropoff_point, p_dropoff_contact_name, p_dropoff_contact_phone,
        p_category_id, p_package_size, p_package_description, p_package_notes,
        v_distance_km, v_dynamic_price, p_suggested_price, v_final_price, v_vat_amount,
        v_platform_commission_rate, v_platform_commission_amount,
        0, 0, v_final_price - v_platform_commission_amount,
        v_promo_id, v_discount_amount,
        p_payment_method, v_delivery_code, v_expires_at, p_service_area_id
    )
    RETURNING id INTO v_order_id;

    -- Record initial status
    INSERT INTO order_status_history (order_id, old_status, new_status, changed_by)
    VALUES (v_order_id, NULL, 'pending', p_customer_id);

    -- Notification for customer
    INSERT INTO notifications (user_id, type, title, body, data)
    VALUES (
        p_customer_id,
        'order_update',
        'Order Created',
        'Your delivery order has been placed. Finding a rider...',
        jsonb_build_object('order_id', v_order_id)
    );

    RETURN jsonb_build_object(
        'order_id', v_order_id,
        'distance_km', v_distance_km,
        'dynamic_price', v_dynamic_price,
        'suggested_price', p_suggested_price,
        'final_price', v_final_price,
        'vat_amount', v_vat_amount,
        'discount_amount', v_discount_amount,
        'delivery_code', v_delivery_code,
        'expires_at', v_expires_at,
        'pickup_address', p_pickup_address,
        'dropoff_address', p_dropoff_address,
        'payment_method', p_payment_method
    );
END;
$$;
