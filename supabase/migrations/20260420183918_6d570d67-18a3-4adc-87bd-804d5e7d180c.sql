-- Fix 1: Restrict profiles SELECT to users who share a household or own profile
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
CREATE POLICY "Users can view profiles of household members"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR public.shares_household(auth.uid(), user_id)
  );

-- Fix 2: Add UPDATE and DELETE policies for shopping_trip_items scoped to household membership
CREATE POLICY "Members can update trip items"
  ON public.shopping_trip_items
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM shopping_trips st
      WHERE st.id = shopping_trip_items.trip_id
        AND public.is_household_member(auth.uid(), st.household_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM shopping_trips st
      WHERE st.id = shopping_trip_items.trip_id
        AND public.is_household_member(auth.uid(), st.household_id)
    )
  );

CREATE POLICY "Members can delete trip items"
  ON public.shopping_trip_items
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM shopping_trips st
      WHERE st.id = shopping_trip_items.trip_id
        AND public.is_household_member(auth.uid(), st.household_id)
    )
  );