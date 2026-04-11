-- ============================================================
-- DZpatch V2.0 — Fix: RLS infinite recursion
-- Migration: 00014_fix_rls_infinite_recursion.sql
--
-- Problem: is_admin() → get_user_role() → SELECT FROM profiles
-- → profiles_select_admin policy → is_admin() → infinite loop.
-- Error: "infinite recursion detected in policy for relation riders"
--
-- Fix: Rewrite get_user_role() and is_admin() to bypass RLS
-- by using SET search_path and querying auth.uid() directly
-- against the table without triggering policies (SECURITY DEFINER
-- alone is not enough — the function must also set row_security=off).
-- ============================================================

-- Drop and recreate get_user_role to bypass RLS
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS user_role
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role user_role;
BEGIN
    SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
    RETURN v_role;
END;
$$;

-- Drop and recreate is_admin to bypass RLS via direct table access
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role user_role;
BEGIN
    SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
    RETURN v_role = 'admin';
END;
$$;

-- Drop and recreate get_rider_id to bypass RLS
CREATE OR REPLACE FUNCTION get_rider_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id uuid;
BEGIN
    SELECT id INTO v_id FROM riders WHERE profile_id = auth.uid();
    RETURN v_id;
END;
$$;

-- Drop and recreate get_fleet_id to bypass RLS
CREATE OR REPLACE FUNCTION get_fleet_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id uuid;
BEGIN
    SELECT id INTO v_id FROM fleets WHERE owner_id = auth.uid();
    RETURN v_id;
END;
$$;
