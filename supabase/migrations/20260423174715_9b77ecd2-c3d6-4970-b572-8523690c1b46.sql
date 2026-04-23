-- AI credit ledger: one row per user, monthly reset.
CREATE TABLE IF NOT EXISTS public.ai_credit_ledger (
  user_id uuid PRIMARY KEY,
  tier text NOT NULL DEFAULT 'free',
  monthly_allowance integer NOT NULL DEFAULT 0,
  credits_remaining integer NOT NULL DEFAULT 0,
  period_start timestamptz NOT NULL DEFAULT date_trunc('month', now()),
  period_end timestamptz NOT NULL DEFAULT (date_trunc('month', now()) + interval '1 month'),
  total_used_lifetime integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_credit_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own ledger" ON public.ai_credit_ledger;
CREATE POLICY "Users view own ledger"
ON public.ai_credit_ledger
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Returns (tier, monthly_allowance) for the caller based on their active subscription_cache row.
CREATE OR REPLACE FUNCTION public.get_user_tier_credits(_user_id uuid)
RETURNS TABLE(tier text, monthly_allowance integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product_id text;
  v_tier text := 'free';
  v_allowance integer := 0;
BEGIN
  SELECT sc.product_id INTO v_product_id
  FROM public.subscription_cache sc
  WHERE sc.user_id = _user_id
    AND sc.status IN ('active','trialing')
  ORDER BY sc.updated_at DESC
  LIMIT 1;

  IF v_product_id IS NULL THEN
    -- Also check household-shared pro: if any household member has an active sub
    SELECT sc.product_id INTO v_product_id
    FROM public.subscription_cache sc
    JOIN public.household_members hm ON hm.user_id = sc.user_id
    WHERE hm.household_id IN (
      SELECT household_id FROM public.household_members WHERE user_id = _user_id
    )
    AND sc.status IN ('active','trialing')
    ORDER BY sc.updated_at DESC
    LIMIT 1;
  END IF;

  IF v_product_id = 'admin' THEN
    RETURN QUERY SELECT 'unlimited'::text, 1500;
    RETURN;
  END IF;

  -- Map product → tier (mirrors src/config/subscription.ts)
  IF v_product_id IN (
    'prod_UMmLQfrU8s7K5Z','prod_UMmMruDBeQbqq2',
    'prod_UJmkcGNlIWvfoh','prod_UK2GPSlm6dNKbC',
    'duo_monthly','duo_yearly'
  ) THEN
    v_tier := 'duo'; v_allowance := 300;
  ELSIF v_product_id IN (
    'prod_UMmMPePoc6w4tV','prod_UMmMkbQrw4RvWk',
    'prod_UK3jUbJSpStHEx','prod_UK3k0gRfRqH9dl',
    'family_monthly','family_yearly'
  ) THEN
    v_tier := 'family'; v_allowance := 700;
  ELSIF v_product_id IN (
    'prod_UMmNSMB08gx044','prod_UMmN3UgAX6Nj4X',
    'prod_UK3k6GQ1X2Phkl','prod_UK3l7pPFppJ6G2',
    'unlimited_monthly','unlimited_yearly'
  ) THEN
    v_tier := 'unlimited'; v_allowance := 1500;
  END IF;

  RETURN QUERY SELECT v_tier, v_allowance;
END;
$$;

-- Atomically consume credits. Returns (success, credits_remaining, tier, monthly_allowance).
-- Refreshes the allowance if a new month started or the user's tier changed.
CREATE OR REPLACE FUNCTION public.consume_ai_credits(_user_id uuid, _cost integer)
RETURNS TABLE(success boolean, credits_remaining integer, tier text, monthly_allowance integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tier text;
  v_allowance integer;
  v_now timestamptz := now();
  v_row public.ai_credit_ledger%ROWTYPE;
BEGIN
  IF _cost <= 0 THEN
    RAISE EXCEPTION 'cost must be positive';
  END IF;

  SELECT t.tier, t.monthly_allowance INTO v_tier, v_allowance
  FROM public.get_user_tier_credits(_user_id) t;

  -- Free tier: hard zero, no AI ever.
  IF v_allowance = 0 THEN
    RETURN QUERY SELECT false, 0, v_tier, 0;
    RETURN;
  END IF;

  SELECT * INTO v_row FROM public.ai_credit_ledger WHERE user_id = _user_id FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.ai_credit_ledger (
      user_id, tier, monthly_allowance, credits_remaining,
      period_start, period_end, total_used_lifetime
    ) VALUES (
      _user_id, v_tier, v_allowance, v_allowance,
      date_trunc('month', v_now), date_trunc('month', v_now) + interval '1 month', 0
    )
    RETURNING * INTO v_row;
  END IF;

  -- Reset on new month OR tier change (tier change always resets to fresh allowance,
  -- preventing exploits where downgrading mid-month gives more credits).
  IF v_now >= v_row.period_end OR v_row.tier <> v_tier OR v_row.monthly_allowance <> v_allowance THEN
    UPDATE public.ai_credit_ledger
    SET tier = v_tier,
        monthly_allowance = v_allowance,
        credits_remaining = v_allowance,
        period_start = date_trunc('month', v_now),
        period_end = date_trunc('month', v_now) + interval '1 month',
        updated_at = v_now
    WHERE user_id = _user_id
    RETURNING * INTO v_row;
  END IF;

  IF v_row.credits_remaining < _cost THEN
    RETURN QUERY SELECT false, v_row.credits_remaining, v_tier, v_allowance;
    RETURN;
  END IF;

  UPDATE public.ai_credit_ledger
  SET credits_remaining = credits_remaining - _cost,
      total_used_lifetime = total_used_lifetime + _cost,
      updated_at = v_now
  WHERE user_id = _user_id
  RETURNING * INTO v_row;

  RETURN QUERY SELECT true, v_row.credits_remaining, v_tier, v_allowance;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_tier_credits(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_ai_credits(uuid, integer) TO service_role;