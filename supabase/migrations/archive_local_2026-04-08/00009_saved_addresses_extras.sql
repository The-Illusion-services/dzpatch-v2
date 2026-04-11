-- ============================================================
-- Migration 00009: Add is_default + lat/lng to saved_addresses
-- ============================================================
-- saved_addresses currently has: id, user_id, label, address,
-- location (GEOGRAPHY), place_id, use_count, created_at, updated_at
-- App needs: is_default, latitude, longitude as flat columns.

ALTER TABLE saved_addresses
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS latitude   DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude  DOUBLE PRECISION;

-- Populate lat/lng from existing geography column where present
UPDATE saved_addresses
SET
  latitude  = ST_Y(location::geometry),
  longitude = ST_X(location::geometry)
WHERE location IS NOT NULL;

-- Ensure at most one default per user (constraint + trigger)
CREATE UNIQUE INDEX IF NOT EXISTS idx_saved_addresses_default_per_user
  ON saved_addresses (user_id)
  WHERE is_default = TRUE;

-- RLS: no new policies needed — existing user_id = auth.uid() policies cover new columns
