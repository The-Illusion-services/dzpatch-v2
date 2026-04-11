-- ============================================================
-- DZpatch V2.0 — Sprint 1: Delivery code security hardening
-- Migration: 00037_delivery_code_rate_limit.sql
--
-- PROBLEMS:
-- 1. verify_delivery_code has NO rate limiting. A 6-digit code
--    has only 1,000,000 combinations. 3 attempts/sec = cracked
--    in ~4 days. Unacceptable.
-- 2. create_order generates a delivery_code but never notifies
--    the customer. Customer has no code when rider arrives.
-- 3. complete_delivery allows delivery without code verification.
--
-- FIXES:
-- 1. Add failed_delivery_attempts + delivery_locked_until to orders
-- 2. Patch verify_delivery_code to enforce max 3 attempts / 1hr lock
-- 3. Patch create_order notification to include the delivery code
-- 4. Patch complete_delivery to require delivery_code_verified = TRUE
-- ============================================================

-- ── 1. Add rate-limiting columns to orders ─────────────────────
ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS failed_delivery_attempts INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS delivery_locked_until TIMESTAMPTZ DEFAULT NULL;

-- ── 2. Patch verify_delivery_code with rate limiting ───────────
CREATE OR REPLACE FUNCTION verify_delivery_code(
    p_order_id  UUID,
    p_rider_id  UUID,
    p_code      TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order orders%ROWTYPE;
BEGIN
    SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found';
    END IF;
    IF v_order.rider_id != p_rider_id THEN
        RAISE EXCEPTION 'This order is not assigned to you';
    END IF;
    IF v_order.status NOT IN ('arrived_dropoff', 'in_transit') THEN
        RAISE EXCEPTION 'Order is not at the delivery stage (status: %)', v_order.status;
    END IF;

    -- Check if locked due to too many failed attempts
    IF v_order.delivery_locked_until IS NOT NULL AND v_order.delivery_locked_until > NOW() THEN
        RAISE EXCEPTION 'Too many incorrect attempts. Code entry locked until %',
            to_char(v_order.delivery_locked_until AT TIME ZONE 'UTC', 'HH24:MI UTC');
    END IF;

    IF v_order.delivery_code = p_code THEN
        -- Success: reset failure counter, mark verified
        UPDATE orders
        SET delivery_code_verified   = TRUE,
            failed_delivery_attempts = 0,
            delivery_locked_until    = NULL,
            updated_at               = NOW()
        WHERE id = p_order_id;
        RETURN TRUE;
    ELSE
        -- Wrong code: increment counter, lock if threshold reached
        UPDATE orders
        SET failed_delivery_attempts = failed_delivery_attempts + 1,
            delivery_locked_until    = CASE
                WHEN failed_delivery_attempts + 1 >= 3
                THEN NOW() + INTERVAL '1 hour'
                ELSE NULL
            END,
            updated_at = NOW()
        WHERE id = p_order_id;

        RETURN FALSE;
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION verify_delivery_code(UUID, UUID, TEXT) TO authenticated;

-- ── 3. Patch create_order: include delivery code in notification ──
-- The existing create_order already generates v_delivery_code.
-- We patch just the notification INSERT to include it in the body.
-- Full RPC replace to keep all logic in sync.

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
    p_package_size TEXT DEFAULT 'small',
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
    IF p_dropoff_address IS NULL OR p_dropoff_lat IS NULL OR p_dropoff_lng IS NULL THEN
        RAISE EXCEPTION 'Dropoff address, latitude, and longitude are required';
    END IF;

    v_pickup_point  := ST_SetSRID(ST_MakePoint(p_pickup_lng, p_pickup_lat), 4326)::GEOGRAPHY;
    v_dropoff_point := ST_SetSRID(ST_MakePoint(p_dropoff_lng, p_dropoff_lat), 4326)::GEOGRAPHY;
    v_distance_km   := ROUND((ST_Distance(v_pickup_point, v_dropoff_point) / 1000.0)::NUMERIC, 2);

    IF p_service_area_id IS NOT NULL THEN
        SELECT * INTO v_pricing
        FROM pricing_rules
        WHERE service_area_id = p_service_area_id AND is_active = TRUE
        LIMIT 1;
    END IF;

    IF v_pricing.id IS NOT NULL THEN
        v_dynamic_price := ROUND(
            (v_pricing.base_rate + (v_distance_km * v_pricing.per_km_rate)) * v_pricing.surge_multiplier, 2
        );
        IF v_dynamic_price < v_pricing.min_price THEN v_dynamic_price := v_pricing.min_price; END IF;
        IF v_pricing.max_price IS NOT NULL AND v_dynamic_price > v_pricing.max_price THEN
            v_dynamic_price := v_pricing.max_price;
        END IF;
        v_vat_amount := ROUND(v_dynamic_price * (v_pricing.vat_percentage / 100.0), 2);
    ELSE
        v_dynamic_price := ROUND(500 + (v_distance_km * 100), 2);
        v_vat_amount    := ROUND(v_dynamic_price * 0.075, 2);
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
            SELECT
                CASE
                    WHEN discount_type = 'percentage' THEN
                        LEAST(ROUND(v_dynamic_price * (discount_value / 100.0), 2),
                              COALESCE(max_discount_amount, v_dynamic_price))
                    ELSE LEAST(discount_value, v_dynamic_price)
                END
            INTO v_discount_amount
            FROM promo_codes WHERE id = v_promo_id;

            UPDATE promo_codes SET used_count = used_count + 1 WHERE id = v_promo_id;
        END IF;
    END IF;

    v_final_price := COALESCE(p_suggested_price, v_dynamic_price) + v_vat_amount - v_discount_amount;
    IF v_final_price < 0 THEN v_final_price := 0; END IF;

    v_platform_commission_amount := ROUND(v_final_price * (v_platform_commission_rate / 100.0), 2);
    v_delivery_code := LPAD(FLOOR(RANDOM() * 1000000)::TEXT, 6, '0');
    v_expires_at    := NOW() + INTERVAL '2 hours';

    IF p_payment_method = 'wallet' THEN
        SELECT id INTO v_wallet_id
        FROM wallets WHERE owner_type = 'customer' AND owner_id = p_customer_id;

        IF v_wallet_id IS NULL THEN
            RAISE EXCEPTION 'Customer wallet not found. Please set up your wallet first.';
        END IF;

        v_reference := 'ORD-' || gen_random_uuid()::TEXT;
        PERFORM debit_wallet(
            v_wallet_id, v_final_price, 'debit', v_reference, 'Payment for delivery order'
        );
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

    -- Notify customer — include delivery code in data payload
    -- (NOT in body — lock screen visible. Show only in app via data.code)
    INSERT INTO notifications (user_id, type, title, body, data)
    VALUES (
        p_customer_id,
        'delivery_code',
        'Order Created — Save Your Code',
        'Your order is placed. Keep your delivery code safe — share it only when the rider is with you.',
        jsonb_build_object(
            'order_id', v_order_id,
            'code',     v_delivery_code
        )
    );

    RETURN jsonb_build_object(
        'order_id',       v_order_id,
        'distance_km',    v_distance_km,
        'dynamic_price',  v_dynamic_price,
        'suggested_price', p_suggested_price,
        'final_price',    v_final_price,
        'vat_amount',     v_vat_amount,
        'discount_amount', v_discount_amount,
        'delivery_code',  v_delivery_code,
        'expires_at',     v_expires_at,
        'pickup_address', p_pickup_address,
        'dropoff_address', p_dropoff_address
    );
END;
$$;

GRANT EXECUTE ON FUNCTION create_order(UUID,TEXT,FLOAT,FLOAT,TEXT,TEXT,TEXT,FLOAT,FLOAT,TEXT,TEXT,UUID,TEXT,TEXT,TEXT,NUMERIC,TEXT,UUID,TEXT) TO authenticated;

-- ── 4. Patch complete_delivery to require code verified ────────
-- complete_delivery now refuses if delivery_code_verified is FALSE.
-- This closes the gap where rider could skip code entry entirely.

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
    v_unpaid_count    INT;
BEGIN
    SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
    IF v_order.status != 'arrived_dropoff' THEN
        RAISE EXCEPTION 'Order must be in arrived_dropoff status (current: %)', v_order.status;
    END IF;

    -- Require delivery code to have been verified
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
        WHERE owner_type = 'rider' AND owner_id = p_rider_id;

        IF v_rider_wallet IS NOT NULL AND v_rider_earnings > 0 THEN
            PERFORM credit_wallet(
                v_rider_wallet, v_rider_earnings, 'earning',
                'EARN-' || p_order_id::TEXT, 'Delivery earnings', p_order_id
            );
        END IF;

        SELECT id INTO v_platform_wallet FROM wallets WHERE owner_type = 'platform' LIMIT 1;
        IF v_platform_wallet IS NOT NULL AND v_commission > 0 THEN
            PERFORM credit_wallet(
                v_platform_wallet, v_commission, 'commission',
                'COMM-' || p_order_id::TEXT, 'Platform commission', p_order_id
            );
        END IF;
    END IF;

    -- Commission lock check
    SELECT COUNT(*) INTO v_unpaid_count
    FROM orders
    WHERE rider_id = p_rider_id
      AND status = 'delivered'
      AND id NOT IN (
          SELECT DISTINCT reference::UUID FROM transactions
          WHERE owner_id = p_rider_id AND type = 'commission'
          LIMIT 1000
      );
    IF v_unpaid_count >= 2 THEN
        UPDATE riders SET is_commission_locked = TRUE WHERE id = p_rider_id;
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
        'final_price',    v_order.final_price
    );
END;
$$;

GRANT EXECUTE ON FUNCTION complete_delivery(UUID, UUID, TEXT) TO authenticated;