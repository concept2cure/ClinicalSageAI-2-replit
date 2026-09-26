/**
 * The server's three "your session is over on its own account" answers, and
 * the one place the client keeps the reason until the sign-in page can show it
 * (security audit 2026-09-24, IAM-06; plan P1-1).
 *
 * `SESSION_IDLE`, `SESSION_LIFETIME` and `SESSION_SUPERSEDED` (a later sign-in
 * beyond the account's concurrent-session limit) come from every authenticator
 * and from the refresh (`server/services/session-inactivity.ts`). A refresh
 * will not mint past them, so the fetch wrappers end the session rather than retry.
 * `lib/queryClient.ts` cannot import the auth service without a cycle, so it
 * announces the end on `window` and the auth provider listens.
 */
export type SessionEndReason = 'idle' | 'lifetime' | 'superseded';

const CODES: Record<string, SessionEndReason> = { SESSION_IDLE: 'idle', SESSION_LIFETIME: 'lifetime', SESSION_SUPERSEDED: 'superseded' };

/** The reason an error code names, else null. */
export function sessionEndReasonOf(code: unknown): SessionEndReason | null {
  return typeof code === 'string' ? (CODES[code] ?? null) : null;
}

/** The reason a 401 response names, else null. Reads a clone; the caller's body is untouched. */
export async function sessionEndReasonOfResponse(response: Response): Promise<SessionEndReason | null> {
  if (response.status !== 401) return null;
  try {
    const body = (await response.clone().json()) as { code?: unknown; error?: { code?: unknown } | unknown } | null;
    const nested = body && typeof body.error === 'object' && body.error !== null ? (body.error as { code?: unknown }).code : undefined;
    return sessionEndReasonOf(nested) ?? sessionEndReasonOf(body?.code);
  } catch {
    return null;
  }
}

const REASON_KEY = 'trialsage_signout_reason';

/** Keep the reason for the sign-in page. Storage may be unavailable; then nothing is kept. */
export function rememberSignOutReason(reason: SessionEndReason): void {
  try {
    sessionStorage.setItem(REASON_KEY, reason);
  } catch {
    /* no storage: the sign-in page shows no notice */
  }
}

/** Read the reason once; the next read finds nothing. */
export function takeSignOutReason(): SessionEndReason | null {
  try {
    const raw = sessionStorage.getItem(REASON_KEY);
    if (raw !== null) sessionStorage.removeItem(REASON_KEY);
    return raw === 'idle' || raw === 'lifetime' || raw === 'superseded' ? raw : null;
  } catch {
    return null;
  }
}

export const SESSION_ENDED_EVENT = 'c2c:session-ended';

export interface SessionEndedDetail {
  reason: SessionEndReason;
}

/** Keep the reason and tell the auth provider, from code that cannot import it. */
export function announceSessionEnded(reason: SessionEndReason): void {
  rememberSignOutReason(reason);
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<SessionEndedDetail>(SESSION_ENDED_EVENT, { detail: { reason } }));
}
