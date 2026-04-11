-- Migration 00010: Storage buckets for document uploads
-- Apply via Supabase SQL Editor

-- Create the documents bucket (private — not public by default)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents',
  'documents',
  false,
  10485760, -- 10MB max per file
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- RLS: Riders can upload to their own path (rider-docs/{user_id}/*)
CREATE POLICY "Riders can upload own documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] = 'rider-docs'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

-- RLS: Riders can read their own documents
CREATE POLICY "Riders can read own documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] = 'rider-docs'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

-- RLS: Riders can update/replace their own documents
CREATE POLICY "Riders can update own documents"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] = 'rider-docs'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

-- RLS: Admins can read all documents (for KYC review)
CREATE POLICY "Admins can read all documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents'
  AND EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  )
);

-- Note: getPublicUrl() on a private bucket returns a URL that requires a signed token.
-- For admin KYC review, use createSignedUrl() instead of getPublicUrl().
-- The document_url stored in rider_documents will be the storage path, not a public URL.
-- Update signup-review.tsx to store the path and use signed URLs when displaying.
