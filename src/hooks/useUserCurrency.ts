import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { getCurrencyInfo, detectCurrencyFromLocale, type CurrencyInfo } from '@/lib/currency';

/**
 * Returns the user's preferred currency (from profiles.preferred_currency)
 * as a full CurrencyInfo object. Falls back to locale detection if not set.
 *
 * Use this everywhere we need to display amounts the user enters/sees in-app
 * (budgets, shopping totals, dashboard, spending). Historical records that
 * stored their own currency code (receipts, past trips) should use the
 * stored value instead — only fall back to this when the stored code is missing.
 */
export function useUserCurrency(): CurrencyInfo {
  const { user } = useAuth();

  const { data } = useQuery({
    queryKey: ['user-preferred-currency', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('preferred_currency')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      return data?.preferred_currency || null;
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  if (data) return getCurrencyInfo(data);
  return detectCurrencyFromLocale();
}
