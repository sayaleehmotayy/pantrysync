CREATE OR REPLACE FUNCTION public.consume_ai_credits(_user_id uuid, _cost integer)
 RETURNS TABLE(success boolean, credits_remaining integer, bonus_remaining integer, tier text, monthly_allowance integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tier text;
  v_allowance integer;
  v_now timestamptz := now();
  v_row public.ai_credit_ledger%ROWTYPE;
  v_bonus_to_use integer := 0;
  v_monthly_to_use integer := 0;
BEGIN
  IF _cost <= 0 THEN
    RAISE EXCEPTION 'cost must be positive';
  END IF;

  SELECT t.tier, t.monthly_allowance INTO v_tier, v_allowance
  FROM public.get_user_tier_credits(_user_id) t;

  IF v_allowance = 0 THEN
    RETURN QUERY SELECT false, 0, 0, v_tier, 0;
    RETURN;
  END IF;

  SELECT * INTO v_row FROM public.ai_credit_ledger l WHERE l.user_id = _user_id FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.ai_credit_ledger AS l (
      user_id, tier, monthly_allowance, credits_remaining,
      period_start, period_end, total_used_lifetime, bonus_credits
    ) VALUES (
      _user_id, v_tier, v_allowance, v_allowance,
      date_trunc('month', v_now), date_trunc('month', v_now) + interval '1 month', 0, 0
    )
    RETURNING l.* INTO v_row;
  END IF;

  IF v_row.bonus_credits > 0 AND v_row.bonus_credits_expire_at IS NOT NULL AND v_now >= v_row.bonus_credits_expire_at THEN
    UPDATE public.ai_credit_ledger AS l
      SET bonus_credits = 0, bonus_credits_expire_at = NULL, updated_at = v_now
      WHERE l.user_id = _user_id
      RETURNING l.* INTO v_row;
  END IF;

  IF v_now >= v_row.period_end OR v_row.tier <> v_tier OR v_row.monthly_allowance <> v_allowance THEN
    UPDATE public.ai_credit_ledger AS l
    SET tier = v_tier,
        monthly_allowance = v_allowance,
        credits_remaining = v_allowance,
        period_start = date_trunc('month', v_now),
        period_end = date_trunc('month', v_now) + interval '1 month',
        updated_at = v_now
    WHERE l.user_id = _user_id
    RETURNING l.* INTO v_row;
  END IF;

  IF (v_row.credits_remaining + v_row.bonus_credits) < _cost THEN
    RETURN QUERY SELECT false, v_row.credits_remaining, v_row.bonus_credits, v_tier, v_allowance;
    RETURN;
  END IF;

  v_bonus_to_use := LEAST(v_row.bonus_credits, _cost);
  v_monthly_to_use := _cost - v_bonus_to_use;

  UPDATE public.ai_credit_ledger AS l
  SET bonus_credits = l.bonus_credits - v_bonus_to_use,
      credits_remaining = l.credits_remaining - v_monthly_to_use,
      total_used_lifetime = l.total_used_lifetime + _cost,
      updated_at = v_now
  WHERE l.user_id = _user_id
  RETURNING l.* INTO v_row;

  RETURN QUERY SELECT true, v_row.credits_remaining, v_row.bonus_credits, v_tier, v_allowance;
END;
$function$;