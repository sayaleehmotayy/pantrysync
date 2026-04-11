import React, { useState } from 'react';
import { useHousehold } from '@/contexts/HouseholdContext';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Copy, LogOut, Users, Crown, User, Sparkles, CreditCard } from 'lucide-react';

export default function SettingsPage() {
  const { household, members, userRole, leaveHousehold } = useHousehold();
  const { signOut, user, subscription, checkSubscription } = useAuth();
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);

  if (!household) return null;

  const copyInviteCode = () => {
    navigator.clipboard.writeText(household.invite_code);
    toast.success('Invite code copied!');
  };

  const handleCheckout = async () => {
    setCheckoutLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout');
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

  return (
    <div className="space-y-4 animate-fade-in">
      <h1 className="text-xl font-display font-bold">Settings</h1>

      {/* Subscription Card */}
      <Card className={`overflow-hidden ${subscription.subscribed ? 'border-primary/30 bg-primary/5' : 'border-border/50'}`}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-display flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" /> PantrySync Pro
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {subscription.loading ? (
            <p className="text-sm text-muted-foreground">Checking subscription...</p>
          ) : subscription.subscribed ? (
            <>
              <div className="flex items-center gap-2">
                <Badge className="bg-primary text-primary-foreground">Active</Badge>
                <span className="text-sm text-muted-foreground">
                  Renews {subscription.subscriptionEnd ? new Date(subscription.subscriptionEnd).toLocaleDateString() : '—'}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">You have access to all premium features including AI assistant, unlimited households, and priority support.</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleManageSubscription} disabled={portalLoading}>
                  <CreditCard className="w-3.5 h-3.5 mr-1" />
                  {portalLoading ? 'Loading...' : 'Manage Subscription'}
                </Button>
                <Button variant="ghost" size="sm" onClick={checkSubscription}>
                  Refresh Status
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Upgrade to Pro for $4.99/month and unlock AI-powered features, unlimited households, and more.
              </p>
              <ul className="text-sm space-y-1 text-muted-foreground">
                <li>✨ AI pantry assistant</li>
                <li>👥 Unlimited household members</li>
                <li>📊 Advanced analytics</li>
                <li>🔔 Priority support</li>
              </ul>
              <Button onClick={handleCheckout} disabled={checkoutLoading} className="w-full">
                <Sparkles className="w-4 h-4 mr-1" />
                {checkoutLoading ? 'Loading...' : 'Upgrade to Pro — $4.99/mo'}
              </Button>
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
              <code className="bg-muted px-3 py-1.5 rounded-md text-sm font-mono flex-1">{household.invite_code}</code>
              <Button size="sm" variant="outline" onClick={copyInviteCode}>
                <Copy className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Share this code with family members</p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-display flex items-center gap-2">
            <Users className="w-4 h-4" /> Members ({members.length})
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
