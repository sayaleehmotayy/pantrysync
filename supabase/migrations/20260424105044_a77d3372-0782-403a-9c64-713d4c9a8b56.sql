-- ============================================================
-- Admin gate: only the configured admin email can read these views.
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_app_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid()
      AND email = 'pantrysync9@gmail.com'
  );
$$;

-- ============================================================
-- 1) Top 10 most expensive users (last 30 days)
-- ============================================================
CREATE OR REPLACE VIEW public.ai_cost_top_users_30d
WITH (security_invoker = true) AS
SELECT
  l.user_id,
  COALESCE(p.display_name, 'Unknown') AS display_name,
  COALESCE(sc.product_id, 'free')     AS product_id,
  COUNT(*)                            AS calls,
  SUM(l.credits_charged)              AS total_credits,
  ROUND(SUM(l.actual_cost_eur)::numeric, 4)             AS total_cost_eur,
  ROUND((SUM(l.credits_charged) * 0.033)::numeric, 4)   AS revenue_at_min_topup,
  CASE
    WHEN SUM(l.actual_cost_eur) > SUM(l.credits_charged) * 0.033
    THEN true ELSE false
  END AS unprofitable
FROM public.ai_cost_log l
LEFT JOIN public.profiles p          ON p.user_id = l.user_id
LEFT JOIN public.subscription_cache sc ON sc.user_id = l.user_id AND sc.status IN ('active','trialing')
WHERE l.created_at > now() - interval '30 days'
  AND public.is_app_admin()                  -- gate: admin only
GROUP BY l.user_id, p.display_name, sc.product_id
ORDER BY total_cost_eur DESC
LIMIT 10;

-- ============================================================
-- 2) Average credits used per plan (last 30 days)
-- ============================================================
CREATE OR REPLACE VIEW public.ai_credits_used_per_plan
WITH (security_invoker = true) AS
WITH plan_users AS (
  SELECT
    sc.user_id,
    CASE
      WHEN sc.product_id IN ('prod_UMmLQfrU8s7K5Z','prod_UMmMruDBeQbqq2','prod_UJmkcGNlIWvfoh','prod_UK2GPSlm6dNKbC','duo_monthly','duo_yearly') THEN 'duo'
      WHEN sc.product_id IN ('prod_UMmMPePoc6w4tV','prod_UMmMkbQrw4RvWk','prod_UK3jUbJSpStHEx','prod_UK3k0gRfRqH9dl','family_monthly','family_yearly') THEN 'family'
      WHEN sc.product_id IN ('prod_UMmNSMB08gx044','prod_UMmN3UgAX6Nj4X','prod_UK3k6GQ1X2Phkl','prod_UK3l7pPFppJ6G2','unlimited_monthly','unlimited_yearly') THEN 'unlimited'
      WHEN sc.product_id = 'admin' THEN 'unlimited'
      ELSE 'free'
    END AS plan
  FROM public.subscription_cache sc
  WHERE sc.status IN ('active','trialing')
)
SELECT
  pu.plan,
  COUNT(DISTINCT pu.user_id)                                    AS subscribers,
  COALESCE(ROUND(AVG(user_totals.credits)::numeric, 1), 0)      AS avg_credits_used,
  COALESCE(ROUND(AVG(user_totals.cost_eur)::numeric, 4), 0)     AS avg_cost_eur,
  COALESCE(ROUND(SUM(user_totals.cost_eur)::numeric, 2), 0)     AS total_cost_eur
FROM plan_users pu
LEFT JOIN LATERAL (
  SELECT SUM(credits_charged) AS credits, SUM(actual_cost_eur) AS cost_eur
  FROM public.ai_cost_log
  WHERE user_id = pu.user_id AND created_at > now() - interval '30 days'
) user_totals ON true
WHERE public.is_app_admin()
GROUP BY pu.plan
ORDER BY CASE pu.plan WHEN 'unlimited' THEN 1 WHEN 'family' THEN 2 WHEN 'duo' THEN 3 ELSE 4 END;

-- ============================================================
-- 3) Total AI cost vs revenue (last 30 days)
-- ============================================================
CREATE OR REPLACE VIEW public.ai_revenue_vs_cost_30d
WITH (security_invoker = true) AS
WITH cost AS (
  SELECT
    COUNT(*)                      AS calls,
    SUM(credits_charged)          AS credits_used,
    SUM(actual_cost_eur)          AS ai_cost_eur
  FROM public.ai_cost_log
  WHERE created_at > now() - interval '30 days'
),
revenue AS (
  SELECT
    -- Rough revenue estimate: count active subs × blended monthly EUR price (net of VAT 21% + Play 15%)
    COUNT(*) FILTER (WHERE sc.product_id IN ('prod_UMmLQfrU8s7K5Z','prod_UMmMruDBeQbqq2','prod_UJmkcGNlIWvfoh','prod_UK2GPSlm6dNKbC','duo_monthly','duo_yearly')) * 2.10
  + COUNT(*) FILTER (WHERE sc.product_id IN ('prod_UMmMPePoc6w4tV','prod_UMmMkbQrw4RvWk','prod_UK3jUbJSpStHEx','prod_UK3k0gRfRqH9dl','family_monthly','family_yearly')) * 3.51
  + COUNT(*) FILTER (WHERE sc.product_id IN ('prod_UMmNSMB08gx044','prod_UMmN3UgAX6Nj4X','prod_UK3k6GQ1X2Phkl','prod_UK3l7pPFppJ6G2','unlimited_monthly','unlimited_yearly')) * 5.61
    AS sub_revenue_eur,
    -- Top-up revenue (net) from the last 30 days
    COALESCE((
      SELECT SUM((price_micros / 1e6) / 1.21 * 0.85)
      FROM public.credit_purchases
      WHERE created_at > now() - interval '30 days' AND status = 'granted'
    ), 0) AS topup_revenue_eur
  FROM public.subscription_cache sc
  WHERE sc.status IN ('active','trialing')
)
SELECT
  cost.calls,
  cost.credits_used,
  ROUND(cost.ai_cost_eur::numeric, 2) AS ai_cost_eur,
  ROUND(revenue.sub_revenue_eur::numeric, 2) AS subscription_revenue_eur,
  ROUND(revenue.topup_revenue_eur::numeric, 2) AS topup_revenue_eur,
  ROUND((revenue.sub_revenue_eur + revenue.topup_revenue_eur)::numeric, 2) AS total_revenue_eur,
  ROUND(((revenue.sub_revenue_eur + revenue.topup_revenue_eur - cost.ai_cost_eur)
         / NULLIF(revenue.sub_revenue_eur + revenue.topup_revenue_eur, 0) * 100)::numeric, 1) AS margin_pct,
  CASE
    WHEN cost.ai_cost_eur > (revenue.sub_revenue_eur + revenue.topup_revenue_eur) * 0.60
    THEN true ELSE false
  END AS unprofitable_alert
FROM cost, revenue
WHERE public.is_app_admin();