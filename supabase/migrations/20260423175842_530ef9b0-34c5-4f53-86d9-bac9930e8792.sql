-- 1. Add bonus credits + expiry to ledger
ALTER TABLE public.ai_credit_ledger
  ADD COLUMN IF NOT EXISTS bonus_credits integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bonus_credits_expire_at timestamptz;

-- 2. Unique constraint on ledger user_id (needed for ON CONFLICT in grant function)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_credit_ledger_user_id_key') THEN
    ALTER TABLE public.ai_credit_ledger ADD CONSTRAINT ai_credit_ledger_user_id_key UNIQUE (user_id);
  END IF;
END $$;

-- 3. Purchase log
CREATE TABLE IF NOT EXISTS public.credit_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  product_id text NOT NULL,
  credits_granted integer NOT NULL,
  price_micros bigint,
  price_currency text,
  purchase_token text NOT NULL UNIQUE,
  order_id text,
  platform text NOT NULL DEFAULT 'google_play',
  status text NOT NULL DEFAULT 'granted',
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.credit_purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own purchases" ON public.credit_purchases;
CREATE POLICY "Users view own purchases"
  ON public.credit_purchases FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_credit_purchases_user ON public.credit_purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_purchases_token ON public.credit_purchases(purchase_token);

-- 4. Drop old consume function (return type is changing)
DROP FUNCTION IF EXISTS public.consume_ai_credits(uuid, integer);

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

  SELECT * INTO v_row FROM public.ai_credit_ledger WHERE user_id = _user_id FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.ai_credit_ledger (
      user_id, tier, monthly_allowance, credits_remaining,
      period_start, period_end, total_used_lifetime, bonus_credits
    ) VALUES (
      _user_id, v_tier, v_allowance, v_allowance,
      date_trunc('month', v_now), date_trunc('month', v_now) + interval '1 month', 0, 0
    )
    RETURNING * INTO v_row;
  END IF;

  IF v_row.bonus_credits > 0 AND v_row.bonus_credits_expire_at IS NOT NULL AND v_now >= v_row.bonus_credits_expire_at THEN
    UPDATE public.ai_credit_ledger
      SET bonus_credits = 0, bonus_credits_expire_at = NULL, updated_at = v_now
      WHERE user_id = _user_id
      RETURNING * INTO v_row;
  END IF;

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

  IF (v_row.credits_remaining + v_row.bonus_credits) < _cost THEN
    RETURN QUERY SELECT false, v_row.credits_remaining, v_row.bonus_credits, v_tier, v_allowance;
    RETURN;
  END IF;

  v_bonus_to_use := LEAST(v_row.bonus_credits, _cost);
  v_monthly_to_use := _cost - v_bonus_to_use;

  UPDATE public.ai_credit_ledger
  SET bonus_credits = bonus_credits - v_bonus_to_use,
      credits_remaining = credits_remaining - v_monthly_to_use,
      total_used_lifetime = total_used_lifetime + _cost,
      updated_at = v_now
  WHERE user_id = _user_id
  RETURNING * INTO v_row;

  RETURN QUERY SELECT true, v_row.credits_remaining, v_row.bonus_credits, v_tier, v_allowance;
END;
$function$;

-- 5. Grant credits from a verified purchase
CREATE OR REPLACE FUNCTION public.grant_purchased_credits(
  _user_id uuid,
  _product_id text,
  _credits integer,
  _purchase_token text,
  _order_id text,
  _price_micros bigint,
  _price_currency text
)
 RETURNS TABLE(success boolean, bonus_credits integer, expires_at timestamptz)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_now timestamptz := now();
  v_expiry timestamptz := v_now + interval '12 months';
  v_existing public.credit_purchases%ROWTYPE;
  v_ledger public.ai_credit_ledger%ROWTYPE;
BEGIN
  IF _credits <= 0 THEN RAISE EXCEPTION 'credits must be positive'; END IF;

  SELECT * INTO v_existing FROM public.credit_purchases WHERE purchase_token = _purchase_token;
  IF FOUND THEN
    SELECT * INTO v_ledger FROM public.ai_credit_ledger WHERE user_id = _user_id;
    RETURN QUERY SELECT true, COALESCE(v_ledger.bonus_credits, 0), v_existing.expires_at;
    RETURN;
  END IF;

  INSERT INTO public.credit_purchases (
    user_id, product_id, credits_granted, price_micros, price_currency,
    purchase_token, order_id, expires_at
  ) VALUES (
    _user_id, _product_id, _credits, _price_micros, _price_currency,
    _purchase_token, _order_id, v_expiry
  );

  INSERT INTO public.ai_credit_ledger (user_id, tier, monthly_allowance, credits_remaining, bonus_credits, bonus_credits_expire_at)
  VALUES (_user_id, 'free', 0, 0, _credits, v_expiry)
  ON CONFLICT (user_id) DO UPDATE
  SET bonus_credits = public.ai_credit_ledger.bonus_credits + _credits,
      bonus_credits_expire_at = GREATEST(COALESCE(public.ai_credit_ledger.bonus_credits_expire_at, v_expiry), v_expiry),
      updated_at = v_now
  RETURNING * INTO v_ledger;

  RETURN QUERY SELECT true, v_ledger.bonus_credits, v_ledger.bonus_credits_expire_at;
END;
$function$;