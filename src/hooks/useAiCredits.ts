import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface AiCredits {
  tier: string;
  monthlyAllowance: number;
  creditsRemaining: number;
  bonusCredits: number;
  bonusCreditsExpireAt: string | null;
  totalUsedLifetime: number;
  periodEnd: string | null;
  loading: boolean;
}

const initial: AiCredits = {
  tier: 'free',
  monthlyAllowance: 0,
  creditsRemaining: 0,
  bonusCredits: 0,
  bonusCreditsExpireAt: null,
  totalUsedLifetime: 0,
  periodEnd: null,
  loading: true,
};

/**
 * Reads the caller's AI credit ledger row. Returns zero allowance for free
 * users (they can never call AI). Refetches when subscription changes.
 */
export function useAiCredits() {
  const { user, subscription } = useAuth();
  const [credits, setCredits] = useState<AiCredits>(initial);

  const refresh = useCallback(async () => {
    if (!user) {
      setCredits({ ...initial, loading: false });
      return;
    }
    const { data, error } = await supabase
      .from('ai_credit_ledger')
      .select('tier, monthly_allowance, credits_remaining, bonus_credits, bonus_credits_expire_at, total_used_lifetime, period_end')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) {
      console.warn('[useAiCredits] read failed', error);
      setCredits({ ...initial, loading: false });
      return;
    }
    if (!data) {
      const monthly = subscription.subscribed
        ? estimateAllowanceFromProductId(subscription.productId)
        : 0;
      setCredits({
        tier: subscription.subscribed ? 'paid' : 'free',
        monthlyAllowance: monthly,
        creditsRemaining: monthly,
        bonusCredits: 0,
        bonusCreditsExpireAt: null,
        totalUsedLifetime: 0,
        periodEnd: null,
        loading: false,
      });
      return;
    }
    setCredits({
      tier: data.tier,
      monthlyAllowance: data.monthly_allowance,
      creditsRemaining: data.credits_remaining,
      bonusCredits: (data as any).bonus_credits ?? 0,
      bonusCreditsExpireAt: (data as any).bonus_credits_expire_at ?? null,
      totalUsedLifetime: data.total_used_lifetime,
      periodEnd: data.period_end,
      loading: false,
    });
  }, [user, subscription.subscribed, subscription.productId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { ...credits, refresh };
}

// Mirrors get_user_tier_credits in the DB. Used to show the expected allowance
// when no ledger row exists yet.
function estimateAllowanceFromProductId(productId: string | null): number {
  if (!productId) return 0;
  if (productId === 'admin') return 1200;
  const duo = ['prod_UMmLQfrU8s7K5Z','prod_UMmMruDBeQbqq2','prod_UJmkcGNlIWvfoh','prod_UK2GPSlm6dNKbC','duo_monthly','duo_yearly'];
  const family = ['prod_UMmMPePoc6w4tV','prod_UMmMkbQrw4RvWk','prod_UK3jUbJSpStHEx','prod_UK3k0gRfRqH9dl','family_monthly','family_yearly'];
  const unl = ['prod_UMmNSMB08gx044','prod_UMmN3UgAX6Nj4X','prod_UK3k6GQ1X2Phkl','prod_UK3l7pPFppJ6G2','unlimited_monthly','unlimited_yearly'];
  if (duo.includes(productId)) return 250;
  if (family.includes(productId)) return 600;
  if (unl.includes(productId)) return 1200;
  return 0;
}
