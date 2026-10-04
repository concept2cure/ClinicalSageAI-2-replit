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
 * Activity, the account's session registry and the superseded markers live in
 * Postgres (session_activity, migrations/20261001e_session_activity.sql),
 * which every server process shares; production runs no Redis (decision B6,
 * 2026-10-01). Until then they lived in each process's memory, and a process
 * that had not seen a session measured it from its token's issue — so every
 * deploy signed out everyone who had signed in more than the idle window ago,
 * a session the limit ended kept working on the other task, and the limit
 * counted per task (U20). A session with no record is still measured from its
 * token's issue. Memory is the fallback when the store cannot be reached: the
 * session is then judged by what this process has seen, as before.
 *
 * A concurrent-session limit, the tenant's `settings.security.maxConcurrentSessions`
 * (DEFAULT_MAX_CONCURRENT_SESSIONS when unset): every sign-in registers its
 * session against the account, and when the account then holds more sessions
 * than the limit the oldest are superseded. A superseded session's next request
 * and its refresh are refused (SESSION_SUPERSEDED); the marker outlives the
 * session's own lifetime, so nothing revives it. Signing out frees the slot,
 * and a session found idle or past its lifetime frees it too. Registration is
 * one transaction under a per-account advisory lock, so two sign-ins at once
 * cannot both read the same count; when the store answers, its decision is the
 * only one.
 *
 * A connector access token (mcp/auth/platform-token.ts) is a session too,
 * opened through openConnectorSession (plan P1-38): the same claims,
 * registration and lifetime rule, with the connector's own idle policy and its
 * own pool, both explained at that function.
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
/** The `token_use` a connector access token carries (mcp/auth/platform-token.ts); its sessions hold slots in the account's connector pool. */
export const CONNECTOR_TOKEN_USE = 'mcp';

/** Every session_activity row: a session belongs to an account, not one organisation (see the migration). */
const STORE_ORG = 0;
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
  token_use?: unknown;
}

function wholeSeconds(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : null;
}

function claimsOf(claims: unknown): SessionClaimLike {
  return claims && typeof claims === 'object' ? (claims as SessionClaimLike) : {};
}

/** Whole seconds held inside [MIN_IDLE_MINUTES, MAX_IDLE_MINUTES]; the default when the value is not a number. */
function clampIdleSeconds(seconds: unknown): number {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return DEFAULT_IDLE_MINUTES * 60;
  return Math.min(MAX_IDLE_MINUTES * 60, Math.max(MIN_IDLE_MINUTES * 60, Math.floor(seconds)));
}

