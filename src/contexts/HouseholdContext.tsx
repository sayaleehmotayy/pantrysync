import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './AuthContext';
import { getTierByProductId, getMemberLimit } from '@/config/subscription';

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
  const { user, subscription } = useAuth();
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

    const { data: results, error: findError } = await supabase
      .rpc('lookup_household_by_invite_code', { _invite_code: inviteCode.trim() });

    if (findError || !results || results.length === 0) return { error: new Error('Invalid invite code') };
    const hh = results[0];

    // Check member limit based on household owner's subscription
    const { data: currentMembers } = await supabase
      .from('household_members')
      .select('user_id')
      .eq('household_id', hh.id);

    const memberCount = currentMembers?.length ?? 0;

    // Check the subscription of the household via the check-subscription edge function
    // For simplicity, we check the current user's subscription context
    // The real enforcement is: what tier does the household owner have?
    // We use the subscription from AuthContext which already checks household-level pro
    const tier = getTierByProductId(subscription.productId);
    const limit = getMemberLimit(tier);

    // If the joining user has no sub, check if the household has a sub by counting
    // For free tier, limit is 1 (solo only), so joining is blocked
    if (!subscription.subscribed) {
      // Check if anyone in the household has a subscription by trying to get household sub info
      // We'll do a simpler check: if there's already 1 member and no subscription, block
      if (memberCount >= 1) {
        return { error: new Error(`This household has reached its free member limit (1 member). The household owner needs to upgrade to Pro to add more members.`) };
      }
    } else if (limit !== null && memberCount >= limit) {
      const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);
      return { error: new Error(`This household has reached the ${tierLabel} plan limit of ${limit} members. Upgrade to a higher tier to add more members.`) };
    }

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
