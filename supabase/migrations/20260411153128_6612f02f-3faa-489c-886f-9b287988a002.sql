
DROP POLICY "Authenticated can insert notifications" ON public.notifications;

CREATE POLICY "Sender can insert notifications" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = sender_id);
