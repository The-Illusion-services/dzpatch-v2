-- Drop the duplicate double precision overload of update_rider_location.
-- The numeric overload (created in 20260406000000_sprint_1_1_auth_hardening.sql)
-- is the canonical version. PostgreSQL cannot disambiguate the two when optional
-- params are omitted, causing "could not choose the best candidate function" errors.

DROP FUNCTION IF EXISTS public.update_rider_location(
  p_rider_id    uuid,
  p_lat         double precision,
  p_lng         double precision,
  p_order_id    uuid,
  p_speed       double precision,
  p_heading     double precision,
  p_accuracy    double precision,
  p_recorded_at timestamp with time zone,
  p_sequence_number integer
);
