-- Migration 00008: Fix create_order RPC — correct order_status_history column name
-- order_status_history uses new_status not status.

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
    p_payment_method TEXT DEFAULT 'cash'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    IF p_payment_method NOT IN ('cash', 'wallet') THEN
        RAISE EXCEPTION 'Invalid payment method: %. Must be cash or wallet.', p_payment_method;
    END IF;

    IF p_dropoff_address IS NULL OR p_dropoff_lat IS NULL OR p_dropoff_lng IS NULL THEN
        RAISE EXCEPTION 'Dropoff address, latitude, and longitude are required';
    END IF;

    v_pickup_point  := ST_SetSRID(ST_MakePoint(p_pickup_lng,  p_pickup_lat),  4326)::GEOGRAPHY;
    v_dropoff_point := ST_SetSRID(ST_MakePoint(p_dropoff_lng, p_dropoff_lat), 4326)::GEOGRAPHY;

    v_distance_km := ROUND((ST_Distance(v_pickup_point, v_dropoff_point) / 1000.0)::NUMERIC, 2);

    IF p_service_area_id IS NOT NULL THEN
        SELECT * INTO v_pricing FROM pricing_rules
        WHERE service_area_id = p_service_area_id AND is_active = TRUE LIMIT 1;
    END IF;

    IF v_pricing.id IS NULL THEN
        SELECT * INTO v_pricing FROM pricing_rules WHERE is_active = TRUE LIMIT 1;
    END IF;

    IF v_pricing.id IS NOT NULL THEN
        v_dynamic_price := ROUND(
            (v_pricing.base_rate + (v_distance_km * v_pricing.per_km_rate)) * v_pricing.surge_multiplier, 2);
        IF v_dynamic_price < v_pricing.min_price THEN v_dynamic_price := v_pricing.min_price; END IF;
        IF v_pricing.max_price IS NOT NULL AND v_dynamic_price > v_pricing.max_price THEN
            v_dynamic_price := v_pricing.max_price; END IF;
        v_vat_amount := ROUND(v_dynamic_price * (v_pricing.vat_percentage / 100.0), 2);
    ELSE
        v_dynamic_price := ROUND(500 + (v_distance_km * 100), 2);
        v_vat_amount    := ROUND(v_dynamic_price * 0.075, 2);
    END IF;

    IF p_promo_code IS NOT NULL THEN
        SELECT id INTO v_promo_id FROM promo_codes
        WHERE code = UPPER(TRIM(p_promo_code))
            AND is_active = TRUE AND starts_at <= NOW()
            AND (expires_at IS NULL OR expires_at > NOW())
            AND (max_uses IS NULL OR used_count < max_uses)
            AND (v_dynamic_price + v_vat_amount) >= min_order_amount;

        IF v_promo_id IS NOT NULL THEN
            SELECT CASE
                WHEN discount_type = 'percentage' THEN
                    LEAST(ROUND((v_dynamic_price * discount_value / 100.0), 2),
                          COALESCE(max_discount_amount, v_dynamic_price))
                ELSE discount_value
            END INTO v_discount_amount FROM promo_codes WHERE id = v_promo_id;
            UPDATE promo_codes SET used_count = used_count + 1 WHERE id = v_promo_id;
        END IF;
    END IF;

    v_final_price := GREATEST(0, v_dynamic_price + v_vat_amount - v_discount_amount);
    v_platform_commission_amount := ROUND(v_final_price * v_platform_commission_rate / 100.0, 2);
    v_delivery_code := LPAD(FLOOR(RANDOM() * 1000000)::TEXT, 6, '0');
    v_expires_at    := NOW() + INTERVAL '10 minutes';

    IF p_payment_method = 'wallet' THEN
        SELECT id INTO v_wallet_id FROM wallets
        WHERE owner_type = 'customer' AND owner_id = p_customer_id;
        IF v_wallet_id IS NULL THEN RAISE EXCEPTION 'Customer wallet not found.'; END IF;
        v_reference := 'ORD-' || gen_random_uuid()::TEXT;
        PERFORM debit_wallet(v_wallet_id, v_final_price, 'debit', v_reference, 'Payment for delivery order');
    END IF;

    INSERT INTO orders (
        customer_id, status, payment_method,
        pickup_address, pickup_location, pickup_contact_name, pickup_contact_phone,
        dropoff_address, dropoff_location, dropoff_contact_name, dropoff_contact_phone,
        category_id, package_size, package_description, package_notes,
        distance_km, dynamic_price, suggested_price, final_price, vat_amount,
        platform_commission_rate, platform_commission_amount,
        fleet_commission_rate, fleet_commission_amount, rider_net_amount,
        promo_code_id, discount_amount,
        delivery_code, expires_at, service_area_id
    ) VALUES (
        p_customer_id, 'pending', p_payment_method,
        p_pickup_address, v_pickup_point, p_pickup_contact_name, p_pickup_contact_phone,
        p_dropoff_address, v_dropoff_point, p_dropoff_contact_name, p_dropoff_contact_phone,
        p_category_id, p_package_size, p_package_description, p_package_notes,
        v_distance_km, v_dynamic_price, p_suggested_price, v_final_price, v_vat_amount,
        v_platform_commission_rate, v_platform_commission_amount,
        0, 0, v_final_price - v_platform_commission_amount,
        v_promo_id, v_discount_amount,
        v_delivery_code, v_expires_at, p_service_area_id
    ) RETURNING id INTO v_order_id;

    -- FIX: correct column is new_status, not status
    INSERT INTO order_status_history (order_id, new_status, changed_by)
    VALUES (v_order_id, 'pending', p_customer_id);

    RETURN jsonb_build_object(
        'order_id',      v_order_id,
        'final_price',   v_final_price,
        'distance_km',   v_distance_km,
        'delivery_code', v_delivery_code
    );
END;
$$;
