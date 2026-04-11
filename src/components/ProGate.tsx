import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
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

  const handleUpgrade = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout');
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
        <span className="font-semibold text-foreground">{feature}</span> is available with PantrySync Pro. Upgrade to unlock all premium features.
      </p>
      <Button onClick={handleUpgrade} disabled={loading} className="mt-6 gap-2">
        <Sparkles className="w-4 h-4" />
        {loading ? 'Loading...' : `Upgrade to Pro — ${STRIPE_CONFIG.monthlyPrice}/mo`}
      </Button>
    </div>
  );
}
