-- 1. Fix create_order Pricing logic (add package size multiplier)
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

-- 2. Fix send_counter_offer (Customer counter-offer)
CREATE OR REPLACE FUNCTION "public"."send_counter_offer"("p_bid_id" "uuid", "p_customer_id" "uuid", "p_amount" numeric) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_bid              bids%ROWTYPE;
    v_order            orders%ROWTYPE;
    v_rider_profile_id UUID;
    v_new_bid_id       UUID;
    v_next_round       INT;
BEGIN
    IF auth.uid() != p_customer_id THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT * INTO v_bid FROM bids WHERE id = p_bid_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Bid not found';
    END IF;
    IF v_bid.status != 'pending' THEN
        RAISE EXCEPTION 'Bid is no longer pending (status: %)', v_bid.status;
    END IF;
    
    -- CUSTOMER COUNTER FIX: Ensure customer is not countering their own bid
    IF v_bid.negotiation_round % 2 = 0 THEN
        RAISE EXCEPTION 'You cannot counter your own bid. Please wait for the rider to respond.';
    END IF;

    SELECT * INTO v_order FROM orders WHERE id = v_bid.order_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found';
    END IF;
    IF v_order.status != 'pending' THEN
        RAISE EXCEPTION 'Order is no longer accepting counter-offers (status: %)', v_order.status;
    END IF;
    IF v_order.customer_id != p_customer_id THEN
        RAISE EXCEPTION 'Unauthorized to counter this order';
    END IF;
    IF v_order.expires_at IS NOT NULL AND v_order.expires_at < NOW() THEN
        RAISE EXCEPTION 'Order has expired';
    END IF;

    v_next_round := v_bid.negotiation_round + 1;
    IF v_next_round > 3 THEN
        RAISE EXCEPTION 'Maximum 3 negotiation rounds reached for this rider. Accept, decline, or find another rider.';
    END IF;

    UPDATE bids SET status = 'countered', updated_at = NOW() WHERE id = p_bid_id;

    INSERT INTO bids (
        order_id, rider_id, amount, status,
        parent_bid_id, negotiation_round, expires_at
    )
    VALUES (
        v_bid.order_id, v_bid.rider_id, p_amount, 'pending',
        p_bid_id, v_next_round, NOW() + INTERVAL '15 minutes'
    )
    ON CONFLICT (order_id, rider_id) WHERE status = 'pending'
    DO UPDATE SET
        amount           = EXCLUDED.amount,
        parent_bid_id    = EXCLUDED.parent_bid_id,
        negotiation_round = EXCLUDED.negotiation_round,
        expires_at       = EXCLUDED.expires_at,
        updated_at       = NOW()
    RETURNING id INTO v_new_bid_id;

    SELECT r.profile_id INTO v_rider_profile_id
    FROM riders r WHERE r.id = v_bid.rider_id;

    IF v_rider_profile_id IS NOT NULL THEN
        INSERT INTO notifications (user_id, type, title, body, data)
        VALUES (
            v_rider_profile_id,
            'order_update',
            'Counter Offer — Round ' || v_next_round || '/3',
            CASE
                WHEN v_next_round = 3 THEN 'Final round! Customer countered at ₦' || p_amount::TEXT || '. Accept or decline.'
                ELSE 'Customer countered at ₦' || p_amount::TEXT || '. Round ' || v_next_round || ' of 3.'
            END,
            jsonb_build_object(
                'order_id',          v_bid.order_id,
                'bid_id',            v_new_bid_id,
                'amount',            p_amount,
                'negotiation_round', v_next_round,
                'is_final_round',    (v_next_round = 3)
            )
        );
    END IF;

    RETURN v_new_bid_id;
END;
$$;


-- 3. Fix send_rider_counter_offer (Rider counter-offer)
CREATE OR REPLACE FUNCTION public.send_rider_counter_offer(p_bid_id uuid, p_rider_id uuid, p_amount numeric)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_bid bids%ROWTYPE;
    v_order orders%ROWTYPE;
    v_new_bid_id UUID;
    v_next_round INT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT * INTO v_bid FROM bids WHERE id = p_bid_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Bid not found';
    END IF;
    IF v_bid.status != 'pending' THEN
        RAISE EXCEPTION 'Bid is no longer pending (status: %)', v_bid.status;
    END IF;
    IF v_bid.parent_bid_id IS NULL THEN
        RAISE EXCEPTION 'This bid is not a customer counter-offer';
    END IF;

    -- RIDER COUNTER FIX: Ensure rider is not countering their own bid
    IF v_bid.negotiation_round % 2 != 0 THEN
        RAISE EXCEPTION 'You cannot counter your own bid. Please wait for the customer to respond.';
    END IF;

    SELECT * INTO v_order FROM orders WHERE id = v_bid.order_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found';
    END IF;
    IF v_order.status != 'pending' THEN
        RAISE EXCEPTION 'Order is no longer accepting counter-offers (status: %)', v_order.status;
    END IF;
    IF v_order.expires_at IS NOT NULL AND v_order.expires_at < NOW() THEN
        RAISE EXCEPTION 'Order has expired';
    END IF;

    v_next_round := v_bid.negotiation_round + 1;
    IF v_next_round > 3 THEN
        RAISE EXCEPTION 'Maximum 3 negotiation rounds reached for this rider. Accept or decline the current offer.';
    END IF;

    UPDATE bids
    SET status = 'countered',
        updated_at = NOW()
    WHERE id = p_bid_id;

    INSERT INTO bids (
        order_id, rider_id, amount, status,
        parent_bid_id, negotiation_round, expires_at
    )
    VALUES (
        v_bid.order_id, v_bid.rider_id, p_amount, 'pending',
        p_bid_id, v_next_round, NOW() + INTERVAL '15 minutes'
    )
    ON CONFLICT (order_id, rider_id) WHERE status = 'pending'
    DO UPDATE SET
        amount = EXCLUDED.amount,
        parent_bid_id = EXCLUDED.parent_bid_id,
        negotiation_round = EXCLUDED.negotiation_round,
        expires_at = EXCLUDED.expires_at,
        updated_at = NOW()
    RETURNING id INTO v_new_bid_id;

    INSERT INTO notifications (user_id, type, title, body, data)
    VALUES (
        v_order.customer_id,
        'order_update',
        'Rider Counter-Offer - Round ' || v_next_round || '/3',
        'Rider responded with ₦' || p_amount::TEXT || '. Accept or counter.',
        jsonb_build_object(
            'order_id', v_bid.order_id,
            'bid_id', v_new_bid_id,
            'amount', p_amount,
            'negotiation_round', v_next_round
        )
    );

    RETURN v_new_bid_id;
END;
$function$;
