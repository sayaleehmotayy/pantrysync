-- ============================================================
-- 1. Update plan allowances (lower = safer)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_user_tier_credits(_user_id uuid)
 RETURNS TABLE(tier text, monthly_allowance integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    RETURN QUERY SELECT 'unlimited'::text, 1200;
    RETURN;
  END IF;

  IF v_product_id IN (
    'prod_UMmLQfrU8s7K5Z','prod_UMmMruDBeQbqq2',
    'prod_UJmkcGNlIWvfoh','prod_UK2GPSlm6dNKbC',
    'duo_monthly','duo_yearly'
  ) THEN
    v_tier := 'duo'; v_allowance := 250;
  ELSIF v_product_id IN (
    'prod_UMmMPePoc6w4tV','prod_UMmMkbQrw4RvWk',
    'prod_UK3jUbJSpStHEx','prod_UK3k0gRfRqH9dl',
    'family_monthly','family_yearly'
  ) THEN
    v_tier := 'family'; v_allowance := 600;
  ELSIF v_product_id IN (
    'prod_UMmNSMB08gx044','prod_UMmN3UgAX6Nj4X',
    'prod_UK3k6GQ1X2Phkl','prod_UK3l7pPFppJ6G2',
    'unlimited_monthly','unlimited_yearly'
  ) THEN
    v_tier := 'unlimited'; v_allowance := 1200;
  END IF;

  RETURN QUERY SELECT v_tier, v_allowance;
END;
$function$;

-- ============================================================
-- 2. Cost-monitoring table — actual € cost per AI call
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ai_cost_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  feature text NOT NULL,
  credits_charged integer NOT NULL,
  actual_cost_eur numeric(10,6) NOT NULL,
  model text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_cost_log_feature_created
  ON public.ai_cost_log (feature, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_cost_log_user_created
  ON public.ai_cost_log (user_id, created_at DESC);

ALTER TABLE public.ai_cost_log ENABLE ROW LEVEL SECURITY;

-- No client policies — table is service-role only (no SELECT/INSERT/UPDATE/DELETE
-- granted to authenticated). Edge functions write via service-role bypass.

-- Helper RPC for the service role to insert log rows efficiently.
CREATE OR REPLACE FUNCTION public.log_ai_cost(
  _user_id uuid,
  _feature text,
  _credits integer,
  _cost_eur numeric,
  _model text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.ai_cost_log (user_id, feature, credits_charged, actual_cost_eur, model)
  VALUES (_user_id, _feature, _credits, _cost_eur, _model);
END;
$$;

-- ============================================================
-- 3. 30-day per-feature margin summary view (admin-only via service role)
-- ============================================================
CREATE OR REPLACE VIEW public.ai_cost_summary_30d AS
SELECT
  feature,
  COUNT(*)                                AS calls,
  ROUND(AVG(actual_cost_eur)::numeric, 5) AS avg_cost_eur,
  ROUND(MAX(actual_cost_eur)::numeric, 5) AS max_cost_eur,
  ROUND(AVG(credits_charged)::numeric, 2) AS avg_credits,
  -- Revenue per credit at the minimum top-up price (€0.033)
  ROUND((AVG(credits_charged) * 0.033)::numeric, 4)        AS avg_revenue_eur,
  -- Margin %: (revenue - cost) / revenue
  ROUND((
    (AVG(credits_charged) * 0.033 - AVG(actual_cost_eur))
    / NULLIF(AVG(credits_charged) * 0.033, 0) * 100
  )::numeric, 1) AS margin_pct,
  -- Alert flag: true if cost exceeds 60% of revenue
  CASE
    WHEN AVG(actual_cost_eur) > AVG(credits_charged) * 0.033 * 0.60
    THEN true ELSE false
  END AS unprofitable_alert
FROM public.ai_cost_log
WHERE created_at > now() - interval '30 days'
GROUP BY feature
ORDER BY margin_pct ASC;