import React, { useState } from 'react';
import { useHousehold } from '@/contexts/HouseholdContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { Home, UserPlus, LogOut } from 'lucide-react';
import pantrySyncLogo from '@/assets/pantry-sync-logo.png';

export default function HouseholdSetup() {
  const { createHousehold, joinHousehold } = useHousehold();
  const { signOut } = useAuth();
  const [tab, setTab] = useState<'create' | 'join'>('create');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
            onClick={() => setTab('create')}
          >
            <Home className="w-4 h-4 mr-2" /> Create
          </Button>
          <Button
            variant={tab === 'join' ? 'default' : 'outline'}
            className="flex-1"
            onClick={() => setTab('join')}
          >
            <UserPlus className="w-4 h-4 mr-2" /> Join
          </Button>
        </div>

        <Card className="border-border/50 shadow-lg">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">{tab === 'create' ? 'Create Household' : 'Join Household'}</CardTitle>
            <CardDescription>
              {tab === 'create' ? 'Give your household a name' : 'Enter the invite code'}
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
              <form onSubmit={handleJoin} className="space-y-4">
                <Input placeholder="Invite code" value={code} onChange={e => setCode(e.target.value)} required />
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Joining...' : 'Join Household'}
                </Button>
              </form>
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
