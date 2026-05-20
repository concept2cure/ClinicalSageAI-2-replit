/**
 * Compute a safe post-login redirect destination.
 *
 * Security contract (see __tests__/computeRedirect.test.ts):
 *   - Same-origin paths only. External absolute URLs (`https://…`) and
 *     protocol-relative (`//foo.com/…`) are rejected.
 *   - Path must match one of the allowed beta prefixes. Other internal
 *     paths (`/admin`, `/system`) fall back to the canonical landing
 *     page so URLs from older surfaces don't leak the user into a
 *     non-existent route after login.
 *   - Reject path-traversal (`..`), backslash payloads, whitespace, and
 *     control characters. These are the standard open-redirect
 *     attack vectors and all variants must collapse to the safe default.
 *   - Decode double-encoded inputs before validating so an attacker
 *     can't smuggle a backslash or null byte via percent-encoding.
 *   - When no `next` is supplied, fall back to a role-based default:
 *     client_user / client_admin → `/client-portal`, everyone else →
 *     `/concept2cure`.
 */

// Allowed beta-path prefixes. A candidate path is accepted only when its
// first segment matches one of these and the rest of the path passes the
// per-character allowlist (see isAllowedPathname).
export const ALLOWED_REDIRECT_PREFIXES = ['/concept2cure', '/client-portal'] as const;

const CANONICAL_FALLBACK = '/concept2cure';
const CLIENT_FALLBACK = '/client-portal';

// Conservative pathname allowlist. Permits the chars URLs legitimately
// use in this app's beta routes (alphanumerics, `-_./~`, `:`, `@`, `+`,
// `=`, `,`, `;`, `&`, `?`, `#`, `%`). Notably excludes backslashes,
// control characters, and whitespace.
const ALLOWED_CHARS = /^[A-Za-z0-9\-_./~:@+=,;&?#%]+$/;

/**
 * Lightly normalize a redirect candidate: trim whitespace and decode up to
 * two layers of percent-encoding so smuggled bytes surface before
 * validation. Returns null on decode errors — those signal a malformed
 * input we shouldn't follow.
 */
export function normalizeRedirectCandidate(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  if (raw !== raw.trim() || /\s/.test(raw)) return null;
  let candidate = raw.trim();
  for (let i = 0; i < 2; i++) {
    try {
      const decoded = decodeURIComponent(candidate);
      if (decoded === candidate) break;
      candidate = decoded;
    } catch {
      return null;
    }
  }
  return candidate;
}

/**
 * True when a normalized pathname is safe to redirect to. Combines the
 * prefix allowlist and the per-character allowlist; rejects traversal
 * sequences and any non-allowed character (covers backslashes + NUL +
 * other control bytes that decoding may have produced).
 */
export function isAllowedPathname(candidate: string): boolean {
  if (!candidate) return false;
  if (!candidate.startsWith('/')) return false;
  if (candidate.startsWith('//')) return false;
  if (candidate.includes('\\')) return false;
  if (!ALLOWED_CHARS.test(candidate)) return false;

  // Split on / and look for traversal segments. Any literal '..' anywhere
  // in the path collapses the candidate to the fallback. We split on the
  // unencoded slash; decoded inputs already passed normalizeRedirectCandidate.
  const segments = candidate.split('/');
  for (const seg of segments) {
    if (seg === '..') return false;
  }

  // First-segment prefix check. We match by either exact segment equality
  // (`/concept2cure`) or by prefix-with-slash (`/concept2cure/...`) so
  // a sibling like `/concept2cure-evil` does not falsely match.
  const pathOnly = candidate.split(/[?#]/)[0];
  for (const prefix of ALLOWED_REDIRECT_PREFIXES) {
    if (pathOnly === prefix) return true;
    if (pathOnly.startsWith(prefix + '/')) return true;
  }
  return false;
}

export const computeRedirect = (
  search: string = typeof window !== 'undefined' ? window.location.search : '',
  userArg?: any,
  userGetter?: () => any,
): string => {
  try {
    const params = new URLSearchParams(search);
    const next = params.get('next') ?? params.get('returnTo') ?? params.get('redirect');
    const normalized = normalizeRedirectCandidate(next);
    if (normalized && isAllowedPathname(normalized)) {
      return normalized;
    }
  } catch {
    // malformed search — fall through to role-based default
  }

  const curUser = userArg ?? (userGetter ? userGetter() : undefined);
  if (curUser?.roles?.includes('client_admin') || curUser?.roles?.includes('client_user')) {
    return CLIENT_FALLBACK;
  }
  return CANONICAL_FALLBACK;
};
