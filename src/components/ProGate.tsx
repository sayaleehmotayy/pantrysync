import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Sparkles, Lock, Check, Users, Mic, ChefHat, Receipt, Wallet, MessageSquare } from 'lucide-react';
import { TIERS, TRIAL_DAYS, AI_FEATURE_BLOCK, type TierKey } from '@/config/subscription';
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

const FEATURE_ICONS = [Mic, ChefHat, Wallet, Receipt, MessageSquare];

export function ProUpgradeWall({ feature }: { feature: string }) {
  const [loading, setLoading] = useState(false);
  const [interval, setInterval] = useState<'monthly' | 'yearly'>('monthly');
  const [selectedTier, setSelectedTier] = useState<Exclude<TierKey, 'free'>>('family');

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
    <div className="flex flex-col items-center py-8 px-4 animate-fade-in max-w-2xl mx-auto">
      <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-3">
        <Lock className="w-7 h-7 text-primary" />
      </div>
      <h2 className="text-2xl font-display font-bold text-center">Unlock AI-powered pantry</h2>
      <p className="text-muted-foreground text-sm text-center mt-1.5 max-w-sm">
        <span className="font-semibold text-foreground">{feature}</span> is part of the AI-powered PantrySync experience.
      </p>

      {/* AI Feature block — single, identical across all paid tiers */}
      <div className="mt-5 w-full rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 via-primary/0 to-primary/5 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-primary" />
          <h3 className="font-display font-bold text-sm">{AI_FEATURE_BLOCK.title}</h3>
        </div>
        <ul className="space-y-2">
          {AI_FEATURE_BLOCK.bullets.map((b, i) => {
            const Icon = FEATURE_ICONS[i] ?? Check;
            return (
              <li key={b} className="flex items-start gap-2.5 text-sm">
                <Icon className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <span>{b}</span>
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-muted-foreground mt-3 italic">
          👉 {AI_FEATURE_BLOCK.tagline}
        </p>
      </div>

      {/* Interval toggle */}
      <div className="flex items-center gap-2 mt-5 bg-muted rounded-lg p-1">
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
          <span className="ml-1 text-xs text-primary font-semibold">Save ~25%</span>
        </button>
      </div>

      {/* Tier cards — only differ by member count */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 w-full">
        {tiers.map((tier) => {
          const price = interval === 'yearly' ? tier.yearly.price : tier.monthly.price;
          const suffix = interval === 'yearly' ? '/yr' : '/mo';
          const isSelected = selectedTier === tier.key;
          const isPopular = tier.key === 'family';

          return (
            <button
              key={tier.key}
              onClick={() => setSelectedTier(tier.key as Exclude<TierKey, 'free'>)}
              className={`relative p-4 rounded-2xl border-2 text-left transition-all ${
                isSelected
                  ? 'border-primary bg-primary/5 shadow-md'
                  : 'border-border/50 hover:border-border'
              }`}
            >
              {isPopular && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full">
                  Most Popular
                </span>
              )}
              {isSelected && (
                <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                  <Check className="w-3 h-3 text-primary-foreground" />
                </div>
              )}
              <p className="font-display font-bold text-sm">{tier.label}</p>
              <p className="text-xl font-bold mt-1">{price}<span className="text-xs font-normal text-muted-foreground">{suffix}</span></p>
              <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                <Users className="w-3 h-3" />
                {tier.memberLimit === null ? 'Unlimited members' : `Up to ${tier.memberLimit} members`}
              </div>
              <p className="text-[11px] text-primary mt-1.5 font-medium">{TRIAL_DAYS}-day free trial</p>
            </button>
          );
        })}
      </div>

      <Button onClick={handleUpgrade} disabled={loading} size="lg" className="mt-5 gap-2 w-full sm:w-auto">
        <Sparkles className="w-4 h-4" />
        {loading ? 'Loading...' : `Start ${TRIAL_DAYS}-day free trial`}
      </Button>
      <p className="text-[11px] text-muted-foreground mt-2">
        Cancel anytime. Your whole household gets access.
      </p>
    </div>
  );
}
