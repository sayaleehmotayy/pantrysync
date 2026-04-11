
-- Add new columns to inventory_items
ALTER TABLE public.inventory_items 
  ADD COLUMN IF NOT EXISTS expiry_date DATE,
  ADD COLUMN IF NOT EXISTS storage_location TEXT NOT NULL DEFAULT 'pantry',
  ADD COLUMN IF NOT EXISTS min_threshold NUMERIC DEFAULT 0;

-- Create activity log table
CREATE TABLE public.activity_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  action TEXT NOT NULL,
  item_name TEXT,
  details TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Members can view activity" 
  ON public.activity_log FOR SELECT 
  TO authenticated
  USING (is_household_member(auth.uid(), household_id));

CREATE POLICY "Members can create activity" 
  ON public.activity_log FOR INSERT 
  TO authenticated
  WITH CHECK (is_household_member(auth.uid(), household_id) AND auth.uid() = user_id);

-- Enable realtime for activity log
ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_log;
