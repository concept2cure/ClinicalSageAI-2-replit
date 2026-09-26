/**
 * Inactivity logoff and an absolute session lifetime (security audit
 * 2026-09-24, IAM-06; plan P1-1; Annex 11 §12, 21 CFR 11.10(d), HIPAA
 * §164.312(a)(2)(iii)).
 *
 * A session is the pair of tokens a sign-in mints. Both carry the same claims:
 * `sid`, the session id, kept through every refresh and rotation; `sst`, the
 * second the sign-in happened; `idl`, the idle window in seconds, fixed at
 * sign-in from the tenant's `settings.security.sessionTimeoutMinutes`
 * (DEFAULT_IDLE_MINUTES when the tenant has not set one).
 *
 * Every authenticated request records the session's activity. A request that
 * finds the session idle for longer than its window is refused, and so is a
 * refresh: a refresh is not activity, so a client whose user walked away
 * cannot renew its way past the window. A session older than
 * ABSOLUTE_SESSION_HOURS is refused whatever its activity.
 *
 * Activity lives in Redis (shared by every task), with an in-memory tier
 * behind it, the shape token-revocation.ts uses. A session with no record is
 * measured from its token's issue, so a task that has never seen a session
 * still refuses one whose token is older than the window; a request that
 * finds Redis away records in memory and the session stays alive on that task.
 * Production runs Redis (plan P1-3).
 *
 * Tokens minted before this change carry no `sid`. Their activity is keyed by
 * the token itself, and their refresh tokens can be checked for their lifetime
 * only, until they expire (seven days at most).
 */
import { createHash, randomUUID } from 'crypto';

import { createScopedLogger } from '../utils/logger';

const log = createScopedLogger('session-inactivity');

export const DEFAULT_IDLE_MINUTES = 15;
export const MIN_IDLE_MINUTES = 1;
export const MAX_IDLE_MINUTES = 24 * 60;
export const ABSOLUTE_SESSION_HOURS = 12;

const REDIS_KEY_PREFIX = 'c2c:session-seen:';
const MEMORY_CAP = 50_000;

export type SessionInactivityReason = 'idle' | 'lifetime';

export const SESSION_IDLE_MESSAGE = 'Signed out after a period of inactivity. Sign in again.';
export const SESSION_LIFETIME_MESSAGE = 'This session reached its time limit. Sign in again.';

/** The claims a sign-in mints into both its tokens. */
export interface SessionClaims {
  /** Session id, shared by the access and refresh token and carried through every rotation. */
  sid: string;
  /** Session start, whole seconds since the epoch. */
  sst: number;
  /** Idle window, whole seconds, fixed at sign-in from the tenant's setting. */
  idl: number;
}

interface SessionClaimLike {
  sid?: unknown;
  sst?: unknown;
  idl?: unknown;
  iat?: unknown;
}

function wholeSeconds(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : null;
}

function claimsOf(claims: unknown): SessionClaimLike {
  return claims && typeof claims === 'object' ? (claims as SessionClaimLike) : {};
}

/** The tenant's idle window in seconds from its settings object, clamped; the default when unset. */
export function idleWindowSecondsOf(settings: unknown): number {
  const security = (settings as { security?: { sessionTimeoutMinutes?: unknown } } | null | undefined)?.security;
  const minutes = security?.sessionTimeoutMinutes;
  if (typeof minutes !== 'number' || !Number.isFinite(minutes)) return DEFAULT_IDLE_MINUTES * 60;
  return Math.min(MAX_IDLE_MINUTES, Math.max(MIN_IDLE_MINUTES, Math.floor(minutes))) * 60;
}

/** The idle window a token carries, else the default. */
export function idleWindowSecondsOfClaims(claims: unknown): number {
  const idl = wholeSeconds(claimsOf(claims).idl);
  return idl !== null && idl >= MIN_IDLE_MINUTES * 60 && idl <= MAX_IDLE_MINUTES * 60 ? idl : DEFAULT_IDLE_MINUTES * 60;
}

/** A new session, at sign-in. */
export function newSessionClaims(organizationSettings?: unknown, now: number = Date.now()): SessionClaims {
  return { sid: randomUUID(), sst: Math.floor(now / 1000), idl: idleWindowSecondsOf(organizationSettings) };
}

/**
 * The same session, carried into the tokens a refresh or rotation mints. A
 * token minted before sessions had ids starts its clock at its own issue.
 */
export function continuedSessionClaims(claims: unknown, now: number = Date.now()): SessionClaims {
  const c = claimsOf(claims);
  return {
    sid: typeof c.sid === 'string' && c.sid ? c.sid : randomUUID(),
    sst: wholeSeconds(c.sst) ?? wholeSeconds(c.iat) ?? Math.floor(now / 1000),
    idl: idleWindowSecondsOfClaims(c),
  };
}

