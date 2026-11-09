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
// External clients land on the portal surface INSIDE the bundle. The bare
// `/client-portal` path is a legacy alias that App.jsx fences to `/concept2cure`
// (product home), so sending clients there would drop them on the wrong page —
// route them straight to the registered surface instead.
const CLIENT_FALLBACK = '/concept2cure/client-portal';

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

const JWT_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const PROVIDER_SHAPE = /^[a-z0-9-]{1,32}$/i;

export interface SsoHandoff {
  token: string;
  provider: string | null;
  /** A same-origin path this app allows, else null. */
  returnTo: string | null;
}

/**
 * The single sign-on hand-off the sign-in page reads from the URL fragment
 * (`#sso=…&provider=…&returnTo=…`). The server puts the session there because a
 * fragment is never sent to a server and never logged (security audit
 * 2026-09-24, IAM-18 item 6). Null unless the fragment carries a JWT-shaped
 * token; the return path is followed only when it passes the same allow-list as
 * every other redirect here.
 */
export function parseSsoHandoff(hash: string | null | undefined): SsoHandoff | null {
  const raw = (hash ?? '').replace(/^#/, '');
  if (!raw) return null;
  const params = new URLSearchParams(raw);
  if (params.has('mfa')) return null;
  const token = params.get('sso') ?? '';
  if (!JWT_SHAPE.test(token)) return null;
  const provider = params.get('provider');
  const candidate = normalizeRedirectCandidate(params.get('returnTo'));
  return {
    token,
    provider: provider && PROVIDER_SHAPE.test(provider) ? provider : null,
    returnTo: candidate && isAllowedPathname(candidate) ? candidate : null,
  };
}

/** First-factor SAML proof goes to the existing MFA verifier, never session adoption. */
export function parseSsoMfaHandoff(hash: string | null | undefined): {
  challenge: string; method: 'email' | 'totp'; returnTo: string | null; maskedEmail: string;
} | null {
  const params = new URLSearchParams((hash ?? '').replace(/^#/, ''));
  const challenge = params.get('mfa') ?? '';
  const method = params.get('method');
  if (params.has('sso') || params.get('provider') !== 'saml' || !JWT_SHAPE.test(challenge) || challenge.length > 8192 || (method !== 'email' && method !== 'totp')) return null;
  const candidate = normalizeRedirectCandidate(params.get('returnTo'));
  return {
    challenge, method, returnTo: candidate && isAllowedPathname(candidate) ? candidate : null,
    maskedEmail: (params.get('maskedEmail') ?? '').slice(0, 254),
  };
}

/**
 * Existing Demo Access entry: qualify the session and its two most basic
 * project-management destinations BEFORE persisting a login or navigating.
 *
 * This is not a seed, provisioner or a second authentication path. It reads
 * already-governed endpoints with the JWT the existing dev-login returned.
 * Normal sign-in is unaffected. A working blank account is valid for ordinary
 * sign-in, but it is not an honest customer demonstration.
 */
export interface DemoAccessReadiness {
  ready: boolean;
  message?: string;
}

const DEMO_READ_TIMEOUT_MS = 12_000;

async function demoRead(path: string, token: string, orgId: string): Promise<unknown> {
  const abort = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        const response = await fetch(path, {
          method: 'GET',
          credentials: 'include',
          headers: { Authorization: `Bearer ${token}`, 'x-organization-id': orgId },
          signal: abort.signal,
        });
        if (!response.ok) throw new Error('Demo read refused');
        return await response.json() as unknown;
      })(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          abort.abort();
          reject(new Error('Demo read timed out'));
        }, DEMO_READ_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export async function verifyDemoAccessReadiness(
  token: string,
  claimedUser: unknown,
  configuredEmail: string,
): Promise<DemoAccessReadiness> {
  const user = claimedUser && typeof claimedUser === 'object' && !Array.isArray(claimedUser)
    ? claimedUser as Record<string, unknown> : null;
  const orgId = typeof user?.organizationId === 'string' ? user.organizationId.trim() : '';
  const accountId = String(user?.id ?? '');
  const accountEmail = typeof user?.email === 'string' ? user.email.trim().toLowerCase() : '';
  if (!token || !/^[1-9]\d*$/.test(orgId) || !accountId || !accountEmail ||
      accountEmail !== configuredEmail.trim().toLowerCase()) {
    return { ready: false, message: 'Demo Access is not connected to the configured demonstration account and organization.' };
  }

  try {
    const session = await demoRead('/api/auth/session', token, orgId) as {
      authenticated?: boolean;
      user?: { id?: unknown; email?: string; organizationId?: unknown; organizationName?: string };
    };
    if (session?.authenticated !== true ||
        String(session.user?.id ?? '') !== accountId ||
        String(session.user?.organizationId ?? '') !== orgId ||
        session.user?.email?.trim().toLowerCase() !== accountEmail ||
        !session.user?.organizationName?.trim()) {
      return { ready: false, message: 'The demo account has no verified organization membership. Demo Access was not opened.' };
    }

    const projects = await demoRead('/api/c2c/projects?limit=1', token, orgId) as {
      data?: unknown;
      meta?: { pendingStore?: boolean; reconciliationRequired?: boolean };
    };
    if (!Array.isArray(projects?.data) || projects.meta?.pendingStore === true ||
        projects.meta?.reconciliationRequired === true) {
      return { ready: false, message: 'Demo project access or provisioning is incomplete. An administrator must repair it before a demonstration.' };
    }
    if (projects.data.length === 0) {
      return { ready: false, message: 'There is no accessible demo project for this account. Prepare the project and its evidence before using Demo Access.' };
    }

    const board = await demoRead('/api/task-management/board', token, orgId) as {
      data?: unknown; meta?: { partial?: boolean; unreadSources?: unknown };
    };
    if (!Array.isArray(board?.data) || board.meta?.partial !== false ||
        !Array.isArray(board.meta?.unreadSources) || board.meta.unreadSources.length > 0) {
      return { ready: false, message: 'Demo Tasking is not fully available. The application needs attention before a customer demonstration.' };
    }
    return { ready: true };
  } catch {
    return { ready: false, message: 'The demo environment could not be verified. No demo session was saved; try again after its configuration is checked.' };
  }
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
