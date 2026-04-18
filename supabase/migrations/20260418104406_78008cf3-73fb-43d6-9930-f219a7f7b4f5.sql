CREATE TABLE public.food_weight_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  food_key text NOT NULL,
  unit text NOT NULL DEFAULT 'piece',
  grams_per_unit numeric NOT NULL,
  sample_count integer NOT NULL DEFAULT 1,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (household_id, food_key, unit)
);

ALTER TABLE public.food_weight_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view overrides"
  ON public.food_weight_overrides FOR SELECT TO authenticated
  USING (is_household_member(auth.uid(), household_id));

CREATE POLICY "Members can insert overrides"
  ON public.food_weight_overrides FOR INSERT TO authenticated
  WITH CHECK (is_household_member(auth.uid(), household_id));

CREATE POLICY "Members can update overrides"
  ON public.food_weight_overrides FOR UPDATE TO authenticated
  USING (is_household_member(auth.uid(), household_id))
  WITH CHECK (is_household_member(auth.uid(), household_id));

CREATE POLICY "Members can delete overrides"
  ON public.food_weight_overrides FOR DELETE TO authenticated
  USING (is_household_member(auth.uid(), household_id));

CREATE TRIGGER update_food_weight_overrides_updated_at
  BEFORE UPDATE ON public.food_weight_overrides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_food_weight_overrides_household_key
  ON public.food_weight_overrides (household_id, food_key);