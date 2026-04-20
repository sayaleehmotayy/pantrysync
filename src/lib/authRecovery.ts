export const PUBLISHED_APP_ORIGIN = 'https://pantrysync.lovable.app';

export function getAuthRedirectOrigin(origin: string) {
  const normalizedOrigin = origin.toLowerCase();

  if (
    normalizedOrigin.startsWith('capacitor://') ||
    normalizedOrigin.includes('id-preview--') ||
    normalizedOrigin.includes('lovableproject.com')
  ) {
    return PUBLISHED_APP_ORIGIN;
  }

  return origin;
}

export function getRecoveryParams(location: Pick<Location, 'search' | 'hash'> = window.location) {
  // Prefer params captured synchronously at app boot (before Supabase client init)
  if (typeof window !== 'undefined' && window.__pantrysyncRecovery) {
    const c = window.__pantrysyncRecovery;
    return {
      type: c.type,
      code: c.code,
      tokenHash: c.tokenHash,
      accessToken: c.accessToken,
      refreshToken: c.refreshToken,
    };
  }

  const searchParams = new URLSearchParams(location.search || '');
  const hashParams = new URLSearchParams((location.hash || '').replace(/^#/, ''));

  return {
    type: searchParams.get('type') ?? hashParams.get('type'),
    code: searchParams.get('code') ?? hashParams.get('code'),
    tokenHash: searchParams.get('token_hash') ?? hashParams.get('token_hash'),
    accessToken: hashParams.get('access_token') ?? searchParams.get('access_token'),
    refreshToken: hashParams.get('refresh_token') ?? searchParams.get('refresh_token'),
  };
}

export function isRecoveryUrl(
  location: Pick<Location, 'pathname' | 'search' | 'hash'> = window.location,
) {
  const normalizedPath = location.pathname.replace(/\/+$/, '') || '/';
  if (typeof window !== 'undefined' && window.__pantrysyncRecovery) return true;
  const { type, code, tokenHash, accessToken } = getRecoveryParams(location);

  return (
    normalizedPath === '/reset-password' ||
    type === 'recovery' ||
    Boolean(code) ||
    Boolean(tokenHash) ||
    Boolean(accessToken)
  );
}

export function getCapturedRecoveryUrl(): string | null {
  if (typeof window === 'undefined') return null;
  return window.__pantrysyncRecovery?.fullUrl ?? null;
}

export function clearCapturedRecovery() {
  if (typeof window !== 'undefined') {
    window.__pantrysyncRecovery = null;
    try {
      sessionStorage.removeItem('pantrysync_recovery');
    } catch {
      // ignore
    }
  }
}