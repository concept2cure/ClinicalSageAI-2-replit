const ALLOWED_REDIRECT_PREFIXES = ['/concept2cure', '/client-portal'] as const;
const CONTROL_CHAR_PATTERN = /[\x00-\x1F\x7F]/;

const decodeUpToTwice = (raw: string): string => {
  let decoded = raw;
  for (let i = 0; i < 2; i += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      break;
    }
  }
  return decoded;
};

const isAllowedPathname = (pathname: string): boolean => {
  if (!pathname.startsWith('/')) return false;
  if (pathname.startsWith('//')) return false;
  if (pathname.includes('\\')) return false;

  const segments = pathname.split('/').filter(Boolean);
  if (segments.some(seg => seg === '..')) return false;

  return ALLOWED_REDIRECT_PREFIXES.some(
    prefix => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
};

const normalizeRedirectCandidate = (candidateRaw: string): string | null => {
  const decoded = decodeUpToTwice(candidateRaw.trim());
  if (decoded === '' || /\s/.test(decoded)) return null;

  if (!decoded.startsWith('/')) return null;

  let parsed: URL;
  try {
    parsed = new URL(decoded, 'https://concept2cure.local');
  } catch {
    return null;
  }

  if (parsed.origin !== 'https://concept2cure.local') return null;
  if (!isAllowedPathname(parsed.pathname)) return null;

  const combined = `${parsed.pathname}${parsed.search}${parsed.hash}`;
  if (CONTROL_CHAR_PATTERN.test(combined)) return null;

  return combined;
};

export const computeRedirect = (
  search = typeof window !== 'undefined' ? window.location.search : '',
  userArg?: any,
  userGetter?: () => any
) => {
  try {
    const params = new URLSearchParams(search);
    const next = params.get('next') || params.get('returnTo') || params.get('redirect');
    if (next) {
      const normalized = normalizeRedirectCandidate(next);
      if (normalized) return normalized;
    }
  } catch {
    // ignore malformed search
  }

  const curUser = userArg ?? (userGetter ? userGetter() : undefined);
  if (curUser?.roles?.includes('client_admin') || curUser?.roles?.includes('client_user')) {
    return '/client-portal';
  }
  return '/concept2cure';
};
