
-- 1. Helper: extract household UUID from realtime topic (e.g. "chat-{uuid}")
CREATE OR REPLACE FUNCTION public.realtime_topic_household_id(_topic text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE 
    WHEN length(_topic) >= 36 
      AND right(_topic, 36) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN right(_topic, 36)::uuid
    ELSE NULL
  END;
$$;

-- Replace open realtime policy with household-scoped one
DROP POLICY IF EXISTS "Authenticated can receive realtime" ON realtime.messages;
CREATE POLICY "Users can subscribe to household channels" ON realtime.messages
  FOR SELECT TO authenticated
  USING (
    public.is_household_member(
      auth.uid(),
      public.realtime_topic_household_id(topic)
    )
  );

-- 2. Helper: check if two users share a household
CREATE OR REPLACE FUNCTION public.shares_household(_user_a uuid, _user_b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM household_members hm1
    JOIN household_members hm2 ON hm1.household_id = hm2.household_id
    WHERE hm1.user_id = _user_a AND hm2.user_id = _user_b
  );
$$;

-- Restrict receipt image viewing to household members of the uploader
DROP POLICY IF EXISTS "Anyone can view receipt images" ON storage.objects;
CREATE POLICY "Household members can view receipt images" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'receipt-images'
    AND public.shares_household(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

-- 3. Notifications: recipient must also be in the same household
DROP POLICY IF EXISTS "Sender can insert notifications" ON notifications;
CREATE POLICY "Sender can insert notifications" ON notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND is_household_member(auth.uid(), household_id)
    AND is_household_member(user_id, household_id)
  );
