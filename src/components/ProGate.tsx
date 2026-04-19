import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Sparkles, Lock, Check, Mic, ChefHat, Receipt, Wallet, MessageSquare } from 'lucide-react';
import { AI_FEATURE_BLOCK } from '@/config/subscription';

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
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center py-8 px-4 animate-fade-in max-w-2xl mx-auto">
      <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-3">
        <Lock className="w-7 h-7 text-primary" />
      </div>
      <h2 className="text-2xl font-display font-bold text-center">Unlock AI-powered pantry</h2>
      <p className="text-muted-foreground text-sm text-center mt-1.5 max-w-sm">
        <span className="font-semibold text-foreground">{feature}</span> is part of the AI-powered PantrySync experience.
      </p>

      {/* AI Feature block */}
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

      <Button onClick={() => navigate('/plans')} size="lg" className="mt-5 gap-2 w-full sm:w-auto">
        <Sparkles className="w-4 h-4" />
        See plans & pricing
      </Button>
      <p className="text-[11px] text-muted-foreground mt-2">
        Plans from €2.99/mo · 7-day free trial available · Cancel anytime
      </p>
    </div>
  );
}
