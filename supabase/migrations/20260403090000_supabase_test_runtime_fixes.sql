-- Fix local test/runtime drift for Supabase-backed integration tests.
-- 1. Add notification enum values used by live RPCs.
-- 2. Ensure the private documents storage bucket exists locally.

ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'delivery_code';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'new_bid';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'bid_withdrawn';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents',
  'documents',
  false,
  10485760,
  ARRAY[
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'application/pdf',
    'text/plain'
  ]
)
ON CONFLICT (id) DO NOTHING;
