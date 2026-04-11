-- ============================================================
-- DZpatch V2.0 — Seed: test accounts
-- Migration: 00011_seed_test_accounts.sql
--
-- Creates 4 test accounts for development/QA:
--   customer@test.com  / 123456  (role: customer)
--   rider@test.com     / 123456  (role: rider, kyc approved)
--   fleet@test.com     / 123456  (role: fleet_manager)
--   admin@test.com     / 123456  (role: admin)
--
-- Safe to run multiple times (IF NOT EXISTS guards on all inserts).
-- Uses WHERE NOT EXISTS instead of ON CONFLICT because auth.users
-- has no named unique constraint accessible to ON CONFLICT syntax.
-- ============================================================

DO $$
DECLARE
  v_customer_id uuid := gen_random_uuid();
  v_rider_id    uuid := gen_random_uuid();
  v_fleet_id    uuid := gen_random_uuid();
  v_admin_id    uuid := gen_random_uuid();
  v_now         timestamptz := now();
BEGIN

  -- ── customer@test.com ──────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'customer@test.com') THEN
    INSERT INTO auth.users (
      instance_id, id, aud, role, email,
      encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_customer_id, 'authenticated', 'authenticated', 'customer@test.com',
      crypt('123456', gen_salt('bf')), v_now,
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"role":"customer","full_name":"Test Customer","phone":"+2340000000001"}'::jsonb,
      v_now, v_now, null, null
    );
    INSERT INTO auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at)
    VALUES (gen_random_uuid(), v_customer_id, 'customer@test.com', 'email',
      jsonb_build_object('sub', v_customer_id::text, 'email', 'customer@test.com', 'email_verified', true, 'provider', 'email'),
      v_now, v_now);
  END IF;

  -- ── rider@test.com ─────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'rider@test.com') THEN
    INSERT INTO auth.users (
      instance_id, id, aud, role, email,
      encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_rider_id, 'authenticated', 'authenticated', 'rider@test.com',
      crypt('123456', gen_salt('bf')), v_now,
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"role":"rider","full_name":"Test Rider","phone":"+2340000000002"}'::jsonb,
      v_now, v_now, null, null
    );
    INSERT INTO auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at)
    VALUES (gen_random_uuid(), v_rider_id, 'rider@test.com', 'email',
      jsonb_build_object('sub', v_rider_id::text, 'email', 'rider@test.com', 'email_verified', true, 'provider', 'email'),
      v_now, v_now);
  END IF;

  -- ── fleet@test.com ─────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'fleet@test.com') THEN
    INSERT INTO auth.users (
      instance_id, id, aud, role, email,
      encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_fleet_id, 'authenticated', 'authenticated', 'fleet@test.com',
      crypt('123456', gen_salt('bf')), v_now,
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"role":"fleet_manager","full_name":"Test Fleet","phone":"+2340000000003"}'::jsonb,
      v_now, v_now, null, null
    );
    INSERT INTO auth.identities (id, user_id, provider_id, provider, identity_data, email, created_at, updated_at)
    VALUES (gen_random_uuid(), v_fleet_id, 'fleet@test.com', 'email',
      jsonb_build_object('sub', v_fleet_id::text, 'email', 'fleet@test.com', 'email_verified', true, 'provider', 'email'),
      'fleet@test.com', v_now, v_now);
  END IF;

  -- ── admin@test.com ─────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'admin@test.com') THEN
    INSERT INTO auth.users (
      instance_id, id, aud, role, email,
      encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_admin_id, 'authenticated', 'authenticated', 'admin@test.com',
      crypt('123456', gen_salt('bf')), v_now,
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"role":"admin","full_name":"Test Admin","phone":"+2340000000004"}'::jsonb,
      v_now, v_now, null, null
    );
    INSERT INTO auth.identities (id, user_id, provider_id, provider, identity_data, email, created_at, updated_at)
    VALUES (gen_random_uuid(), v_admin_id, 'admin@test.com', 'email',
      jsonb_build_object('sub', v_admin_id::text, 'email', 'admin@test.com', 'email_verified', true, 'provider', 'email'),
      'admin@test.com', v_now, v_now);
  END IF;

END $$;
