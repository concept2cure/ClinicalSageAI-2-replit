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
 * A concurrent-session limit, the tenant's `settings.security.maxConcurrentSessions`
 * (DEFAULT_MAX_CONCURRENT_SESSIONS when unset): every sign-in registers its
 * session against the account, and when the account then holds more sessions
 * than the limit the oldest are superseded. A superseded session's next request
 * and its refresh are refused (SESSION_SUPERSEDED); the marker outlives the
 * session's own lifetime, so nothing revives it. Signing out frees the slot,
 * and a session found idle or past its lifetime frees it too. The registry
 * lives beside the activity store: in Redis, where one atomic script prunes,
 * adds, counts and evicts, so two sign-ins at once cannot both read the same
 * count; and when Redis answers, its decision is the only one, because the
 * memory tier knows just the sessions this task opened and still lists the
 * ones signed out elsewhere. Without Redis each task enforces the limit over
 * the sessions it opened, and production runs Redis (plan P1-3).
 *
 * Tokens minted before this change carry no `sid`. Their activity is keyed by
 * the token itself, their refresh tokens can be checked for their lifetime
 * only, until they expire (seven days at most), and they hold no slot.
 */
import { createHash, randomUUID } from 'crypto';

import { createScopedLogger } from '../utils/logger';

const log = createScopedLogger('session-inactivity');

export const DEFAULT_IDLE_MINUTES = 15;
export const MIN_IDLE_MINUTES = 1;
export const MAX_IDLE_MINUTES = 24 * 60;
export const ABSOLUTE_SESSION_HOURS = 12;
export const DEFAULT_MAX_CONCURRENT_SESSIONS = 5;
export const MIN_MAX_CONCURRENT_SESSIONS = 1;
export const MAX_MAX_CONCURRENT_SESSIONS = 20;

const REDIS_KEY_PREFIX = 'c2c:session-seen:';
const SESSIONS_KEY_PREFIX = 'c2c:user-sessions:';
const SUPERSEDED_KEY_PREFIX = 'c2c:session-superseded:';
const MEMORY_CAP = 50_000;
const LIFETIME_MS = ABSOLUTE_SESSION_HOURS * 3600 * 1000;
/** How long a superseded marker must outlive the sign-in that set it: the session's lifetime, and a minute. */
const SUPERSEDED_TTL_SECONDS = ABSOLUTE_SESSION_HOURS * 3600 + 60;

export type SessionInactivityReason = 'idle' | 'lifetime' | 'superseded';

export const SESSION_IDLE_MESSAGE = 'Signed out after a period of inactivity. Sign in again.';
export const SESSION_LIFETIME_MESSAGE = 'This session reached its time limit. Sign in again.';
export const SESSION_SUPERSEDED_MESSAGE = 'This session was closed when the account signed in elsewhere. Sign in again.';

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
  userId?: unknown;
  sub?: unknown;
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

