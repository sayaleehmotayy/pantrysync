
-- Fix 1: Prevent role escalation on household_members
-- Only admins can update members in their household
CREATE POLICY "Admins can update household members"
ON public.household_members
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.household_members hm
    WHERE hm.household_id = household_members.household_id
      AND hm.user_id = auth.uid()
      AND hm.role = 'admin'
  )
);

-- Fix 2: Add UPDATE policy on receipt-images storage bucket
CREATE POLICY "Users can update own receipt images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'receipt-images' AND auth.uid()::text = (storage.foldername(name))[1]);
