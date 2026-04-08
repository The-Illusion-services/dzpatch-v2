-- Migration: Allow riders to read customer profiles for orders they are assigned to.
-- Fixes confirm-arrival screen: "Cannot coerce the result to a single JSON object"
-- Root cause: profiles_select_own only allows users to read their own profile.
-- Riders need to read the customer's full_name and phone on the confirm-arrival screen.

CREATE POLICY profiles_select_rider_active_order
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    -- The profile being read is the customer of an order the current rider is assigned to
    EXISTS (
      SELECT 1
      FROM public.orders o
      JOIN public.riders r ON r.id = o.rider_id
      WHERE o.customer_id = profiles.id
        AND r.profile_id = auth.uid()
        AND o.status IN (
          'matched',
          'pickup_en_route',
          'arrived_pickup',
          'in_transit',
          'arrived_dropoff'
        )
    )
  );
