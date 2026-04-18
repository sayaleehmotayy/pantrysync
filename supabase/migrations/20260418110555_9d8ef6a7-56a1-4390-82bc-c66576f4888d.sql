
ALTER TABLE public.discount_codes
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS discount_text text,
  ADD COLUMN IF NOT EXISTS min_spend numeric,
  ADD COLUMN IF NOT EXISTS restrictions text,
  ADD COLUMN IF NOT EXISTS conditions text,
  ADD COLUMN IF NOT EXISTS valid_from date,
  ADD COLUMN IF NOT EXISTS extracted_at timestamptz,
  ADD COLUMN IF NOT EXISTS ai_confidence jsonb,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS expired_at timestamptz,
  ADD COLUMN IF NOT EXISTS delete_after timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_2d_sent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_1d_sent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_0d_sent boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_discount_codes_delete_after ON public.discount_codes (delete_after) WHERE delete_after IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_discount_codes_expiry ON public.discount_codes (expiry_date) WHERE expiry_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_discount_codes_household ON public.discount_codes (household_id, expiry_date);
