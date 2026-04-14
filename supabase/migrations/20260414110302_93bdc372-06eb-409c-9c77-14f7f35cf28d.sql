
-- ============================================================
-- 1. CREATE household_invites TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.household_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL,
  invite_code text NOT NULL UNIQUE,
  created_by uuid NOT NULL,
  expires_at timestamptz,
  max_uses integer,
  used_count integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_household_invites_household_id ON public.household_invites(household_id);
CREATE INDEX IF NOT EXISTS idx_household_invites_invite_code ON public.household_invites(invite_code);

ALTER TABLE public.household_invites ENABLE ROW LEVEL SECURITY;

-- Admins can create invites
CREATE POLICY "Admins can create invites"
  ON public.household_invites FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = created_by
    AND EXISTS (
      SELECT 1 FROM public.household_members hm
      WHERE hm.household_id = household_invites.household_id
        AND hm.user_id = auth.uid()
        AND hm.role = 'admin'
    )
  );

-- Members can view invites for their household
CREATE POLICY "Members can view invites"
  ON public.household_invites FOR SELECT TO authenticated
  USING (public.is_household_member(auth.uid(), household_id));

-- Admins can update invites (deactivate, etc.)
CREATE POLICY "Admins can update invites"
  ON public.household_invites FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.household_members hm
      WHERE hm.household_id = household_invites.household_id
        AND hm.user_id = auth.uid()
        AND hm.role = 'admin'
    )
  );

-- Admins can delete invites
CREATE POLICY "Admins can delete invites"
  ON public.household_invites FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.household_members hm
      WHERE hm.household_id = household_invites.household_id
        AND hm.user_id = auth.uid()
        AND hm.role = 'admin'
    )
  );

-- ============================================================
-- 2. ADD invite_code_used TO household_members
-- ============================================================
ALTER TABLE public.household_members
  ADD COLUMN IF NOT EXISTS invite_code_used text;

-- ============================================================
-- 3. REPLACE UNSAFE household_members INSERT POLICY
-- ============================================================

-- Drop the old unsafe policy
DROP POLICY IF EXISTS "Users can join households" ON public.household_members;

-- Policy for household CREATORS (admin role, no invite needed)
CREATE POLICY "Creators can add themselves as admin"
  ON public.household_members FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND role = 'admin'
    AND EXISTS (
      SELECT 1 FROM public.households h
      WHERE h.id = household_members.household_id
        AND h.created_by = auth.uid()
    )
  );

-- Policy for members joining via valid invite code
CREATE POLICY "Users can join with valid invite"
  ON public.household_members FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND role = 'member'
    AND invite_code_used IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.household_invites hi
      WHERE hi.household_id = household_members.household_id
        AND hi.invite_code = household_members.invite_code_used
        AND hi.is_active = true
        AND (hi.expires_at IS NULL OR hi.expires_at > now())
        AND (hi.max_uses IS NULL OR hi.used_count < hi.max_uses)
    )
  );

