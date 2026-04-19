import React, { useEffect, useState } from 'react';
import { useHousehold } from '@/contexts/HouseholdContext';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Copy, LogOut, Users, Crown, User, Sparkles, CreditCard, Check, Globe, Moon, Sun, Monitor, AlertTriangle } from 'lucide-react';
import { TIERS, TRIAL_DAYS, AI_FEATURE_BLOCK, getTierByProductId, getMemberLimit, suggestTierForMembers, type TierKey } from '@/config/subscription';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTheme } from 'next-themes';
import { useQueryClient } from '@tanstack/react-query';

const CURRENCIES = [
  { code: 'USD', label: 'US Dollar ($)' },
  { code: 'EUR', label: 'Euro (€)' },
  { code: 'GBP', label: 'British Pound (£)' },
  { code: 'CAD', label: 'Canadian Dollar (CA$)' },
  { code: 'AUD', label: 'Australian Dollar (A$)' },
  { code: 'CHF', label: 'Swiss Franc (CHF)' },
  { code: 'SEK', label: 'Swedish Krona (kr)' },
  { code: 'NOK', label: 'Norwegian Krone (kr)' },
  { code: 'DKK', label: 'Danish Krone (kr)' },
  { code: 'PLN', label: 'Polish Złoty (zł)' },
  { code: 'CZK', label: 'Czech Koruna (Kč)' },
  { code: 'JPY', label: 'Japanese Yen (¥)' },
  { code: 'INR', label: 'Indian Rupee (₹)' },
  { code: 'BRL', label: 'Brazilian Real (R$)' },
  { code: 'MXN', label: 'Mexican Peso (MX$)' },
  { code: 'ZAR', label: 'South African Rand (R)' },
  { code: 'NZD', label: 'New Zealand Dollar (NZ$)' },
  { code: 'SGD', label: 'Singapore Dollar (S$)' },
  { code: 'HKD', label: 'Hong Kong Dollar (HK$)' },
  { code: 'KRW', label: 'South Korean Won (₩)' },
  { code: 'TRY', label: 'Turkish Lira (₺)' },
  { code: 'AED', label: 'UAE Dirham (د.إ)' },
];

