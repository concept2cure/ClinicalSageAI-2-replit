/**
 * Token Revocation Service — Three-Tier Durable Revocation
 *
 * Priority order:
 *   1. Redis (primary) — fast, TTL-based, survives app restart
 *   2. DB revoked_tokens table (fallback) — survives Redis outage + restart
 *   3. In-memory Set (emergency) — volatile, used only when both Redis and DB are down
 *
 * Writes go to ALL available backends (write-through).
 * Reads check Redis → DB → memory in order, returning on first hit.
 *
 * Redis: ioredis via redis-manager.ts (already active for rate limiting/queues/locks)
 * DB: revoked_tokens table (migration 0015_document_artifact_bridge.sql)
 * Expiry: the later of 24 hours and the token's own `exp` (revocationExpiryFor)
 *
 * @module server/services/token-revocation
 */

import { createHash } from 'crypto';
import jwt from 'jsonwebtoken';
import { createScopedLogger } from '../utils/logger';
import { runWithPreAuthScope } from '../db/tenantStore';
import {
  ACCOUNT_INACTIVE_MESSAGE,
  accountIdOfClaims,
  issuedAtOfClaims,
  readAccountStandingBeforeTenant,
  sessionPredatesPasswordChange,
} from './account-standing';
import { verifyJwtWithRotation, type JwtVerifyOptions } from '../utils/jwtVerify';
import {
  SESSION_IDLE_MESSAGE,
  SESSION_LIFETIME_MESSAGE,
  sessionInactivityReason,
  type SessionCheckOptions,
  type SessionInactivityReason,
} from './session-inactivity';

const log = createScopedLogger('token-revocation');

const REDIS_KEY_PREFIX = 'c2c:revoked:';
/** The floor of a revocation's life: the access token's own 24 hours. */
const TOKEN_TTL_SECONDS = 24 * 60 * 60;

/**
 * When a revocation may lapse: the later of 24 hours and the token's own `exp`.
 *
 * Security audit 2026-09-24, IAM-04 (High): every entry used to live 24 hours,
 * the access token's life, while a refresh token lives 7 days
 * (routes/auth.ts REFRESH_TOKEN_EXPIRES_IN). A refresh token revoked at logout
 * therefore came back to life after a day, for the remaining six. The `exp`
 * claim is decoded, not verified: a token that does not verify is refused
 * before the list is ever consulted, and anything unreadable gets the floor.
 * The memory tier never expires and is unaffected.
 */
export function revocationExpiryFor(token: string, now: number = Date.now()): Date {
  const floor = now + TOKEN_TTL_SECONDS * 1000;
  let expMs: number | null = null;
  try {
    const decoded = jwt.decode(token);
    const exp = decoded && typeof decoded === 'object' ? (decoded as { exp?: unknown }).exp : undefined;
    if (typeof exp === 'number' && Number.isFinite(exp)) expMs = exp * 1000;
  } catch {
    /* not a JWT: the floor applies */
  }
  return new Date(expMs !== null && expMs > floor ? expMs : floor);
}

// Tier 3: In-memory emergency fallback
const memoryBlacklist = new Set<string>();

// Metrics
let revokeCount = 0;
let checkCount = 0;
let redisFails = 0;
let dbFails = 0;
let redisAvailable = false;
let dbAvailable = false;

/** Hash a token for DB storage (don't store raw tokens in the database). */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// ── Backend access ──────────────────────────────────────────────────────────

async function getRedis() {
  try {
    const { getRedisClient, isRedisAvailable } = await import('./ai-actions/redis-manager.js');
    if (isRedisAvailable()) {
      redisAvailable = true;
      return getRedisClient();
    }
  } catch { /* unavailable */ }
  redisAvailable = false;
  return null;
}

async function getPool() {
  try {
    const { pool } = await import('../db.js');
    return pool;
  } catch { /* unavailable */ }
  return null;
}

/**
 * revoked_tokens carries no row-level security and no tenant column: a token is
 * revoked or not, for everyone. The lookup runs where no tenant is known yet
 * (the /api gate checks it before membership is resolved), and under
 * RLS_ENFORCE=on the pool refuses an unscoped query, so every DB check used to
 * fail silently and fall through to this instance's memory set. The pre-auth
 * scope marks the query as intentionally tenant-less and grants no role.
 */
function tenantless<T>(caller: string, fn: () => Promise<T>): Promise<T> {
  return runWithPreAuthScope(`auth:token-revocation-${caller}`, async () => await fn());
}

// ── Write: write-through to all available backends ──────────────────────────

/**
 * Revoke a token. Writes to Redis + DB + memory (write-through).
 * Any backend failure is non-blocking — the token is still revoked in the others.
 */
