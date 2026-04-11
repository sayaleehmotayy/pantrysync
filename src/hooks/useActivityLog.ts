import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useHousehold } from '@/contexts/HouseholdContext';
import { useEffect } from 'react';

export interface ActivityEntry {
  id: string;
  household_id: string;
  user_id: string;
  action: string;
  item_name: string | null;
  details: string | null;
  created_at: string;
}

export function useActivityLog(limit = 50) {
  const { household, members } = useHousehold();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['activity', household?.id, limit],
    queryFn: async () => {
      if (!household) return [];
      const { data, error } = await supabase
        .from('activity_log')
        .select('*')
        .eq('household_id', household.id)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data as ActivityEntry[];
    },
    enabled: !!household,
  });

  // Real-time subscription
  useEffect(() => {
    if (!household) return;
    const channel = supabase
      .channel(`activity-${household.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'activity_log',
        filter: `household_id=eq.${household.id}`,
      }, () => {
        qc.invalidateQueries({ queryKey: ['activity'] });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [household?.id]);

  const getMemberName = (userId: string) => {
    const member = members.find(m => m.user_id === userId);
    return member?.profile?.display_name || 'Someone';
  };

  return { ...query, getMemberName };
}