/** The activity key: the session id, else (a token minted before sessions had ids) the token itself. */
export function sessionKeyOf(token: string, claims: unknown): string {
  const sid = claimsOf(claims).sid;
  return typeof sid === 'string' && sid ? `sid:${sid}` : `tok:${createHash('sha256').update(token).digest('hex')}`;
}

/** The second the session began: `sst`, else the token's own issue, else null. */
export function sessionStartSecondsOf(claims: unknown): number | null {
  const c = claimsOf(claims);
  return wholeSeconds(c.sst) ?? wholeSeconds(c.iat);
}

/** Whether the session is older than ABSOLUTE_SESSION_HOURS. */
export function sessionLifetimeExceeded(claims: unknown, now: number = Date.now()): boolean {
  const start = sessionStartSecondsOf(claims);
  return start !== null && now / 1000 - start > ABSOLUTE_SESSION_HOURS * 3600;
}

export function sessionEndCodeOf(reason: SessionInactivityReason): 'SESSION_IDLE' | 'SESSION_LIFETIME' {
  return reason === 'idle' ? 'SESSION_IDLE' : 'SESSION_LIFETIME';
}

export function sessionEndMessageOf(reason: SessionInactivityReason): string {
  return reason === 'idle' ? SESSION_IDLE_MESSAGE : SESSION_LIFETIME_MESSAGE;
}

// ── Activity store: Redis, then memory ──────────────────────────────────────

const memoryLastSeen = new Map<string, number>();

async function getRedis() {
  try {
    const { getRedisClient, isRedisAvailable } = await import('./ai-actions/redis-manager.js');
    return isRedisAvailable() ? getRedisClient() : null;
  } catch {
    return null;
  }
}

async function readLastSeen(key: string): Promise<number | null> {
  const redis = await getRedis();
  if (redis) {
    try {
      const raw = await redis.get(REDIS_KEY_PREFIX + key);
      if (raw !== null) {
        const seen = Number(raw);
        if (Number.isFinite(seen)) return seen;
      }
    } catch (err) {
      log.warn('Session activity could not be read from Redis; memory tier consulted', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return memoryLastSeen.get(key) ?? null;
}

async function recordActivity(key: string, now: number, idleSeconds: number): Promise<void> {
  memoryLastSeen.delete(key);
  memoryLastSeen.set(key, now);
  if (memoryLastSeen.size > MEMORY_CAP) {
    const oldest = memoryLastSeen.keys().next().value;
    if (oldest !== undefined) memoryLastSeen.delete(oldest);
  }
  const redis = await getRedis();
  if (!redis) return;
  try {
    await redis.set(REDIS_KEY_PREFIX + key, String(now), 'EX', idleSeconds + 60);
  } catch (err) {
    log.warn('Session activity could not be written to Redis; memory tier holds it', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export interface SessionCheckOptions {
  /** False for a check that is not the user acting (a socket's periodic re-check, a rotation). Default true. */
  activity?: boolean;
  /** The clock, for tests. */
  now?: number;
}

/**
 * Why a signed, unexpired access token's session is over, or null. Records
 * this request as the session's activity unless `activity: false`. A session
 * found idle is not touched, so the answer does not change by being asked.
 */
export async function sessionInactivityReason(
  token: string,
  claims: unknown,
  options: SessionCheckOptions = {},
): Promise<SessionInactivityReason | null> {
  const now = options.now ?? Date.now();
  if (sessionLifetimeExceeded(claims, now)) return 'lifetime';
  const c = claimsOf(claims);
  const idleSeconds = idleWindowSecondsOfClaims(c);
  const key = sessionKeyOf(token, c);
  const issued = wholeSeconds(c.iat);
  const lastSeen = (await readLastSeen(key)) ?? (issued !== null ? issued * 1000 : now);
  if (now - lastSeen > idleSeconds * 1000) return 'idle';
  if (options.activity !== false) await recordActivity(key, now, idleSeconds);
  return null;
}

/**
 * The same question for a refresh token. A refresh is never activity. A
 * session with no activity record is measured from its start. A refresh token
 * minted before sessions had ids has nothing to compare with and is checked
 * for its lifetime only.
 */
export async function refreshInactivityReason(claims: unknown, now: number = Date.now()): Promise<SessionInactivityReason | null> {
  if (sessionLifetimeExceeded(claims, now)) return 'lifetime';
  const c = claimsOf(claims);
  if (typeof c.sid !== 'string' || !c.sid) return null;
  const start = wholeSeconds(c.sst) ?? wholeSeconds(c.iat) ?? Math.floor(now / 1000);
  const lastSeen = (await readLastSeen(`sid:${c.sid}`)) ?? start * 1000;
  return now - lastSeen > idleWindowSecondsOfClaims(c) * 1000 ? 'idle' : null;
}

/** Test seam: forget every session's activity held in memory. */
export function resetSessionActivityForTests(): void {
  memoryLastSeen.clear();
}
