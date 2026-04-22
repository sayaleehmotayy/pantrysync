import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useHousehold } from '@/contexts/HouseholdContext';
import { TIERS, TRIAL_DAYS, AI_FEATURE_BLOCK, getTierByProductId, type TierKey } from '@/config/subscription';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Sparkles, Check, Users, ArrowLeft, Mic, ChefHat, Wallet, Receipt, MessageSquare, RefreshCw, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { useGooglePlayBilling } from '@/hooks/useGooglePlayBilling';
import { useMediaPermissions } from '@/hooks/useMediaPermissions';
import { isNativeAndroid } from '@/lib/platform';
import { PLAY_PRODUCT_IDS } from '@/config/playBilling';

const FEATURE_ICONS = [Mic, ChefHat, Wallet, Receipt, MessageSquare];

const TIER_FEATURES = [
  'Voice-controlled pantry updates',
  'AI recipe suggestions from your ingredients',
  'Smart shopping & budget tracking',
  'Receipt & discount scanning',
  'Real-time household sync & chat',
];

type PaidTier = Exclude<TierKey, 'free'>;

export default function PlansPage() {
  const navigate = useNavigate();
  const { subscription, checkSubscription } = useAuth();
  const { members } = useHousehold();
  const [interval, setIntervalState] = useState<'monthly' | 'yearly'>('monthly');
  const [pendingTier, setPendingTier] = useState<string | null>(null);

  const billing = useGooglePlayBilling();
  const { requestCameraAndMic } = useMediaPermissions();
  const onAndroid = isNativeAndroid();

  const currentTier = getTierByProductId(subscription.productId);
  const isPaid = subscription.subscribed && currentTier !== 'free' && subscription.productId !== 'admin';
  const isHouseholdPro = subscription.householdPro;
  const isAdmin = subscription.productId === 'admin';

  // Detect legacy Stripe subscriber on Android (read-only mode)
  const isLegacyStripe = useMemo(() => {
    if (!isPaid || !subscription.productId) return false;
    // Stripe IDs start with "prod_". Play IDs are duo_monthly, etc.
    return subscription.productId.startsWith('prod_');
  }, [isPaid, subscription.productId]);

  const handleBuy = async (tier: PaidTier) => {
    if (!onAndroid) {
      toast.error('Subscriptions are only available in the Android app right now.');
      return;
    }
    if (!billing.available || !billing.ready) {
      toast.error('Google Play Billing is still initialising. Try again in a moment.');
      return;
    }
    setPendingTier(`${tier}-${interval}`);
    try {
      const ok = await billing.purchase(tier, interval);
      if (ok) {
        toast.success('Purchase successful — unlocking Pro!');
        await checkSubscription();
        setTimeout(() => { void checkSubscription(); }, 2500);

        // Premium unlocks voice & camera-powered features. Prompt for the
        // OS-level permissions now so first use is friction-free.
        try {
          const res = await requestCameraAndMic();
          if (res.camera === 'granted' || res.microphone === 'granted') {
            toast.success('Camera & microphone ready for scanning and voice commands.');
          } else if (res.camera === 'denied' || res.microphone === 'denied') {
            toast.message('You can enable camera & mic later from your phone Settings.');
          }
        } catch (e) {
          console.warn('[Plans] permission prompt failed', e);
        }
      } else if (billing.error) {
        toast.error(billing.error);
      }
    } finally {
      setPendingTier(null);
    }
  };

  const handleRestore = async () => {
    if (!onAndroid) return;
    await billing.restore();
    await checkSubscription();
    toast.success('Restored purchases');
  };

  const tiers = Object.values(TIERS);

  // ─── Render ───────────────────────────────────────────────────────────
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
                ? "You have access via your household admin's plan."
                : isLegacyStripe
                  ? 'You have an active legacy subscription. Pro is unlocked.'
                  : 'Choose a plan billed via Google Play.'}
          </p>
        </div>
      </div>

      {/* Not on Android: hide checkout entirely */}
      {!onAndroid && !isPaid && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4 flex items-start gap-3">
            <Smartphone className="w-5 h-5 text-primary mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="font-display font-semibold text-sm">Available in the Android app</p>
              <p className="text-xs text-muted-foreground">
                Subscriptions are purchased through Google Play in the PantrySync Android app.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Legacy Stripe subscriber banner (Android, read-only) */}
      {isLegacyStripe && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4">
            <p className="font-display font-semibold text-sm">Legacy subscription active</p>
            <p className="text-xs text-muted-foreground mt-1">
              Your existing subscription continues to work and you keep full Pro access. New plan changes are
              not available in the app — please contact support if you need help with your subscription.
            </p>
          </CardContent>
        </Card>
      )}

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

      {/* Interval toggle (only when buying) */}
      {onAndroid && !isLegacyStripe && (
        <div className="flex items-center justify-center">
          <div className="flex gap-1 bg-muted rounded-lg p-1">
            <button
              onClick={() => setIntervalState('monthly')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                interval === 'monthly' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setIntervalState('yearly')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                interval === 'yearly' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
              }`}
            >
              Yearly <span className="ml-1 text-xs text-primary font-bold">Save ~25%</span>
            </button>
          </div>
        </div>
      )}

      {/* Tier cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {tiers.map((tier) => {
          const tierKey = tier.key as PaidTier;
          const playProductId = PLAY_PRODUCT_IDS[tierKey][interval];
          const playProduct = billing.products[playProductId];
          // Prefer the live Play price (localised). Fall back to config price for first paint or web preview.
          const priceLabel = playProduct?.price
            ?? (interval === 'yearly' ? tier.yearly.price : tier.monthly.price);
          const suffix = interval === 'yearly' ? '/yr' : '/mo';
          const isCurrent = isPaid && currentTier === tierKey;
          const isPopular = tierKey === 'family';

          const buyDisabled =
            !onAndroid ||
            !billing.available ||
            (!billing.ready && !billing.loading) ||
            pendingTier !== null ||
            isLegacyStripe;

          const buyLabel = pendingTier === `${tierKey}-${interval}`
            ? 'Opening Play…'
            : `Subscribe with Play${TRIAL_DAYS ? ` · ${TRIAL_DAYS}-day trial` : ''}`;

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
                  <span className="text-2xl font-bold">{priceLabel}</span>
                  <span className="text-xs text-muted-foreground">{suffix}</span>
                </div>
                <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground">
                  <Users className="w-3.5 h-3.5" />
                  {tier.memberLimit === null ? 'Unlimited members' : `Up to ${tier.memberLimit} members`}
                </div>

                <ul className="mt-3 space-y-1.5 border-t border-border/50 pt-3">
                  {TIER_FEATURES.map((feat) => (
                    <li key={feat} className="flex items-start gap-2 text-xs">
                      <Check className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-4 space-y-2">
                  {isAdmin || isHouseholdPro ? (
                    <Button disabled className="w-full" variant="outline" size="sm">
                      {isAdmin ? 'Admin access' : 'Via household admin'}
                    </Button>
                  ) : isCurrent ? (
                    <Button disabled className="w-full" variant="outline" size="sm">
                      <Check className="w-3.5 h-3.5 mr-1" /> Current plan
                    </Button>
                  ) : (
                    <Button
                      className="w-full"
                      size="sm"
                      onClick={() => handleBuy(tierKey)}
                      disabled={buyDisabled}
                    >
                      <Sparkles className="w-3.5 h-3.5 mr-1" />
                      {buyLabel}
                    </Button>
                  )}
                  {tierKey === 'duo' && members.length > 2 && (
                    <p className="text-[10px] text-destructive">
                      Your household has {members.length} members — pick Family or Unlimited.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Restore + manage actions */}
      {onAndroid && !isLegacyStripe && (
        <div className="flex flex-wrap gap-2 justify-center pt-2">
          <Button variant="outline" size="sm" onClick={handleRestore} disabled={billing.loading}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" />
            Restore purchases
          </Button>
          {isPaid && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                // Deep-link to Play Store subscription management
                const sku = subscription.productId ?? '';
                const pkg = 'com.pantrysync.app';
                const url = `https://play.google.com/store/account/subscriptions?sku=${encodeURIComponent(sku)}&package=${pkg}`;
                window.open(url, '_blank');
              }}
            >
              Manage on Play Store
            </Button>
          )}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground text-center">
        Billed via Google Play. Cancel anytime in your Play Store account. Your whole household gets access.
      </p>
    </div>
  );
}
