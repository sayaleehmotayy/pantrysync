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
  const { type, code, tokenHash, accessToken } = getRecoveryParams(location);

  return (
    normalizedPath === '/reset-password' ||
    type === 'recovery' ||
    Boolean(code) ||
    Boolean(tokenHash) ||
    Boolean(accessToken)
  );
}