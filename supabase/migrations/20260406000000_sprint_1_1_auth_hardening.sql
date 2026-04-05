-- Migration: Sprint 1.1 Auth Hardening
-- Addresses fixes 5.1, 5.2, 5.3, 9.27, and general 2.2 security definer hardening

-- Fix 5.1: create_order ownership check
CREATE OR REPLACE FUNCTION "public"."create_order"("p_customer_id" "uuid", "p_pickup_address" "text", "p_pickup_lat" double precision, "p_pickup_lng" double precision, "p_pickup_contact_name" "text" DEFAULT NULL::"text", "p_pickup_contact_phone" "text" DEFAULT NULL::"text", "p_dropoff_address" "text" DEFAULT NULL::"text", "p_dropoff_lat" double precision DEFAULT NULL::double precision, "p_dropoff_lng" double precision DEFAULT NULL::double precision, "p_dropoff_contact_name" "text" DEFAULT NULL::"text", "p_dropoff_contact_phone" "text" DEFAULT NULL::"text", "p_category_id" "uuid" DEFAULT NULL::"uuid", "p_package_size" "text" DEFAULT 'small'::"text", "p_package_description" "text" DEFAULT NULL::"text", "p_package_notes" "text" DEFAULT NULL::"text", "p_suggested_price" numeric DEFAULT NULL::numeric, "p_promo_code" "text" DEFAULT NULL::"text", "p_service_area_id" "uuid" DEFAULT NULL::"uuid", "p_payment_method" "text" DEFAULT 'wallet'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;
    IF auth.uid() != p_customer_id THEN
        RAISE EXCEPTION 'Unauthorized: customer ID does not match session';
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
        v_dynamic_price := ROUND((v_pricing.base_rate + (v_distance_km * v_pricing.per_km_rate)) * v_pricing.surge_multiplier * v_size_multiplier, 2);
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

    v_final_price := COALESCE(p_suggested_price, v_dynamic_price) + v_vat_amount - v_discount_amount;
    IF v_final_price < 0 THEN
        v_final_price := 0;
    END IF;

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
        v_distance_km, v_dynamic_price, p_suggested_price, v_final_price, v_vat_amount,
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
        'suggested_price', p_suggested_price,
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
REVOKE EXECUTE ON FUNCTION "public"."create_order"("uuid", "text", double precision, double precision, "text", "text", "text", double precision, double precision, "text", "text", "uuid", "text", "text", "text", numeric, "text", "uuid", "text") FROM "anon";

-- Fix 5.2: mark_cash_paid auth wrapper
CREATE OR REPLACE FUNCTION "public"."mark_cash_paid"("p_order_id" "uuid", "p_rider_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_balance outstanding_balances%ROWTYPE;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM riders WHERE id = p_rider_id AND profile_id = auth.uid()) THEN
        RAISE EXCEPTION 'Unauthorized: rider ID does not match session';
    END IF;

    SELECT * INTO v_balance
    FROM outstanding_balances
    WHERE order_id = p_order_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No outstanding balance found for this order';
    END IF;
    IF v_balance.rider_id != p_rider_id THEN
        RAISE EXCEPTION 'Unauthorized: this balance is not associated with your rider account';
    END IF;
    IF v_balance.paid_at IS NOT NULL THEN
        RAISE EXCEPTION 'Balance already marked as paid';
    END IF;

    UPDATE outstanding_balances
    SET paid_at = NOW()
    WHERE id = v_balance.id;
END;
$$;
REVOKE EXECUTE ON FUNCTION "public"."mark_cash_paid"("uuid", "uuid") FROM "anon";

-- Fix 5.3: toggle_rider_online auth wrapper
CREATE OR REPLACE FUNCTION "public"."toggle_rider_online"("p_rider_id" "uuid", "p_is_online" boolean, "p_lat" double precision DEFAULT NULL::double precision, "p_lng" double precision DEFAULT NULL::double precision) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM riders WHERE id = p_rider_id AND profile_id = auth.uid()) THEN
        RAISE EXCEPTION 'Unauthorized rider toggle';
    END IF;

    UPDATE riders SET
        is_online = p_is_online,
        current_location = CASE
            WHEN p_lat IS NOT NULL AND p_lng IS NOT NULL
            THEN ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::GEOGRAPHY
            ELSE current_location
        END,
        location_updated_at = CASE
            WHEN p_lat IS NOT NULL THEN NOW()
            ELSE location_updated_at
        END
    WHERE id = p_rider_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Rider not found: %', p_rider_id;
    END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION "public"."toggle_rider_online"("uuid", boolean, double precision, double precision) FROM "anon";

-- Fix 5.3: update_rider_location auth wrapper
CREATE OR REPLACE FUNCTION "public"."update_rider_location"("p_rider_id" "uuid", "p_lat" double precision, "p_lng" double precision, "p_order_id" "uuid" DEFAULT NULL::"uuid", "p_speed" numeric DEFAULT NULL::numeric, "p_heading" numeric DEFAULT NULL::numeric, "p_accuracy" numeric DEFAULT NULL::numeric, "p_recorded_at" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_sequence_number" integer DEFAULT NULL::integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_location GEOGRAPHY;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM riders WHERE id = p_rider_id AND profile_id = auth.uid()) THEN
        RAISE EXCEPTION 'Unauthorized rider location update';
    END IF;

    v_location := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::GEOGRAPHY;

    -- Update rider's current location in riders table (existing behaviour)
    UPDATE riders
    SET
        current_location     = v_location,
        location_updated_at  = COALESCE(p_recorded_at, NOW())
    WHERE id = p_rider_id;

    -- Append to location history log (existing behaviour)
    INSERT INTO rider_location_logs (
        rider_id, order_id, location,
        speed, heading, accuracy,
        recorded_at, sequence_number
    )
    VALUES (
        p_rider_id,
        p_order_id,
        v_location,
        p_speed,
        p_heading,
        p_accuracy,
        COALESCE(p_recorded_at, NOW()),
        p_sequence_number
    )
    ON CONFLICT DO NOTHING;

    -- NEW: Upsert flat lat/lng into rider_locations for Realtime subscriptions
    INSERT INTO rider_locations (
        rider_id, latitude, longitude,
        order_id, speed, heading, accuracy, updated_at
    )
    VALUES (
        p_rider_id, p_lat, p_lng,
        p_order_id, p_speed, p_heading, p_accuracy, NOW()
    )
    ON CONFLICT (rider_id) DO UPDATE SET
        latitude   = EXCLUDED.latitude,
        longitude  = EXCLUDED.longitude,
        order_id   = EXCLUDED.order_id,
        speed      = EXCLUDED.speed,
        heading    = EXCLUDED.heading,
        accuracy   = EXCLUDED.accuracy,
        updated_at = NOW();
END;
$$;
REVOKE EXECUTE ON FUNCTION "public"."update_rider_location"("uuid", double precision, double precision, "uuid", numeric, numeric, numeric, timestamp with time zone, integer) FROM "anon";
REVOKE EXECUTE ON FUNCTION "public"."update_rider_location"("uuid", double precision, double precision, "uuid", double precision, double precision, double precision, timestamp with time zone, integer) FROM "anon";

-- Fix 9.27: request_withdrawal anon revoke
REVOKE EXECUTE ON FUNCTION "public"."request_withdrawal"("uuid", numeric, "text", "text", "text", "text") FROM "anon";
