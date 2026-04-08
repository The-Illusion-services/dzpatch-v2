-- Fix: rider cannot SELECT their matched order because orders_select_rider checks
-- rider_profile_id (which may lag) and orders_select_pending only covers status='pending'.
-- Once accept_bid sets status='matched' and rider_id=riders.id, neither policy matches
-- until rider_profile_id is also populated — leaving the waiting-for-customer poll blind.
--
-- This policy lets any rider SELECT orders where they are the assigned rider (rider_id).

CREATE POLICY "orders_select_assigned_rider"
ON public.orders FOR SELECT
USING (
  rider_id = (SELECT public.get_rider_id())
);
