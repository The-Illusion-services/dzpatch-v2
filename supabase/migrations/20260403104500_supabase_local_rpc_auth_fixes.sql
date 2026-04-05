CREATE OR REPLACE FUNCTION public.place_bid(p_order_id uuid, p_rider_id uuid, p_amount numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_order orders%ROWTYPE;
    v_rider riders%ROWTYPE;
    v_bid_id UUID;
    v_profile_id UUID;
    v_rider_kyc_status public.kyc_status;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found';
    END IF;
    IF v_order.status NOT IN ('pending') THEN
        RAISE EXCEPTION 'Order is not open for bids (status: %)', v_order.status;
    END IF;
    IF v_order.expires_at IS NOT NULL AND v_order.expires_at < NOW() THEN
        RAISE EXCEPTION 'Order has expired';
    END IF;

    SELECT *
    INTO v_rider
    FROM riders
    WHERE id = p_rider_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Rider not found';
    END IF;
    IF v_rider.profile_id != auth.uid() THEN
        RAISE EXCEPTION 'Unauthorized rider';
    END IF;
    IF NOT v_rider.is_online THEN
        RAISE EXCEPTION 'Rider is offline';
    END IF;
    IF v_rider.is_commission_locked THEN
        RAISE EXCEPTION 'Your account is locked due to unpaid commissions. Please settle outstanding balance.';
    END IF;

    SELECT p.kyc_status
    INTO v_rider_kyc_status
    FROM profiles p
    WHERE p.id = v_rider.profile_id;

    IF COALESCE(v_rider_kyc_status, 'not_submitted'::public.kyc_status) != 'approved'::public.kyc_status THEN
        RAISE EXCEPTION 'Rider account is not approved yet';
    END IF;

    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Bid amount must be positive';
    END IF;

    INSERT INTO bids (order_id, rider_id, amount, status, negotiation_round, expires_at)
    VALUES (p_order_id, p_rider_id, p_amount, 'pending', 1, NOW() + INTERVAL '5 minutes')
    ON CONFLICT (order_id, rider_id) WHERE status = 'pending'
    DO UPDATE SET
        amount = EXCLUDED.amount,
        negotiation_round = 1,
        parent_bid_id = NULL,
        expires_at = EXCLUDED.expires_at,
        updated_at = NOW()
    RETURNING id INTO v_bid_id;

    SELECT profile_id INTO v_profile_id FROM riders WHERE id = p_rider_id;

    INSERT INTO notifications (user_id, type, title, body, data)
    VALUES (
        v_order.customer_id,
        'new_bid',
        'New Rider Offer',
        'A rider has offered ₦' || p_amount::TEXT || ' for your delivery.',
        jsonb_build_object(
            'order_id', p_order_id,
            'bid_id', v_bid_id,
            'amount', p_amount,
            'rider_id', p_rider_id,
            'negotiation_round', 1
        )
    );

    RETURN jsonb_build_object(
        'bid_id', v_bid_id,
        'order_id', p_order_id,
        'amount', p_amount,
        'negotiation_round', 1
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_order(p_customer_id uuid, p_pickup_address text, p_pickup_lat double precision, p_pickup_lng double precision, p_pickup_contact_name text DEFAULT NULL::text, p_pickup_contact_phone text DEFAULT NULL::text, p_dropoff_address text DEFAULT NULL::text, p_dropoff_lat double precision DEFAULT NULL::double precision, p_dropoff_lng double precision DEFAULT NULL::double precision, p_dropoff_contact_name text DEFAULT NULL::text, p_dropoff_contact_phone text DEFAULT NULL::text, p_category_id uuid DEFAULT NULL::uuid, p_package_size text DEFAULT 'small'::text, p_package_description text DEFAULT NULL::text, p_package_notes text DEFAULT NULL::text, p_suggested_price numeric DEFAULT NULL::numeric, p_promo_code text DEFAULT NULL::text, p_service_area_id uuid DEFAULT NULL::uuid, p_payment_method text DEFAULT 'wallet'::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    IF auth.uid() IS NULL OR auth.uid() != p_customer_id THEN
        RAISE EXCEPTION 'Unauthorized customer';
    END IF;

    IF p_dropoff_address IS NULL OR p_dropoff_lat IS NULL OR p_dropoff_lng IS NULL THEN
        RAISE EXCEPTION 'Dropoff address, latitude, and longitude are required';
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
        v_dynamic_price := ROUND((v_pricing.base_rate + (v_distance_km * v_pricing.per_km_rate)) * v_pricing.surge_multiplier, 2);
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
$function$;

CREATE OR REPLACE FUNCTION public.cancel_order(p_order_id uuid, p_cancelled_by cancellation_actor, p_user_id uuid DEFAULT NULL::uuid, p_reason text DEFAULT 'No reason provided'::text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_order orders%ROWTYPE;
    v_wallet_id UUID;
    v_penalty NUMERIC := 0;
    v_refund_amount NUMERIC;
    v_rider_profile_id UUID;
    v_platform_wallet UUID;
    v_actor_id UUID := COALESCE(p_user_id, auth.uid());
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found';
    END IF;
    IF v_order.status IN ('delivered', 'completed', 'cancelled') THEN
        RAISE EXCEPTION 'Cannot cancel order in status: %', v_order.status;
    END IF;

    IF p_cancelled_by = 'customer'::cancellation_actor THEN
        IF v_order.customer_id != v_actor_id OR auth.uid() != v_actor_id THEN
            RAISE EXCEPTION 'Only the order customer can cancel this order';
        END IF;
    ELSIF p_cancelled_by = 'rider'::cancellation_actor THEN
        SELECT profile_id
        INTO v_rider_profile_id
        FROM riders
        WHERE id = v_order.rider_id;

        IF v_order.rider_id IS NULL OR v_rider_profile_id IS NULL OR v_rider_profile_id != v_actor_id OR auth.uid() != v_actor_id THEN
            RAISE EXCEPTION 'Only the assigned rider can cancel this order as rider';
        END IF;
    END IF;

    IF v_order.status IN ('in_transit', 'arrived_dropoff') THEN
        v_penalty := ROUND(v_order.final_price * 0.20, 2);
    END IF;

    v_refund_amount := COALESCE(v_order.final_price, 0) - v_penalty;

    IF v_refund_amount > 0 AND v_order.payment_method = 'wallet' THEN
        SELECT id INTO v_wallet_id
        FROM wallets
        WHERE owner_type = 'customer' AND owner_id = v_order.customer_id;

        IF v_wallet_id IS NOT NULL
           AND NOT EXISTS (
               SELECT 1
               FROM transactions
               WHERE order_id = p_order_id
                 AND type = 'refund'
           ) THEN
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

    IF v_penalty > 0 THEN
        SELECT id INTO v_platform_wallet
        FROM wallets
        WHERE owner_type = 'platform'
        LIMIT 1;

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

    UPDATE orders
    SET status = 'cancelled',
        cancelled_at = NOW(),
        updated_at = NOW()
    WHERE id = p_order_id;

    INSERT INTO order_status_history (order_id, old_status, new_status, changed_by, reason)
    VALUES (p_order_id, v_order.status, 'cancelled', v_actor_id, p_reason);

    INSERT INTO cancellations (order_id, cancelled_by, user_id, reason, penalty_amount)
    VALUES (p_order_id, p_cancelled_by, v_actor_id, p_reason, v_penalty);

    IF v_order.rider_id IS NOT NULL THEN
        SELECT profile_id INTO v_rider_profile_id
        FROM riders
        WHERE id = v_order.rider_id;

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

    INSERT INTO notifications (user_id, type, title, body, data)
    VALUES (
        v_order.customer_id,
        'order_update',
        'Order Cancelled',
        'Your order has been cancelled.',
        jsonb_build_object('order_id', p_order_id, 'reason', p_reason)
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_delivery(p_order_id uuid, p_rider_id uuid, p_pod_photo_url text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_order orders%ROWTYPE;
    v_rider riders%ROWTYPE;
    v_commission NUMERIC;
    v_rider_earnings NUMERIC;
    v_rider_wallet UUID;
    v_platform_wallet UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found';
    END IF;
    IF v_order.status != 'arrived_dropoff' THEN
        RAISE EXCEPTION 'Order must be in arrived_dropoff status (current: %)', v_order.status;
    END IF;
    IF NOT COALESCE(v_order.delivery_code_verified, FALSE) THEN
        RAISE EXCEPTION 'Delivery code must be verified before marking complete';
    END IF;

    SELECT * INTO v_rider FROM riders WHERE id = p_rider_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Rider not found';
    END IF;
    IF v_order.rider_id != p_rider_id THEN
        RAISE EXCEPTION 'Rider is not assigned to this order';
    END IF;
    IF v_rider.profile_id != auth.uid() THEN
        RAISE EXCEPTION 'Unauthorized rider';
    END IF;

    v_commission := COALESCE(
        v_order.platform_commission_amount,
        ROUND(COALESCE(v_order.final_price, 0) * 0.15, 2)
    );
    v_rider_earnings := COALESCE(
        v_order.rider_net_amount,
        COALESCE(v_order.final_price, 0) - v_commission
    );

    UPDATE orders
    SET status = 'delivered',
        pod_photo_url = COALESCE(p_pod_photo_url, pod_photo_url),
        updated_at = NOW()
    WHERE id = p_order_id;

    INSERT INTO order_status_history (order_id, old_status, new_status, changed_by)
    VALUES (p_order_id, 'arrived_dropoff', 'delivered', auth.uid());

    IF v_order.payment_method = 'wallet' THEN
        SELECT id
        INTO v_rider_wallet
        FROM wallets
        WHERE owner_type = 'rider'
          AND owner_id IN (v_rider.profile_id, v_rider.id::uuid)
        ORDER BY CASE WHEN owner_id = v_rider.profile_id THEN 0 ELSE 1 END
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

        SELECT id INTO v_platform_wallet FROM wallets WHERE owner_type = 'platform' LIMIT 1;
        IF v_platform_wallet IS NOT NULL AND v_commission > 0 THEN
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
        INSERT INTO outstanding_balances (customer_id, order_id, rider_id, amount)
        VALUES (v_order.customer_id, p_order_id, p_rider_id, COALESCE(v_order.final_price, 0))
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
        'commission', v_commission,
        'final_price', v_order.final_price,
        'payment_method', v_order.payment_method
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.request_withdrawal(p_wallet_id uuid, p_amount numeric, p_bank_name text, p_bank_code text, p_account_number text, p_account_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_withdrawal_id UUID;
    v_reference TEXT;
    v_transaction_id UUID;
    v_wallet wallets%ROWTYPE;
    v_rider_profile_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Withdrawal amount must be positive';
    END IF;

    SELECT *
    INTO v_wallet
    FROM wallets
    WHERE id = p_wallet_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Wallet not found';
    END IF;

    IF v_wallet.owner_type = 'rider' THEN
        SELECT profile_id
        INTO v_rider_profile_id
        FROM riders
        WHERE id = v_wallet.owner_id;

        IF NOT (
            v_wallet.owner_id = auth.uid()
            OR (v_rider_profile_id IS NOT NULL AND v_rider_profile_id = auth.uid())
        ) THEN
            RAISE EXCEPTION 'Unauthorized wallet access';
        END IF;
    ELSIF v_wallet.owner_id != auth.uid() THEN
        RAISE EXCEPTION 'Unauthorized wallet access';
    END IF;

    v_reference := 'WDR-' || gen_random_uuid()::TEXT;

    v_transaction_id := debit_wallet(
        p_wallet_id,
        p_amount,
        'withdrawal',
        v_reference,
        'Withdrawal request to ' || p_bank_name || ' ' || p_account_number
    );

    INSERT INTO withdrawals (wallet_id, amount, bank_name, bank_code, account_number, account_name, transaction_id)
    VALUES (p_wallet_id, p_amount, p_bank_name, p_bank_code, p_account_number, p_account_name, v_transaction_id)
    RETURNING id INTO v_withdrawal_id;

    RETURN v_withdrawal_id;
END;
$function$;
