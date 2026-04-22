CREATE OR REPLACE FUNCTION public.join_household_with_invite(p_invite_code text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_household_id uuid;
  v_invite_id uuid;
  v_member_count integer;
  v_owner_id uuid;
  v_product_id text;
  v_member_limit integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

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

  IF EXISTS (
    SELECT 1 FROM public.household_members hm
    WHERE hm.household_id = v_household_id
      AND hm.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'You are already a member of this household';
  END IF;

  SELECT h.created_by INTO v_owner_id
  FROM public.households h WHERE h.id = v_household_id;

  SELECT sc.product_id INTO v_product_id
  FROM public.subscription_cache sc
  WHERE sc.user_id = v_owner_id
    AND sc.status IN ('active', 'trialing')
  LIMIT 1;

  IF v_product_id IS NULL THEN
    SELECT sc.product_id INTO v_product_id
    FROM public.subscription_cache sc
    JOIN public.household_members hm ON hm.user_id = sc.user_id
    WHERE hm.household_id = v_household_id
      AND sc.status IN ('active', 'trialing')
    LIMIT 1;
  END IF;

  v_member_limit := CASE
    WHEN v_product_id IS NULL THEN 1
    -- Duo: new EUR Stripe + legacy USD Stripe + Google Play = 2 members
    WHEN v_product_id IN (
      'prod_UMmLQfrU8s7K5Z', 'prod_UMmMruDBeQbqq2',
      'prod_UJmkcGNlIWvfoh', 'prod_UK2GPSlm6dNKbC',
      'duo_monthly', 'duo_yearly'
    ) THEN 2
    -- Family: new EUR Stripe + legacy USD Stripe + Google Play = 5 members
    WHEN v_product_id IN (
      'prod_UMmMPePoc6w4tV', 'prod_UMmMkbQrw4RvWk',
      'prod_UK3jUbJSpStHEx', 'prod_UK3k0gRfRqH9dl',
      'family_monthly', 'family_yearly'
    ) THEN 5
    -- Unlimited: new EUR Stripe + legacy USD Stripe + Google Play = no limit
    WHEN v_product_id IN (
      'prod_UMmNSMB08gx044', 'prod_UMmN3UgAX6Nj4X',
      'prod_UK3k6GQ1X2Phkl', 'prod_UK3l7pPFppJ6G2',
      'unlimited_monthly', 'unlimited_yearly'
    ) THEN NULL
    WHEN v_product_id = 'admin' THEN NULL
    ELSE 1
  END;

  IF v_member_limit IS NOT NULL THEN
    SELECT COUNT(*) INTO v_member_count
    FROM public.household_members hm
    WHERE hm.household_id = v_household_id;

    IF v_member_count >= v_member_limit THEN
      RAISE EXCEPTION 'This household has reached its plan limit of % members. The household admin needs to upgrade to add more people.', v_member_limit;
    END IF;
  END IF;

  INSERT INTO public.household_members (household_id, user_id, role, invite_code_used)
  VALUES (v_household_id, auth.uid(), 'member', p_invite_code);

  UPDATE public.household_invites
  SET used_count = used_count + 1
  WHERE id = v_invite_id;
END;
$function$;