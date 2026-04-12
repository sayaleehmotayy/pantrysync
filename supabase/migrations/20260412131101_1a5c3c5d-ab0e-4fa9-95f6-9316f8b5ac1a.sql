
-- Drop and recreate the SELECT policy to also allow the creator
DROP POLICY IF EXISTS "Members can view their households" ON public.households;
CREATE POLICY "Members can view their households"
ON public.households
FOR SELECT
TO authenticated
USING (is_household_member(auth.uid(), id) OR auth.uid() = created_by);
