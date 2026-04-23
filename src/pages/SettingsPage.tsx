import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useHousehold } from '@/contexts/HouseholdContext';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Copy, LogOut, Users, Crown, User, Sparkles, Check, Globe, Moon, Sun, Monitor, ArrowRightLeft, ExternalLink, Smartphone, HelpCircle } from 'lucide-react';
import { getTierByProductId, getMemberLimit } from '@/config/subscription';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTheme } from 'next-themes';
import { useQueryClient } from '@tanstack/react-query';
import { isNativeAndroid } from '@/lib/platform';
import { CreditsCard } from '@/components/CreditsCard';
import { triggerOnboardingReplay } from '@/hooks/useOnboarding';

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
  const navigate = useNavigate();
  const [preferredCurrency, setPreferredCurrency] = useState<string>('USD');
  const [shareInviteCode, setShareInviteCode] = useState<string>('');

  const currentTier = getTierByProductId(subscription.productId);
  const memberLimit = getMemberLimit(currentTier);
  const onAndroid = isNativeAndroid();

  // Legacy Stripe subscriber: product_id starts with "prod_" (Stripe IDs).
  // Google Play product IDs are "duo_monthly", "family_yearly", etc.
  const isLegacyStripe = useMemo(
    () => !!subscription.productId && subscription.productId.startsWith('prod_'),
    [subscription.productId],
  );

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

  const openPlayManagement = () => {
    const sku = subscription.productId ?? '';
    const pkg = 'com.pantrysync.app';
    const url = `https://play.google.com/store/account/subscriptions?sku=${encodeURIComponent(sku)}&package=${pkg}`;
    window.open(url, '_blank');
  };

  const tierLabel = currentTier === 'free' ? 'Free' : currentTier.charAt(0).toUpperCase() + currentTier.slice(1);

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

      {/* Subscription / Billing Card — concise summary, all actions go to /plans */}
      <Card className={`overflow-hidden ${subscription.subscribed ? 'border-primary/30 bg-primary/5' : 'border-border/50'}`}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-display flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            {subscription.subscribed ? 'Your plan' : 'Choose a plan'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {subscription.loading ? (
            <p className="text-sm text-muted-foreground">Checking subscription...</p>
          ) : subscription.productId === 'admin' ? (
            <>
              <Badge className="bg-primary text-primary-foreground">Admin</Badge>
              <p className="text-sm text-muted-foreground">You have full access to all features as the app administrator.</p>
            </>
          ) : subscription.subscribed ? (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className="bg-primary text-primary-foreground">{tierLabel} plan</Badge>
                {subscription.trial && <Badge variant="secondary">Free trial</Badge>}
                {subscription.householdPro && <Badge variant="secondary">Via household</Badge>}
              </div>
              <div className="text-sm text-muted-foreground space-y-0.5">
                <p>
                  {memberLimit === null
                    ? `Unlimited household members (${members.length} active).`
                    : `${members.length} of ${memberLimit} household members used.`}
                </p>
                <p>
                  {subscription.trial ? 'Trial ends' : 'Renews'}{' '}
                  <span className="text-foreground font-medium">
                    {subscription.subscriptionEnd ? new Date(subscription.subscriptionEnd).toLocaleDateString() : '—'}
                  </span>
                </p>
              </div>

              {!subscription.householdPro && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {isLegacyStripe ? (
                    <div className="w-full rounded-md border border-border/50 bg-muted/40 p-3 text-xs text-muted-foreground">
                      You're on a legacy subscription that's still active. Plan changes aren't available in
                      the app — please reach out to support if you need help with your subscription.
                    </div>
                  ) : (
                    <>
                      <Button size="sm" onClick={() => navigate('/plans')}>
                        <ArrowRightLeft className="w-3.5 h-3.5 mr-1" />
                        Change plan
                      </Button>
                      {onAndroid && (
                        <Button variant="outline" size="sm" onClick={openPlayManagement}>
                          <ExternalLink className="w-3.5 h-3.5 mr-1" />
                          Manage on Play Store
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={checkSubscription}>
                        Refresh
                      </Button>
                    </>
                  )}
                </div>
              )}

              {subscription.householdPro && (
                <p className="text-xs text-muted-foreground pt-1">
                  Your household admin manages billing for everyone.
                </p>
              )}
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Unlock the AI-powered pantry experience for your whole household — voice updates, recipes, receipt scanning and more.
              </p>
              <Button size="sm" onClick={() => navigate('/plans')} className="gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                See plans & pricing
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <CreditsCard />

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

      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-display flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-primary" /> Help
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Button variant="outline" className="w-full justify-start" onClick={triggerOnboardingReplay}>
            <Sparkles className="w-4 h-4 mr-2" /> How to use the app
          </Button>
          <p className="text-xs text-muted-foreground mt-2">Replay the welcome tour for a quick walkthrough of all features.</p>
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
