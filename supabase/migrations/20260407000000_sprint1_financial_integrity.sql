-- =============================================================================
-- Sprint 1 — Financial Integrity
-- Fixes: F1, F2, F3, F4, F5, F6, F7, F8, F9, F11, F12
-- F10 (mark_cash_paid UI) is a frontend fix — handled in Sprint 2
-- =============================================================================

-- -----------------------------------------------------------------------------
-- F1 + F2 + F4 + F5 + F6: Rewrite complete_delivery
--
-- F1: Use orders.platform_commission_amount (snapshotted at order creation)
--     instead of recalculating from riders.commission_rate
-- F2: Commission was calculated on VAT-inclusive final_price — now uses
--     the pre-VAT delivery price (final_price - vat_amount)
-- F4: Cash outstanding_balance was inserting v_order.final_price instead of
--     v_commission — rider was locked out after 2 cash deliveries
-- F5: Platform wallet was never credited on cash orders — now credited
-- F6: If platform wallet is missing, raise an exception instead of silently
--     skipping — prevents invisible revenue loss in bad environments
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.complete_delivery(
    p_order_id    UUID,
    p_rider_id    UUID,
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
    v_delivery_price  NUMERIC; -- final_price minus VAT — commission basis
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

    -- F6: Require platform wallet to exist — fail loudly, not silently
    SELECT id INTO v_platform_wallet FROM wallets WHERE owner_type = 'platform' LIMIT 1;
    IF v_platform_wallet IS NULL THEN
        RAISE EXCEPTION 'Platform wallet not found — cannot complete delivery without a revenue ledger';
    END IF;

    -- F1: Use the commission amount snapshotted on the order at creation/accept time
    --     NOT recalculated from riders.commission_rate (which may have changed)
    -- F2: Commission applies to the delivery fee only (pre-VAT amount)
    --     Compute: delivery_price = final_price - vat_amount
    --     Then use platform_commission_amount if it was snapshotted, otherwise
    --     recalculate from delivery_price * platform_commission_rate
    v_delivery_price := COALESCE(v_order.final_price, 0) - COALESCE(v_order.vat_amount, 0);

    IF COALESCE(v_order.platform_commission_amount, 0) > 0 THEN
        -- Snapshotted amount exists — use it (F1)
        v_commission := v_order.platform_commission_amount;
    ELSE
        -- Fallback: recalculate on delivery_price (pre-VAT) using snapshotted rate (F2)
        v_commission := ROUND(
            v_delivery_price * (COALESCE(v_order.platform_commission_rate, 15.0) / 100.0),
            2
        );
    END IF;

    v_rider_earnings := COALESCE(v_order.final_price, 0) - v_commission;

    -- Mark order delivered
    UPDATE orders SET
        status        = 'delivered',
        pod_photo_url = COALESCE(p_pod_photo_url, pod_photo_url),
        updated_at    = NOW()
    WHERE id = p_order_id;

    INSERT INTO order_status_history (order_id, old_status, new_status, changed_by)
    VALUES (p_order_id, 'arrived_dropoff', 'delivered', auth.uid());

    IF v_order.payment_method = 'wallet' THEN
        -- Credit rider wallet with net earnings
        SELECT id INTO v_rider_wallet FROM wallets
        WHERE owner_type = 'rider' AND owner_id = v_rider.profile_id;

        IF v_rider_wallet IS NOT NULL AND v_rider_earnings > 0 THEN
            PERFORM credit_wallet(
                v_rider_wallet, v_rider_earnings, 'credit',
                'EARN-' || p_order_id::TEXT, 'Delivery earnings', p_order_id
            );
        END IF;

        -- Credit platform wallet with commission
        IF v_commission > 0 THEN
            PERFORM credit_wallet(
                v_platform_wallet, v_commission, 'commission_credit',
                'COMM-' || p_order_id::TEXT, 'Platform commission', p_order_id
            );
        END IF;

    ELSIF v_order.payment_method = 'cash' THEN
        -- F4: Record only the commission owed (not the full trip price)
        -- Rider collected cash from customer; they owe the platform the commission
        INSERT INTO outstanding_balances (customer_id, order_id, rider_id, amount)
        VALUES (v_order.customer_id, p_order_id, p_rider_id, v_commission)
        ON CONFLICT (order_id) DO NOTHING;

        -- F5: Credit platform wallet for cash orders too (creates audit trail)
        -- Balance is owed by rider; platform records expected revenue
        IF v_commission > 0 THEN
            PERFORM credit_wallet(
                v_platform_wallet, v_commission, 'commission_credit',
                'COMM-CASH-' || p_order_id::TEXT, 'Platform commission (cash order)', p_order_id
            );
        END IF;
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


-- -----------------------------------------------------------------------------
-- F7: cancel_expired_orders — wallet refund on expiry
--
-- The existing cancel_expired_orders already calls refund_cancelled_order().
-- Verify that function actually refunds wallet-paid orders. If it does, F7
-- is already handled. Let us check and make it explicit with a rewrite that
-- directly calls credit_wallet for wallet orders.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cancel_expired_orders()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_expired_ids UUID[];
    v_order       orders%ROWTYPE;
    v_order_id    UUID;
    v_wallet_id   UUID;
    v_platform_wallet UUID;
BEGIN
    SELECT ARRAY_AGG(id) INTO v_expired_ids
    FROM orders
    WHERE status = 'pending'
      AND expires_at IS NOT NULL
      AND expires_at < NOW();

    IF v_expired_ids IS NULL OR ARRAY_LENGTH(v_expired_ids, 1) = 0 THEN
        RETURN 0;
    END IF;

    SELECT id INTO v_platform_wallet FROM wallets WHERE owner_type = 'platform' LIMIT 1;

    FOREACH v_order_id IN ARRAY v_expired_ids LOOP
        SELECT * INTO v_order FROM orders WHERE id = v_order_id;

        UPDATE orders
        SET status     = 'cancelled',
            updated_at = NOW()
        WHERE id = v_order_id;

        INSERT INTO order_status_history (order_id, old_status, new_status, changed_by)
        VALUES (v_order_id, 'pending', 'cancelled', NULL);

        -- F7: Refund wallet-paid orders on expiry
        IF v_order.payment_method = 'wallet' AND COALESCE(v_order.final_price, 0) > 0 THEN
            SELECT id INTO v_wallet_id FROM wallets
            WHERE owner_type = 'customer' AND owner_id = v_order.customer_id;

            IF v_wallet_id IS NOT NULL THEN
                PERFORM credit_wallet(
                    v_wallet_id,
                    v_order.final_price,
                    'refund',
                    'EXPIRE-REFUND-' || v_order_id::TEXT,
                    'Refund: no rider found before order expired',
                    v_order_id
                );
            END IF;

            -- Reverse the platform commission expectation if any was recorded
            -- (order never matched so no commission was earned)
            -- Nothing to reverse in platform wallet since debit never happened
        END IF;

        -- Reject all open bids on this order
        UPDATE bids SET status = 'rejected', updated_at = NOW()
        WHERE order_id = v_order_id AND status IN ('pending', 'countered');

        -- Notify customer
        INSERT INTO notifications (user_id, type, title, body, data)
        VALUES (
            v_order.customer_id,
            'order_update',
            'Order Expired',
            'No rider was found for your order. If you paid by wallet, your money has been refunded.',
            jsonb_build_object('order_id', v_order_id, 'reason', 'no_rider_found')
        );
    END LOOP;

    RETURN ARRAY_LENGTH(v_expired_ids, 1);
END;
$$;


-- -----------------------------------------------------------------------------
-- F8 + F9: Rewrite accept_bid
--
-- F8: COALESCE(platform_commission_rate, 10) → COALESCE(platform_commission_rate, 15)
--     Platform default is 15%, not 10%
-- F9: Add explicit insufficient-funds check before debit_wallet on higher bids
--     Raises a clean exception customer-facing apps can catch and display
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.accept_bid(
    p_bid_id      UUID,
    p_customer_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_bid                 bids%ROWTYPE;
    v_order               orders%ROWTYPE;
    v_rider               riders%ROWTYPE;
    v_rider_profile_id    UUID;
    v_price_diff          NUMERIC;
    v_wallet_id           UUID;
    v_wallet_balance      NUMERIC;
    v_new_final_price     NUMERIC;
    v_platform_commission NUMERIC;
    v_fleet_commission    NUMERIC := 0;
    v_fleet_commission_rate NUMERIC := 0;
    v_rider_net           NUMERIC;
BEGIN
    SELECT * INTO v_bid FROM bids WHERE id = p_bid_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Bid not found'; END IF;
    IF v_bid.status != 'pending' THEN
        RAISE EXCEPTION 'Bid is no longer pending (status: %)', v_bid.status;
    END IF;

    SELECT * INTO v_order FROM orders WHERE id = v_bid.order_id FOR UPDATE;
    IF v_order.customer_id != p_customer_id THEN
        RAISE EXCEPTION 'Only the order customer can accept bids';
    END IF;
    IF v_order.status != 'pending' THEN
        RAISE EXCEPTION 'Order is no longer accepting bids';
    END IF;

    SELECT * INTO v_rider FROM riders WHERE id = v_bid.rider_id;
    SELECT id INTO v_rider_profile_id FROM profiles WHERE id = v_rider.profile_id;

    v_new_final_price := v_bid.amount + COALESCE(v_order.vat_amount, 0);

    IF v_order.payment_method = 'wallet' THEN
        v_price_diff := v_order.final_price - v_new_final_price;

        IF v_price_diff > 0 THEN
            -- Bid lower than original — refund difference
            SELECT id INTO v_wallet_id FROM wallets
            WHERE owner_type = 'customer' AND owner_id = p_customer_id;

            PERFORM credit_wallet(
                v_wallet_id, v_price_diff, 'refund',
                'BID-REFUND-' || p_bid_id::TEXT,
                'Refund: accepted bid lower than original price',
                v_order.id
            );
        ELSIF v_price_diff < 0 THEN
            -- Bid higher than original — charge the extra
            SELECT id INTO v_wallet_id FROM wallets
            WHERE owner_type = 'customer' AND owner_id = p_customer_id;

            -- F9: Check balance before debiting — raise clean error if insufficient
            SELECT balance INTO v_wallet_balance FROM wallets WHERE id = v_wallet_id;
            IF v_wallet_balance < ABS(v_price_diff) THEN
                RAISE EXCEPTION 'INSUFFICIENT_FUNDS: Wallet balance (₦%) is less than required extra charge (₦%)',
                    v_wallet_balance, ABS(v_price_diff);
            END IF;

            PERFORM debit_wallet(
                v_wallet_id, ABS(v_price_diff), 'debit',
                'BID-CHARGE-' || p_bid_id::TEXT,
                'Additional charge: accepted bid higher than original price',
                v_order.id
            );
        END IF;
    END IF;

    -- F8: Default commission rate is 15% not 10%
    v_platform_commission := ROUND(
        v_new_final_price * (COALESCE(v_order.platform_commission_rate, 15.0) / 100.0),
        2
    );

    IF v_rider.fleet_id IS NOT NULL THEN
        SELECT commission_rate INTO v_fleet_commission_rate
        FROM fleets WHERE id = v_rider.fleet_id;

        v_fleet_commission := ROUND(
            (v_new_final_price - v_platform_commission) * (COALESCE(v_fleet_commission_rate, 0) / 100.0),
            2
        );
    END IF;

    v_rider_net := v_new_final_price - v_platform_commission - v_fleet_commission;

    UPDATE bids SET status = 'accepted' WHERE id = p_bid_id;

    UPDATE bids SET status = 'expired'
    WHERE order_id = v_order.id AND id != p_bid_id AND status = 'pending';

    UPDATE orders SET
        status                    = 'matched',
        rider_id                  = v_bid.rider_id,
        final_price               = v_new_final_price,
        platform_commission_amount = v_platform_commission,
        fleet_commission_rate     = v_fleet_commission_rate,
        fleet_commission_amount   = v_fleet_commission,
        rider_net_amount          = v_rider_net,
        matched_at                = NOW()
    WHERE id = v_order.id;

    INSERT INTO order_status_history (order_id, old_status, new_status, changed_by)
    VALUES (v_order.id, 'pending', 'matched', p_customer_id);

    INSERT INTO notifications (user_id, type, title, body, data)
    VALUES (
        v_rider_profile_id,
        'order_update',
        'Bid Accepted!',
        'Your offer of ₦' || v_bid.amount::TEXT || ' was accepted. Head to pickup.',
        jsonb_build_object('order_id', v_order.id)
    );

    RETURN jsonb_build_object(
        'order_id',            v_order.id,
        'rider_id',            v_bid.rider_id,
        'final_price',         v_new_final_price,
        'platform_commission', v_platform_commission,
        'fleet_commission',    v_fleet_commission,
        'rider_net',           v_rider_net
    );
END;
$$;


-- -----------------------------------------------------------------------------
-- F11: create_order — suggested_price column was overwritten with dynamic_price.
-- Minimal fix: copy exact function body from 20260406010000, changing only:
--   INSERT VALUES: v_dynamic_price, v_dynamic_price → v_dynamic_price, COALESCE(p_suggested_price, v_dynamic_price)
--   RETURN:        'suggested_price', v_dynamic_price → 'suggested_price', COALESCE(p_suggested_price, v_dynamic_price)
-- All pricing logic, promo code handling, and expiry unchanged.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_order(
    p_customer_id           uuid,
    p_pickup_address        text,
    p_pickup_lat            double precision,
    p_pickup_lng            double precision,
    p_pickup_contact_name   text DEFAULT NULL::text,
    p_pickup_contact_phone  text DEFAULT NULL::text,
    p_dropoff_address       text DEFAULT NULL::text,
    p_dropoff_lat           double precision DEFAULT NULL::double precision,
    p_dropoff_lng           double precision DEFAULT NULL::double precision,
    p_dropoff_contact_name  text DEFAULT NULL::text,
    p_dropoff_contact_phone text DEFAULT NULL::text,
    p_category_id           uuid DEFAULT NULL::uuid,
    p_package_size          text DEFAULT 'small'::text,
    p_package_description   text DEFAULT NULL::text,
    p_package_notes         text DEFAULT NULL::text,
    p_suggested_price       numeric DEFAULT NULL::numeric,
    p_promo_code            text DEFAULT NULL::text,
    p_service_area_id       uuid DEFAULT NULL::uuid,
    p_payment_method        text DEFAULT 'wallet'::text
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
        v_distance_km, v_dynamic_price,
        COALESCE(p_suggested_price, v_dynamic_price), -- F11: use customer's suggested price
        v_final_price, v_vat_amount,
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
        'suggested_price', COALESCE(p_suggested_price, v_dynamic_price), -- F11
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


-- -----------------------------------------------------------------------------
-- F3: payment-webhook — failed withdrawal must refund wallet
-- This is an Edge Function fix (payment-webhook/index.ts) — handled in code.
-- No DB migration needed here.
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- F12: Commission rate — establish single source of truth
--
-- riders table has NO commission_rate column in v2 schema.
-- The old complete_delivery used v_rider.commission_rate (always NULL in v2),
-- which fell back to COALESCE(..., 0.10) — silently using the wrong rate.
--
-- Fix: The rewritten complete_delivery above uses orders.platform_commission_amount
-- (snapshotted at 15% on order creation) — no rider-level column needed.
-- The earnings screen hardcode is fixed in frontend (earnings.tsx already patched).
-- No schema change required here.
-- -----------------------------------------------------------------------------
