-- Add SET search_path TO 'public' to all functions that were missing it.
-- Prevents search_path injection: a malicious schema shadowing public could
-- otherwise redirect table lookups inside SECURITY DEFINER functions.
-- create_order already had this set (sprint5); the remaining 7 are fixed here.

-- ---------------------------------------------------------------------------
-- 1. update_updated_at_column (trigger helper)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. create_wallet
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_wallet(
    p_owner_type public.wallet_owner_type,
    p_owner_id   uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

-- ---------------------------------------------------------------------------
-- 3. credit_wallet
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.credit_wallet(
    p_wallet_id   uuid,
    p_amount      numeric,
    p_type        public.transaction_type,
    p_reference   text,
    p_description text    DEFAULT NULL,
    p_order_id    uuid    DEFAULT NULL,
    p_metadata    jsonb   DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_balance_before  NUMERIC;
    v_balance_after   NUMERIC;
    v_transaction_id  UUID;
    v_existing_id     UUID;
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
    INSERT INTO transactions (
        wallet_id, type, amount, balance_before, balance_after,
        reference, description, order_id, metadata
    )
    VALUES (
        p_wallet_id, p_type, p_amount, v_balance_before, v_balance_after,
        p_reference, p_description, p_order_id, p_metadata
    )
    RETURNING id INTO v_transaction_id;

    RETURN v_transaction_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. debit_wallet
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.debit_wallet(
    p_wallet_id   uuid,
    p_amount      numeric,
    p_type        public.transaction_type,
    p_reference   text,
    p_description text    DEFAULT NULL,
    p_order_id    uuid    DEFAULT NULL,
    p_metadata    jsonb   DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_balance_before  NUMERIC;
    v_balance_after   NUMERIC;
    v_transaction_id  UUID;
    v_existing_id     UUID;
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
    INSERT INTO transactions (
        wallet_id, type, amount, balance_before, balance_after,
        reference, description, order_id, metadata
    )
    VALUES (
        p_wallet_id, p_type, p_amount, v_balance_before, v_balance_after,
        p_reference, p_description, p_order_id, p_metadata
    )
    RETURNING id INTO v_transaction_id;

    RETURN v_transaction_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. rate_rider
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rate_rider(
    p_order_id    uuid,
    p_customer_id uuid,
    p_score       integer,
    p_review      text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_order    orders%ROWTYPE;
    v_rating_id UUID;
    v_new_avg   NUMERIC;
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

-- ---------------------------------------------------------------------------
-- 6. trigger_sos
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trigger_sos(
    p_user_id  uuid,
    p_order_id uuid    DEFAULT NULL,
    p_lat      double precision DEFAULT NULL,
    p_lng      double precision DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_sos_id   UUID;
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

-- ---------------------------------------------------------------------------
-- 7. update_rider_location
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_rider_location(
    p_rider_id        uuid,
    p_lat             double precision,
    p_lng             double precision,
    p_order_id        uuid             DEFAULT NULL,
    p_speed           numeric          DEFAULT NULL,
    p_heading         numeric          DEFAULT NULL,
    p_accuracy        numeric          DEFAULT NULL,
    p_recorded_at     timestamptz      DEFAULT NULL,
    p_sequence_number integer          DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

    -- Update rider's current location in riders table
    UPDATE riders
    SET
        current_location    = v_location,
        location_updated_at = COALESCE(p_recorded_at, NOW())
    WHERE id = p_rider_id;

    -- Append to location history log
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

    -- Upsert flat lat/lng into rider_locations for Realtime subscriptions
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
