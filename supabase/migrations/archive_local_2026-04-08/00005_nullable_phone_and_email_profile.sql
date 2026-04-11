-- ============================================================
-- DZpatch V2.0 — Migration 00005
-- Allow email-only signup: make phone nullable (not all users
-- sign up via phone), store email on profile.
-- APPLIED via Supabase SQL Editor
-- ============================================================

-- 1. Make phone nullable (email-only users won't have one)
--    NULLs don't violate UNIQUE in Postgres, so multiple
--    email-only users can have phone = NULL safely.
ALTER TABLE profiles
    ALTER COLUMN phone DROP NOT NULL,
    ALTER COLUMN phone SET DEFAULT NULL;

-- 2. Update handle_new_user to store email and use NULL for phone
--    when no phone is present. See 00006 for search_path fix.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_role       user_role;
    v_full_name  TEXT;
    v_phone      TEXT;
    v_email      TEXT;
    v_owner_type wallet_owner_type;
BEGIN
    v_role      := COALESCE(NEW.raw_user_meta_data->>'role', 'customer')::user_role;
    v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', '');
    v_email     := COALESCE(NEW.email, NEW.raw_user_meta_data->>'email', NULL);
    v_phone     := NULLIF(TRIM(COALESCE(NEW.phone, NEW.raw_user_meta_data->>'phone', '')), '');

    INSERT INTO profiles (id, role, full_name, phone, email)
    VALUES (NEW.id, v_role, v_full_name, v_phone, v_email)
    ON CONFLICT (id) DO NOTHING;

    IF v_role != 'admin' THEN
        v_owner_type := CASE v_role
            WHEN 'fleet_manager' THEN 'fleet'::wallet_owner_type
            ELSE v_role::wallet_owner_type
        END;
        PERFORM create_wallet(v_owner_type, NEW.id);
    END IF;

    RETURN NEW;
END;
$$;
