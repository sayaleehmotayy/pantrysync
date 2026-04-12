import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Sparkles, Lock, Check } from 'lucide-react';
import { TIERS, TRIAL_DAYS, type TierKey } from '@/config/subscription';
import { toast } from 'sonner';

interface ProGateProps {
  feature: string;
  children: React.ReactNode;
}

export function ProGate({ feature, children }: ProGateProps) {
  const { subscription } = useAuth();

  if (subscription.subscribed) {
    return <>{children}</>;
  }

  return <ProUpgradeWall feature={feature} />;
}

export function ProUpgradeWall({ feature }: { feature: string }) {
  const [loading, setLoading] = useState(false);
  const [interval, setInterval] = useState<'monthly' | 'yearly'>('monthly');
  const [selectedTier, setSelectedTier] = useState<Exclude<TierKey, 'free'>>('duo');

  const handleUpgrade = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        body: { tier: selectedTier, interval },
      });
      if (error) throw error;
      if (data?.url) window.open(data.url, '_blank');
    } catch (e: any) {
      toast.error(e.message || 'Failed to start checkout');
    } finally {
      setLoading(false);
    }
  };

  const tiers = Object.values(TIERS);

  return (
    <div className="flex flex-col items-center justify-center py-10 px-4 animate-fade-in">
      <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-3">
        <Lock className="w-7 h-7 text-primary" />
      </div>
      <h2 className="text-xl font-display font-bold text-center">Pro Feature</h2>
      <p className="text-muted-foreground text-sm text-center mt-1.5 max-w-xs">
        <span className="font-semibold text-foreground">{feature}</span> requires PantrySync Pro.
      </p>
      <p className="text-xs text-muted-foreground mt-0.5">Includes a {TRIAL_DAYS}-day free trial!</p>

      {/* Interval toggle */}
      <div className="flex items-center gap-2 mt-4 bg-muted rounded-lg p-1">
        <button
          onClick={() => setInterval('monthly')}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${interval === 'monthly' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}
        >
          Monthly
        </button>
        <button
          onClick={() => setInterval('yearly')}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${interval === 'yearly' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}
        >
          Yearly
          <span className="ml-1 text-xs text-primary font-semibold">Save 33%</span>
        </button>
      </div>

      {/* Tier cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 w-full max-w-lg">
        {tiers.map((tier) => {
          const price = interval === 'yearly' ? tier.yearly.price : tier.monthly.price;
          const suffix = interval === 'yearly' ? '/yr' : '/mo';
          const isSelected = selectedTier === tier.key;

          return (
            <button
              key={tier.key}
              onClick={() => setSelectedTier(tier.key as Exclude<TierKey, 'free'>)}
              className={`relative p-3 rounded-xl border-2 text-left transition-all ${
                isSelected
                  ? 'border-primary bg-primary/5 shadow-sm'
                  : 'border-border/50 hover:border-border'
              }`}
            >
              {isSelected && (
                <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                  <Check className="w-3 h-3 text-primary-foreground" />
                </div>
              )}
              <p className="font-display font-bold text-sm">{tier.label}</p>
              <p className="text-lg font-bold mt-0.5">{price}<span className="text-xs font-normal text-muted-foreground">{suffix}</span></p>
              <p className="text-xs text-muted-foreground mt-1">
                {tier.memberLimit === null ? 'Unlimited members' : `Up to ${tier.memberLimit} members`}
              </p>
            </button>
          );
        })}
      </div>

      <Button onClick={handleUpgrade} disabled={loading} className="mt-4 gap-2">
        <Sparkles className="w-4 h-4" />
        {loading ? 'Loading...' : 'Start Free Trial'}
      </Button>
    </div>
  );
}
