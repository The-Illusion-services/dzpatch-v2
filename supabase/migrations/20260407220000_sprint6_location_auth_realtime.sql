-- Sprint 6 — Location, Auth & Realtime
-- Fixes: L2 (RLS for bidding riders), L3 (batching bug), S10 push token table
-- L1 (background tracking) requires native rebuild — handled in app code
-- L4 (location debounce) is a frontend change — done in rider/index.tsx
-- S9 (realtime recovery) is a frontend change — done in use-app-state-channels.ts
-- S11 (auth listener dedup) is a frontend change — done in auth.store.ts
-- S12 (route guard) is a frontend change — done in splash.tsx
-- ============================================================================

-- ---------------------------------------------------------------------------
-- L2: Allow customers to see rider locations during bid/negotiation phase.
--
-- Current policy only allows customers to view a rider's location after the
-- order is matched (status in pickup_en_route, arrived_pickup, etc.).
-- During the finding-rider and live-bidding phases (status = pending), the
-- customer stares at a blank map because RLS returns 0 rows.
--
-- Fix: Expand the policy to also allow visibility when a rider has an active
-- bid (status = pending or countered) on the customer's pending order.
-- ---------------------------------------------------------------------------

-- Replace the helper function to include pending bids in the check
CREATE OR REPLACE FUNCTION public.get_rider_location_customer_id(p_rider_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
DECLARE
    v_customer_id UUID;
BEGIN
    -- Priority 1: matched/active trip — customer can always see their assigned rider
    SELECT o.customer_id INTO v_customer_id
    FROM orders o
    WHERE o.rider_id = p_rider_id
      AND o.status IN (
          'matched',
          'pickup_en_route',
          'arrived_pickup',
          'in_transit',
          'arrived_dropoff'
      )
    ORDER BY o.created_at DESC
    LIMIT 1;

    IF v_customer_id IS NOT NULL THEN
        RETURN v_customer_id;
    END IF;

    -- Priority 2: rider has an active bid on a pending order — customer can see
    -- the rider's location during negotiation so they can make informed decisions
    SELECT o.customer_id INTO v_customer_id
    FROM bids b
    JOIN orders o ON o.id = b.order_id
    WHERE b.rider_id = p_rider_id
      AND b.status IN ('pending', 'countered')
      AND o.status = 'pending'
      AND (o.expires_at IS NULL OR o.expires_at > NOW())
    ORDER BY b.created_at DESC
    LIMIT 1;

    RETURN v_customer_id; -- may be NULL if no active bid either
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_rider_location_customer_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_rider_location_customer_id(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_rider_location_customer_id(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- L3: Batching bug — first customer loses tracking if rider has two orders.
--
-- get_rider_location_customer_id uses LIMIT 1. When a rider has two concurrent
-- active orders (edge case), only the customer on the most-recent order can
-- see the rider's location. The first customer's map goes black.
--
-- Fix: Replace the single-customer RLS function approach with a broader policy
-- that joins through both trips and active bids. The existing policy already
-- calls get_rider_location_customer_id which now returns one customer ID.
-- For true multi-order batching support we add an additional policy that
-- allows ANY customer with an active order/bid against this rider to read.
-- ---------------------------------------------------------------------------

-- Drop the old single-customer policy and replace with a set-based check
DROP POLICY IF EXISTS "customers_read_active_rider_location" ON public.rider_locations;

CREATE POLICY "customers_read_active_rider_location"
ON public.rider_locations
FOR SELECT
TO public
USING (
    -- Customer has an active/matched trip with this rider
    EXISTS (
        SELECT 1 FROM orders o
        WHERE o.rider_id = rider_locations.rider_id
          AND o.customer_id = auth.uid()
          AND o.status IN (
              'matched', 'pickup_en_route', 'arrived_pickup',
              'in_transit', 'arrived_dropoff'
          )
    )
    OR
    -- Customer has a pending bid from this rider on their order
    EXISTS (
        SELECT 1
        FROM bids b
        JOIN orders o ON o.id = b.order_id
        WHERE b.rider_id = rider_locations.rider_id
          AND o.customer_id = auth.uid()
          AND b.status IN ('pending', 'countered')
          AND o.status = 'pending'
          AND (o.expires_at IS NULL OR o.expires_at > NOW())
    )
);

-- ---------------------------------------------------------------------------
-- S10: Push notification device token table.
--
-- Current schema stores a single push_token on profiles — no device-level
-- granularity, stale tokens accumulate, and there's no backend dispatch path.
-- Fix: Add a per-device push_tokens table for proper multi-device support.
-- The Edge Function dispatch path is a future enhancement.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.push_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    token       TEXT NOT NULL,
    platform    TEXT NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
    device_id   TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (profile_id, token)
);

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "push_tokens_manage_own"
ON public.push_tokens
FOR ALL
TO authenticated
USING (profile_id = auth.uid())
WITH CHECK (profile_id = auth.uid());

CREATE INDEX IF NOT EXISTS push_tokens_profile_idx ON public.push_tokens(profile_id);

-- Grant service_role full access (for server-side dispatch)
GRANT ALL ON TABLE public.push_tokens TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.push_tokens TO authenticated;
