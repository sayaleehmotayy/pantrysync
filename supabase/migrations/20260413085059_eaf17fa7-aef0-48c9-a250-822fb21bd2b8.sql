
-- Receipt scans table
CREATE TABLE public.receipt_scans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  scanned_by UUID NOT NULL,
  store_name TEXT,
  receipt_date DATE,
  total_amount NUMERIC,
  currency TEXT DEFAULT 'USD',
  image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.receipt_scans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view receipt scans"
  ON public.receipt_scans FOR SELECT
  TO authenticated
  USING (is_household_member(auth.uid(), household_id));

CREATE POLICY "Members can create receipt scans"
  ON public.receipt_scans FOR INSERT
  TO authenticated
  WITH CHECK (is_household_member(auth.uid(), household_id) AND auth.uid() = scanned_by);

CREATE POLICY "Members can delete receipt scans"
  ON public.receipt_scans FOR DELETE
  TO authenticated
  USING (is_household_member(auth.uid(), household_id));

-- Receipt items table
CREATE TABLE public.receipt_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  receipt_id UUID NOT NULL REFERENCES public.receipt_scans(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  quantity NUMERIC DEFAULT 1,
  unit TEXT DEFAULT 'pieces',
  unit_price NUMERIC,
  total_price NUMERIC,
  category TEXT DEFAULT 'Other',
  added_to_pantry BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.receipt_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view receipt items"
  ON public.receipt_items FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.receipt_scans rs
    WHERE rs.id = receipt_items.receipt_id
    AND is_household_member(auth.uid(), rs.household_id)
  ));

CREATE POLICY "Members can create receipt items"
  ON public.receipt_items FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.receipt_scans rs
    WHERE rs.id = receipt_items.receipt_id
    AND is_household_member(auth.uid(), rs.household_id)
  ));

CREATE POLICY "Members can update receipt items"
  ON public.receipt_items FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.receipt_scans rs
    WHERE rs.id = receipt_items.receipt_id
    AND is_household_member(auth.uid(), rs.household_id)
  ));

CREATE POLICY "Members can delete receipt items"
  ON public.receipt_items FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.receipt_scans rs
    WHERE rs.id = receipt_items.receipt_id
    AND is_household_member(auth.uid(), rs.household_id)
  ));

-- Index for faster lookups
CREATE INDEX idx_receipt_scans_household ON public.receipt_scans(household_id);
CREATE INDEX idx_receipt_items_receipt ON public.receipt_items(receipt_id);
CREATE INDEX idx_receipt_scans_date ON public.receipt_scans(receipt_date);
