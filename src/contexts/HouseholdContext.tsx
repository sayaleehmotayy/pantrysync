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

    // Fetch household and members in parallel
    const [hhRes] = await Promise.all([
      supabase.from('households').select('*').eq('id', membership.household_id).single(),
    ]);

    if (hhRes.data) setHousehold(hhRes.data);
    await fetchMembers(membership.household_id);
    setLoading(false);
  };

  const fetchMembers = async (householdId: string) => {
    // Fetch members and profiles in parallel to avoid N+1
    const [membersRes, profilesRes] = await Promise.all([
      supabase.from('household_members').select('id, user_id, role, joined_at').eq('household_id', householdId),
      supabase.from('profiles').select('user_id, display_name, avatar_url'),
    ]);

    if (membersRes.data) {
      const profileMap = new Map(
        (profilesRes.data || []).map(p => [p.user_id, p])
      );
      const membersWithProfiles = membersRes.data.map(m => ({
        ...m,
        profile: profileMap.get(m.user_id) || null,
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

    const normalizedInviteCode = inviteCode.trim().toLowerCase();

    const { error } = await supabase
      .rpc('join_household_with_invite', { p_invite_code: normalizedInviteCode });

    if (error) {
      // Surface the RPC exception message — friendlier wording for plan-limit errors
      let msg = error.message || 'Failed to join household';
      if (/plan limit of (\d+) members/i.test(msg)) {
        const m = msg.match(/plan limit of (\d+)/i);
        const limit = m ? Number(m[1]) : null;
        if (limit === 1) {
          msg = 'This household is on the Free plan (1 member only). The admin needs to choose a paid plan to add more people.';
        } else if (limit === 2) {
          msg = 'This household is on the Duo plan (up to 2 members). Ask the admin to upgrade to Family to add more people.';
        } else if (limit === 5) {
          msg = 'This household is on the Family plan (up to 5 members). Ask the admin to upgrade to Unlimited to add more people.';
        }
      }
      return { error: new Error(msg) };
    }

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
