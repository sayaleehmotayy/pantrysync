
-- Create read receipts table
CREATE TABLE public.chat_read_receipts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  household_id UUID NOT NULL,
  user_id UUID NOT NULL,
  last_read_message_id UUID NOT NULL,
  last_read_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (household_id, user_id)
);

-- Enable RLS
ALTER TABLE public.chat_read_receipts ENABLE ROW LEVEL SECURITY;

-- Members can view read receipts in their household
CREATE POLICY "Members can view read receipts"
  ON public.chat_read_receipts
  FOR SELECT
  TO authenticated
  USING (is_household_member(auth.uid(), household_id));

-- Users can insert their own read receipt
CREATE POLICY "Users can insert own read receipt"
  ON public.chat_read_receipts
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id AND is_household_member(auth.uid(), household_id));

-- Users can update their own read receipt
CREATE POLICY "Users can update own read receipt"
  ON public.chat_read_receipts
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_read_receipts;
