/**
 * Distributed Lock Service
 *
 * Prevents concurrent mutations on the same entity across every server
 * process: a lease in Postgres (coordination-leases.ts), held in the acting
 * organisation's scope. Production runs no Redis (decision B6, 2026-10-01);
 * this was Redis with an in-memory fallback, so there two writes on one
 * target from different API tasks both ran (U21).
 *
 * Falls back to an in-memory Map when the store cannot be reached, or when no
 * organisation is given (this process only).
 */

import { acquireLease, releaseLease } from './coordination-leases';
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
  ttlMs = 30_000,
  organizationId?: number
): Promise<LockHandle | null> {
  const key = `${KEY_PREFIX}${resource}`;
  const leaseMs = Math.min(ttlMs, 120_000);
  const taken = await acquireLease(organizationId, key, owner, leaseMs);
  if (taken === false) {
    logger.debug(`Lock contention on ${resource}`, { owner, organizationId });
    return null;
  }
  if (taken === null && !memoryAcquire(key, owner, leaseMs)) return null;

  return {
    key,
    owner,
    release: () => releaseLock(resource, owner, organizationId),
  };
}

/**
 * Release a distributed lock. Only the owner can release.
 */
export async function releaseLock(resource: string, owner: string, organizationId?: number): Promise<boolean> {
  const key = `${KEY_PREFIX}${resource}`;
  const released = await releaseLease(organizationId, key, owner);
  if (released !== null) {
    memoryRelease(key, owner);
    return released;
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
  ttlMs = 30_000,
  organizationId?: number
): Promise<T> {
  const lock = await acquireLock(resource, owner, ttlMs, organizationId);
  if (!lock) {
    throw new Error(`Failed to acquire lock on '${resource}' — concurrent operation in progress`);
  }

  try {
    return await fn();
  } finally {
    await lock.release();
  }
}
