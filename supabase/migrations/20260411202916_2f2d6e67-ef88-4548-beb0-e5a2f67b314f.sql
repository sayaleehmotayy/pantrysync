
-- Create discount_codes table
CREATE TABLE public.discount_codes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  household_id UUID NOT NULL,
  store_name TEXT NOT NULL,
  code TEXT NOT NULL,
  description TEXT,
  receipt_image_url TEXT,
  expiry_date DATE,
  added_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.discount_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view discount codes"
  ON public.discount_codes FOR SELECT TO authenticated
  USING (is_household_member(auth.uid(), household_id));

CREATE POLICY "Members can add discount codes"
  ON public.discount_codes FOR INSERT TO authenticated
  WITH CHECK (is_household_member(auth.uid(), household_id) AND auth.uid() = added_by);

CREATE POLICY "Members can update discount codes"
  ON public.discount_codes FOR UPDATE TO authenticated
  USING (is_household_member(auth.uid(), household_id));

CREATE POLICY "Members can delete discount codes"
  ON public.discount_codes FOR DELETE TO authenticated
  USING (is_household_member(auth.uid(), household_id));

-- Create storage bucket for receipt images
INSERT INTO storage.buckets (id, name, public) VALUES ('receipt-images', 'receipt-images', true);

-- Storage policies
CREATE POLICY "Authenticated users can upload receipt images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'receipt-images');

CREATE POLICY "Anyone can view receipt images"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'receipt-images');

CREATE POLICY "Users can delete own receipt images"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'receipt-images');
