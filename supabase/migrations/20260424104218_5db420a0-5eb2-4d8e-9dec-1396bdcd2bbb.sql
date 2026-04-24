-- 1) Recreate the summary view WITHOUT security_definer behaviour.
DROP VIEW IF EXISTS public.ai_cost_summary_30d;

CREATE VIEW public.ai_cost_summary_30d
WITH (security_invoker = true) AS
SELECT
  feature,
  COUNT(*)                                AS calls,
  ROUND(AVG(actual_cost_eur)::numeric, 5) AS avg_cost_eur,
  ROUND(MAX(actual_cost_eur)::numeric, 5) AS max_cost_eur,
  ROUND(AVG(credits_charged)::numeric, 2) AS avg_credits,
  ROUND((AVG(credits_charged) * 0.033)::numeric, 4) AS avg_revenue_eur,
  ROUND((
    (AVG(credits_charged) * 0.033 - AVG(actual_cost_eur))
    / NULLIF(AVG(credits_charged) * 0.033, 0) * 100
  )::numeric, 1) AS margin_pct,
  CASE
    WHEN AVG(actual_cost_eur) > AVG(credits_charged) * 0.033 * 0.60
    THEN true ELSE false
  END AS unprofitable_alert
FROM public.ai_cost_log
WHERE created_at > now() - interval '30 days'
GROUP BY feature
ORDER BY margin_pct ASC;

-- 2) Explicit deny-all RLS on ai_cost_log for authenticated users.
-- (Service-role keys bypass RLS, so the edge function logger still works.)
CREATE POLICY "Deny all client access to cost log"
ON public.ai_cost_log
FOR ALL
TO authenticated
USING (false)
WITH CHECK (false);