/** The tenant's idle window in seconds from its settings object, clamped; the default when unset. */
export function idleWindowSecondsOf(settings: unknown): number {
  const security = (settings as { security?: { sessionTimeoutMinutes?: unknown } } | null | undefined)?.security;
  const minutes = security?.sessionTimeoutMinutes;
  if (typeof minutes !== 'number' || !Number.isFinite(minutes)) return DEFAULT_IDLE_MINUTES * 60;
  return clampIdleSeconds(Math.floor(minutes) * 60);
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

/** The registry key of an account's connector sessions: a pool of their own (openConnectorSession). */
function connectorPoolOf(userId: string | number): string {
  return `connector:${userId}`;
}

/** The account a token names, as the registry keys it, else null; a connector token names the account's connector pool. */
function accountKeyOf(claims: SessionClaimLike): string | null {
  const id = claims.userId ?? claims.sub;
  if (typeof id !== 'string' && typeof id !== 'number') return null;
  return claims.token_use === CONNECTOR_TOKEN_USE ? connectorPoolOf(id) : String(id);
}

// ── Activity store and session registry: Postgres, then memory ──────────────

const memoryLastSeen = new Map<string, number>();
/** account → session id → session start (ms). */
const memoryUserSessions = new Map<string, Map<string, number>>();
/** superseded session id → the marker's expiry (ms). */
const memorySuperseded = new Map<string, number>();
/** activity key → when this process last wrote it to the store (ms). */
const memoryLastWritten = new Map<string, number>();

interface StorePool {
  query(text: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>>; rowCount?: number | null }>;
  connect(): Promise<{
    query(text: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
    release(err?: Error): void;
  }>;
}

/**
 * Run against the shared store under the audited system scope (the rows belong
 * to no tenant; the table's policy admits that scope alone). Null when the
 * store cannot be reached: the caller falls back to this process's memory.
 */
async function store<T>(caller: string, fn: (pool: StorePool) => Promise<T>): Promise<T | null> {
  try {
    const [{ getPool }, { runWithSystemTenantScope }] = await Promise.all([
      import('../db/runtime.js'),
      import('../db/tenantStore.js'),
    ]);
    return await runWithSystemTenantScope(`auth:session-activity:${caller}`, () => fn(getPool() as unknown as StorePool));
  } catch (err) {
    log.warn('Session store could not be reached; this process\'s memory decides', {
      caller,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

const ts = (ms: number) => ms / 1000;

/** How often one process writes a session's activity: often enough that another process never misjudges it idle. */
function activityWriteIntervalMs(idleSeconds: number): number {
  return Math.min(30_000, (idleSeconds * 1000) / 4);
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
 * The session's last recorded activity on any process and whether a later
 * sign-in superseded it: one indexed lookup, merged with this process's
 * memory (the later activity, either marker).
 */
async function readSessionState(key: string, sid: string | null, now: number): Promise<SessionState> {
  const state: SessionState = { lastSeen: memoryLastSeen.get(key) ?? null, superseded: sid !== null && memorySupersededHas(sid, now) };
  const row = await store('read', async pool => {
    const { rows } = await pool.query(
      `SELECT (extract(epoch FROM last_seen_at) * 1000)::float8 AS seen, superseded_at IS NOT NULL AS superseded
         FROM session_activity WHERE organization_id = $1 AND session_key = $2`,
      [STORE_ORG, key],
    );
    return rows[0] ?? null;
  });
  if (row) {
    const seen = Number(row.seen);
    if (Number.isFinite(seen) && (state.lastSeen === null || seen > state.lastSeen)) state.lastSeen = seen;
    if (row.superseded === true) state.superseded = true;
  }
  return state;
}

async function recordActivity(key: string, now: number, idleSeconds: number, expiresMs: number): Promise<void> {
  memoryLastSeen.delete(key);
  memoryLastSeen.set(key, now);
  capMap(memoryLastSeen);
  const written = memoryLastWritten.get(key);
  if (written !== undefined && now - written >= 0 && now - written < activityWriteIntervalMs(idleSeconds)) return;
  const ok = await store('activity', async pool => {
    await pool.query(
      `INSERT INTO session_activity (organization_id, session_key, last_seen_at, expires_at)
       VALUES ($1, $2, to_timestamp($3), to_timestamp($4))
       ON CONFLICT (organization_id, session_key) DO UPDATE
         SET last_seen_at = GREATEST(session_activity.last_seen_at, EXCLUDED.last_seen_at),
             expires_at = GREATEST(session_activity.expires_at, EXCLUDED.expires_at)`,
      [STORE_ORG, key, ts(now), ts(expiresMs)],
    );
    return true;
  });
  if (ok) {
    memoryLastWritten.delete(key);
    memoryLastWritten.set(key, now);
    capMap(memoryLastWritten);
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

/**
 * The same in the shared store, for every process's sign-ins: one transaction
 * under a per-account advisory lock prunes what has expired, adds the session,
 * counts the account's live sessions and supersedes the oldest beyond the
 * limit. Null when the store cannot be reached.
 */
async function storeRegister(account: string, sid: string, startedMs: number, limit: number, now: number): Promise<string[] | null> {
  return store('register', async pool => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`session-registry:${account}`]);
      await client.query('DELETE FROM session_activity WHERE organization_id = $1 AND expires_at < to_timestamp($2)', [STORE_ORG, ts(now)]);
      await client.query(
        `INSERT INTO session_activity (organization_id, session_key, account, session_started_at, last_seen_at, expires_at)
         VALUES ($1, $2, $3, to_timestamp($4), to_timestamp($4), to_timestamp($5))
         ON CONFLICT (organization_id, session_key) DO UPDATE
           SET account = EXCLUDED.account, session_started_at = EXCLUDED.session_started_at`,
        [STORE_ORG, `sid:${sid}`, account, ts(startedMs), ts(startedMs + SUPERSEDED_TTL_SECONDS * 1000)],
      );
      const { rows } = await client.query(
        `SELECT session_key FROM session_activity
          WHERE organization_id = $1 AND account = $2 AND superseded_at IS NULL AND expires_at > to_timestamp($3)
          ORDER BY session_started_at ASC, session_key ASC`,
        [STORE_ORG, account, ts(now)],
      );
      const live = rows.map(r => String(r.session_key));
      const excess = live.length - limit;
      const evictedKeys = excess > 0 ? live.filter(k => k !== `sid:${sid}`).slice(0, excess) : [];
      if (evictedKeys.length > 0) {
        await client.query(
          'UPDATE session_activity SET superseded_at = to_timestamp($3) WHERE organization_id = $1 AND session_key = ANY($2::text[])',
          [STORE_ORG, evictedKeys, ts(now)],
        );
      }
      await client.query('COMMIT');
      return evictedKeys.map(k => k.slice('sid:'.length));
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  });
}

function markSupersededInMemory(sids: string[], now: number): void {
  for (const sid of sids) {
    memorySuperseded.set(sid, now + SUPERSEDED_TTL_SECONDS * 1000);
    capMap(memorySuperseded);
  }
}

/**
 * Register a session against its account's concurrent-session limit. Returns
 * the session ids the limit ended (the oldest), which are marked superseded so
 * their next request and their refresh are refused. When the shared store
 * answers, its decision is the only one; the memory tier is kept current so it
 * can decide for this process when the store cannot be reached.
 */
export async function registerSession(userId: string | number, claims: SessionClaims, limit: number, now: number = Date.now()): Promise<string[]> {
  const account = String(userId);
  const startedMs = claims.sst * 1000;
  const fromMemory = memoryRegister(account, claims.sid, startedMs, limit, now);
  const fromStore = await storeRegister(account, claims.sid, startedMs, limit, now);
  const evicted = fromStore ?? fromMemory;
  if (evicted.length > 0) {
    markSupersededInMemory(evicted, now);
    log.info('Sessions ended by a sign-in beyond the account limit', { account, limit, ended: evicted.length });
  }
  return evicted;
}

/** Free a session's slot: at sign-out, and when a session is found over. */
export async function unregisterSession(userId: unknown, sid: unknown): Promise<void> {
  if ((typeof userId !== 'string' && typeof userId !== 'number') || typeof sid !== 'string' || !sid) return;
  const account = String(userId);
  memoryUserSessions.get(account)?.delete(sid);
  await store('unregister', async pool => {
    await pool.query(
      'DELETE FROM session_activity WHERE organization_id = $1 AND session_key = $2 AND account = $3 AND superseded_at IS NULL',
      [STORE_ORG, `sid:${sid}`, account],
    );
  });
}

/**
 * A new session at sign-in: its claims, registered against the account's
 * limit read from the same settings as its idle window. The one door every
 * sign-in mints through; with openConnectorSession below, the only way an
 * access token gets its session (routes/__tests__/session-open-contract.test.ts).
 */
export async function openSession(userId: string | number, organizationSettings?: unknown, now: number = Date.now()): Promise<SessionClaims> {
  const claims = newSessionClaims(organizationSettings, now);
  await registerSession(userId, claims, maxConcurrentSessionsOf(organizationSettings), now);
  return claims;
}

/**
 * A connector access token is a session too (plan P1-38; the IAM-02 / IAM-06
 * residual of the 2026-09-26 lens): the same claims, the same registration
 * and the same lifetime rule as a sign-in, with two differences the
 * connector's semantics require.
 *
 * Its idle window is the token's own TTL, held inside the platform window. A
 * connector is a client acting for a person between tool calls, with no
 * "walked away" to detect; its access token is short (an hour by default) and
 * dies on its own, and renewal is the OAuth refresh grant, itself bounded by
 * the refresh token's TTL, rotation and revocation (mcp/auth/store.ts). So the
 * tenant's window is not imposed on a client that legitimately goes quiet,
 * and the claim states what is true: the token is idle when it has expired.
 *
 * Its sessions hold slots in the account's connector pool, at the tenant's
 * limit, not in the sign-in pool: every refresh mints a new access token and
 * so a new session, and a connector refreshing every hour would otherwise
 * sign the person out of the browser by noon. Beyond the limit the oldest
 * connector token is superseded, as a sign-in's would be.
 *
 * A connector token presented to a platform authenticator is checked like any
 * other token (verifyLiveToken). The connector's own verifier is IAM-02's.
 */
export async function openConnectorSession(
  userId: string | number,
  accessTtlSeconds: number,
  organizationSettings?: unknown,
  now: number = Date.now(),
): Promise<SessionClaims> {
  const claims: SessionClaims = { sid: randomUUID(), sst: Math.floor(now / 1000), idl: clampIdleSeconds(accessTtlSeconds) };
  await registerSession(connectorPoolOf(userId), claims, maxConcurrentSessionsOf(organizationSettings), now);
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
  if (options.activity !== false) {
    const start = sessionStartSecondsOf(c);
    const expiresMs = (start !== null ? start * 1000 : now) + SUPERSEDED_TTL_SECONDS * 1000;
    await recordActivity(key, now, idleSeconds, expiresMs);
  }
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
  memoryLastWritten.clear();
}
