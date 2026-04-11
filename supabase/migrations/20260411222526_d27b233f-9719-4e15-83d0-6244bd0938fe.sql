
-- Fix storage policies for receipt-images bucket
DROP POLICY IF EXISTS "Authenticated users can upload receipt images" ON storage.objects;
CREATE POLICY "Authenticated users can upload receipt images" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'receipt-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users can delete own receipt images" ON storage.objects;
CREATE POLICY "Users can delete own receipt images" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'receipt-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Strengthen invite code entropy
ALTER TABLE public.households ALTER COLUMN invite_code SET DEFAULT encode(gen_random_bytes(6), 'hex');
