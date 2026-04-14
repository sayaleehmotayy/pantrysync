
-- Shopping trips table
CREATE TABLE public.shopping_trips (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  store_name TEXT,
  budget NUMERIC,
  total_spent NUMERIC NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  items_count INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  finished_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.shopping_trips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view shopping trips"
  ON public.shopping_trips FOR SELECT TO authenticated
  USING (is_household_member(auth.uid(), household_id));

CREATE POLICY "Members can create shopping trips"
  ON public.shopping_trips FOR INSERT TO authenticated
  WITH CHECK (is_household_member(auth.uid(), household_id) AND auth.uid() = user_id);

CREATE POLICY "Members can delete shopping trips"
  ON public.shopping_trips FOR DELETE TO authenticated
  USING (is_household_member(auth.uid(), household_id));

-- Shopping trip items table
CREATE TABLE public.shopping_trip_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  trip_id UUID NOT NULL REFERENCES public.shopping_trips(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  quantity_bought NUMERIC NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'pieces',
  category TEXT NOT NULL DEFAULT 'Other',
  unit_price NUMERIC,
  total_price NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.shopping_trip_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view trip items"
  ON public.shopping_trip_items FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.shopping_trips st
    WHERE st.id = shopping_trip_items.trip_id
    AND is_household_member(auth.uid(), st.household_id)
  ));

CREATE POLICY "Members can create trip items"
  ON public.shopping_trip_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.shopping_trips st
    WHERE st.id = shopping_trip_items.trip_id
    AND is_household_member(auth.uid(), st.household_id)
  ));