export async function revokeToken(token: string, reason = 'logout'): Promise<void> {
  revokeCount++;
  const hash = hashToken(token);
  const now = Date.now();
  const expiresAt = revocationExpiryFor(token, now);
  const ttlSeconds = Math.ceil((expiresAt.getTime() - now) / 1000);

  // Always write to memory (guaranteed)
  memoryBlacklist.add(hash);
  if (memoryBlacklist.size > 50000) {
    // Trim oldest entries (Set iteration is insertion-order)
    const iter = memoryBlacklist.values();
    for (let i = 0; i < 10000; i++) iter.next();
    const keep = new Set<string>();
    for (const v of memoryBlacklist) keep.add(v);
    // Actually trim by clearing and re-adding recent
    memoryBlacklist.clear();
    let count = 0;
    for (const v of keep) {
      if (count++ >= 10000) memoryBlacklist.add(v);
    }
  }

  // Tier 1: Redis (async, non-blocking)
  const redis = await getRedis();
  if (redis) {
    try {
      await redis.setex(`${REDIS_KEY_PREFIX}${hash}`, ttlSeconds, '1');
    } catch (err) {
      redisFails++;
      log.warn('Redis revoke failed', { error: err instanceof Error ? err.message : String(err) });
    }
  }

  // Tier 2: DB (async, non-blocking)
  const pool = await getPool();
  if (pool) {
    try {
      await tenantless('write', () =>
        pool.query(
          `INSERT INTO revoked_tokens (token_hash, revoked_at, expires_at, reason)
           VALUES ($1, NOW(), $2, $3)
           ON CONFLICT (token_hash) DO NOTHING`,
          [hash, expiresAt.toISOString(), reason],
        ),
      );
      dbAvailable = true;
    } catch (err) {
      dbFails++;
      dbAvailable = false;
      log.warn('DB revoke failed', { error: err instanceof Error ? err.message : String(err) });
    }
  }
}

// ── Read: check Redis → DB → memory ────────────────────────────────────────

/**
 * Check if a token has been revoked.
 * Checks Redis first, then DB, then in-memory. Returns on first hit.
 */
export async function isTokenRevoked(token: string): Promise<boolean> {
  checkCount++;
  const hash = hashToken(token);

  // Tier 1: Redis
  const redis = await getRedis();
  if (redis) {
    try {
      const result = await redis.exists(`${REDIS_KEY_PREFIX}${hash}`);
      if (result > 0) return true;
    } catch (err) {
      redisFails++;
      log.warn('Redis check failed', { error: err instanceof Error ? err.message : String(err) });
    }
  }

  // Tier 2: DB
  const pool = await getPool();
  if (pool) {
    try {
      const result = await tenantless('check', () =>
        pool.query(`SELECT 1 FROM revoked_tokens WHERE token_hash = $1 AND expires_at > NOW() LIMIT 1`, [hash]),
      );
      dbAvailable = true;
      if (result.rows.length > 0) return true;
    } catch (err) {
      dbFails++;
      dbAvailable = false;
    }
  }

  // Tier 3: Memory (emergency)
  return memoryBlacklist.has(hash);
}

/**
 * A signed, unexpired token whose session is over: it was signed out, its
 * account was taken out of use (suspended or deprovisioned, VSR-001 F-29), or
 * the account's password changed after it was issued (IAM-04). One error for
 * all three, so every caller that already answers a signed-out session with
 * 401 answers the others the same way. A password change is worded as a
 * signed-out session: it is one, from the holder's side.
 */
export type SessionEndedReason = 'signed-out' | 'account-inactive' | 'password-changed' | SessionInactivityReason;

function sessionEndedMessage(reason: SessionEndedReason): string {
  if (reason === 'account-inactive') return ACCOUNT_INACTIVE_MESSAGE;
  if (reason === 'idle') return SESSION_IDLE_MESSAGE;
  if (reason === 'lifetime') return SESSION_LIFETIME_MESSAGE;
  return 'This session has ended. Sign in again.';
}

export class SessionEndedError extends Error {
  readonly reason: SessionEndedReason;
  constructor(reason: SessionEndedReason = 'signed-out') {
    super(sessionEndedMessage(reason));
    this.name = 'SessionEndedError';
    this.reason = reason;
  }
}

