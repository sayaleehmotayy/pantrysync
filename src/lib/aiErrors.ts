import { toast } from 'sonner';

/**
 * Handles a Lovable-edge-function response error. Returns true if it was an
 * AI-credit-related error (402) and a toast was shown, so callers can early-return.
 *
 * Pattern:
 *   const { data, error } = await supabase.functions.invoke('foo', {...});
 *   if (handleAiCreditError(error, data)) return;
 */
export function handleAiCreditError(error: unknown, data?: unknown): boolean {
  // supabase-js returns FunctionsHttpError with `context.response` for non-2xx.
  const anyErr = error as any;
  const status = anyErr?.context?.response?.status ?? anyErr?.status;

  // The body might be in `data` (some flows) or have to be re-read from the response.
  const anyData = data as any;
  const code = anyData?.code;
  const message = anyData?.error || anyErr?.message;

  if (status === 402 || code === 'free_tier_blocked' || code === 'out_of_credits') {
    if (code === 'free_tier_blocked' || (typeof message === 'string' && /paid plans/i.test(message))) {
      toast.error('AI features require a paid plan.', {
        description: 'Upgrade to use voice, scanning, recipes and chat AI.',
        action: { label: 'See plans', onClick: () => { window.location.href = '/plans'; } },
      });
    } else {
      toast.error('You\'re out of AI credits this month.', {
        description: typeof message === 'string' ? message : 'Credits reset on the 1st, or upgrade for more.',
        action: { label: 'Upgrade', onClick: () => { window.location.href = '/plans'; } },
      });
    }
    return true;
  }
  return false;
}
