import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic, Lock } from 'lucide-react';

/**
 * Visual replacement for VoiceCommandBar shown to non-Pro users.
 * Same shape/styling as the real bar, but the entire surface is a button
 * that redirects to /plans.
 */
export default function LockedVoiceBar() {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate('/plans')}
      className="relative group w-full text-left"
      aria-label="Upgrade to Pro to use voice commands"
    >
      <div className="absolute -inset-1.5 rounded-3xl blur-2xl bg-primary/6 animate-glow-breathe" />
      <div className="relative flex items-center gap-3 rounded-2xl border border-primary/15 bg-gradient-to-r from-card/80 to-primary/[0.03] px-4 py-3.5 backdrop-blur-md shadow-md hover:shadow-lg hover:border-primary/30 transition-all">
        <div className="relative flex-shrink-0 w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Mic className="w-4 h-4 text-primary" />
          <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-foreground/90 flex items-center justify-center ring-2 ring-background">
            <Lock className="w-2.5 h-2.5 text-background" />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">Tap the mic to add items by voice</p>
          <p className="text-[11px] text-muted-foreground truncate">Pro feature · Upgrade to unlock</p>
        </div>
        <Lock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      </div>
    </button>
  );
}