/**
 * Verify a bearer token and refuse it when its session was signed out.
 *
 * POST /api/auth/logout revokes the token and answers "Tokens invalidated.",
 * but no authenticator read the revocation list (July 2026 audit, AUTH-03), so
 * a signed-out token kept opening the /api gate, the session check, the users
 * routes and the enterprise route that mints a fresh token from it, for the rest
 * of its 24 hours. Every bearer verification goes through here.
 *
 * Throws what verifyJwtWithRotation throws for a bad or expired token, and
 * SessionEndedError for a revoked one. Callers that already answer 401 for any
 * verification error need no other change.
 *
 * Also SessionEndedError('account-inactive') for a token whose account has been
 * suspended or deprovisioned since it was issued (VSR-001 F-29): the session
 * probe, the users routes, the enterprise routes and the collaboration server
 * all verify here, and each kept serving such an account until the token
 * expired. A standing that cannot be read throws, and the caller refuses.
 *
 * And SessionEndedError('password-changed') for a token issued before the
 * account's last password change (security audit 2026-09-24, IAM-04): a reset
 * or change stamps users.password_changed_at, and until this check no
 * authenticator compared it with the token's iat, so the sessions a holder
 * most needs ended kept working. The standing and the stamp are one read
 * (readAccountStanding).
 *
 * And SessionEndedError('idle' | 'lifetime') for a session idle past its window
 * or older than its lifetime (security audit 2026-09-24, IAM-06; plan P1-1):
 * this verification is recorded as the session's activity unless `session`
 * says it is not the user acting (a socket's periodic re-check, a rotation).
 * The token is revoked on the way out, so every authenticator answers alike.
 */
export async function verifyLiveToken<T = unknown>(
  token: string,
  options?: JwtVerifyOptions,
  session?: SessionCheckOptions,
): Promise<T> {
  const decoded = verifyJwtWithRotation<T>(token, options);
  if (await isTokenRevoked(token)) throw new SessionEndedError();
  const accountId = accountIdOfClaims(decoded);
  if (accountId !== null) {
    const standing = await readAccountStandingBeforeTenant(accountId);
    if (!standing.active) throw new SessionEndedError('account-inactive');
    if (sessionPredatesPasswordChange(issuedAtOfClaims(decoded), standing.passwordChangedAtSeconds)) {
      throw new SessionEndedError('password-changed');
    }
  }
  const inactivity = await sessionInactivityReason(token, decoded, session);
  if (inactivity) {
    await revokeToken(token, inactivity);
    throw new SessionEndedError(inactivity);
  }
  return decoded;
}

/**
 * Synchronous check — memory tier only. Backward compatibility.
 */
export function isTokenRevokedSync(token: string): boolean {
  return memoryBlacklist.has(hashToken(token));
}

// ── Health ──────────────────────────────────────────────────────────────────

export type RevocationBackend = 'redis+db+memory' | 'redis+memory' | 'db+memory' | 'memory_only';

export async function getRevocationHealth(): Promise<{
  backend: RevocationBackend;
  status: 'healthy' | 'degraded' | 'emergency';
  redisAvailable: boolean;
  dbAvailable: boolean;
  memorySize: number;
  revokeCount: number;
  checkCount: number;
  redisFails: number;
  dbFails: number;
}> {
  // Probe backends
  const redis = await getRedis();
  const pool = await getPool();

  let dbOk = false;
  if (pool) {
    try {
      const r = await pool.query(`SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'revoked_tokens') AS ok`);
      dbOk = r.rows[0]?.ok === true;
    } catch { /* unavailable */ }
  }

  let backend: RevocationBackend;
  let status: 'healthy' | 'degraded' | 'emergency';

  if (redis && dbOk) {
    backend = 'redis+db+memory';
    status = 'healthy';
  } else if (redis) {
    backend = 'redis+memory';
    status = 'degraded';
  } else if (dbOk) {
    backend = 'db+memory';
    status = 'degraded';
  } else {
    backend = 'memory_only';
    status = 'emergency';
  }

  return {
    backend,
    status,
    redisAvailable: !!redis,
    dbAvailable: dbOk,
    memorySize: memoryBlacklist.size,
    revokeCount,
    checkCount,
    redisFails,
    dbFails,
  };
}

/** Cleanup expired entries from the DB (call periodically or from a job). */
export async function cleanupExpiredTokens(): Promise<number> {
  const pool = await getPool();
  if (!pool) return 0;
  try {
    const result = await pool.query(`DELETE FROM revoked_tokens WHERE expires_at <= NOW()`);
    return result.rowCount ?? 0;
  } catch {
    return 0;
  }
}

/** Reset metrics (for tests). */
export function resetRevocationMetrics(): void {
  revokeCount = 0;
  checkCount = 0;
  redisFails = 0;
  dbFails = 0;
  memoryBlacklist.clear();
  redisAvailable = false;
  dbAvailable = false;
}
