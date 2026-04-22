
CREATE TABLE public.chat_message_shopping_adds (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_message_id uuid NOT NULL,
  household_id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (chat_message_id)
);

CREATE INDEX chat_message_shopping_adds_household_idx
  ON public.chat_message_shopping_adds (household_id);

ALTER TABLE public.chat_message_shopping_adds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view shopping adds"
  ON public.chat_message_shopping_adds
  FOR SELECT
  TO authenticated
  USING (public.is_household_member(auth.uid(), household_id));

CREATE POLICY "Members can claim a message"
  ON public.chat_message_shopping_adds
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_household_member(auth.uid(), household_id)
    AND auth.uid() = user_id
  );

ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_message_shopping_adds;
