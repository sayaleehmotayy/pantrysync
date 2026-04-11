
-- 1. Fix broken "Admins can update households" policy
DROP POLICY IF EXISTS "Admins can update households" ON public.households;
CREATE POLICY "Admins can update households" ON public.households
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.household_members hm
      WHERE hm.household_id = households.id
        AND hm.user_id = auth.uid()
        AND hm.role = 'admin'
    )
  );

-- 2. Fix "Anyone can read household by invite code" - replace with secure lookup function
DROP POLICY IF EXISTS "Anyone can read household by invite code" ON public.households;

CREATE OR REPLACE FUNCTION public.lookup_household_by_invite_code(_invite_code text)
RETURNS TABLE(id uuid, name text, invite_code text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT h.id, h.name, h.invite_code
  FROM public.households h
  WHERE h.invite_code = _invite_code
  LIMIT 1;
$$;

-- 3. Fix "Members can leave households" broken self-join
DROP POLICY IF EXISTS "Members can leave households" ON public.household_members;
CREATE POLICY "Members can leave households" ON public.household_members
  FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.household_members hm
      WHERE hm.household_id = household_members.household_id
        AND hm.user_id = auth.uid()
        AND hm.role = 'admin'
    )
  );

-- 4. Fix notification sender escalation - require shared household
DROP POLICY IF EXISTS "Sender can insert notifications" ON public.notifications;
CREATE POLICY "Sender can insert notifications" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND is_household_member(auth.uid(), household_id)
  );

-- 5. Add realtime authorization policy
CREATE POLICY "Authenticated can receive realtime" ON realtime.messages
  FOR SELECT TO authenticated
  USING (true);
