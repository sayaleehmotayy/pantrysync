import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Plus, Zap } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { useAiCredits } from '@/hooks/useAiCredits';
import { useCreditPackPurchase } from '@/hooks/useCreditPackPurchase';
import { CREDIT_PACKS } from '@/config/creditPacks';
import { isNativeAndroid } from '@/lib/platform';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export function CreditsCard() {
  const { subscription } = useAuth();
  const credits = useAiCredits();
  const billing = useCreditPackPurchase();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const onAndroid = isNativeAndroid();

  // Free users can't have AI at all per pricing rule.
  if (!subscription.subscribed && subscription.productId !== 'admin') {
    return null;
  }

  const monthly = credits.monthlyAllowance;
  const remaining = credits.creditsRemaining;
  const bonus = (credits as any).bonusCredits ?? 0;
  const total = remaining + bonus;
  const pct = monthly > 0 ? Math.min(100, Math.round((remaining / monthly) * 100)) : 0;
  const resetDate = credits.periodEnd ? new Date(credits.periodEnd).toLocaleDateString() : null;

  const handleBuy = async (productId: string, fallbackCredits: number) => {
    if (!onAndroid) {
      toast.error('Top-ups are only available in the Android app.');
      return;
    }
    if (!billing.ready) {
      toast.error('Billing is still loading. Try again in a moment.');
      return;
    }
    setPending(productId);
    try {
      const res = await billing.purchase(productId);
      if (res.ok) {
        toast.success(`+${res.credits ?? fallbackCredits} credits added!`);
        setSheetOpen(false);
        await credits.refresh();
      } else if (billing.error) {
        toast.error(billing.error);
      }
    } finally {
      setPending(null);
    }
  };

  return (
    <>
      <Card className="border-primary/30 bg-primary/5 overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-display flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
            AI Credits
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {credits.loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : (
            <>
              <div className="flex items-baseline justify-between gap-2 flex-wrap">
                <div>
                  <p className="text-2xl font-display font-bold">
                    {total.toLocaleString()}
                    <span className="text-sm font-normal text-muted-foreground"> credits left</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {remaining}/{monthly} monthly
                    {bonus > 0 && <> · <span className="text-primary font-medium">+{bonus} bonus</span></>}
                  </p>
                </div>
                {resetDate && (
                  <Badge variant="secondary" className="text-[10px]">
                    Resets {resetDate}
                  </Badge>
                )}
              </div>

              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>

              <Button
                onClick={() => setSheetOpen(true)}
                size="sm"
                className="w-full gap-1.5"
                disabled={!onAndroid}
              >
                <Plus className="w-3.5 h-3.5" />
                Top up credits
              </Button>
              {!onAndroid && (
                <p className="text-[11px] text-muted-foreground text-center">
                  Top-ups are available in the Android app.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader className="text-left">
            <SheetTitle className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              Buy credit pack
            </SheetTitle>
            <SheetDescription>
              Credits never expire for 12 months and stack on top of your monthly allowance.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-2 mt-4 pb-6">
            {CREDIT_PACKS.map((pack) => {
              const live = billing.products[pack.id];
              const price = live?.price || pack.price;
              const isPending = pending === pack.id;
              return (
                <button
                  key={pack.id}
                  onClick={() => handleBuy(pack.id, pack.credits)}
                  disabled={pending !== null || (onAndroid && !billing.ready)}
                  className="w-full flex items-center justify-between p-4 rounded-xl border border-border/50 bg-card hover:bg-muted/50 transition-colors disabled:opacity-50 text-left relative"
                >
                  {pack.badge && (
                    <span className="absolute -top-2 left-4 bg-primary text-primary-foreground text-[10px] font-semibold px-2 py-0.5 rounded-full">
                      {pack.badge}
                    </span>
                  )}
                  <div>
                    <p className="font-display font-semibold text-base">
                      {pack.credits.toLocaleString()} credits
                    </p>
                    <p className="text-xs text-muted-foreground">
                      ~{(pack.credits / 5).toFixed(0)} receipt scans or {pack.credits} text actions
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-base">{isPending ? '...' : price}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
