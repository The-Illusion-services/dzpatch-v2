-- ============================================================
-- DZpatch V2.0 — Create rider_locations table for realtime tracking
-- Migration: 00027_create_rider_locations_table.sql
--
-- PROBLEM: The customer app (active-order-tracking.tsx) subscribes
-- to a Supabase Realtime channel on a table named 'rider_locations'.
-- This table does not exist. Actual location data is stored in:
--   - riders.current_location (GEOGRAPHY) — updated by update_rider_location RPC
--   - rider_location_logs — append-only history log
--
-- Supabase Realtime cannot subscribe to GEOGRAPHY columns or computed
-- views with sufficient reliability. Creating a dedicated flat-column
-- table (latitude/longitude as DOUBLE PRECISION) is the correct approach.
--
-- FIX:
--   1. Create rider_locations table with flat lat/lng columns
--   2. Add RLS: riders write own row; customers read for matched orders
--   3. Add to Supabase Realtime publication
--   4. Update update_rider_location RPC to upsert into rider_locations
--      in addition to updating riders.current_location
-- ============================================================

-- ── 1. Create table ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rider_locations (
    rider_id    UUID PRIMARY KEY REFERENCES riders(id) ON DELETE CASCADE,
    latitude    DOUBLE PRECISION NOT NULL,
    longitude   DOUBLE PRECISION NOT NULL,
    order_id    UUID REFERENCES orders(id) ON DELETE SET NULL,
    speed       NUMERIC,
    heading     NUMERIC,
    accuracy    NUMERIC,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rider_locations_order_id
    ON rider_locations(order_id)
    WHERE order_id IS NOT NULL;

-- ── 2. Enable RLS ─────────────────────────────────────────────
ALTER TABLE rider_locations ENABLE ROW LEVEL SECURITY;

-- Riders can upsert their own location row
CREATE POLICY "riders_manage_own_location"
    ON rider_locations
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM riders r
            WHERE r.id = rider_locations.rider_id
              AND r.profile_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM riders r
            WHERE r.id = rider_locations.rider_id
              AND r.profile_id = auth.uid()
        )
    );

-- Customers can read the location of the rider assigned to their active order.
-- Uses SECURITY DEFINER helper pattern (no subquery) so Realtime delivers events.
CREATE OR REPLACE FUNCTION get_rider_location_customer_id(p_rider_id UUID)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
    v_customer_id UUID;
BEGIN
    SELECT o.customer_id INTO v_customer_id
    FROM orders o
    WHERE o.rider_id = p_rider_id
      AND o.status IN (
          'pickup_en_route',
          'arrived_pickup',
          'in_transit',
          'arrived_dropoff'
      )
    ORDER BY o.created_at DESC
    LIMIT 1;
    RETURN v_customer_id;
END;
$$;

CREATE POLICY "customers_read_active_rider_location"
    ON rider_locations
    FOR SELECT
    USING (
        get_rider_location_customer_id(rider_id) = auth.uid()
    );

-- Admins and fleet managers can read all locations
CREATE POLICY "admins_read_all_locations"
    ON rider_locations
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
              AND p.role IN ('admin', 'fleet_manager')
              AND p.is_active = TRUE
        )
    );

-- ── 3. Add to Supabase Realtime publication ───────────────────
-- Supabase creates 'supabase_realtime' publication automatically.
-- Run this only if the publication already exists (it always does in Supabase).
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE rider_locations;
    END IF;
END;
$$;

-- ── 4. Update update_rider_location RPC ──────────────────────
-- Add upsert into rider_locations alongside existing riders + rider_location_logs writes.
CREATE OR REPLACE FUNCTION update_rider_location(
    p_rider_id      UUID,
    p_lat           FLOAT,
    p_lng           FLOAT,
    p_order_id      UUID      DEFAULT NULL,
    p_speed         NUMERIC   DEFAULT NULL,
    p_heading       NUMERIC   DEFAULT NULL,
    p_accuracy      NUMERIC   DEFAULT NULL,
    p_recorded_at   TIMESTAMPTZ DEFAULT NULL,
    p_sequence_number INT     DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_location GEOGRAPHY;
BEGIN
    v_location := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::GEOGRAPHY;

    -- Update rider's current location in riders table (existing behaviour)
    UPDATE riders
    SET
        current_location     = v_location,
        location_updated_at  = COALESCE(p_recorded_at, NOW())
    WHERE id = p_rider_id;

    -- Append to location history log (existing behaviour)
    INSERT INTO rider_location_logs (
        rider_id, order_id, location,
        speed, heading, accuracy,
        recorded_at, sequence_number
    )
    VALUES (
        p_rider_id,
        p_order_id,
        v_location,
        p_speed,
        p_heading,
        p_accuracy,
        COALESCE(p_recorded_at, NOW()),
        p_sequence_number
    )
    ON CONFLICT DO NOTHING;

    -- NEW: Upsert flat lat/lng into rider_locations for Realtime subscriptions
    INSERT INTO rider_locations (
        rider_id, latitude, longitude,
        order_id, speed, heading, accuracy, updated_at
    )
    VALUES (
        p_rider_id, p_lat, p_lng,
        p_order_id, p_speed, p_heading, p_accuracy, NOW()
    )
    ON CONFLICT (rider_id) DO UPDATE SET
        latitude   = EXCLUDED.latitude,
        longitude  = EXCLUDED.longitude,
        order_id   = EXCLUDED.order_id,
        speed      = EXCLUDED.speed,
        heading    = EXCLUDED.heading,
        accuracy   = EXCLUDED.accuracy,
        updated_at = NOW();
END;
$$;
