
-- 1) Track past household memberships so users can rejoin without invite code
CREATE TABLE IF NOT EXISTS public.past_household_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  household_name text NOT NULL,
  role text NOT NULL DEFAULT 'member',
  joined_at timestamptz NOT NULL,
  left_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, household_id)
);

ALTER TABLE public.past_household_memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own past memberships"
  ON public.past_household_memberships FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own past memberships"
  ON public.past_household_memberships FOR DELETE
  USING (auth.uid() = user_id);

-- 2) Trigger: when a user leaves a household, record it in past_household_memberships
CREATE OR REPLACE FUNCTION public.record_past_membership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
BEGIN
  SELECT name INTO v_name FROM public.households WHERE id = OLD.household_id;
  IF v_name IS NULL THEN
    RETURN OLD;
  END IF;

  INSERT INTO public.past_household_memberships (user_id, household_id, household_name, role, joined_at, left_at)
  VALUES (OLD.user_id, OLD.household_id, v_name, OLD.role, OLD.joined_at, now())
  ON CONFLICT (user_id, household_id)
  DO UPDATE SET household_name = EXCLUDED.household_name,
                role = EXCLUDED.role,
                left_at = now();
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_record_past_membership ON public.household_members;
CREATE TRIGGER trg_record_past_membership
  AFTER DELETE ON public.household_members
  FOR EACH ROW
  EXECUTE FUNCTION public.record_past_membership();

-- 3) When a user (re)joins, remove that household from their past list
CREATE OR REPLACE FUNCTION public.clear_past_membership_on_join()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.past_household_memberships
  WHERE user_id = NEW.user_id AND household_id = NEW.household_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clear_past_membership_on_join ON public.household_members;
CREATE TRIGGER trg_clear_past_membership_on_join
  AFTER INSERT ON public.household_members
  FOR EACH ROW
  EXECUTE FUNCTION public.clear_past_membership_on_join();

-- 4) RPC to rejoin a previous household without an invite code
CREATE OR REPLACE FUNCTION public.rejoin_past_household(p_household_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_past public.past_household_memberships%ROWTYPE;
  v_member_count int;
  v_plan_limit int;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_past FROM public.past_household_memberships
  WHERE user_id = v_user AND household_id = p_household_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'You have not been a member of this household before';
  END IF;

  -- Already a member elsewhere? Block (mirror existing single-household constraint behaviour)
  IF EXISTS (SELECT 1 FROM public.household_members WHERE user_id = v_user) THEN
    RAISE EXCEPTION 'You are already in a household. Leave it first to join another.';
  END IF;

  -- Verify household still exists
  IF NOT EXISTS (SELECT 1 FROM public.households WHERE id = p_household_id) THEN
    DELETE FROM public.past_household_memberships WHERE user_id = v_user AND household_id = p_household_id;
    RAISE EXCEPTION 'This household no longer exists';
  END IF;

  INSERT INTO public.household_members (household_id, user_id, role)
  VALUES (p_household_id, v_user, COALESCE(v_past.role, 'member'));
END;
$$;

GRANT EXECUTE ON FUNCTION public.rejoin_past_household(uuid) TO authenticated;

-- 5) Update profiles RLS so members of a household can still see profiles of
--    users who authored chat messages there, even after those users leave.
DROP POLICY IF EXISTS "Users can view profiles of household members" ON public.profiles;

CREATE POLICY "Users can view profiles of household members or chat authors"
  ON public.profiles FOR SELECT
  USING (
    auth.uid() = user_id
    OR public.shares_household(auth.uid(), user_id)
    OR EXISTS (
      SELECT 1
      FROM public.chat_messages cm
      JOIN public.household_members hm
        ON hm.household_id = cm.household_id
       AND hm.user_id = auth.uid()
      WHERE cm.user_id = profiles.user_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.activity_log al
      JOIN public.household_members hm
        ON hm.household_id = al.household_id
       AND hm.user_id = auth.uid()
      WHERE al.user_id = profiles.user_id
    )
  );
