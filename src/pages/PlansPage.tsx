import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useHousehold } from '@/contexts/HouseholdContext';
import { supabase } from '@/integrations/supabase/client';
import { TIERS, TRIAL_DAYS, AI_FEATURE_BLOCK, getTierByProductId, type TierKey } from '@/config/subscription';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Sparkles, Check, Users, ArrowLeft, CreditCard, Mic, ChefHat, Wallet, Receipt, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';

const FEATURE_ICONS = [Mic, ChefHat, Wallet, Receipt, MessageSquare];

type PaidTier = Exclude<TierKey, 'free'>;

export default function PlansPage() {
  const navigate = useNavigate();
  const { subscription, checkSubscription } = useAuth();
  const { members } = useHousehold();
  const [interval, setInterval] = useState<'monthly' | 'yearly'>('monthly');
  const [loadingTier, setLoadingTier] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [confirmTier, setConfirmTier] = useState<PaidTier | null>(null);

  const currentTier = getTierByProductId(subscription.productId);
  const isPaid = subscription.subscribed && currentTier !== 'free' && subscription.productId !== 'admin';
  const isHouseholdPro = subscription.householdPro; // member of someone else's plan
  const isAdmin = subscription.productId === 'admin';

  // Detect ?checkout=cancel from create-checkout failure path
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('checkout') === 'cancel') {
      toast.error('Checkout was cancelled');
      params.delete('checkout');
      const search = params.toString();
      window.history.replaceState({}, '', `${window.location.pathname}${search ? `?${search}` : ''}`);
    }
  }, []);

  const startCheckout = async (tier: PaidTier, withTrial: boolean) => {
    setLoadingTier(`${tier}-${withTrial ? 'trial' : 'now'}`);
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        body: { tier, interval, withTrial },
      });
      if (error) {
        // Edge function returned non-2xx — try to surface the JSON message
        const ctx: any = (error as any).context;
        let msg = error.message || 'Failed to start checkout';
        try {
          const body = ctx?.body ? JSON.parse(ctx.body) : null;
          if (body?.message) msg = body.message;
          if (body?.error === 'ALREADY_SUBSCRIBED') {
            toast.info(body.message);
            return;
          }
        } catch {}
        throw new Error(msg);
      }
      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (e: any) {
      toast.error(e.message || 'Failed to start checkout');
    } finally {
      setLoadingTier(null);
    }
  };

  const performSwitch = async (tier: PaidTier) => {
    setLoadingTier(`${tier}-switch`);
    try {
      const { data, error } = await supabase.functions.invoke('change-subscription', {
        body: { tier, interval },
      });
      if (error) {
        const ctx: any = (error as any).context;
        let msg = error.message || 'Failed to change plan';
        let code: string | undefined;
        try {
          const body = ctx?.body ? JSON.parse(ctx.body) : null;
          if (body?.message) msg = body.message;
          code = body?.error;
        } catch {}
        if (code === 'DOWNGRADE_BLOCKED' || code === 'SAME_PLAN' || code === 'NO_SUBSCRIPTION') {
          toast.error(msg);
          return;
        }
        throw new Error(msg);
      }
      if (data?.requiresCheckout && data?.url) {
        toast.info('Redirecting to checkout to update your payment method…');
        window.location.href = data.url;
        return;
      }
      toast.success(`Switched to ${tier.charAt(0).toUpperCase() + tier.slice(1)} plan`);
      await checkSubscription();
      // Give Stripe a beat then refresh again
      setTimeout(() => { void checkSubscription(); }, 2500);
    } catch (e: any) {
      toast.error(e.message || 'Failed to change plan');
    } finally {
      setLoadingTier(null);
      setConfirmTier(null);
    }
  };

  const handleSwitchClick = (tier: PaidTier) => {
    const target = TIERS[tier];
    // Show confirm dialog only when downgrading to a tier with a stricter member limit
    const currentLimit = currentTier === 'free' ? 1 : TIERS[currentTier as PaidTier].memberLimit;
    const targetLimit = target.memberLimit;
    const isDowngrade =
      targetLimit !== null && (currentLimit === null || targetLimit < currentLimit);

    if (isDowngrade && members.length > (targetLimit ?? 0)) {
      // Hard block in UI (server will reject too, but be friendly)
      toast.error(
        `Your household has ${members.length} members. ${target.label} only allows ${targetLimit}. Remove ${members.length - (targetLimit ?? 0)} member(s) first.`
      );
      return;
    }

    if (isDowngrade) {
      setConfirmTier(tier);
    } else {
      void performSwitch(tier);
    }
  };

  const openPortal = async () => {
    setPortalLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('customer-portal');
      if (error) throw error;
      if (data?.url) window.open(data.url, '_blank');
    } catch (e: any) {
      toast.error(e.message || 'Failed to open billing portal');
    } finally {
      setPortalLoading(false);
    }
  };

  const tiers = Object.values(TIERS);

  return (
    <div className="space-y-5 animate-fade-in pb-8">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="h-8 w-8">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-xl font-display font-bold">Plans & Billing</h1>
          <p className="text-xs text-muted-foreground">
            {isAdmin
              ? 'Admin account — full access to everything.'
              : isHouseholdPro
                ? 'You have access via your household admin\'s plan.'
                : isPaid
                  ? 'Switch plans anytime — changes are instant and prorated.'
                  : 'Choose a plan that fits your household.'}
          </p>
        </div>
      </div>

      {/* AI Value Block */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-primary/0 to-primary/5">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-primary" />
            <h3 className="font-display font-bold text-sm">{AI_FEATURE_BLOCK.title}</h3>
          </div>
          <ul className="space-y-1.5">
            {AI_FEATURE_BLOCK.bullets.map((b, i) => {
              const Icon = FEATURE_ICONS[i] ?? Check;
              return (
                <li key={b} className="flex items-start gap-2 text-sm">
                  <Icon className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                  <span>{b}</span>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-muted-foreground mt-2.5 italic">👉 {AI_FEATURE_BLOCK.tagline}</p>
        </CardContent>
      </Card>

      {/* Interval toggle */}
      <div className="flex items-center justify-center">
        <div className="flex gap-1 bg-muted rounded-lg p-1">
          <button
            onClick={() => setInterval('monthly')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              interval === 'monthly' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setInterval('yearly')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              interval === 'yearly' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
            }`}
          >
            Yearly <span className="ml-1 text-xs text-primary font-bold">Save ~25%</span>
          </button>
        </div>
      </div>

      {/* Tier cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {tiers.map((tier) => {
          const tierKey = tier.key as PaidTier;
          const price = interval === 'yearly' ? tier.yearly.price : tier.monthly.price;
          const suffix = interval === 'yearly' ? '/yr' : '/mo';
          const isCurrent = isPaid && currentTier === tierKey;
          const isPopular = tierKey === 'family';

          return (
            <Card
              key={tier.key}
              className={`relative overflow-hidden transition-all ${
                isCurrent ? 'border-primary border-2 bg-primary/5 shadow-md' : 'border-border/50'
              }`}
            >
              {isPopular && !isCurrent && (
                <span className="absolute top-0 right-3 bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-b-md">
                  Most Popular
                </span>
              )}
              {isCurrent && (
                <span className="absolute top-0 right-3 bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-b-md">
                  Your Plan
                </span>
              )}
              <CardContent className="p-4 pt-6">
                <h3 className="font-display font-bold text-lg">{tier.label}</h3>
                <div className="mt-1">
                  <span className="text-2xl font-bold">{price}</span>
                  <span className="text-xs text-muted-foreground">{suffix}</span>
                </div>
                <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground">
                  <Users className="w-3.5 h-3.5" />
                  {tier.memberLimit === null ? 'Unlimited members' : `Up to ${tier.memberLimit} members`}
                </div>

                <div className="mt-4 space-y-2">
                  {/* Render buttons depending on state */}
                  {isAdmin || isHouseholdPro ? (
                    <Button disabled className="w-full" variant="outline" size="sm">
                      {isAdmin ? 'Admin access' : 'Via household admin'}
                    </Button>
                  ) : isCurrent ? (
                    <Button disabled className="w-full" variant="outline" size="sm">
                      <Check className="w-3.5 h-3.5 mr-1" /> Current plan
                    </Button>
                  ) : isPaid ? (
                    // Already paying, switching tiers
                    <Button
                      className="w-full"
                      size="sm"
                      onClick={() => handleSwitchClick(tierKey)}
                      disabled={loadingTier !== null}
                    >
                      {loadingTier === `${tierKey}-switch` ? 'Switching...' : `Switch to ${tier.label}`}
                    </Button>
                  ) : (
                    // Free user — offer trial + subscribe-now
                    <>
                      <Button
                        className="w-full"
                        size="sm"
                        onClick={() => startCheckout(tierKey, true)}
                        disabled={loadingTier !== null}
                      >
                        <Sparkles className="w-3.5 h-3.5 mr-1" />
                        {loadingTier === `${tierKey}-trial`
                          ? 'Loading...'
                          : `Start ${TRIAL_DAYS}-day free trial`}
                      </Button>
                      <button
                        onClick={() => startCheckout(tierKey, false)}
                        disabled={loadingTier !== null}
                        className="w-full text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 disabled:opacity-50"
                      >
                        {loadingTier === `${tierKey}-now` ? 'Loading...' : 'or subscribe now (no trial)'}
                      </button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Manage billing — only for paid (non-household-pro) users */}
      {isPaid && !isHouseholdPro && !isAdmin && (
        <Card className="border-border/50">
          <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p className="font-display font-semibold text-sm">Manage billing</p>
              <p className="text-xs text-muted-foreground">
                Update payment method, view invoices, or cancel your subscription.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={openPortal} disabled={portalLoading}>
              <CreditCard className="w-3.5 h-3.5 mr-1" />
              {portalLoading ? 'Loading...' : 'Open billing portal'}
            </Button>
          </CardContent>
        </Card>
      )}

      <p className="text-[11px] text-muted-foreground text-center">
        All prices in EUR. Cancel anytime. Your whole household gets access.
      </p>

      {/* Downgrade confirm dialog */}
      <AlertDialog open={confirmTier !== null} onOpenChange={(open) => !open && setConfirmTier(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Downgrade to {confirmTier ? TIERS[confirmTier].label : ''}?</AlertDialogTitle>
            <AlertDialogDescription>
              You're switching to a smaller plan. The change is prorated — you'll get account credit
              for the unused portion of your current plan, applied to future invoices.
              {confirmTier && TIERS[confirmTier].memberLimit !== null && (
                <span className="block mt-2">
                  Your household currently has <strong>{members.length}</strong> member(s) and the new
                  limit is <strong>{TIERS[confirmTier].memberLimit}</strong>.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep current plan</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmTier && performSwitch(confirmTier)}>
              Confirm downgrade
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
