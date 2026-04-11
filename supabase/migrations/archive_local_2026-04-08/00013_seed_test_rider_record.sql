-- ============================================================
-- DZpatch V2.0 — Seed: test rider record
-- Migration: 00013_seed_test_rider_record.sql
--
-- Creates the riders table row for rider@test.com so the
-- rider home screen can find the riderId and go online.
-- Safe to run multiple times (ON CONFLICT DO UPDATE).
-- ============================================================

INSERT INTO public.riders (
    profile_id,
    vehicle_type,
    vehicle_plate,
    vehicle_color,
    vehicle_make,
    vehicle_model,
    documents_verified,
    is_approved,
    is_online,
    average_rating
)
SELECT
    id,
    'motorcycle',
    'LG-001-AA',
    'Black',
    'Honda',
    'CG 125',
    TRUE,
    TRUE,
    FALSE,
    5.0
FROM public.profiles
WHERE email = 'rider@test.com'
ON CONFLICT (profile_id) DO UPDATE SET
    is_approved        = TRUE,
    documents_verified = TRUE;
