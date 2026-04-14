
-- ============================================================
-- 1. UNIQUE constraint safety net (already exists, but idempotent)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.household_members'::regclass
      AND contype = 'u'
      AND conname = 'household_members_household_id_user_id_key'
  ) THEN
    ALTER TABLE public.household_members
      ADD CONSTRAINT household_members_household_id_user_id_key UNIQUE (household_id, user_id);
  END IF;
END $$;

-- ============================================================
-- 2. REPLACE join_household_with_invite WITH HARDENED VERSION
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
  v_member_count integer;
  v_owner_id uuid;
  v_product_id text;
  v_member_limit integer;
BEGIN
  -- 0. Auth check
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 1. Lock the invite row to prevent concurrent use
  SELECT hi.household_id, hi.id
  INTO v_household_id, v_invite_id
  FROM public.household_invites hi
  WHERE hi.invite_code = p_invite_code
    AND hi.is_active = true
    AND (hi.expires_at IS NULL OR hi.expires_at > now())
    AND (hi.max_uses IS NULL OR hi.used_count < hi.max_uses)
  FOR UPDATE;

  IF v_household_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired invite code';
  END IF;

  -- 2. Check not already a member
  IF EXISTS (
    SELECT 1 FROM public.household_members hm
    WHERE hm.household_id = v_household_id
      AND hm.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'You are already a member of this household';
  END IF;

  -- 3. Enforce member limits based on household owner's subscription
  SELECT h.created_by INTO v_owner_id
  FROM public.households h WHERE h.id = v_household_id;

  -- Look up owner's subscription tier from subscription_cache
  SELECT sc.product_id INTO v_product_id
  FROM public.subscription_cache sc
  WHERE sc.user_id = v_owner_id
    AND sc.status IN ('active', 'trialing')
  LIMIT 1;

  -- Also check if ANY household member has a subscription (household-based pro)
  IF v_product_id IS NULL THEN
    SELECT sc.product_id INTO v_product_id
    FROM public.subscription_cache sc
    JOIN public.household_members hm ON hm.user_id = sc.user_id
    WHERE hm.household_id = v_household_id
      AND sc.status IN ('active', 'trialing')
    LIMIT 1;
  END IF;

  -- Determine member limit from product_id
  -- Product IDs mapped to tier limits:
  --   free (no product) = 1 member
  --   duo products = 2 members
  --   family products = 5 members
  --   unlimited products = NULL (no limit)
  v_member_limit := CASE
    WHEN v_product_id IS NULL THEN 1
    WHEN v_product_id IN ('prod_UJmkcGNlIWvfoh', 'prod_UK2GPSlm6dNKbC') THEN 2       -- duo monthly/yearly
    WHEN v_product_id IN ('prod_UK3jUbJSpStHEx', 'prod_UK3k0gRfRqH9dl') THEN 5       -- family monthly/yearly
    WHEN v_product_id IN ('prod_UK3k6GQ1X2Phkl', 'prod_UK3l7pPFppJ6G2') THEN NULL    -- unlimited monthly/yearly
    WHEN v_product_id = 'admin' THEN NULL                                              -- admin bypass
    ELSE 1  -- unknown product = free tier
  END;

  IF v_member_limit IS NOT NULL THEN
    SELECT COUNT(*) INTO v_member_count
    FROM public.household_members hm
    WHERE hm.household_id = v_household_id;

    IF v_member_count >= v_member_limit THEN
      RAISE EXCEPTION 'This household has reached its plan limit of % members. The household owner needs to upgrade to add more members.', v_member_limit;
    END IF;
  END IF;

  -- 4. Insert membership (unique constraint prevents duplicates even under race)
  INSERT INTO public.household_members (household_id, user_id, role, invite_code_used)
  VALUES (v_household_id, auth.uid(), 'member', p_invite_code);

  -- 5. Increment usage count atomically (row is already locked)
  UPDATE public.household_invites
  SET used_count = used_count + 1
  WHERE id = v_invite_id;
END;
$$;

-- ============================================================
-- 3. TIGHTEN INVITE VISIBILITY: admin-only
-- ============================================================
DROP POLICY IF EXISTS "Members can view invites" ON public.household_invites;

CREATE POLICY "Admins can view invites"
  ON public.household_invites FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.household_members hm
      WHERE hm.household_id = household_invites.household_id
        AND hm.user_id = auth.uid()
        AND hm.role = 'admin'
    )
  );
