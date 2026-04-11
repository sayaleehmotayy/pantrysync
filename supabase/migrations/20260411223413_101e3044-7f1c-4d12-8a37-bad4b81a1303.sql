
-- Make receipt-images bucket private so RLS is enforced on all access
UPDATE storage.buckets SET public = false WHERE id = 'receipt-images';

-- Add UPDATE and DELETE policies for notifications
CREATE POLICY "Users can update own notifications" ON notifications
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own notifications" ON notifications
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
