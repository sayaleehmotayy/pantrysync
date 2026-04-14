-- Create price_history table
CREATE TABLE public.price_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  inventory_item_id UUID NOT NULL,
  household_id UUID NOT NULL,
  price NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  store_name TEXT,
  recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  recorded_by UUID
);

-- Enable RLS
ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Members can view price history"
  ON public.price_history FOR SELECT
  TO authenticated
  USING (is_household_member(auth.uid(), household_id));

CREATE POLICY "Members can add price history"
  ON public.price_history FOR INSERT
  TO authenticated
  WITH CHECK (is_household_member(auth.uid(), household_id));

CREATE POLICY "Members can delete price history"
  ON public.price_history FOR DELETE
  TO authenticated
  USING (is_household_member(auth.uid(), household_id));

-- Indexes for performance
CREATE INDEX idx_price_history_item ON public.price_history (inventory_item_id, recorded_at DESC);
CREATE INDEX idx_price_history_household ON public.price_history (household_id);

-- Add last_price and last_store to inventory_items for quick access
ALTER TABLE public.inventory_items
  ADD COLUMN last_price NUMERIC DEFAULT NULL,
  ADD COLUMN last_store TEXT DEFAULT NULL;