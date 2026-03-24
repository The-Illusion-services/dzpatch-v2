-- ============================================================
-- DZpatch V2.0 — RPC Functions (Stored Procedures)
-- Migration: 00002_rpc_functions.sql
--
-- All critical operations are server-side RPCs.
-- No client-side balance checks. No client-side status transitions.
-- Every wallet mutation uses SELECT ... FOR UPDATE row locking.
-- ============================================================


-- ============================================================
-- 1. WALLET OPERATIONS
-- ============================================================

-- ---------------------------------------------------------
-- 1.1 create_wallet
-- Creates a wallet for a user/rider/fleet. Called during signup.
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION create_wallet(
    p_owner_type wallet_owner_type,
    p_owner_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_wallet_id UUID;
BEGIN
    INSERT INTO wallets (owner_type, owner_id, balance, currency)
    VALUES (p_owner_type, p_owner_id, 0, 'NGN')
    ON CONFLICT (owner_type, owner_id) DO NOTHING
    RETURNING id INTO v_wallet_id;

    -- If already exists, fetch the existing one
    IF v_wallet_id IS NULL THEN
        SELECT id INTO v_wallet_id
        FROM wallets
        WHERE owner_type = p_owner_type AND owner_id = p_owner_id;
    END IF;

    RETURN v_wallet_id;
END;
$$;

-- ---------------------------------------------------------
-- 1.2 credit_wallet
-- Adds funds to a wallet. Used for: Paystack funding, refunds, adjustments.
-- Idempotent via unique reference.
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION credit_wallet(
    p_wallet_id UUID,
    p_amount NUMERIC,
    p_type transaction_type,
    p_reference TEXT,
    p_description TEXT DEFAULT NULL,
    p_order_id UUID DEFAULT NULL,
    p_metadata JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_balance_before NUMERIC;
    v_balance_after NUMERIC;
    v_transaction_id UUID;
    v_existing_id UUID;
BEGIN
    -- Idempotency check: if reference already processed, return existing transaction
    SELECT id INTO v_existing_id FROM transactions WHERE reference = p_reference;
    IF v_existing_id IS NOT NULL THEN
        RETURN v_existing_id;
    END IF;

    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Credit amount must be positive: %', p_amount;
    END IF;

    -- Lock the wallet row
    SELECT balance INTO v_balance_before
    FROM wallets
    WHERE id = p_wallet_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Wallet not found: %', p_wallet_id;
    END IF;

    v_balance_after := v_balance_before + p_amount;

    -- Update wallet balance
    UPDATE wallets
    SET balance = v_balance_after
    WHERE id = p_wallet_id;

    -- Record transaction
    INSERT INTO transactions (wallet_id, type, amount, balance_before, balance_after, reference, description, order_id, metadata)
    VALUES (p_wallet_id, p_type, p_amount, v_balance_before, v_balance_after, p_reference, p_description, p_order_id, p_metadata)
    RETURNING id INTO v_transaction_id;

    RETURN v_transaction_id;
END;
$$;

-- ---------------------------------------------------------
-- 1.3 debit_wallet
-- Removes funds from a wallet. Used for: order payment, commission deduction, withdrawals.
-- Fails if insufficient balance (CHECK constraint enforces >= 0).
-- Idempotent via unique reference.
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION debit_wallet(
    p_wallet_id UUID,
    p_amount NUMERIC,
    p_type transaction_type,
    p_reference TEXT,
    p_description TEXT DEFAULT NULL,
    p_order_id UUID DEFAULT NULL,
    p_metadata JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_balance_before NUMERIC;
    v_balance_after NUMERIC;
    v_transaction_id UUID;
    v_existing_id UUID;
BEGIN
    -- Idempotency check
    SELECT id INTO v_existing_id FROM transactions WHERE reference = p_reference;
    IF v_existing_id IS NOT NULL THEN
        RETURN v_existing_id;
    END IF;

    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Debit amount must be positive: %', p_amount;
    END IF;

    -- Lock the wallet row
    SELECT balance INTO v_balance_before
    FROM wallets
    WHERE id = p_wallet_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Wallet not found: %', p_wallet_id;
    END IF;

    v_balance_after := v_balance_before - p_amount;

    IF v_balance_after < 0 THEN
        RAISE EXCEPTION 'Insufficient balance. Current: %, Requested: %', v_balance_before, p_amount;
    END IF;

    -- Update wallet balance
    UPDATE wallets
    SET balance = v_balance_after
    WHERE id = p_wallet_id;

    -- Record transaction
    INSERT INTO transactions (wallet_id, type, amount, balance_before, balance_after, reference, description, order_id, metadata)
    VALUES (p_wallet_id, p_type, p_amount, v_balance_before, v_balance_after, p_reference, p_description, p_order_id, p_metadata)
    RETURNING id INTO v_transaction_id;

    RETURN v_transaction_id;
END;
$$;

-- ---------------------------------------------------------
-- 1.4 request_withdrawal
-- Creates a withdrawal request and immediately debits the wallet.
-- The funds are "held" until admin approves/rejects.
-- On rejection, a separate credit_wallet call refunds the amount.
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION request_withdrawal(
    p_wallet_id UUID,
    p_amount NUMERIC,
    p_bank_name TEXT,
    p_bank_code TEXT,
    p_account_number TEXT,
    p_account_name TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_withdrawal_id UUID;
    v_reference TEXT;
    v_transaction_id UUID;
BEGIN
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Withdrawal amount must be positive';
    END IF;

    -- Generate unique reference
    v_reference := 'WDR-' || gen_random_uuid()::TEXT;

    -- Debit wallet first (locks row, checks balance)
    v_transaction_id := debit_wallet(
        p_wallet_id,
        p_amount,
        'withdrawal',
        v_reference,
        'Withdrawal request to ' || p_bank_name || ' ' || p_account_number
    );

    -- Create withdrawal record
    INSERT INTO withdrawals (wallet_id, amount, bank_name, bank_code, account_number, account_name, transaction_id)
    VALUES (p_wallet_id, p_amount, p_bank_name, p_bank_code, p_account_number, p_account_name, v_transaction_id)
    RETURNING id INTO v_withdrawal_id;

    RETURN v_withdrawal_id;
END;
$$;


-- ============================================================
-- 2. ORDER OPERATIONS
-- ============================================================

-- ---------------------------------------------------------
-- 2.1 create_order
-- Creates an order, calculates pricing, generates delivery code,
-- and debits customer wallet atomically.
-- ---------------------------------------------------------
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
    p_service_area_id UUID DEFAULT NULL
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
    v_platform_commission_rate NUMERIC := 15.00;  -- default platform commission %
    v_platform_commission_amount NUMERIC;
    v_expires_at TIMESTAMPTZ;
BEGIN
    -- Validate required dropoff
    IF p_dropoff_address IS NULL OR p_dropoff_lat IS NULL OR p_dropoff_lng IS NULL THEN
        RAISE EXCEPTION 'Dropoff address, latitude, and longitude are required';
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
        -- Apply min/max
        IF v_dynamic_price < v_pricing.min_price THEN
            v_dynamic_price := v_pricing.min_price;
        END IF;
        IF v_pricing.max_price IS NOT NULL AND v_dynamic_price > v_pricing.max_price THEN
            v_dynamic_price := v_pricing.max_price;
        END IF;
        -- VAT
        v_vat_amount := ROUND(v_dynamic_price * (v_pricing.vat_percentage / 100.0), 2);
    ELSE
        -- Fallback pricing if no pricing rules configured
        v_dynamic_price := ROUND(500 + (v_distance_km * 100), 2);  -- NGN 500 base + 100/km
        v_vat_amount := ROUND(v_dynamic_price * 0.075, 2);         -- 7.5% VAT
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

            -- Increment usage
            UPDATE promo_codes SET used_count = used_count + 1 WHERE id = v_promo_id;
        END IF;
    END IF;

    -- Determine final price:
    -- If customer suggests a price, that becomes the starting point for negotiation.
    -- If not, dynamic_price is used. Discount applies either way.
    v_final_price := COALESCE(p_suggested_price, v_dynamic_price) + v_vat_amount - v_discount_amount;
    IF v_final_price < 0 THEN
        v_final_price := 0;
    END IF;

    -- Commission calculations (snapshot at order creation)
    v_platform_commission_amount := ROUND(v_final_price * (v_platform_commission_rate / 100.0), 2);

    -- Generate 6-digit delivery code
    v_delivery_code := LPAD(FLOOR(RANDOM() * 1000000)::TEXT, 6, '0');

    -- Negotiation timeout (configurable, default 10 minutes)
    v_expires_at := NOW() + INTERVAL '10 minutes';

    -- Get customer wallet
    SELECT id INTO v_wallet_id
    FROM wallets
    WHERE owner_type = 'customer' AND owner_id = p_customer_id;

    IF v_wallet_id IS NULL THEN
        RAISE EXCEPTION 'Customer wallet not found. Please set up your wallet first.';
    END IF;

    -- Debit customer wallet (atomic — fails if insufficient balance)
    v_reference := 'ORD-' || gen_random_uuid()::TEXT;
    PERFORM debit_wallet(
        v_wallet_id,
        v_final_price,
        'debit',
        v_reference,
        'Payment for delivery order'
    );

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
        delivery_code, expires_at, service_area_id
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
        v_delivery_code, v_expires_at, p_service_area_id
    )
    RETURNING id INTO v_order_id;

    -- Record initial status
    INSERT INTO order_status_history (order_id, old_status, new_status, changed_by)
    VALUES (v_order_id, NULL, 'pending', p_customer_id);

    -- Create notification for customer
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
        'expires_at', v_expires_at
    );
END;
$$;


-- ============================================================
-- 3. BID / NEGOTIATION OPERATIONS
-- ============================================================

-- ---------------------------------------------------------
-- 3.1 place_bid
-- Rider places a bid (accept at price or counter-offer).
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION place_bid(
    p_order_id UUID,
    p_rider_id UUID,
    p_amount NUMERIC
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_bid_id UUID;
    v_order orders%ROWTYPE;
    v_rider riders%ROWTYPE;
    v_customer_profile_id UUID;
BEGIN
    -- Validate order
    SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found';
    END IF;
    IF v_order.status != 'pending' THEN
        RAISE EXCEPTION 'Order is no longer accepting bids (status: %)', v_order.status;
    END IF;
    IF v_order.expires_at IS NOT NULL AND v_order.expires_at < NOW() THEN
        RAISE EXCEPTION 'Order has expired';
    END IF;

    -- Validate rider
    SELECT * INTO v_rider FROM riders WHERE id = p_rider_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Rider not found';
    END IF;
    IF NOT v_rider.is_approved THEN
        RAISE EXCEPTION 'Rider is not approved for deliveries';
    END IF;
    IF NOT v_rider.is_online THEN
        RAISE EXCEPTION 'Rider must be online to place bids';
    END IF;
    IF v_rider.is_commission_locked THEN
        RAISE EXCEPTION 'Rider is commission-locked. Please settle outstanding commission.';
    END IF;

    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Bid amount must be positive';
    END IF;

    -- Insert bid (partial unique index prevents duplicate pending bids)
    INSERT INTO bids (order_id, rider_id, amount, status, expires_at)
    VALUES (p_order_id, p_rider_id, p_amount, 'pending', NOW() + INTERVAL '2 minutes')
    RETURNING id INTO v_bid_id;

    -- Notify customer of new bid
    INSERT INTO notifications (user_id, type, title, body, data)
    VALUES (
        v_order.customer_id,
        'order_update',
        'New Rider Offer',
        'A rider has offered ₦' || p_amount::TEXT || ' for your delivery.',
        jsonb_build_object('order_id', p_order_id, 'bid_id', v_bid_id, 'amount', p_amount)
    );

    RETURN v_bid_id;
END;
$$;

-- ---------------------------------------------------------
-- 3.2 accept_bid
-- Customer accepts a rider's bid. Locks in the rider and price.
-- Handles price difference if bid != original final_price.
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION accept_bid(
    p_bid_id UUID,
    p_customer_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_bid bids%ROWTYPE;
    v_order orders%ROWTYPE;
    v_rider riders%ROWTYPE;
    v_rider_profile_id UUID;
    v_price_diff NUMERIC;
    v_wallet_id UUID;
    v_new_final_price NUMERIC;
    v_platform_commission NUMERIC;
    v_fleet_commission NUMERIC := 0;
    v_fleet_commission_rate NUMERIC := 0;
    v_rider_net NUMERIC;
BEGIN
    -- Lock and validate bid
    SELECT * INTO v_bid FROM bids WHERE id = p_bid_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Bid not found';
    END IF;
    IF v_bid.status != 'pending' THEN
        RAISE EXCEPTION 'Bid is no longer pending (status: %)', v_bid.status;
    END IF;

    -- Lock and validate order
    SELECT * INTO v_order FROM orders WHERE id = v_bid.order_id FOR UPDATE;
    IF v_order.customer_id != p_customer_id THEN
        RAISE EXCEPTION 'Only the order customer can accept bids';
    END IF;
    IF v_order.status != 'pending' THEN
        RAISE EXCEPTION 'Order is no longer accepting bids';
    END IF;

    -- Get rider info
    SELECT * INTO v_rider FROM riders WHERE id = v_bid.rider_id;
    SELECT id INTO v_rider_profile_id FROM profiles WHERE id = v_rider.profile_id;

    -- Calculate new final price (bid amount + VAT)
    v_new_final_price := v_bid.amount + v_order.vat_amount;

    -- Handle price difference (refund or charge)
    v_price_diff := v_order.final_price - v_new_final_price;

    IF v_price_diff > 0 THEN
        -- Bid was lower — refund the difference to customer
        SELECT id INTO v_wallet_id FROM wallets
        WHERE owner_type = 'customer' AND owner_id = p_customer_id;

        PERFORM credit_wallet(
            v_wallet_id,
            v_price_diff,
            'refund',
            'BID-REFUND-' || p_bid_id::TEXT,
            'Refund: accepted bid lower than original price',
            v_order.id
        );
    ELSIF v_price_diff < 0 THEN
        -- Bid was higher — charge the difference
        SELECT id INTO v_wallet_id FROM wallets
        WHERE owner_type = 'customer' AND owner_id = p_customer_id;

        PERFORM debit_wallet(
            v_wallet_id,
            ABS(v_price_diff),
            'debit',
            'BID-CHARGE-' || p_bid_id::TEXT,
            'Additional charge: accepted bid higher than original price',
            v_order.id
        );
    END IF;

    -- Recalculate commission with new price
    v_platform_commission := ROUND(v_new_final_price * (v_order.platform_commission_rate / 100.0), 2);

    -- Check if rider is in a fleet
    IF v_rider.fleet_id IS NOT NULL THEN
        SELECT commission_rate, commission_type INTO v_fleet_commission_rate
        FROM fleets WHERE id = v_rider.fleet_id;

        -- Fleet commission is taken from rider's share (after platform commission)
        v_fleet_commission := ROUND(
            (v_new_final_price - v_platform_commission) * (v_fleet_commission_rate / 100.0),
            2
        );
    END IF;

    v_rider_net := v_new_final_price - v_platform_commission - v_fleet_commission;

    -- Accept the bid
    UPDATE bids SET status = 'accepted' WHERE id = p_bid_id;

    -- Expire all other pending bids for this order
    UPDATE bids SET status = 'expired'
    WHERE order_id = v_order.id AND id != p_bid_id AND status = 'pending';

    -- Update order
    UPDATE orders SET
        status = 'matched',
        rider_id = v_bid.rider_id,
        final_price = v_new_final_price,
        platform_commission_amount = v_platform_commission,
        fleet_commission_rate = v_fleet_commission_rate,
        fleet_commission_amount = v_fleet_commission,
        rider_net_amount = v_rider_net,
        matched_at = NOW()
    WHERE id = v_order.id;

    -- Record status change
    INSERT INTO order_status_history (order_id, old_status, new_status, changed_by)
    VALUES (v_order.id, 'pending', 'matched', p_customer_id);

    -- Notify rider
    INSERT INTO notifications (user_id, type, title, body, data)
    VALUES (
        v_rider_profile_id,
        'order_update',
        'Bid Accepted!',
        'Your offer of ₦' || v_bid.amount::TEXT || ' was accepted. Head to pickup.',
        jsonb_build_object('order_id', v_order.id)
    );

    RETURN jsonb_build_object(
        'order_id', v_order.id,
        'rider_id', v_bid.rider_id,
        'final_price', v_new_final_price,
        'platform_commission', v_platform_commission,
        'fleet_commission', v_fleet_commission,
        'rider_net', v_rider_net
    );
END;
$$;


-- ============================================================
-- 4. DELIVERY STATE MACHINE
-- ============================================================

-- ---------------------------------------------------------
-- 4.1 update_order_status
-- The ONLY way to transition order status.
-- Enforces valid state transitions.
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION update_order_status(
    p_order_id UUID,
    p_new_status order_status,
    p_changed_by UUID DEFAULT NULL,
    p_reason TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order orders%ROWTYPE;
    v_valid BOOLEAN := FALSE;
BEGIN
    -- Lock the order
    SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found: %', p_order_id;
    END IF;

    -- Validate state transition
    v_valid := CASE
        WHEN v_order.status = 'pending'         AND p_new_status IN ('matched', 'cancelled') THEN TRUE
        WHEN v_order.status = 'matched'          AND p_new_status IN ('pickup_en_route', 'cancelled') THEN TRUE
        WHEN v_order.status = 'pickup_en_route'  AND p_new_status IN ('arrived_pickup', 'cancelled') THEN TRUE
        WHEN v_order.status = 'arrived_pickup'    AND p_new_status IN ('in_transit', 'cancelled') THEN TRUE
        WHEN v_order.status = 'in_transit'        AND p_new_status IN ('arrived_dropoff', 'cancelled') THEN TRUE
        WHEN v_order.status = 'arrived_dropoff'   AND p_new_status IN ('delivered', 'cancelled') THEN TRUE
        WHEN v_order.status = 'delivered'         AND p_new_status = 'completed' THEN TRUE
        ELSE FALSE
    END;

    IF NOT v_valid THEN
        RAISE EXCEPTION 'Invalid status transition: % → %', v_order.status, p_new_status;
    END IF;

    -- Update the order
    UPDATE orders SET
        status = p_new_status,
        picked_up_at = CASE WHEN p_new_status = 'in_transit' THEN NOW() ELSE picked_up_at END,
        delivered_at = CASE WHEN p_new_status = 'delivered' THEN NOW() ELSE delivered_at END,
        cancelled_at = CASE WHEN p_new_status = 'cancelled' THEN NOW() ELSE cancelled_at END
    WHERE id = p_order_id;

    -- Record status change
    INSERT INTO order_status_history (order_id, old_status, new_status, changed_by, reason, metadata)
    VALUES (p_order_id, v_order.status, p_new_status, p_changed_by, p_reason, p_metadata);

    -- Notify relevant parties
    IF p_new_status = 'pickup_en_route' THEN
        INSERT INTO notifications (user_id, type, title, body, data)
        VALUES (v_order.customer_id, 'order_update', 'Rider En Route',
            'Your rider is heading to the pickup location.',
            jsonb_build_object('order_id', p_order_id));

    ELSIF p_new_status = 'arrived_pickup' THEN
        INSERT INTO notifications (user_id, type, title, body, data)
        VALUES (v_order.customer_id, 'order_update', 'Rider Arrived at Pickup',
            'Your rider has arrived at the pickup location.',
            jsonb_build_object('order_id', p_order_id));

    ELSIF p_new_status = 'in_transit' THEN
        INSERT INTO notifications (user_id, type, title, body, data)
        VALUES (v_order.customer_id, 'order_update', 'Package Picked Up',
            'Your package is on its way!',
            jsonb_build_object('order_id', p_order_id));

    ELSIF p_new_status = 'arrived_dropoff' THEN
        INSERT INTO notifications (user_id, type, title, body, data)
        VALUES (v_order.customer_id, 'order_update', 'Rider at Dropoff',
            'Your rider has arrived at the delivery location.',
            jsonb_build_object('order_id', p_order_id));

    ELSIF p_new_status = 'delivered' THEN
        INSERT INTO notifications (user_id, type, title, body, data)
        VALUES (v_order.customer_id, 'order_update', 'Delivery Complete',
            'Your package has been delivered!',
            jsonb_build_object('order_id', p_order_id));
    END IF;
END;
$$;


-- ============================================================
-- 5. DELIVERY COMPLETION
-- ============================================================

-- ---------------------------------------------------------
-- 5.1 verify_delivery_code
-- Rider enters the OTP. Must match the order's delivery_code.
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION verify_delivery_code(
    p_order_id UUID,
    p_rider_id UUID,
    p_code TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
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

    IF v_order.delivery_code = p_code THEN
        UPDATE orders SET delivery_code_verified = TRUE WHERE id = p_order_id;
        RETURN TRUE;
    ELSE
        RETURN FALSE;
    END IF;
END;
$$;

-- ---------------------------------------------------------
-- 5.2 complete_delivery
-- Finalizes delivery: verifies OTP + POD, pays rider,
-- distributes commission, updates stats.
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION complete_delivery(
    p_order_id UUID,
    p_rider_id UUID,
    p_pod_photo_url TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order orders%ROWTYPE;
    v_rider riders%ROWTYPE;
    v_rider_wallet_id UUID;
    v_platform_wallet_id UUID;
    v_fleet_wallet_id UUID;
    v_rider_profile_id UUID;
BEGIN
    -- Lock order
    SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found';
    END IF;
    IF v_order.rider_id != p_rider_id THEN
        RAISE EXCEPTION 'This order is not assigned to you';
    END IF;
    IF v_order.status NOT IN ('arrived_dropoff', 'delivered') THEN
        RAISE EXCEPTION 'Order is not ready for completion (status: %)', v_order.status;
    END IF;

    -- Verify delivery code was checked
    IF NOT v_order.delivery_code_verified THEN
        RAISE EXCEPTION 'Delivery code has not been verified';
    END IF;

    -- Save POD photo
    IF p_pod_photo_url IS NOT NULL THEN
        UPDATE orders SET pod_photo_url = p_pod_photo_url WHERE id = p_order_id;
    END IF;

    -- Get rider info
    SELECT * INTO v_rider FROM riders WHERE id = p_rider_id;
    v_rider_profile_id := v_rider.profile_id;

    -- Get wallets
    SELECT id INTO v_rider_wallet_id FROM wallets
    WHERE owner_type = 'rider' AND owner_id = v_rider_profile_id;

    SELECT id INTO v_platform_wallet_id FROM wallets
    WHERE owner_type = 'platform' LIMIT 1;

    -- Pay rider (net amount after commission)
    IF v_order.rider_net_amount > 0 THEN
        PERFORM credit_wallet(
            v_rider_wallet_id,
            v_order.rider_net_amount,
            'credit',
            'RIDER-PAY-' || p_order_id::TEXT,
            'Earnings for order delivery',
            p_order_id
        );
    END IF;

    -- Platform commission
    IF v_order.platform_commission_amount > 0 AND v_platform_wallet_id IS NOT NULL THEN
        PERFORM credit_wallet(
            v_platform_wallet_id,
            v_order.platform_commission_amount,
            'commission_credit',
            'PLATFORM-COM-' || p_order_id::TEXT,
            'Platform commission',
            p_order_id
        );
    END IF;

    -- Fleet commission (if rider is in a fleet)
    IF v_order.fleet_commission_amount > 0 AND v_rider.fleet_id IS NOT NULL THEN
        SELECT id INTO v_fleet_wallet_id FROM wallets
        WHERE owner_type = 'fleet' AND owner_id = v_rider.fleet_id;

        IF v_fleet_wallet_id IS NOT NULL THEN
            PERFORM credit_wallet(
                v_fleet_wallet_id,
                v_order.fleet_commission_amount,
                'commission_credit',
                'FLEET-COM-' || p_order_id::TEXT,
                'Fleet commission',
                p_order_id
            );
        END IF;
    END IF;

    -- Update order to completed
    UPDATE orders SET status = 'completed' WHERE id = p_order_id;

    -- Record status change
    INSERT INTO order_status_history (order_id, old_status, new_status, changed_by)
    VALUES (p_order_id, v_order.status, 'completed', v_rider_profile_id);

    -- Update rider stats
    UPDATE riders SET
        total_trips = total_trips + 1,
        total_earnings = total_earnings + v_order.rider_net_amount
    WHERE id = p_rider_id;

    -- Notify customer to rate
    INSERT INTO notifications (user_id, type, title, body, data)
    VALUES (
        v_order.customer_id,
        'order_update',
        'Delivery Complete!',
        'Your package has been delivered. Please rate your rider.',
        jsonb_build_object('order_id', p_order_id, 'action', 'rate_rider')
    );

    RETURN jsonb_build_object(
        'order_id', p_order_id,
        'rider_earnings', v_order.rider_net_amount,
        'platform_commission', v_order.platform_commission_amount,
        'fleet_commission', v_order.fleet_commission_amount,
        'status', 'completed'
    );
END;
$$;


-- ============================================================
-- 6. CANCELLATION
-- ============================================================

-- ---------------------------------------------------------
-- 6.1 cancel_order
-- Cancels an order, refunds customer, records reason.
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION cancel_order(
    p_order_id UUID,
    p_cancelled_by cancellation_actor,
    p_user_id UUID DEFAULT NULL,
    p_reason TEXT DEFAULT 'No reason provided'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order orders%ROWTYPE;
    v_wallet_id UUID;
    v_penalty NUMERIC := 0;
    v_refund_amount NUMERIC;
    v_rider_profile_id UUID;
BEGIN
    -- Lock order
    SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found';
    END IF;
    IF v_order.status IN ('delivered', 'completed', 'cancelled') THEN
        RAISE EXCEPTION 'Cannot cancel order in status: %', v_order.status;
    END IF;

    -- Determine penalty (after pickup = penalty applies)
    IF v_order.status IN ('in_transit', 'arrived_dropoff') THEN
        v_penalty := ROUND(v_order.final_price * 0.20, 2);  -- 20% penalty
    END IF;

    v_refund_amount := v_order.final_price - v_penalty;

    -- Refund customer (minus penalty)
    IF v_refund_amount > 0 THEN
        SELECT id INTO v_wallet_id FROM wallets
        WHERE owner_type = 'customer' AND owner_id = v_order.customer_id;

        PERFORM credit_wallet(
            v_wallet_id,
            v_refund_amount,
            'refund',
            'CANCEL-REFUND-' || p_order_id::TEXT,
            'Order cancellation refund',
            p_order_id
        );
    END IF;

    -- If penalty collected, credit platform
    IF v_penalty > 0 THEN
        DECLARE v_platform_wallet UUID;
        BEGIN
            SELECT id INTO v_platform_wallet FROM wallets
            WHERE owner_type = 'platform' LIMIT 1;

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
        END;
    END IF;

    -- Update order status via state machine
    PERFORM update_order_status(p_order_id, 'cancelled', p_user_id, p_reason);

    -- Record cancellation
    INSERT INTO cancellations (order_id, cancelled_by, user_id, reason, penalty_amount)
    VALUES (p_order_id, p_cancelled_by, p_user_id, p_reason, v_penalty);

    -- Notify rider if assigned
    IF v_order.rider_id IS NOT NULL THEN
        SELECT profile_id INTO v_rider_profile_id FROM riders WHERE id = v_order.rider_id;

        INSERT INTO notifications (user_id, type, title, body, data)
        VALUES (
            v_rider_profile_id,
            'order_update',
            'Order Cancelled',
            'The delivery order has been cancelled.',
            jsonb_build_object('order_id', p_order_id, 'reason', p_reason)
        );
    END IF;
END;
$$;


-- ============================================================
-- 7. RATING
-- ============================================================

-- ---------------------------------------------------------
-- 7.1 rate_rider
-- Customer rates a rider after delivery. Updates rider stats.
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION rate_rider(
    p_order_id UUID,
    p_customer_id UUID,
    p_score INT,
    p_review TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order orders%ROWTYPE;
    v_rating_id UUID;
    v_new_avg NUMERIC;
    v_new_count INT;
BEGIN
    SELECT * INTO v_order FROM orders WHERE id = p_order_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found';
    END IF;
    IF v_order.customer_id != p_customer_id THEN
        RAISE EXCEPTION 'Only the customer can rate this order';
    END IF;
    IF v_order.status NOT IN ('delivered', 'completed') THEN
        RAISE EXCEPTION 'Can only rate after delivery';
    END IF;
    IF p_score < 1 OR p_score > 5 THEN
        RAISE EXCEPTION 'Rating must be between 1 and 5';
    END IF;

    -- Insert rating (unique constraint on order_id prevents duplicates)
    INSERT INTO ratings (order_id, customer_id, rider_id, score, review)
    VALUES (p_order_id, p_customer_id, v_order.rider_id, p_score, p_review)
    RETURNING id INTO v_rating_id;

    -- Update rider average rating
    SELECT
        ROUND(AVG(score)::NUMERIC, 2),
        COUNT(*)
    INTO v_new_avg, v_new_count
    FROM ratings
    WHERE rider_id = v_order.rider_id;

    UPDATE riders
    SET average_rating = v_new_avg, rating_count = v_new_count
    WHERE id = v_order.rider_id;

    RETURN v_rating_id;
END;
$$;


-- ============================================================
-- 8. RIDER OPERATIONS
-- ============================================================

-- ---------------------------------------------------------
-- 8.1 toggle_rider_online
-- Sets rider online/offline and updates location.
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION toggle_rider_online(
    p_rider_id UUID,
    p_is_online BOOLEAN,
    p_lat FLOAT DEFAULT NULL,
    p_lng FLOAT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
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

-- ---------------------------------------------------------
-- 8.2 update_rider_location
-- Batch-update rider location (for continuous tracking).
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION update_rider_location(
    p_rider_id UUID,
    p_lat FLOAT,
    p_lng FLOAT,
    p_order_id UUID DEFAULT NULL,
    p_speed NUMERIC DEFAULT NULL,
    p_heading NUMERIC DEFAULT NULL,
    p_accuracy NUMERIC DEFAULT NULL,
    p_recorded_at TIMESTAMPTZ DEFAULT NULL,
    p_sequence_number INT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_point GEOGRAPHY;
BEGIN
    v_point := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::GEOGRAPHY;

    -- Update rider's current location
    UPDATE riders SET
        current_location = v_point,
        location_updated_at = NOW()
    WHERE id = p_rider_id;

    -- Log the breadcrumb
    INSERT INTO rider_location_logs (
        rider_id, order_id, location, speed, heading, accuracy,
        recorded_at, sequence_number
    )
    VALUES (
        p_rider_id, p_order_id, v_point, p_speed, p_heading, p_accuracy,
        COALESCE(p_recorded_at, NOW()), p_sequence_number
    )
    ON CONFLICT DO NOTHING;  -- dedup via sequence_number if needed
END;
$$;

-- ---------------------------------------------------------
-- 8.3 get_nearby_orders
-- Finds pending orders within a radius of the rider's location.
-- Uses PostGIS ST_DWithin for spatial query.
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION get_nearby_orders(
    p_rider_id UUID,
    p_radius_meters FLOAT DEFAULT 10000  -- 10km default
)
RETURNS TABLE (
    order_id UUID,
    customer_name TEXT,
    pickup_address TEXT,
    dropoff_address TEXT,
    distance_to_pickup FLOAT,
    dynamic_price NUMERIC,
    suggested_price NUMERIC,
    package_size package_size,
    package_description TEXT,
    category_name TEXT,
    created_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_rider_location GEOGRAPHY;
BEGIN
    -- Get rider's current location
    SELECT current_location INTO v_rider_location
    FROM riders WHERE id = p_rider_id;

    IF v_rider_location IS NULL THEN
        RAISE EXCEPTION 'Rider location not available. Please enable location services.';
    END IF;

    RETURN QUERY
    SELECT
        o.id AS order_id,
        p.full_name AS customer_name,
        o.pickup_address,
        o.dropoff_address,
        ST_Distance(v_rider_location, o.pickup_location)::FLOAT AS distance_to_pickup,
        o.dynamic_price,
        o.suggested_price,
        o.package_size,
        o.package_description,
        pc.name AS category_name,
        o.created_at,
        o.expires_at
    FROM orders o
    JOIN profiles p ON p.id = o.customer_id
    LEFT JOIN package_categories pc ON pc.id = o.category_id
    WHERE o.status = 'pending'
        AND (o.expires_at IS NULL OR o.expires_at > NOW())
        AND ST_DWithin(v_rider_location, o.pickup_location, p_radius_meters)
    ORDER BY ST_Distance(v_rider_location, o.pickup_location) ASC;
END;
$$;


-- ============================================================
-- 9. SOS
-- ============================================================

-- ---------------------------------------------------------
-- 9.1 trigger_sos
-- One-tap emergency alert.
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION trigger_sos(
    p_user_id UUID,
    p_order_id UUID DEFAULT NULL,
    p_lat FLOAT DEFAULT NULL,
    p_lng FLOAT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_sos_id UUID;
    v_location GEOGRAPHY;
BEGIN
    IF p_lat IS NOT NULL AND p_lng IS NOT NULL THEN
        v_location := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::GEOGRAPHY;
    END IF;

    INSERT INTO sos_alerts (user_id, order_id, location)
    VALUES (p_user_id, p_order_id, v_location)
    RETURNING id INTO v_sos_id;

    -- Notify all admins
    INSERT INTO notifications (user_id, type, title, body, data)
    SELECT
        p2.id,
        'sos',
        '🚨 SOS Alert',
        'Emergency alert triggered by a user. Immediate attention required.',
        jsonb_build_object('sos_id', v_sos_id, 'order_id', p_order_id, 'user_id', p_user_id)
    FROM profiles p2
    WHERE p2.role = 'admin' AND p2.is_active = TRUE;

    RETURN v_sos_id;
END;
$$;


-- ============================================================
-- 10. PROFILE CREATION (Auto-wallet)
-- ============================================================

-- ---------------------------------------------------------
-- 10.1 handle_new_user
-- Trigger: creates profile + wallet when a new auth.user is created.
-- Called via Supabase Auth hook.
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_role user_role;
    v_full_name TEXT;
    v_phone TEXT;
BEGIN
    -- Extract metadata from auth signup
    v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'customer')::user_role;
    v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', '');
    v_phone := COALESCE(NEW.phone, NEW.raw_user_meta_data->>'phone', '');

    -- Create profile
    INSERT INTO profiles (id, role, full_name, phone)
    VALUES (NEW.id, v_role, v_full_name, v_phone);

    -- Create wallet
    PERFORM create_wallet(
        CASE WHEN v_role = 'fleet_manager' THEN 'fleet'::wallet_owner_type
             ELSE v_role::wallet_owner_type
        END,
        NEW.id
    );

    RETURN NEW;
END;
$$;

-- Trigger on auth.users insert
CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION handle_new_user();


-- ============================================================
-- DONE
-- 10 function groups, 15 RPCs, 1 auth trigger.
-- Next: RLS policies (00003)
-- ============================================================
