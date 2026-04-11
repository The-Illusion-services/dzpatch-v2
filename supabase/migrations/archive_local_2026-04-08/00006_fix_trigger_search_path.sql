-- ============================================================
-- DZpatch V2.0 — Migration 00006
-- Fix: handle_new_user trigger fails with
--   "type user_role does not exist" (SQLSTATE 42704)
--
-- Root cause: the trigger fires in the auth schema context
-- where public ENUMs (user_role, wallet_owner_type) are not
-- visible. Fix: add SET search_path = public so all types,
-- tables, and functions resolve correctly.
-- APPLIED via Supabase SQL Editor
-- ============================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role       public.user_role;
    v_full_name  TEXT;
    v_phone      TEXT;
    v_email      TEXT;
    v_owner_type public.wallet_owner_type;
BEGIN
    v_role      := COALESCE(NEW.raw_user_meta_data->>'role', 'customer')::public.user_role;
    v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', '');
    v_email     := COALESCE(NEW.email, NEW.raw_user_meta_data->>'email', NULL);
    v_phone     := NULLIF(TRIM(COALESCE(NEW.phone, NEW.raw_user_meta_data->>'phone', '')), '');

    INSERT INTO public.profiles (id, role, full_name, phone, email)
    VALUES (NEW.id, v_role, v_full_name, v_phone, v_email)
    ON CONFLICT (id) DO NOTHING;

    IF v_role != 'admin' THEN
        v_owner_type := CASE v_role::text
            WHEN 'customer'      THEN 'customer'::public.wallet_owner_type
            WHEN 'rider'         THEN 'rider'::public.wallet_owner_type
            WHEN 'fleet_manager' THEN 'fleet'::public.wallet_owner_type
            ELSE 'customer'::public.wallet_owner_type
        END;
        PERFORM public.create_wallet(v_owner_type, NEW.id);
    END IF;

    RETURN NEW;
END;
$$;
