-- 1. Ensure profiles.phone is truly nullable (for email signups)
ALTER TABLE public.profiles ALTER COLUMN phone DROP NOT NULL;
ALTER TABLE public.profiles ALTER COLUMN phone SET DEFAULT NULL;

-- 2. Robust handle_new_user trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
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
    ON CONFLICT (id) DO UPDATE 
    SET 
        role = EXCLUDED.role,
        full_name = EXCLUDED.full_name,
        phone = EXCLUDED.phone,
        email = EXCLUDED.email,
        updated_at = NOW();

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
EXCEPTION WHEN OTHERS THEN
    RETURN NEW;
END;
$$;

-- 3. Fix unusable test accounts
DO $$
DECLARE
    v_correct_instance_id uuid;
BEGIN
    -- Get correct instance_id from project
    SELECT instance_id INTO v_correct_instance_id 
    FROM auth.users 
    WHERE instance_id IS NOT NULL 
    AND instance_id != '00000000-0000-0000-0000-000000000000' 
    LIMIT 1;

    -- Update test accounts
    UPDATE auth.users
    SET 
        email_confirmed_at = COALESCE(email_confirmed_at, created_at, now()),
        instance_id = COALESCE(v_correct_instance_id, instance_id),
        aud = 'authenticated',
        role = 'authenticated'
    WHERE email IN (
        'customer@test.com',
        'rider@test.com',
        'fleet@test.com',
        'admin@test.com'
    );

    -- Ensure identities are correct
    UPDATE auth.identities
    SET identity_data = jsonb_build_object(
        'sub', user_id::text,
        'email', email,
        'email_verified', true,
        'provider', 'email'
    )
    WHERE email IN (
        'customer@test.com',
        'rider@test.com',
        'fleet@test.com',
        'admin@test.com'
    );
END $$;

-- 4. Approve KYC for Test Rider
UPDATE public.profiles
SET kyc_status = 'approved'
WHERE email = 'rider@test.com';

UPDATE public.riders
SET documents_verified = TRUE, is_approved = TRUE
WHERE profile_id = (SELECT id FROM public.profiles WHERE email = 'rider@test.com');
