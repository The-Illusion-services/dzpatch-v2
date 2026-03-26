-- ============================================================
-- DZpatch V2.0 — Change order expiry from 10 minutes to 2 hours
-- Migration: 00018_order_expiry_2hours.sql
-- ============================================================

-- The create_order function sets expires_at inline.
-- We patch it by finding and replacing the interval via a
-- DO block that rewrites just that one line of the function body.

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

    v_src := REPLACE(v_src, 'INTERVAL ''10 minutes''', 'INTERVAL ''2 hours''');

    EXECUTE v_src;
END;
$$;
