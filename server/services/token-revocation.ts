/**
 * Token Revocation Service
 *
 * Durable token blacklist backed by Redis when available, with in-memory fallback.
 * Replaces the in-memory-only `Set<string>` in auth.ts.
 *
 * Redis is already active in this project (ioredis for rate limiting, queues, locks).
 * This service uses the shared Redis connection from redis-manager.ts.
 *
 * Token TTL: 24 hours (matches JWT expiry). Redis automatically evicts expired entries.
 * Fallback: If Redis is unavailable, uses in-memory Set (same as before, but logs the degradation).
 *
 * @module server/services/token-revocation
 */

import { createScopedLogger } from '../utils/logger';

const log = createScopedLogger('token-revocation');

const REDIS_KEY_PREFIX = 'c2c:revoked:';
const TOKEN_TTL_SECONDS = 24 * 60 * 60; // 24 hours

// In-memory fallback (used when Redis is unavailable)
const memoryBlacklist = new Set<string>();
let memoryFallbackActive = false;

// Track metrics
let revokeCount = 0;
let checkCount = 0;
let redisFails = 0;

/**
 * Get the Redis client if available.
 * Uses dynamic import to avoid hard dependency on redis-manager initialization order.
 */
async function getRedis() {
  try {
    const { getRedisClient, isRedisAvailable } = await import('./ai-actions/redis-manager.js');
    if (isRedisAvailable()) {
      return getRedisClient();
    }
  } catch {
    // Redis not available
  }
  return null;
}

/**
 * Revoke a token (add to blacklist).
 * Writes to Redis with TTL. Falls back to in-memory if Redis unavailable.
 */
export async function revokeToken(token: string): Promise<void> {
  revokeCount++;
  const redis = await getRedis();
  if (redis) {
    try {
      await redis.setex(`${REDIS_KEY_PREFIX}${token}`, TOKEN_TTL_SECONDS, '1');
      memoryFallbackActive = false;
      return;
    } catch (err) {
      redisFails++;
      log.warn('Redis revoke failed, using memory fallback', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  // Fallback to in-memory
  memoryFallbackActive = true;
  memoryBlacklist.add(token);
  // Prevent unbounded growth
  if (memoryBlacklist.size > 10000) {
    memoryBlacklist.clear();
  }
}

/**
 * Check if a token has been revoked.
 * Checks Redis first, then in-memory fallback.
 */
export async function isTokenRevoked(token: string): Promise<boolean> {
  checkCount++;
  const redis = await getRedis();
  if (redis) {
    try {
      const result = await redis.exists(`${REDIS_KEY_PREFIX}${token}`);
      if (result > 0) return true;
    } catch (err) {
      redisFails++;
      log.warn('Redis check failed, checking memory fallback', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  // Also check memory (covers tokens revoked during Redis outage)
  return memoryBlacklist.has(token);
}

/**
 * Synchronous check for backward compatibility.
 * Checks only the in-memory fallback. Prefer isTokenRevoked() for full coverage.
 */
export function isTokenRevokedSync(token: string): boolean {
  return memoryBlacklist.has(token);
}

/**
 * Get revocation service health/metrics.
 */
export async function getRevocationHealth(): Promise<{
  backend: 'redis' | 'memory';
  memoryFallbackActive: boolean;
  memorySize: number;
  revokeCount: number;
  checkCount: number;
  redisFails: number;
}> {
  const redis = await getRedis();
  return {
    backend: redis ? 'redis' : 'memory',
    memoryFallbackActive,
    memorySize: memoryBlacklist.size,
    revokeCount,
    checkCount,
    redisFails,
  };
}

/** Reset metrics (for tests). */
export function resetRevocationMetrics(): void {
  revokeCount = 0;
  checkCount = 0;
  redisFails = 0;
  memoryBlacklist.clear();
  memoryFallbackActive = false;
}