export default function SettingsPage() {
  const { household, members, userRole, leaveHousehold } = useHousehold();
  const { signOut, user, subscription, checkSubscription } = useAuth();
  const { theme, setTheme } = useTheme();
  const qc = useQueryClient();
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [interval, setInterval] = useState<'monthly' | 'yearly'>('monthly');
  const [selectedTier, setSelectedTier] = useState<Exclude<TierKey, 'free'>>('family');
  const [preferredCurrency, setPreferredCurrency] = useState<string>('USD');
  const [shareInviteCode, setShareInviteCode] = useState<string>('');

  const currentTier = getTierByProductId(subscription.productId);
  const memberLimit = getMemberLimit(currentTier);

  // Load user's preferred currency
  useEffect(() => {
    if (!user) return;
    supabase
      .from('profiles')
      .select('preferred_currency')
      .eq('user_id', user.id)
      .single()
      .then(({ data }) => {
        if (data?.preferred_currency) setPreferredCurrency(data.preferred_currency);
      });
  }, [user]);

  useEffect(() => {
    if (!household || userRole !== 'admin') {
      setShareInviteCode('');
      return;
    }

    let cancelled = false;

    const ensureInviteCode = async () => {
      const { data: existing } = await supabase
        .from('household_invites')
        .select('invite_code')
        .eq('household_id', household.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled) return;
      if (existing?.invite_code) {
        setShareInviteCode(existing.invite_code.toUpperCase());
        return;
      }

      const { data: created, error } = await supabase
        .from('household_invites')
        .insert({
          household_id: household.id,
          created_by: household.created_by,
          invite_code: household.invite_code,
          is_active: true,
        })
        .select('invite_code')
        .single();

      if (cancelled) return;
      if (error) {
        setShareInviteCode(household.invite_code.toUpperCase());
        return;
      }

      setShareInviteCode((created?.invite_code || household.invite_code).toUpperCase());
    };

    void ensureInviteCode();
    return () => {
      cancelled = true;
    };
  }, [household, userRole]);

  const handleCurrencyChange = async (value: string) => {
    setPreferredCurrency(value);
    if (!user) return;
    const { error } = await supabase
      .from('profiles')
      .update({ preferred_currency: value })
      .eq('user_id', user.id);
    if (error) {
      toast.error('Failed to update currency');
    } else {
      qc.invalidateQueries({ queryKey: ['user-preferred-currency'] });
      toast.success(`Currency set to ${value}`);
    }
  };

  const copyInviteCode = () => {
    navigator.clipboard.writeText((shareInviteCode || household.invite_code).toUpperCase());
    toast.success('Invite code copied!');
  };

  const handleCheckout = async () => {
    setCheckoutLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        body: { tier: selectedTier, interval },
      });
      if (error) throw error;
      if (data?.url) {
        window.open(data.url, '_blank');
      }
    } catch (e: any) {
      toast.error(e.message || 'Failed to start checkout');
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handleManageSubscription = async () => {
    setPortalLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('customer-portal');
      if (error) throw error;
      if (data?.url) {
        window.open(data.url, '_blank');
      }
    } catch (e: any) {
      toast.error(e.message || 'Failed to open subscription portal');
    } finally {
      setPortalLoading(false);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkoutState = params.get('checkout');
    if (!checkoutState) return;

    const clearCheckoutParam = () => {
      params.delete('checkout');
      const search = params.toString();
      window.history.replaceState({}, '', `${window.location.pathname}${search ? `?${search}` : ''}`);
    };

    let retryTimer: number | null = null;

    if (checkoutState === 'cancel') {
      toast.error('Checkout was cancelled');
      clearCheckoutParam();
      return;
    }

    const syncSubscription = async () => {
      toast.success('Checkout complete — updating your Pro access...');
      await checkSubscription();
      retryTimer = window.setTimeout(() => {
        void checkSubscription();
      }, 2500);
      clearCheckoutParam();
    };

    void syncSubscription();

    return () => {
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
      }
    };
  }, [checkSubscription]);

  const tierLabel = currentTier === 'free' ? 'Free' : currentTier.charAt(0).toUpperCase() + currentTier.slice(1);
  const tiers = Object.values(TIERS);

  if (!household) return null;

  return (
    <div className="space-y-4 animate-fade-in">
      <h1 className="text-xl font-display font-bold">Settings</h1>

      {/* Currency Preference */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-display flex items-center gap-2">
            <Globe className="w-4 h-4 text-primary" /> Currency
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-2">Choose your preferred currency for receipts and spending.</p>
          <Select value={preferredCurrency} onValueChange={handleCurrencyChange}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select currency" />
            </SelectTrigger>
            <SelectContent>
              {CURRENCIES.map(c => (
                <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Theme */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-display flex items-center gap-2">
            {theme === 'dark' ? <Moon className="w-4 h-4 text-primary" /> : <Sun className="w-4 h-4 text-primary" />} Appearance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">Choose your preferred theme.</p>
          <div className="flex gap-2">
            {([
              { value: 'light', label: 'Light', icon: Sun },
              { value: 'dark', label: 'Dark', icon: Moon },
              { value: 'system', label: 'System', icon: Monitor },
            ] as const).map(opt => {
              const Icon = opt.icon;
              const active = theme === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => setTheme(opt.value)}
                  className={`flex-1 flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border-2 text-xs font-medium transition-all ${
                    active ? 'border-primary bg-primary/5 text-primary' : 'border-border/50 text-muted-foreground hover:border-border'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {opt.label}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Subscription / Billing Card */}
      <Card className={`overflow-hidden ${subscription.subscribed ? 'border-primary/30 bg-primary/5' : 'border-border/50'}`}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-display flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            {subscription.subscribed ? 'Household subscription' : 'Choose a plan'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {subscription.loading ? (
            <p className="text-sm text-muted-foreground">Checking subscription...</p>
          ) : subscription.subscribed ? (
            subscription.productId === 'admin' ? (
              <>
                <div className="flex items-center gap-2">
                  <Badge className="bg-primary text-primary-foreground">Admin</Badge>
                </div>
                <p className="text-sm text-muted-foreground">You have full access to all features as the app administrator.</p>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className="bg-primary text-primary-foreground">{tierLabel} plan</Badge>
                  {subscription.trial && <Badge variant="secondary">Free trial</Badge>}
                  {subscription.householdPro && (
                    <Badge variant="secondary">Via household</Badge>
                  )}
                </div>
                <div className="text-sm text-muted-foreground space-y-0.5">
                  <p>
                    {memberLimit === null
                      ? 'Unlimited household members.'
                      : `Up to ${memberLimit} household members (${members.length} used).`}
                  </p>
                  <p>
                    {subscription.trial ? 'Trial ends' : 'Renews'}{' '}
                    <span className="text-foreground font-medium">
                      {subscription.subscriptionEnd ? new Date(subscription.subscriptionEnd).toLocaleDateString() : '—'}
                    </span>
                  </p>
                </div>

                {/* Downgrade warning if member count exceeds smaller tiers */}
                {!subscription.householdPro && memberLimit !== null && members.length > 2 && currentTier === 'unlimited' && (
                  <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-400 text-xs">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>You have {members.length} members. Downgrading below this count will be blocked — remove members first.</span>
                  </div>
                )}

                {!subscription.householdPro && (
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={handleManageSubscription} disabled={portalLoading}>
                      <CreditCard className="w-3.5 h-3.5 mr-1" />
                      {portalLoading ? 'Loading...' : 'Manage household subscription'}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={checkSubscription}>
                      Refresh
                    </Button>
                  </div>
                )}

                {/* Upsell to higher tier when applicable */}
                {!subscription.householdPro && currentTier !== 'unlimited' && (
                  <div className="pt-2 border-t border-border/50">
                    <p className="text-xs text-muted-foreground mb-2">Need more household members?</p>
                    <Button
                      size="sm"
                      onClick={() => {
                        const target = currentTier === 'duo' ? 'family' : 'unlimited';
                        setSelectedTier(target);
                        handleCheckout();
                      }}
                      disabled={checkoutLoading}
                    >
                      <Sparkles className="w-3.5 h-3.5 mr-1" />
                      Upgrade to {currentTier === 'duo' ? 'Family' : 'Unlimited'}
                    </Button>
                  </div>
                )}
              </>
            )
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Unlock the full AI-powered pantry experience for your household.
              </p>

              {/* AI feature block */}
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
                <p className="text-xs font-display font-bold mb-1.5 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-primary" /> {AI_FEATURE_BLOCK.title}
                </p>
                <ul className="space-y-1">
                  {AI_FEATURE_BLOCK.bullets.map((b) => (
                    <li key={b} className="flex items-start gap-1.5 text-xs">
                      <Check className="w-3 h-3 text-primary mt-0.5 shrink-0" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-[11px] text-muted-foreground italic mt-2">👉 {AI_FEATURE_BLOCK.tagline}</p>
              </div>

              {/* Interval toggle */}
              <div className="flex items-center gap-2 bg-muted rounded-lg p-1 w-fit">
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

              {/* Tier cards */}
              <div className="grid grid-cols-3 gap-2">
                {tiers.map((tier) => {
                  const price = interval === 'yearly' ? tier.yearly.price : tier.monthly.price;
                  const suffix = interval === 'yearly' ? '/yr' : '/mo';
                  const isSelected = selectedTier === tier.key;
                  const isPopular = tier.key === 'family';

                  return (
                    <button
                      key={tier.key}
                      onClick={() => setSelectedTier(tier.key as Exclude<TierKey, 'free'>)}
                      className={`relative p-2.5 rounded-xl border-2 text-left transition-all ${
                        isSelected
                          ? 'border-primary bg-primary/5 shadow-sm'
                          : 'border-border/50 hover:border-border'
                      }`}
                    >
                      {isPopular && (
                        <span className="absolute -top-2 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full">
                          Popular
                        </span>
                      )}
                      {isSelected && (
                        <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                          <Check className="w-2.5 h-2.5 text-primary-foreground" />
                        </div>
                      )}
                      <p className="font-display font-bold text-xs">{tier.label}</p>
                      <p className="text-sm font-bold mt-0.5">{price}<span className="text-[10px] font-normal text-muted-foreground">{suffix}</span></p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {tier.memberLimit === null ? '∞ members' : `${tier.memberLimit} members`}
                      </p>
                    </button>
                  );
                })}
              </div>

              <Button onClick={handleCheckout} disabled={checkoutLoading} className="w-full">
                <Sparkles className="w-4 h-4 mr-1" />
                {checkoutLoading ? 'Loading...' : `Start ${TRIAL_DAYS}-day free trial`}
              </Button>
              <p className="text-[11px] text-muted-foreground text-center">
                Cancel anytime. Your whole household gets access.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-display">Household</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <p className="text-sm text-muted-foreground">Name</p>
            <p className="font-medium">{household.name}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-1">Invite Code</p>
            <div className="flex items-center gap-2">
               <code className="bg-muted px-3 py-1.5 rounded-md text-sm font-mono flex-1">{(shareInviteCode || household.invite_code).toUpperCase()}</code>
              <Button size="sm" variant="outline" onClick={copyInviteCode}>
                <Copy className="w-4 h-4" />
              </Button>
            </div>
             <p className="text-xs text-muted-foreground mt-1">Share this code with family members to join this household</p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-display flex items-center gap-2">
            <Users className="w-4 h-4" /> Members ({members.length}{memberLimit !== null ? `/${memberLimit}` : ''})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {members.map(member => (
            <div key={member.id} className="flex items-center justify-between py-2">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  {member.role === 'admin' ? <Crown className="w-4 h-4 text-primary" /> : <User className="w-4 h-4 text-muted-foreground" />}
                </div>
                <div>
                  <p className="text-sm font-medium">{member.profile?.display_name || 'Unknown'}</p>
                  <p className="text-xs text-muted-foreground capitalize">{member.role}</p>
                </div>
              </div>
              {member.user_id === user?.id && (
                <Badge variant="secondary" className="text-[10px]">You</Badge>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="space-y-2 pt-4">
        <Button variant="outline" className="w-full" onClick={leaveHousehold}>
          <LogOut className="w-4 h-4 mr-2" /> Leave Household
        </Button>
        <Button variant="ghost" className="w-full text-muted-foreground" onClick={signOut}>
          Sign Out
        </Button>
      </div>
    </div>
  );
}
