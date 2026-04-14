
-- Create a table to cache Stripe subscription status
CREATE TABLE public.subscription_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  stripe_customer_id TEXT NOT NULL,
  stripe_subscription_id TEXT,
  status TEXT NOT NULL DEFAULT 'inactive',
  product_id TEXT,
  price_id TEXT,
  current_period_end TIMESTAMP WITH TIME ZONE,
  trial_end TIMESTAMP WITH TIME ZONE,
  cancel_at_period_end BOOLEAN DEFAULT false,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.subscription_cache ENABLE ROW LEVEL SECURITY;

-- Users can view their own subscription
CREATE POLICY "Users can view own subscription cache"
  ON public.subscription_cache FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Only service role (edge functions) should write to this table
-- No INSERT/UPDATE/DELETE policies for authenticated users

-- Index for fast lookups
CREATE INDEX idx_subscription_cache_user_id ON public.subscription_cache(user_id);
CREATE INDEX idx_subscription_cache_stripe_customer ON public.subscription_cache(stripe_customer_id);

-- Trigger for updated_at
CREATE TRIGGER update_subscription_cache_updated_at
  BEFORE UPDATE ON public.subscription_cache
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
