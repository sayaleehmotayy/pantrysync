import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Sparkles, Lock } from 'lucide-react';
import { STRIPE_CONFIG } from '@/config/subscription';
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
  const [plan, setPlan] = useState<'monthly' | 'yearly'>('monthly');

  const handleUpgrade = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        body: { plan },
      });
      if (error) throw error;
      if (data?.url) window.open(data.url, '_blank');
    } catch (e: any) {
      toast.error(e.message || 'Failed to start checkout');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 animate-fade-in">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
        <Lock className="w-8 h-8 text-primary" />
      </div>
      <h2 className="text-xl font-display font-bold text-center">Pro Feature</h2>
      <p className="text-muted-foreground text-sm text-center mt-2 max-w-xs">
        <span className="font-semibold text-foreground">{feature}</span> is available with PantrySync Pro. Upgrade to unlock all premium features for your whole household.
      </p>
      <p className="text-xs text-muted-foreground mt-1">Includes a 7-day free trial!</p>

      {/* Plan toggle */}
      <div className="flex items-center gap-2 mt-5 bg-muted rounded-lg p-1">
        <button
          onClick={() => setPlan('monthly')}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${plan === 'monthly' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}
        >
          Monthly
        </button>
        <button
          onClick={() => setPlan('yearly')}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${plan === 'yearly' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}
        >
          Yearly
          <span className="ml-1 text-xs text-primary font-semibold">Save 33%</span>
        </button>
      </div>

      <Button onClick={handleUpgrade} disabled={loading} className="mt-4 gap-2">
        <Sparkles className="w-4 h-4" />
        {loading
          ? 'Loading...'
          : `Start Free Trial — then ${plan === 'yearly' ? STRIPE_CONFIG.yearly.price + '/yr' : STRIPE_CONFIG.monthly.price + '/mo'}`}
      </Button>
    </div>
  );
}
