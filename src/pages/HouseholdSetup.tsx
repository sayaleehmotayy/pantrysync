import React, { useEffect, useRef, useState } from 'react';
import { useHousehold } from '@/contexts/HouseholdContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { Home, UserPlus, LogOut, History, Loader2 } from 'lucide-react';
import pantrySyncLogo from '@/assets/pantry-sync-logo.png';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

interface PastMembership {
  id: string;
  household_id: string;
  household_name: string;
  left_at: string;
}

export default function HouseholdSetup() {
  const { createHousehold, joinHousehold } = useHousehold();
  const { signOut, user } = useAuth();
  const [tab, setTab] = useState<'create' | 'join'>('create');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pastMemberships, setPastMemberships] = useState<PastMembership[]>([]);
  const [rejoiningId, setRejoiningId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from('past_household_memberships')
        .select('id, household_id, household_name, left_at')
        .order('left_at', { ascending: false });
      if (data) setPastMemberships(data as PastMembership[]);
    })();
  }, [user]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    const { error } = await createHousehold(name);
    if (error) setError(error.message);
    setLoading(false);
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    const { error } = await joinHousehold(code);
    if (error) setError(error.message);
    setLoading(false);
  };

  const handleRejoin = async (householdId: string) => {
    setRejoiningId(householdId); setError('');
    const { error } = await supabase.rpc('rejoin_past_household', { p_household_id: householdId });
    if (error) {
      setError(error.message);
      toast.error(error.message);
    } else {
      toast.success('Welcome back!');
      window.location.reload();
    }
    setRejoiningId(null);
  };

  const handleRemovePast = async (id: string, householdName: string) => {
    setPastMemberships(prev => prev.filter(p => p.id !== id));
    const { error } = await supabase.from('past_household_memberships').delete().eq('id', id);
    if (error) {
      toast.error('Could not remove from history');
    } else {
      toast.success(`Removed "${householdName}" from history`);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl overflow-hidden mb-4">
            <img src={pantrySyncLogo} alt="PantrySync" className="w-14 h-14 object-cover rounded-2xl" />
          </div>
          <h1 className="text-2xl font-display font-bold">Set Up Your Household</h1>
          <p className="text-muted-foreground text-sm mt-1">Create a new household or join one</p>
        </div>

        <div className="flex gap-2 mb-6">
          <Button
            variant={tab === 'create' ? 'default' : 'outline'}
            className="flex-1"
            onClick={() => { setTab('create'); setError(''); }}
          >
            <Home className="w-4 h-4 mr-2" /> Create
          </Button>
          <Button
            variant={tab === 'join' ? 'default' : 'outline'}
            className="flex-1"
            onClick={() => { setTab('join'); setError(''); }}
          >
            <UserPlus className="w-4 h-4 mr-2" /> Join
          </Button>
        </div>

        <Card className="border-border/50 shadow-lg">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">{tab === 'create' ? 'Create Household' : 'Join Household'}</CardTitle>
            <CardDescription>
              {tab === 'create' ? 'Give your household a name' : 'Enter an invite code or rejoin a previous household'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {tab === 'create' ? (
              <form onSubmit={handleCreate} className="space-y-4">
                <Input placeholder="e.g. The Smiths" value={name} onChange={e => setName(e.target.value)} required />
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Creating...' : 'Create Household'}
                </Button>
              </form>
            ) : (
              <div className="space-y-5">
                <form onSubmit={handleJoin} className="space-y-4">
                  <Input placeholder="Invite code" value={code} onChange={e => setCode(e.target.value)} />
                  {error && <p className="text-sm text-destructive">{error}</p>}
                  <Button type="submit" className="w-full" disabled={loading || !code.trim()}>
                    {loading ? 'Joining...' : 'Join Household'}
                  </Button>
                </form>

                {pastMemberships.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      <History className="w-3.5 h-3.5" />
                      Previous households
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Tap to rejoin instantly. Press &amp; hold to remove from history.
                    </p>
                    <div className="space-y-2">
                      {pastMemberships.map((p) => (
                        <PastHouseholdRow
                          key={p.id}
                          past={p}
                          isJoining={rejoiningId === p.household_id}
                          onTap={() => handleRejoin(p.household_id)}
                          onLongPress={() => handleRemovePast(p.id, p.household_name)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="mt-6 text-center">
          <button onClick={signOut} className="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1">
            <LogOut className="w-3 h-3" /> Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