-- ============================================================
-- 4. CREATE join_household_with_invite RPC
-- ============================================================
CREATE OR REPLACE FUNCTION public.join_household_with_invite(p_invite_code text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_household_id uuid;
  v_invite_id uuid;
BEGIN
  -- Validate invite
  SELECT hi.household_id, hi.id
  INTO v_household_id, v_invite_id
  FROM public.household_invites hi
  WHERE hi.invite_code = p_invite_code
    AND hi.is_active = true
    AND (hi.expires_at IS NULL OR hi.expires_at > now())
    AND (hi.max_uses IS NULL OR hi.used_count < hi.max_uses)
  LIMIT 1;

  IF v_household_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired invite code';
  END IF;

  -- Check not already a member
  IF EXISTS (
    SELECT 1 FROM public.household_members hm
    WHERE hm.household_id = v_household_id
      AND hm.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'You are already a member of this household';
  END IF;

  -- Insert membership
  INSERT INTO public.household_members (household_id, user_id, role, invite_code_used)
  VALUES (v_household_id, auth.uid(), 'member', p_invite_code);

  -- Increment usage
  UPDATE public.household_invites
  SET used_count = used_count + 1
  WHERE id = v_invite_id;
END;
$$;

-- ============================================================
-- 5. TRIGGER: prevent_household_id_change
-- ============================================================
CREATE OR REPLACE FUNCTION public.prevent_household_id_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.household_id IS DISTINCT FROM OLD.household_id THEN
    RAISE EXCEPTION 'household_id cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;

-- Apply to all tenant-scoped mutable tables
DROP TRIGGER IF EXISTS trg_no_hh_change ON public.inventory_items;
CREATE TRIGGER trg_no_hh_change BEFORE UPDATE ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.prevent_household_id_change();

DROP TRIGGER IF EXISTS trg_no_hh_change ON public.shopping_list_items;
CREATE TRIGGER trg_no_hh_change BEFORE UPDATE ON public.shopping_list_items
  FOR EACH ROW EXECUTE FUNCTION public.prevent_household_id_change();

DROP TRIGGER IF EXISTS trg_no_hh_change ON public.discount_codes;
CREATE TRIGGER trg_no_hh_change BEFORE UPDATE ON public.discount_codes
  FOR EACH ROW EXECUTE FUNCTION public.prevent_household_id_change();

DROP TRIGGER IF EXISTS trg_no_hh_change ON public.price_history;
CREATE TRIGGER trg_no_hh_change BEFORE UPDATE ON public.price_history
  FOR EACH ROW EXECUTE FUNCTION public.prevent_household_id_change();

DROP TRIGGER IF EXISTS trg_no_hh_change ON public.receipt_scans;
CREATE TRIGGER trg_no_hh_change BEFORE UPDATE ON public.receipt_scans
  FOR EACH ROW EXECUTE FUNCTION public.prevent_household_id_change();

DROP TRIGGER IF EXISTS trg_no_hh_change ON public.household_members;
CREATE TRIGGER trg_no_hh_change BEFORE UPDATE ON public.household_members
  FOR EACH ROW EXECUTE FUNCTION public.prevent_household_id_change();

DROP TRIGGER IF EXISTS trg_no_hh_change ON public.chat_messages;
CREATE TRIGGER trg_no_hh_change BEFORE UPDATE ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.prevent_household_id_change();

DROP TRIGGER IF EXISTS trg_no_hh_change ON public.activity_log;
CREATE TRIGGER trg_no_hh_change BEFORE UPDATE ON public.activity_log
  FOR EACH ROW EXECUTE FUNCTION public.prevent_household_id_change();

DROP TRIGGER IF EXISTS trg_no_hh_change ON public.notifications;
CREATE TRIGGER trg_no_hh_change BEFORE UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.prevent_household_id_change();

DROP TRIGGER IF EXISTS trg_no_hh_change ON public.chat_read_receipts;
CREATE TRIGGER trg_no_hh_change BEFORE UPDATE ON public.chat_read_receipts
  FOR EACH ROW EXECUTE FUNCTION public.prevent_household_id_change();

-- ============================================================
-- 6. TIGHTEN UPDATE POLICIES (add WITH CHECK)
-- ============================================================

-- inventory_items
DROP POLICY IF EXISTS "Members can update inventory" ON public.inventory_items;
CREATE POLICY "Members can update inventory"
  ON public.inventory_items FOR UPDATE TO authenticated
  USING (public.is_household_member(auth.uid(), household_id))
  WITH CHECK (public.is_household_member(auth.uid(), household_id));

-- shopping_list_items
DROP POLICY IF EXISTS "Members can update shopping items" ON public.shopping_list_items;
CREATE POLICY "Members can update shopping items"
  ON public.shopping_list_items FOR UPDATE TO authenticated
  USING (public.is_household_member(auth.uid(), household_id))
  WITH CHECK (public.is_household_member(auth.uid(), household_id));

-- discount_codes
DROP POLICY IF EXISTS "Members can update discount codes" ON public.discount_codes;
CREATE POLICY "Members can update discount codes"
  ON public.discount_codes FOR UPDATE TO authenticated
  USING (public.is_household_member(auth.uid(), household_id))
  WITH CHECK (public.is_household_member(auth.uid(), household_id));

-- chat_read_receipts
DROP POLICY IF EXISTS "Users can update own read receipt" ON public.chat_read_receipts;
CREATE POLICY "Users can update own read receipt"
  ON public.chat_read_receipts FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- notifications
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- household_members (admin update)
DROP POLICY IF EXISTS "Admins can update household members" ON public.household_members;
CREATE POLICY "Admins can update household members"
  ON public.household_members FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.household_members hm
      WHERE hm.household_id = household_members.household_id
        AND hm.user_id = auth.uid()
        AND hm.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.household_members hm
      WHERE hm.household_id = household_members.household_id
        AND hm.user_id = auth.uid()
        AND hm.role = 'admin'
    )
  );

-- ============================================================
-- 7. MIGRATE EXISTING INVITE CODES
-- ============================================================
INSERT INTO public.household_invites (household_id, invite_code, created_by)
SELECT h.id, h.invite_code, h.created_by
FROM public.households h
WHERE NOT EXISTS (
  SELECT 1 FROM public.household_invites hi
  WHERE hi.invite_code = h.invite_code
);
