-- Sprint 5 — Stability & edge cases
-- Fixes: Issue 13 (expiry cron), Issue 19 (POD enforcement),
--        F15 (promo race condition), F16 (withdrawal fee audit trail)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Issue 13: Schedule cancel_expired_orders via pg_cron every 5 minutes.
-- The function itself (with wallet refund) was already fixed in Sprint 1.
-- This migration wires up the cron job if pg_cron is available on this project.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        -- Remove any old duplicate job first (unschedule is a no-op if job not found)
        BEGIN
            PERFORM cron.unschedule('cancel-expired-orders');
        EXCEPTION WHEN OTHERS THEN
            NULL; -- job did not exist, ignore
        END;
        PERFORM cron.schedule(
            'cancel-expired-orders',
            '*/5 * * * *',
            'SELECT public.cancel_expired_orders()'
        );
    END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Issue 19: Enforce POD photo server-side in complete_delivery.
-- Currently p_pod_photo_url is DEFAULT NULL — no check prevents omission.
-- After this fix the caller MUST supply a non-empty URL.
-- ---------------------------------------------------------------------------

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
    IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
    IF v_order.status != 'arrived_dropoff' THEN
        RAISE EXCEPTION 'Order must be in arrived_dropoff status (current: %)', v_order.status;
    END IF;
    IF NOT COALESCE(v_order.delivery_code_verified, FALSE) THEN
        RAISE EXCEPTION 'Delivery code must be verified before marking complete';
    END IF;

    -- Issue 19: Require a proof-of-delivery photo URL
    IF p_pod_photo_url IS NULL OR TRIM(p_pod_photo_url) = '' THEN
        RAISE EXCEPTION 'Proof-of-delivery photo is required to complete a delivery';
    END IF;

    SELECT * INTO v_rider FROM riders WHERE id = p_rider_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Rider not found'; END IF;
    IF v_order.rider_id != p_rider_id THEN
        RAISE EXCEPTION 'Rider is not assigned to this order';
    END IF;

    SELECT id INTO v_platform_wallet FROM wallets WHERE owner_type = 'platform' LIMIT 1;
    IF v_platform_wallet IS NULL THEN
        RAISE EXCEPTION 'Platform wallet not found — cannot complete delivery without a revenue ledger';
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

    UPDATE orders SET
        status        = 'delivered',
        pod_photo_url = p_pod_photo_url,
        updated_at    = NOW()
    WHERE id = p_order_id;

    INSERT INTO order_status_history (order_id, old_status, new_status, changed_by)
    VALUES (p_order_id, 'arrived_dropoff', 'delivered', auth.uid());

    IF v_order.payment_method = 'wallet' THEN
        SELECT id INTO v_rider_wallet FROM wallets
        WHERE owner_type = 'rider' AND owner_id = v_rider.profile_id;

        IF v_rider_wallet IS NOT NULL AND v_rider_earnings > 0 THEN
            PERFORM credit_wallet(
                v_rider_wallet, v_rider_earnings, 'credit',
                'EARN-' || p_order_id::TEXT, 'Delivery earnings', p_order_id
            );
        END IF;

        IF v_commission > 0 THEN
            PERFORM credit_wallet(
                v_platform_wallet, v_commission, 'commission_credit',
                'COMM-' || p_order_id::TEXT, 'Platform commission', p_order_id
            );
        END IF;
    ELSIF v_order.payment_method = 'cash' THEN
        INSERT INTO outstanding_balances (customer_id, order_id, rider_id, amount)
        VALUES (v_order.customer_id, p_order_id, p_rider_id, v_commission)
        ON CONFLICT (order_id) DO NOTHING;

        IF v_commission > 0 THEN
            PERFORM credit_wallet(
                v_platform_wallet, v_commission, 'commission_credit',
                'COMM-CASH-' || p_order_id::TEXT, 'Platform commission (cash order)', p_order_id
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
        'rider_earnings',       v_rider_earnings,
        'platform_commission',  v_commission,
        'delivery_price',       v_delivery_price
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_delivery(uuid, uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- F15: Promo code race condition — serialise used_count increment.
-- Problem: two concurrent create_order calls with same promo both pass the
-- validity check before either increments used_count, allowing double-use.
-- Fix: add SELECT ... FOR UPDATE on the promo row before the validity check.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_order(
    p_customer_id uuid,
    p_pickup_address text,
    p_pickup_lat double precision,
    p_pickup_lng double precision,
    p_pickup_contact_name text DEFAULT NULL,
    p_pickup_contact_phone text DEFAULT NULL,
    p_dropoff_address text DEFAULT NULL,
    p_dropoff_lat double precision DEFAULT NULL,
    p_dropoff_lng double precision DEFAULT NULL,
    p_dropoff_contact_name text DEFAULT NULL,
    p_dropoff_contact_phone text DEFAULT NULL,
    p_category_id uuid DEFAULT NULL,
    p_package_size text DEFAULT 'small',
    p_package_description text DEFAULT NULL,
    p_package_notes text DEFAULT NULL,
    p_suggested_price numeric DEFAULT NULL,
    p_promo_code text DEFAULT NULL,
    p_service_area_id uuid DEFAULT NULL,
    p_payment_method text DEFAULT 'wallet'
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
    v_promo promo_codes%ROWTYPE;
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

    -- F15: Lock the promo row BEFORE checking validity to prevent concurrent double-use
    IF p_promo_code IS NOT NULL AND NULLIF(TRIM(p_promo_code), '') IS NOT NULL THEN
        SELECT * INTO v_promo
        FROM promo_codes
        WHERE code = UPPER(TRIM(p_promo_code))
        FOR UPDATE;

        IF FOUND
           AND v_promo.is_active = TRUE
           AND v_promo.starts_at <= NOW()
           AND (v_promo.expires_at IS NULL OR v_promo.expires_at > NOW())
           AND (v_promo.max_uses IS NULL OR v_promo.used_count < v_promo.max_uses)
           AND (v_dynamic_price + v_vat_amount) >= v_promo.min_order_amount
        THEN
            v_promo_id := v_promo.id;
            v_discount_amount := CASE
                WHEN v_promo.discount_type = 'percentage' THEN
                    LEAST(ROUND(v_dynamic_price * (v_promo.discount_value / 100.0), 2), COALESCE(v_promo.max_discount_amount, v_dynamic_price))
                ELSE LEAST(v_promo.discount_value, v_dynamic_price)
            END;
            UPDATE promo_codes SET used_count = used_count + 1 WHERE id = v_promo_id;
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

GRANT EXECUTE ON FUNCTION public.create_order(uuid, text, double precision, double precision, text, text, text, double precision, double precision, text, text, uuid, text, text, text, numeric, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_order(uuid, text, double precision, double precision, text, text, text, double precision, double precision, text, text, uuid, text, text, text, numeric, text, uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- F16: Withdrawal fee audit trail.
-- Problem: request_withdrawal debits full amount without recording the ₦100 fee
-- as a separate line item. The withdrawals table has no fee/net_payout columns.
-- Fix: add withdrawal_fee + net_payout columns, rewrite the function to record
-- the fee breakdown. Drop old 6-param overload so new 7-param (fee DEFAULT 100)
-- is the sole overload — existing callers that omit p_fee get 100 by default.
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.request_withdrawal(uuid, numeric, text, text, text, text);

-- First add withdrawal_fee column to withdrawals if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'withdrawals'
          AND column_name = 'withdrawal_fee'
    ) THEN
        ALTER TABLE public.withdrawals
            ADD COLUMN withdrawal_fee NUMERIC(18,2) NOT NULL DEFAULT 0;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'withdrawals'
          AND column_name = 'net_payout'
    ) THEN
        ALTER TABLE public.withdrawals
            ADD COLUMN net_payout NUMERIC(18,2);
    END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.request_withdrawal(
    p_wallet_id    uuid,
    p_amount       numeric,
    p_bank_name    text,
    p_bank_code    text,
    p_account_number text,
    p_account_name text,
    p_fee          numeric DEFAULT 100  -- ₦100 flat withdrawal fee
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_withdrawal_id  UUID;
    v_reference      TEXT;
    v_transaction_id UUID;
    v_wallet         wallets%ROWTYPE;
    v_rider_profile_id UUID;
    v_net_payout     NUMERIC;
    v_total_debit    NUMERIC;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Withdrawal amount must be positive';
    END IF;
    IF p_fee < 0 THEN
        RAISE EXCEPTION 'Fee cannot be negative';
    END IF;

    SELECT * INTO v_wallet FROM wallets WHERE id = p_wallet_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Wallet not found'; END IF;

    IF v_wallet.owner_type = 'rider' THEN
        SELECT profile_id INTO v_rider_profile_id FROM riders WHERE id = v_wallet.owner_id;
        IF NOT (
            v_wallet.owner_id = auth.uid()
            OR (v_rider_profile_id IS NOT NULL AND v_rider_profile_id = auth.uid())
        ) THEN
            RAISE EXCEPTION 'Unauthorized wallet access';
        END IF;
    ELSIF v_wallet.owner_id != auth.uid() THEN
        RAISE EXCEPTION 'Unauthorized wallet access';
    END IF;

    v_net_payout  := p_amount - p_fee;
    v_total_debit := p_amount;
    v_reference   := 'WDR-' || gen_random_uuid()::TEXT;

    IF v_net_payout <= 0 THEN
        RAISE EXCEPTION 'Withdrawal amount must exceed the processing fee of ₦%', p_fee;
    END IF;

    -- Debit the net payout from wallet (fee is retained by platform, not re-credited)
    v_transaction_id := debit_wallet(
        p_wallet_id,
        v_total_debit,
        'withdrawal',
        v_reference,
        'Withdrawal to ' || p_bank_name || ' ' || p_account_number || ' (net: ₦' || v_net_payout || ', fee: ₦' || p_fee || ')'
    );

    INSERT INTO withdrawals (
        wallet_id, amount, bank_name, bank_code, account_number, account_name,
        transaction_id, withdrawal_fee, net_payout
    )
    VALUES (
        p_wallet_id, p_amount, p_bank_name, p_bank_code, p_account_number, p_account_name,
        v_transaction_id, p_fee, v_net_payout
    )
    RETURNING id INTO v_withdrawal_id;

    RETURN v_withdrawal_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_withdrawal(uuid, numeric, text, text, text, text, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_withdrawal(uuid, numeric, text, text, text, text, numeric) TO service_role;
REVOKE EXECUTE ON FUNCTION public.request_withdrawal(uuid, numeric, text, text, text, text, numeric) FROM anon;
