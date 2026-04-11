import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './AuthContext';

interface Household {
  id: string;
  name: string;
  invite_code: string;
  created_by: string;
}

interface HouseholdMember {
  id: string;
  user_id: string;
  role: string;
  joined_at: string;
  profile?: { display_name: string | null; avatar_url: string | null };
}

interface HouseholdContextType {
  household: Household | null;
  members: HouseholdMember[];
  loading: boolean;
  userRole: string | null;
  createHousehold: (name: string) => Promise<{ error: Error | null }>;
  joinHousehold: (inviteCode: string) => Promise<{ error: Error | null }>;
  leaveHousehold: () => Promise<void>;
  refreshMembers: () => Promise<void>;
}

const HouseholdContext = createContext<HouseholdContextType | undefined>(undefined);

export function HouseholdProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [household, setHousehold] = useState<Household | null>(null);
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);

  const fetchHousehold = async () => {
    if (!user) { setHousehold(null); setMembers([]); setLoading(false); return; }
    
    const { data: membership } = await supabase
      .from('household_members')
      .select('household_id, role')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();

    if (!membership) { setHousehold(null); setMembers([]); setLoading(false); return; }

    setUserRole(membership.role);

    const { data: hh } = await supabase
      .from('households')
      .select('*')
      .eq('id', membership.household_id)
      .single();

    if (hh) setHousehold(hh);
    await fetchMembers(membership.household_id);
    setLoading(false);
  };

  const fetchMembers = async (householdId: string) => {
    const { data } = await supabase
      .from('household_members')
      .select('id, user_id, role, joined_at')
      .eq('household_id', householdId);

    if (data) {
      const profileIds = data.map(m => m.user_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar_url')
        .in('user_id', profileIds);

      const membersWithProfiles = data.map(m => ({
        ...m,
        profile: profiles?.find(p => p.user_id === m.user_id) || null,
      }));
      setMembers(membersWithProfiles as HouseholdMember[]);
    }
  };

  const refreshMembers = async () => {
    if (household) await fetchMembers(household.id);
  };

  useEffect(() => { fetchHousehold(); }, [user]);

  const createHousehold = async (name: string) => {
    if (!user) return { error: new Error('Not authenticated') };
    
    const { data: hh, error } = await supabase
      .from('households')
      .insert({ name, created_by: user.id })
      .select()
      .single();

    if (error) return { error: error as unknown as Error };

    await supabase.from('household_members').insert({
      household_id: hh.id,
      user_id: user.id,
      role: 'admin',
    });

    await fetchHousehold();
    return { error: null };
  };

  const joinHousehold = async (inviteCode: string) => {
    if (!user) return { error: new Error('Not authenticated') };

    const { data: results, error: findError } = await supabase
      .rpc('lookup_household_by_invite_code', { _invite_code: inviteCode.trim() });

    if (findError || !results || results.length === 0) return { error: new Error('Invalid invite code') };
    const hh = results[0];

    const { error } = await supabase.from('household_members').insert({
      household_id: hh.id,
      user_id: user.id,
      role: 'member',
    });

    if (error) return { error: error as unknown as Error };
    await fetchHousehold();
    return { error: null };
  };

  const leaveHousehold = async () => {
    if (!user || !household) return;
    await supabase
      .from('household_members')
      .delete()
      .eq('household_id', household.id)
      .eq('user_id', user.id);
    setHousehold(null);
    setMembers([]);
    setUserRole(null);
  };

  return (
    <HouseholdContext.Provider value={{ household, members, loading, userRole, createHousehold, joinHousehold, leaveHousehold, refreshMembers }}>
      {children}
    </HouseholdContext.Provider>
  );
}

export function useHousehold() {
  const context = useContext(HouseholdContext);
  if (!context) throw new Error('useHousehold must be used within HouseholdProvider');
  return context;
}
