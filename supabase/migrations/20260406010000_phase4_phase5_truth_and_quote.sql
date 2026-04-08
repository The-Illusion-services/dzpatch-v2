DROP FUNCTION IF EXISTS public.get_nearby_orders(uuid, double precision);

CREATE OR REPLACE FUNCTION public.get_nearby_orders(
    p_rider_id uuid,
    p_radius_meters double precision DEFAULT 10000
)
RETURNS TABLE(
    order_id uuid,
    customer_name text,
    pickup_address text,
    dropoff_address text,
    distance_to_pickup double precision,
    dynamic_price numeric,
    suggested_price numeric,
    package_size public.package_size,
    package_description text,
    category_name text,
    created_at timestamp with time zone,
    expires_at timestamp with time zone,
    pickup_lat double precision,
    pickup_lng double precision
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_rider_location geography;
BEGIN
    SELECT current_location INTO v_rider_location
    FROM riders
    WHERE id = p_rider_id;

    IF v_rider_location IS NULL THEN
        RETURN QUERY
        SELECT
            o.id,
            p.full_name,
            o.pickup_address,
            o.dropoff_address,
            NULL::FLOAT,
            o.dynamic_price,
            o.suggested_price,
            o.package_size,
            o.package_description,
            pc.name,
            o.created_at,
            o.expires_at,
            CASE WHEN o.pickup_location IS NOT NULL THEN ST_Y(o.pickup_location::geometry) END,
            CASE WHEN o.pickup_location IS NOT NULL THEN ST_X(o.pickup_location::geometry) END
        FROM orders o
        JOIN profiles p ON p.id = o.customer_id
        LEFT JOIN package_categories pc ON pc.id = o.category_id
        WHERE o.status = 'pending'
            AND (o.expires_at IS NULL OR o.expires_at > NOW())
        ORDER BY o.created_at DESC
        LIMIT 20;
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        o.id,
        p.full_name,
        o.pickup_address,
        o.dropoff_address,
        CASE
            WHEN o.pickup_location IS NOT NULL
            THEN ST_Distance(v_rider_location, o.pickup_location)::FLOAT
            ELSE NULL
        END,
        o.dynamic_price,
        o.suggested_price,
        o.package_size,
        o.package_description,
        pc.name,
        o.created_at,
        o.expires_at,
        CASE WHEN o.pickup_location IS NOT NULL THEN ST_Y(o.pickup_location::geometry) END,
        CASE WHEN o.pickup_location IS NOT NULL THEN ST_X(o.pickup_location::geometry) END
    FROM orders o
    JOIN profiles p ON p.id = o.customer_id
    LEFT JOIN package_categories pc ON pc.id = o.category_id
    WHERE o.status = 'pending'
        AND (o.expires_at IS NULL OR o.expires_at > NOW())
        AND (
            o.pickup_location IS NULL
            OR ST_DWithin(v_rider_location, o.pickup_location, p_radius_meters)
        )
    ORDER BY
        CASE
            WHEN o.pickup_location IS NOT NULL THEN ST_Distance(v_rider_location, o.pickup_location)
            ELSE 999999
        END ASC,
        o.created_at DESC
    LIMIT 20;
END;
$$;

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
        v_vat_amount := ROUND(v_delivery_fee * (v_pricing.vat_percentage / 100.0), 2);
    ELSE
        v_effective_surge := 1.0;
        v_delivery_fee := ROUND((500 + (v_distance_km * 100)) * v_size_multiplier, 2);
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

CREATE OR REPLACE FUNCTION public.create_order(
    p_customer_id uuid,
    p_pickup_address text,
    p_pickup_lat double precision,
    p_pickup_lng double precision,
    p_pickup_contact_name text DEFAULT NULL::text,
    p_pickup_contact_phone text DEFAULT NULL::text,
    p_dropoff_address text DEFAULT NULL::text,
    p_dropoff_lat double precision DEFAULT NULL::double precision,
    p_dropoff_lng double precision DEFAULT NULL::double precision,
    p_dropoff_contact_name text DEFAULT NULL::text,
    p_dropoff_contact_phone text DEFAULT NULL::text,
    p_category_id uuid DEFAULT NULL::uuid,
    p_package_size text DEFAULT 'small'::text,
    p_package_description text DEFAULT NULL::text,
    p_package_notes text DEFAULT NULL::text,
    p_suggested_price numeric DEFAULT NULL::numeric,
    p_promo_code text DEFAULT NULL::text,
    p_service_area_id uuid DEFAULT NULL::uuid,
    p_payment_method text DEFAULT 'wallet'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
    v_size_multiplier NUMERIC := 1.0;
    v_effective_surge NUMERIC := 1.0;
BEGIN
    IF auth.uid() IS NULL OR auth.uid() <> p_customer_id THEN
        RAISE EXCEPTION 'Not authorized to create this order';
    END IF;

    IF p_dropoff_address IS NULL OR p_dropoff_lat IS NULL OR p_dropoff_lng IS NULL THEN
        RAISE EXCEPTION 'Dropoff address, latitude, and longitude are required';
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
        WHERE service_area_id = p_service_area_id AND is_active = TRUE
        LIMIT 1;
    END IF;

    IF v_pricing.id IS NOT NULL THEN
        v_effective_surge := GREATEST(1, LEAST(COALESCE(v_pricing.surge_multiplier, 1), 5));
        v_dynamic_price := ROUND((v_pricing.base_rate + (v_distance_km * v_pricing.per_km_rate)) * v_effective_surge * v_size_multiplier, 2);
        IF v_dynamic_price < v_pricing.min_price THEN
            v_dynamic_price := v_pricing.min_price;
        END IF;
        IF v_pricing.max_price IS NOT NULL AND v_dynamic_price > v_pricing.max_price THEN
            v_dynamic_price := v_pricing.max_price;
        END IF;
        v_vat_amount := ROUND(v_dynamic_price * (v_pricing.vat_percentage / 100.0), 2);
    ELSE
        v_dynamic_price := ROUND((500 + (v_distance_km * 100)) * v_size_multiplier, 2);
        v_vat_amount := ROUND(v_dynamic_price * 0.075, 2);
    END IF;

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
            SELECT CASE
                WHEN discount_type = 'percentage' THEN
                    LEAST(ROUND(v_dynamic_price * (discount_value / 100.0), 2), COALESCE(max_discount_amount, v_dynamic_price))
                ELSE LEAST(discount_value, v_dynamic_price)
            END
            INTO v_discount_amount
            FROM promo_codes
            WHERE id = v_promo_id;

            UPDATE promo_codes
            SET used_count = used_count + 1
            WHERE id = v_promo_id;
        END IF;
    END IF;

    v_final_price := GREATEST(v_dynamic_price + v_vat_amount - v_discount_amount, 0);

    v_platform_commission_amount := ROUND(v_final_price * (v_platform_commission_rate / 100.0), 2);
    v_delivery_code := LPAD(FLOOR(RANDOM() * 1000000)::TEXT, 6, '0');
    v_expires_at := NOW() + INTERVAL '2 hours';

    IF p_payment_method = 'wallet' THEN
        SELECT id INTO v_wallet_id
        FROM wallets
        WHERE owner_type = 'customer' AND owner_id = p_customer_id;

        IF v_wallet_id IS NULL THEN
            RAISE EXCEPTION 'Customer wallet not found. Please set up your wallet first.';
        END IF;

        v_reference := 'ORD-' || gen_random_uuid()::TEXT;
        PERFORM debit_wallet(v_wallet_id, v_final_price, 'debit', v_reference, 'Payment for delivery order');
    END IF;

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
        p_category_id, p_package_size::package_size, p_package_description, p_package_notes,
        v_distance_km, v_dynamic_price, v_dynamic_price, v_final_price, v_vat_amount,
        v_platform_commission_rate, v_platform_commission_amount,
        0, 0, v_final_price - v_platform_commission_amount,
        v_promo_id, v_discount_amount,
        p_payment_method, v_delivery_code, v_expires_at, p_service_area_id
    )
    RETURNING id INTO v_order_id;

    INSERT INTO order_status_history (order_id, old_status, new_status, changed_by)
    VALUES (v_order_id, NULL, 'pending', p_customer_id);

    INSERT INTO notifications (user_id, type, title, body, data)
    VALUES (
        p_customer_id,
        'delivery_code',
        'Order Created - Save Your Code',
        'Your order is placed. Keep your delivery code safe - share it only when the rider is with you.',
        jsonb_build_object('order_id', v_order_id, 'code', v_delivery_code)
    );

    RETURN jsonb_build_object(
        'order_id', v_order_id,
        'distance_km', v_distance_km,
        'dynamic_price', v_dynamic_price,
        'suggested_price', v_dynamic_price,
        'final_price', v_final_price,
        'vat_amount', v_vat_amount,
        'discount_amount', v_discount_amount,
        'delivery_code', v_delivery_code,
        'expires_at', v_expires_at,
        'pickup_address', p_pickup_address,
        'dropoff_address', p_dropoff_address
    );
END;
$$;
