import { useState, useCallback } from 'react';
import { useHousehold } from '@/contexts/HouseholdContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type AiFeature = 'meal-planner' | 'waste-advisor' | 'smart-shopping';

export function useAiAssistant() {
  const { household } = useHousehold();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');
  const [activeFeature, setActiveFeature] = useState<AiFeature | null>(null);

  const runFeature = useCallback(async (feature: AiFeature) => {
    if (!household) return;
    setLoading(true);
    setResult('');
    setActiveFeature(feature);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-pantry-assistant`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ feature, householdId: household.id }),
        }
      );

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Request failed' }));
        if (resp.status === 402 || err?.code === 'free_tier_blocked' || err?.code === 'out_of_credits') {
          const { handleAiCreditError } = await import('@/lib/aiErrors');
          handleAiCreditError({ status: 402 }, err);
          return;
        }
        throw new Error(err.error || `Error ${resp.status}`);
      }

      if (!resp.body) throw new Error('No response body');

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let full = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIdx: number;
        while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
          let line = buffer.slice(0, newlineIdx);
          buffer = buffer.slice(newlineIdx + 1);
          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') break;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              full += content;
              setResult(full);
            }
          } catch { /* partial chunk */ }
        }
      }
    } catch (e: any) {
      console.error('AI assistant error:', e);
      toast.error(e.message || 'AI feature failed');
    } finally {
      setLoading(false);
    }
  }, [household]);

  return { loading, result, activeFeature, runFeature, setResult, setActiveFeature };
}
