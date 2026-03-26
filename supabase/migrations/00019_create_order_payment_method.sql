-- ============================================================
-- DZpatch V2.0 — Add payment_method param to create_order RPC
-- Migration: 00019_create_order_payment_method.sql
--
-- Frontend sends p_payment_method but it was missing from RPC.
-- Also adds pickup_address + dropoff_address to the return JSONB
-- so booking-success.tsx can display them without a second fetch.
-- Also changes expiry to 2 hours (replaces 00018 DO-block approach).
-- ============================================================

DO $$
DECLARE
    v_src TEXT;
BEGIN
    SELECT pg_get_functiondef(oid) INTO v_src
    FROM pg_proc
    WHERE proname = 'create_order'
    AND pronamespace = 'public'::regnamespace;

    IF v_src IS NULL THEN
        RAISE EXCEPTION 'create_order function not found';
    END IF;

    -- 1. Add p_payment_method parameter after p_service_area_id
    v_src := REPLACE(
        v_src,
        'p_service_area_id UUID DEFAULT NULL',
        'p_service_area_id UUID DEFAULT NULL,
    p_payment_method TEXT DEFAULT ''wallet'''
    );

    -- 2. Add payment_method to INSERT column list
    v_src := REPLACE(
        v_src,
        'delivery_code, expires_at, service_area_id',
        'payment_method, delivery_code, expires_at, service_area_id'
    );

    -- 3. Add payment_method to INSERT values list
    v_src := REPLACE(
        v_src,
        'v_delivery_code, v_expires_at, p_service_area_id',
        'p_payment_method, v_delivery_code, v_expires_at, p_service_area_id'
    );

    -- 4. Add pickup_address + dropoff_address to return JSONB
    v_src := REPLACE(
        v_src,
        '''expires_at'', v_expires_at',
        '''expires_at'', v_expires_at,
        ''pickup_address'', p_pickup_address,
        ''dropoff_address'', p_dropoff_address'
    );

    -- 5. Change expiry from 10 minutes to 2 hours
    v_src := REPLACE(v_src, 'INTERVAL ''10 minutes''', 'INTERVAL ''2 hours''');

    EXECUTE v_src;
END;
$$;
