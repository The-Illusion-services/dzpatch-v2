-- Fix: profile bootstrap can fail with
--   42P17 infinite recursion detected in policy for relation "orders"
--
-- Root cause:
--   profiles_select_rider_active_order reads public.orders directly inside the
--   profiles RLS USING clause. If the target database has any orders policy
--   path that in turn touches profiles (or another relation that loops back),
--   Postgres detects recursive policy evaluation and aborts the query.
--
-- Fix:
--   Move the rider->customer access check into a SECURITY DEFINER helper with
--   row_security disabled, then make the profiles policy call the helper.
--   This preserves the intended access rule while removing policy-to-policy
--   recursion from the SELECT path used during auth/profile bootstrap.

CREATE OR REPLACE FUNCTION public.can_read_customer_profile_for_assigned_order(
  p_customer_profile_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
DECLARE
  v_can_read boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.orders o
    JOIN public.riders r ON r.id = o.rider_id
    WHERE o.customer_id = p_customer_profile_id
      AND r.profile_id = auth.uid()
      AND o.status IN (
        'matched',
        'pickup_en_route',
        'arrived_pickup',
        'in_transit',
        'arrived_dropoff'
      )
  )
  INTO v_can_read;

  RETURN coalesce(v_can_read, false);
END;
$$;

REVOKE ALL ON FUNCTION public.can_read_customer_profile_for_assigned_order(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_read_customer_profile_for_assigned_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_customer_profile_for_assigned_order(uuid) TO service_role;

DROP POLICY IF EXISTS profiles_select_rider_active_order ON public.profiles;

CREATE POLICY profiles_select_rider_active_order
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    public.can_read_customer_profile_for_assigned_order(profiles.id)
  );