/** The tenant's concurrent-session limit from its settings object, clamped; the default when unset. */
export function maxConcurrentSessionsOf(settings: unknown): number {
  const security = (settings as { security?: { maxConcurrentSessions?: unknown } } | null | undefined)?.security;
  const limit = security?.maxConcurrentSessions;
  if (typeof limit !== 'number' || !Number.isFinite(limit)) return DEFAULT_MAX_CONCURRENT_SESSIONS;
  return Math.min(MAX_MAX_CONCURRENT_SESSIONS, Math.max(MIN_MAX_CONCURRENT_SESSIONS, Math.floor(limit)));
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

export function sessionEndCodeOf(reason: SessionInactivityReason): 'SESSION_IDLE' | 'SESSION_LIFETIME' | 'SESSION_SUPERSEDED' {
  if (reason === 'idle') return 'SESSION_IDLE';
  return reason === 'lifetime' ? 'SESSION_LIFETIME' : 'SESSION_SUPERSEDED';
}

export function sessionEndMessageOf(reason: SessionInactivityReason): string {
  if (reason === 'idle') return SESSION_IDLE_MESSAGE;
  return reason === 'lifetime' ? SESSION_LIFETIME_MESSAGE : SESSION_SUPERSEDED_MESSAGE;
}

/** The session id a token carries, else null. */
function sidOf(claims: SessionClaimLike): string | null {
  return typeof claims.sid === 'string' && claims.sid ? claims.sid : null;
}

/** The account a token names, as the registry keys it, else null. */
function accountKeyOf(claims: SessionClaimLike): string | null {
  const id = claims.userId ?? claims.sub;
  return typeof id === 'string' || typeof id === 'number' ? String(id) : null;
}

// ── Activity store and session registry: Redis, then memory ─────────────────

const memoryLastSeen = new Map<string, number>();
/** account → session id → session start (ms). */
const memoryUserSessions = new Map<string, Map<string, number>>();
/** superseded session id → the marker's expiry (ms). */
const memorySuperseded = new Map<string, number>();

interface RedisLike {
  get(key: string): Promise<string | null>;
  mget(...keys: string[]): Promise<(string | null)[]>;
  set(key: string, value: string, mode: 'EX', seconds: number): Promise<unknown>;
  zrem(key: string, ...members: string[]): Promise<unknown>;
  eval(script: string, numKeys: number, ...args: (string | number)[]): Promise<unknown>;
}

/**
 * Register one session and decide the evictions in one step on the Redis
 * side. KEYS[1] the account's sorted set (score: session start, ms);
 * ARGV: the lifetime cutoff (ms), the session's start (ms), its id, the key's
 * TTL (s), the limit. Returns the ids the limit ends, oldest first, never the
 * one just registered.
 */
const REGISTER_SCRIPT = `
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
redis.call('ZADD', KEYS[1], ARGV[2], ARGV[3])
redis.call('EXPIRE', KEYS[1], ARGV[4])
local excess = redis.call('ZCARD', KEYS[1]) - tonumber(ARGV[5])
if excess <= 0 then return {} end
local oldest = redis.call('ZRANGE', KEYS[1], 0, excess)
local evicted = {}
for _, id in ipairs(oldest) do
  if id ~= ARGV[3] and #evicted < excess then evicted[#evicted + 1] = id end
end
if #evicted > 0 then redis.call('ZREM', KEYS[1], unpack(evicted)) end
return evicted
`;

async function getRedis(): Promise<RedisLike | null> {
  try {
    const { getRedisClient, isRedisAvailable } = await import('./ai-actions/redis-manager.js');
    return isRedisAvailable() ? (getRedisClient() as unknown as RedisLike | null) : null;
  } catch {
    return null;
  }
}

function memorySupersededHas(sid: string, now: number): boolean {
  const expires = memorySuperseded.get(sid);
  if (expires === undefined) return false;
  if (expires > now) return true;
  memorySuperseded.delete(sid);
  return false;
}

interface SessionState {
  lastSeen: number | null;
  superseded: boolean;
}

/**
 * The session's last recorded activity and whether a later sign-in superseded
 * it: one Redis round trip, the memory tier when Redis is away or fails. The
 * memory tier's superseded marker counts either way, so a task that ended the
 * session refuses it whatever Redis says.
 */
async function readSessionState(key: string, sid: string | null, now: number): Promise<SessionState> {
  const state: SessionState = { lastSeen: memoryLastSeen.get(key) ?? null, superseded: sid !== null && memorySupersededHas(sid, now) };
  const redis = await getRedis();
  if (!redis) return state;
  try {
    const [seenRaw, supersededRaw] = sid
      ? await redis.mget(REDIS_KEY_PREFIX + key, SUPERSEDED_KEY_PREFIX + sid)
      : [await redis.get(REDIS_KEY_PREFIX + key), null];
    if (seenRaw !== null) {
      const seen = Number(seenRaw);
      if (Number.isFinite(seen)) state.lastSeen = seen;
    }
    if (supersededRaw !== null) state.superseded = true;
  } catch (err) {
    log.warn('Session state could not be read from Redis; memory tier consulted', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return state;
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

function capMap<V>(map: Map<string, V>): void {
  if (map.size <= MEMORY_CAP) return;
  const oldest = map.keys().next().value;
  if (oldest !== undefined) map.delete(oldest);
}

/** Register in memory; returns the sessions the limit ends, oldest first, never the one registered. */
function memoryRegister(account: string, sid: string, startedMs: number, limit: number, now: number): string[] {
  let sessions = memoryUserSessions.get(account);
  if (!sessions) {
    sessions = new Map();
    memoryUserSessions.set(account, sessions);
    capMap(memoryUserSessions);
  }
  for (const [id, started] of sessions) if (now - started > LIFETIME_MS) sessions.delete(id);
  sessions.set(sid, startedMs);
  const excess = sessions.size - limit;
  if (excess <= 0) return [];
  const evicted = [...sessions.entries()]
    .filter(([id]) => id !== sid)
    .sort((a, b) => a[1] - b[1])
    .slice(0, excess)
    .map(([id]) => id);
  for (const id of evicted) sessions.delete(id);
  return evicted;
}

/** The same in Redis, shared by every task, as one atomic script; null when Redis is away or fails. */
async function redisRegister(account: string, sid: string, startedMs: number, limit: number, now: number): Promise<string[] | null> {
  const redis = await getRedis();
  if (!redis) return null;
  try {
    const evicted = await redis.eval(
      REGISTER_SCRIPT,
      1,
      SESSIONS_KEY_PREFIX + account,
      String(now - LIFETIME_MS),
      String(startedMs),
      sid,
      String(SUPERSEDED_TTL_SECONDS),
      String(limit),
    );
    return Array.isArray(evicted) ? evicted.filter((id): id is string => typeof id === 'string' && id !== sid) : [];
  } catch (err) {
    log.warn('Session registry could not be written to Redis; memory tier holds it', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

async function markSuperseded(sids: string[], now: number): Promise<void> {
  for (const sid of sids) {
    memorySuperseded.set(sid, now + SUPERSEDED_TTL_SECONDS * 1000);
    capMap(memorySuperseded);
  }
  const redis = await getRedis();
  if (!redis || sids.length === 0) return;
  try {
    await Promise.all(sids.map(sid => redis.set(SUPERSEDED_KEY_PREFIX + sid, '1', 'EX', SUPERSEDED_TTL_SECONDS)));
  } catch (err) {
    log.warn('Superseded sessions could not be marked in Redis; memory tier holds them', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Register a session against its account's concurrent-session limit. Returns
 * the session ids the limit ended (the oldest), which are marked superseded so
 * their next request and their refresh are refused. When Redis answers, its
 * decision is the only one; the memory tier is kept current so it can decide
 * for this task when Redis is away.
 */
export async function registerSession(userId: string | number, claims: SessionClaims, limit: number, now: number = Date.now()): Promise<string[]> {
  const account = String(userId);
  const startedMs = claims.sst * 1000;
  const fromMemory = memoryRegister(account, claims.sid, startedMs, limit, now);
  const fromRedis = await redisRegister(account, claims.sid, startedMs, limit, now);
  const evicted = fromRedis ?? fromMemory;
  if (evicted.length > 0) {
    await markSuperseded(evicted, now);
    log.info('Sessions ended by a sign-in beyond the account limit', { account, limit, ended: evicted.length });
  }
  return evicted;
}

/** Free a session's slot: at sign-out, and when a session is found over. */
export async function unregisterSession(userId: unknown, sid: unknown): Promise<void> {
  if ((typeof userId !== 'string' && typeof userId !== 'number') || typeof sid !== 'string' || !sid) return;
  const account = String(userId);
  memoryUserSessions.get(account)?.delete(sid);
  const redis = await getRedis();
  if (!redis) return;
  try {
    await redis.zrem(SESSIONS_KEY_PREFIX + account, sid);
  } catch (err) {
    log.warn('Session could not be removed from the Redis registry', { error: err instanceof Error ? err.message : String(err) });
  }
}

/**
 * A new session at sign-in: its claims, registered against the account's
 * limit read from the same settings as its idle window. The one door every
 * sign-in mints through (routes/__tests__/session-open-contract.test.ts).
 */
export async function openSession(userId: string | number, organizationSettings?: unknown, now: number = Date.now()): Promise<SessionClaims> {
  const claims = newSessionClaims(organizationSettings, now);
  await registerSession(userId, claims, maxConcurrentSessionsOf(organizationSettings), now);
  return claims;
}

export interface SessionCheckOptions {
  /** False for a check that is not the user acting (a socket's periodic re-check, a rotation). Default true. */
  activity?: boolean;
  /** The clock, for tests. */
  now?: number;
}

/** A session found over frees its slot; the answer itself is unchanged by it. */
function ended(reason: SessionInactivityReason, c: SessionClaimLike): SessionInactivityReason {
  if (reason !== 'superseded') void unregisterSession(accountKeyOf(c), sidOf(c));
  return reason;
}

/**
 * Why a signed, unexpired access token's session is over, or null. Records
 * this request as the session's activity unless `activity: false`. A session
 * found over is not touched, so the answer does not change by being asked.
 */
export async function sessionInactivityReason(
  token: string,
  claims: unknown,
  options: SessionCheckOptions = {},
): Promise<SessionInactivityReason | null> {
  const now = options.now ?? Date.now();
  const c = claimsOf(claims);
  if (sessionLifetimeExceeded(c, now)) return ended('lifetime', c);
  const idleSeconds = idleWindowSecondsOfClaims(c);
  const key = sessionKeyOf(token, c);
  const state = await readSessionState(key, sidOf(c), now);
  if (state.superseded) return 'superseded';
  const issued = wholeSeconds(c.iat);
  const lastSeen = state.lastSeen ?? (issued !== null ? issued * 1000 : now);
  if (now - lastSeen > idleSeconds * 1000) return ended('idle', c);
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
  const c = claimsOf(claims);
  if (sessionLifetimeExceeded(c, now)) return ended('lifetime', c);
  const sid = sidOf(c);
  if (sid === null) return null;
  const start = wholeSeconds(c.sst) ?? wholeSeconds(c.iat) ?? Math.floor(now / 1000);
  const state = await readSessionState(`sid:${sid}`, sid, now);
  if (state.superseded) return 'superseded';
  return now - (state.lastSeen ?? start * 1000) > idleWindowSecondsOfClaims(c) * 1000 ? ended('idle', c) : null;
}

/** Test seam: forget every session's activity, registration and marker held in memory. */
export function resetSessionActivityForTests(): void {
  memoryLastSeen.clear();
  memoryUserSessions.clear();
  memorySuperseded.clear();
}
