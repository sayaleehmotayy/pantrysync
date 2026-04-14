
-- Indexes on household_id for all major tables
CREATE INDEX IF NOT EXISTS idx_inventory_items_household_id ON public.inventory_items (household_id);
CREATE INDEX IF NOT EXISTS idx_shopping_list_items_household_id ON public.shopping_list_items (household_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_household_id ON public.chat_messages (household_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_household_id ON public.activity_log (household_id);
CREATE INDEX IF NOT EXISTS idx_household_members_household_id ON public.household_members (household_id);
CREATE INDEX IF NOT EXISTS idx_discount_codes_household_id ON public.discount_codes (household_id);
CREATE INDEX IF NOT EXISTS idx_receipt_scans_household_id ON public.receipt_scans (household_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications (user_id);
CREATE INDEX IF NOT EXISTS idx_chat_read_receipts_household_id ON public.chat_read_receipts (household_id);

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_household_members_user_id ON public.household_members (user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_household_created ON public.activity_log (household_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_household_created ON public.chat_messages (household_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_items_household_category ON public.inventory_items (household_id, category, name);
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles (user_id);
CREATE INDEX IF NOT EXISTS idx_device_tokens_user_id ON public.device_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_receipt_items_receipt_id ON public.receipt_items (receipt_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON public.notifications (user_id, read);
