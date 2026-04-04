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
 * TTL: 24 hours (matches JWT expiry)
 *
 * @module server/services/token-revocation
 */

import { createHash } from 'crypto';
import { createScopedLogger } from '../utils/logger';

const log = createScopedLogger('token-revocation');

const REDIS_KEY_PREFIX = 'c2c:revoked:';
const TOKEN_TTL_SECONDS = 24 * 60 * 60; // 24 hours

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

// ── Write: write-through to all available backends ──────────────────────────

/**
 * Revoke a token. Writes to Redis + DB + memory (write-through).
 * Any backend failure is non-blocking — the token is still revoked in the others.
 */
export async function revokeToken(token: string, reason = 'logout'): Promise<void> {
  revokeCount++;
  const hash = hashToken(token);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_SECONDS * 1000);

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
      await redis.setex(`${REDIS_KEY_PREFIX}${hash}`, TOKEN_TTL_SECONDS, '1');
    } catch (err) {
      redisFails++;
      log.warn('Redis revoke failed', { error: err instanceof Error ? err.message : String(err) });
    }
  }

  // Tier 2: DB (async, non-blocking)
  const pool = await getPool();
  if (pool) {
    try {
      await pool.query(
        `INSERT INTO revoked_tokens (token_hash, revoked_at, expires_at, reason)
         VALUES ($1, NOW(), $2, $3)
         ON CONFLICT (token_hash) DO NOTHING`,
        [hash, expiresAt.toISOString(), reason],
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
      const result = await pool.query(
        `SELECT 1 FROM revoked_tokens WHERE token_hash = $1 AND expires_at > NOW() LIMIT 1`,
        [hash],
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
