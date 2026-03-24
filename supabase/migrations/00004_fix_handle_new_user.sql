-- ============================================================
-- DZpatch V2.0 — Fix: handle_new_user trigger
-- Migration: 00004_fix_handle_new_user.sql
--
-- Problem: admin role caused invalid cast to wallet_owner_type
-- (enum has: customer, rider, fleet, platform — no 'admin').
-- Fix: skip wallet creation for admin role.
-- ============================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_role       user_role;
    v_full_name  TEXT;
    v_phone      TEXT;
    v_owner_type wallet_owner_type;
BEGIN
    v_role      := COALESCE(NEW.raw_user_meta_data->>'role', 'customer')::user_role;
    v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', '');
    v_phone     := COALESCE(NEW.phone, NEW.raw_user_meta_data->>'phone', '');

    -- Create profile row
    INSERT INTO profiles (id, role, full_name, phone)
    VALUES (NEW.id, v_role, v_full_name, v_phone);

    -- Create wallet for all non-admin roles
    -- (admin has no personal wallet — uses platform wallet)
    IF v_role != 'admin' THEN
        v_owner_type := CASE v_role
            WHEN 'fleet_manager' THEN 'fleet'::wallet_owner_type
            ELSE v_role::wallet_owner_type  -- customer | rider
        END;
        PERFORM create_wallet(v_owner_type, NEW.id);
    END IF;

    RETURN NEW;
END;
$$;
