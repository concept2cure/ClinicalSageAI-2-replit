/**
 * Distributed Lock Service
 *
 * Prevents concurrent mutations on the same entity across multiple server
 * instances. Uses Redis SET NX EX (atomic lock acquisition with TTL).
 *
 * Falls back to in-memory Map when Redis is unavailable (single-node safe).
 */

import { getRedisClient } from './redis-manager';
import { createScopedLogger } from '../../utils/logger';

const logger = createScopedLogger('distributed-lock');

// ---------------------------------------------------------------------------
// In-memory fallback
// ---------------------------------------------------------------------------

const memoryLocks = new Map<string, { owner: string; expiresAt: number }>();

function memoryAcquire(key: string, owner: string, ttlMs: number): boolean {
  const existing = memoryLocks.get(key);
  if (existing && existing.expiresAt > Date.now()) {
    return false; // Already locked
  }
  memoryLocks.set(key, { owner, expiresAt: Date.now() + ttlMs });
  return true;
}

function memoryRelease(key: string, owner: string): boolean {
  const existing = memoryLocks.get(key);
  if (!existing) return false;
  // Allow release if: owner matches, OR lock has already expired
  if (existing.owner !== owner && existing.expiresAt > Date.now()) return false;
  memoryLocks.delete(key);
  return true;
}

// Periodic cleanup of expired in-memory locks
setInterval(() => {
  const now = Date.now();
  for (const [key, lock] of memoryLocks) {
    if (lock.expiresAt <= now) memoryLocks.delete(key);
  }
}, 10_000).unref();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const KEY_PREFIX = 'csai:lock:';

export interface LockHandle {
  key: string;
  owner: string;
  release: () => Promise<boolean>;
}

/**
 * Acquire a distributed lock.
 *
 * @param resource - Lock name (e.g. "document:42", "artifact:abc")
 * @param owner    - Unique owner ID (e.g. actionId)
 * @param ttlMs    - Lock TTL in ms (default 30s, max 120s)
 * @returns LockHandle if acquired, null if contention
 */
export async function acquireLock(
  resource: string,
  owner: string,
  ttlMs = 30_000
): Promise<LockHandle | null> {
  const key = `${KEY_PREFIX}${resource}`;
  const ttlSec = Math.min(Math.ceil(ttlMs / 1000), 120);

  const redis = getRedisClient();

  if (redis) {
    try {
      // SET key owner NX EX ttlSec — atomic acquire
      const result = await redis.set(key, owner, 'EX', ttlSec, 'NX');
      if (result !== 'OK') {
        logger.debug(`Lock contention on ${resource}`, { owner });
        return null;
      }
    } catch (err: any) {
      logger.warn(`Redis lock failed, falling back to memory`, { error: err.message });
      if (!memoryAcquire(key, owner, ttlMs)) return null;
    }
  } else {
    if (!memoryAcquire(key, owner, ttlMs)) return null;
  }

  return {
    key,
    owner,
    release: () => releaseLock(resource, owner),
  };
}

/**
 * Release a distributed lock. Only the owner can release.
 */
export async function releaseLock(resource: string, owner: string): Promise<boolean> {
  const key = `${KEY_PREFIX}${resource}`;
  const redis = getRedisClient();

  if (redis) {
    try {
      // Lua script for atomic compare-and-delete
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;
      const result = await redis.eval(script, 1, key, owner);
      return result === 1;
    } catch (err: any) {
      logger.warn(`Redis unlock failed`, { error: err.message });
      return memoryRelease(key, owner);
    }
  }

  return memoryRelease(key, owner);
}

/**
 * Execute a function while holding a lock. Auto-releases on completion.
 *
 * @throws Error if lock cannot be acquired (contention)
 */
export async function withLock<T>(
  resource: string,
  owner: string,
  fn: () => Promise<T>,
  ttlMs = 30_000
): Promise<T> {
  const lock = await acquireLock(resource, owner, ttlMs);
  if (!lock) {
    throw new Error(`Failed to acquire lock on '${resource}' — concurrent operation in progress`);
  }

  try {
    return await fn();
  } finally {
    await lock.release();
  }
}
