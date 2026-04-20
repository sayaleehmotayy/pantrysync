// Runs BEFORE the Supabase client is imported so we can intercept
// password-recovery tokens from the URL (hash or query) and prevent the
// client's `detectSessionInUrl` from auto-signing the user in.
//
// Without this, clicking a password-reset email link would:
//   1. Land on `/` (or `/reset-password`) with `#access_token=...&type=recovery`
//   2. Supabase JS auto-exchanges it, signs the user in, and strips the hash
//   3. The app then has no way to know this was a recovery flow
//      → user is sent straight to the dashboard, never sees the new-password form.

export interface CapturedRecovery {
  type: string | null;
  code: string | null;
  tokenHash: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  fullUrl: string;
}

declare global {
  interface Window {
    __pantrysyncRecovery?: CapturedRecovery | null;
  }
}

function capture(): CapturedRecovery | null {
  if (typeof window === 'undefined') return null;

  const search = new URLSearchParams(window.location.search || '');
  const hash = new URLSearchParams((window.location.hash || '').replace(/^#/, ''));

  const type = search.get('type') ?? hash.get('type');
  const code = search.get('code') ?? hash.get('code');
  const tokenHash = search.get('token_hash') ?? hash.get('token_hash');
  const accessToken = hash.get('access_token') ?? search.get('access_token');
  const refreshToken = hash.get('refresh_token') ?? search.get('refresh_token');

  const isRecovery =
    type === 'recovery' ||
    Boolean(code) ||
    Boolean(tokenHash) ||
    Boolean(accessToken);

  if (!isRecovery) return null;

  const captured: CapturedRecovery = {
    type,
    code,
    tokenHash,
    accessToken,
    refreshToken,
    fullUrl: window.location.href,
  };

  // Strip tokens from the URL so Supabase's detectSessionInUrl is a no-op
  // and so the URL bar is clean. Keep the user on /reset-password.
  try {
    window.history.replaceState({}, '', '/reset-password');
  } catch {
    // ignore
  }

  return captured;
}

window.__pantrysyncRecovery = capture();

export {};