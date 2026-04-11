import React, { useState } from 'react';
import { useHousehold } from '@/contexts/HouseholdContext';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { saveDummyTokenRow, triggerPushTokenRegistration, usePushNotificationDebug } from '@/hooks/usePushNotifications';
import { toast } from 'sonner';
import { Copy, LogOut, Users, Crown, User } from 'lucide-react';

export default function SettingsPage() {
  const { household, members, userRole, leaveHousehold } = useHousehold();
  const { signOut, user } = useAuth();
  const pushDebug = usePushNotificationDebug();
  const [registeringPush, setRegisteringPush] = useState(false);
  const [savingDummy, setSavingDummy] = useState(false);

  if (!household) return null;

  const renderStatusBadge = (value: boolean, truthyLabel = 'Yes', falsyLabel = 'No') => (
    <Badge variant={value ? 'default' : 'secondary'} className="text-[10px]">
      {value ? truthyLabel : falsyLabel}
    </Badge>
  );

  const renderCodeValue = (value: string | null | undefined) => (
    value ? <code className="break-all rounded bg-muted px-2 py-1 text-xs">{value}</code> : <span className="text-muted-foreground">—</span>
  );

  const copyInviteCode = () => {
    navigator.clipboard.writeText(household.invite_code);
    toast.success('Invite code copied!');
  };

  const handleRegisterPushToken = async () => {
    setRegisteringPush(true);
    try {
      await triggerPushTokenRegistration(user?.id ?? null);
      toast.success('Push token registration flow triggered');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to trigger push token registration');
    } finally {
      setRegisteringPush(false);
    }
  };

  const handleSaveDummyToken = async () => {
    setSavingDummy(true);
    try {
      await saveDummyTokenRow(user?.id ?? null);
      toast.success('Dummy device token save attempted');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save dummy device token');
    } finally {
      setSavingDummy(false);
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <h1 className="text-xl font-display font-bold">Settings</h1>

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

      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-display">Native push debug</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {renderStatusBadge(pushDebug.environment.isNative, 'Native', 'Web')}
            {renderStatusBadge(pushDebug.environment.backendConfigured, 'Backend config loaded', 'Backend config missing')}
            {renderStatusBadge(pushDebug.registerCalled, 'register() called', 'register() not called')}
            {renderStatusBadge(pushDebug.registrationEventReceived, 'Token event received', 'No token event')}
            {renderStatusBadge(pushDebug.saveSucceeded, 'device_tokens saved', 'device_tokens not saved')}
          </div>

          <div className="grid gap-3 text-sm">
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Current user</p>
              {renderCodeValue(user?.id)}
            </div>

            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Household</p>
              {renderCodeValue(household.id)}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Capacitor detected</p>
                <div className="flex flex-wrap gap-2">
                  {renderStatusBadge(pushDebug.environment.hasWindowCapacitor)}
                  {renderCodeValue(pushDebug.environment.importPlatform)}
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Window platform</p>
                {renderCodeValue(pushDebug.environment.windowPlatform)}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Context user ID</p>
                {renderCodeValue(pushDebug.contextUserId)}
              </div>

              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Auth user ID</p>
                {renderCodeValue(pushDebug.authUserId)}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Permission before</p>
                {renderCodeValue(pushDebug.permissionBefore)}
              </div>

              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Permission after</p>
                {renderCodeValue(pushDebug.permissionAfter)}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Token preview</p>
                {renderCodeValue(pushDebug.tokenPreview)}
              </div>

              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Token length</p>
                {renderCodeValue(pushDebug.tokenLength ? String(pushDebug.tokenLength) : null)}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">device_tokens write attempted</p>
                <div>{renderStatusBadge(pushDebug.saveAttempted)}</div>
              </div>

              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Dummy row attempted</p>
                <div>{renderStatusBadge(pushDebug.dummySaveAttempted)}</div>
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Last payload preview</p>
              {pushDebug.lastPayload ? (
                <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(pushDebug.lastPayload, null, 2)}</pre>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </div>

            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Last saved row</p>
              {pushDebug.lastSavedRow ? (
                <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(pushDebug.lastSavedRow, null, 2)}</pre>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </div>

            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Last action</p>
              {renderCodeValue(pushDebug.lastAction)}
            </div>

            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Last updated</p>
              {renderCodeValue(pushDebug.lastUpdatedAt)}
            </div>

            {pushDebug.registrationError && (
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Registration error</p>
                <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {pushDebug.registrationError}
                </p>
              </div>
            )}

            {pushDebug.saveError && (
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">device_tokens error</p>
                <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {pushDebug.saveError}
                </p>
              </div>
            )}

            {pushDebug.dummySaveError && (
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Dummy row error</p>
                <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {pushDebug.dummySaveError}
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button onClick={handleRegisterPushToken} disabled={registeringPush} className="sm:flex-1">
              {registeringPush ? 'Registering…' : 'Register Push Token Now'}
            </Button>
            <Button variant="outline" onClick={handleSaveDummyToken} disabled={savingDummy} className="sm:flex-1">
              {savingDummy ? 'Saving…' : 'Save Dummy Token Row'}
            </Button>
          </div>
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
