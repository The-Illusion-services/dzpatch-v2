-- Fix: rider lookup can fail with
--   42P17 infinite recursion detected in policy for relation "riders"
--
-- Root cause:
--   riders_select_customer reads public.orders directly inside the riders RLS
--   USING clause. In environments where orders policies or helper paths loop
--   back into riders/profiles, Postgres detects recursive policy evaluation.
--
-- Fix:
--   Move the customer->rider access check into a SECURITY DEFINER helper with
--   row_security disabled, then make the riders policy call the helper.

CREATE OR REPLACE FUNCTION public.can_read_rider_for_customer_order(
  p_rider_id uuid
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
    WHERE o.customer_id = auth.uid()
      AND o.rider_id = p_rider_id
      AND o.rider_id IS NOT NULL
  )
  INTO v_can_read;

  RETURN coalesce(v_can_read, false);
END;
$$;

REVOKE ALL ON FUNCTION public.can_read_rider_for_customer_order(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_read_rider_for_customer_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_rider_for_customer_order(uuid) TO service_role;

DROP POLICY IF EXISTS "riders_select_customer" ON public.riders;

CREATE POLICY "riders_select_customer"
  ON public.riders
  FOR SELECT
  TO authenticated
  USING (
    public.can_read_rider_for_customer_order(riders.id)
  );
