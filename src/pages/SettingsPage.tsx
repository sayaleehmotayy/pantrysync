import React, { useState } from 'react';
import { useHousehold } from '@/contexts/HouseholdContext';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Copy, LogOut, Users, Crown, User } from 'lucide-react';

export default function SettingsPage() {
  const { household, members, userRole, leaveHousehold } = useHousehold();
  const { signOut, user } = useAuth();

  if (!household) return null;

  const copyInviteCode = () => {
    navigator.clipboard.writeText(household.invite_code);
    toast.success('Invite code copied!');
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
