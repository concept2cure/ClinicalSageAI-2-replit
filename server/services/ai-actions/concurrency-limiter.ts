/**
 * Per-Organization Concurrency Limiter
 *
 * Prevents any single tenant from monopolizing server resources by
 * limiting the number of concurrent AI actions per organization.
 *
 * Uses Redis INCR/DECR for distributed counting when available,
 * falls back to in-memory Map for single-node deployments.
 */

import { getRedisClient } from './redis-manager';
import { createScopedLogger } from '../../utils/logger';

const logger = createScopedLogger('concurrency-limiter');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DEFAULT_MAX_CONCURRENT_PER_ORG = 5;
const DEFAULT_MAX_CONCURRENT_GLOBAL = 50;
const REDIS_KEY_PREFIX = 'csai:concurrency:';
const REDIS_KEY_TTL = 120; // 2 minutes — safety TTL to prevent stuck counters

// In-memory fallback
const memoryCounters = new Map<string, number>();
let globalCounter = 0;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ConcurrencySlot {
  orgKey: string;
  release: () => Promise<void>;
}

/**
 * Try to acquire a concurrency slot for the given org.
 * Returns a slot handle if available, null if at limit.
 */
export async function acquireConcurrencySlot(
  organizationId: number,
  maxPerOrg = DEFAULT_MAX_CONCURRENT_PER_ORG,
  maxGlobal = DEFAULT_MAX_CONCURRENT_GLOBAL
): Promise<ConcurrencySlot | null> {
  const orgKey = `org:${organizationId}`;
  const redis = getRedisClient();

  if (redis) {
    return acquireRedis(orgKey, organizationId, maxPerOrg, maxGlobal);
  }
  return acquireMemory(orgKey, maxPerOrg, maxGlobal);
}

// ---------------------------------------------------------------------------
// Redis implementation
// ---------------------------------------------------------------------------

async function acquireRedis(
  orgKey: string,
  organizationId: number,
  maxPerOrg: number,
  maxGlobal: number
): Promise<ConcurrencySlot | null> {
  const redis = getRedisClient()!;
  const redisOrgKey = `${REDIS_KEY_PREFIX}${orgKey}`;
  const redisGlobalKey = `${REDIS_KEY_PREFIX}global`;

  try {
    // Check global limit first
    const globalCount = await redis.get(redisGlobalKey);
    if (globalCount && parseInt(globalCount, 10) >= maxGlobal) {
      logger.warn('Global concurrency limit reached', { current: globalCount, max: maxGlobal });
      return null;
    }

    // Increment org counter atomically
    const orgCount = await redis.incr(redisOrgKey);
    await redis.expire(redisOrgKey, REDIS_KEY_TTL);

    if (orgCount > maxPerOrg) {
      // Over limit — decrement back
      await redis.decr(redisOrgKey);
      logger.warn('Org concurrency limit reached', { organizationId, current: orgCount - 1, max: maxPerOrg });
      return null;
    }

    // Increment global counter
    await redis.incr(redisGlobalKey);
    await redis.expire(redisGlobalKey, REDIS_KEY_TTL);

    return {
      orgKey,
      release: async () => {
        try {
          const pipeline = redis.pipeline();
          pipeline.decr(redisOrgKey);
          pipeline.decr(redisGlobalKey);
          await pipeline.exec();
        } catch (err: any) {
          logger.error('Failed to release Redis concurrency slot', { error: err.message });
        }
      },
    };
  } catch (err: any) {
    logger.warn('Redis concurrency check failed, falling back to memory', { error: err.message });
    return acquireMemory(orgKey, maxPerOrg, maxGlobal);
  }
}

// ---------------------------------------------------------------------------
// In-memory implementation
// ---------------------------------------------------------------------------

function acquireMemory(
  orgKey: string,
  maxPerOrg: number,
  maxGlobal: number
): ConcurrencySlot | null {
  if (globalCounter >= maxGlobal) {
    logger.warn('Global concurrency limit reached (memory)', { current: globalCounter, max: maxGlobal });
    return null;
  }

  const current = memoryCounters.get(orgKey) || 0;
  if (current >= maxPerOrg) {
    logger.warn('Org concurrency limit reached (memory)', { orgKey, current, max: maxPerOrg });
    return null;
  }

  memoryCounters.set(orgKey, current + 1);
  globalCounter++;

  return {
    orgKey,
    release: async () => {
      const c = memoryCounters.get(orgKey) || 1;
      memoryCounters.set(orgKey, Math.max(0, c - 1));
      globalCounter = Math.max(0, globalCounter - 1);
    },
  };
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

export async function getConcurrencyMetrics(): Promise<{
  global: number;
  perOrg: Record<string, number>;
}> {
  const redis = getRedisClient();

  if (redis) {
    try {
      const globalCount = parseInt(await redis.get(`${REDIS_KEY_PREFIX}global`) || '0', 10);
      // Scan for org keys
      const orgCounts: Record<string, number> = {};
      let cursor = '0';
      do {
        const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', `${REDIS_KEY_PREFIX}org:*`, 'COUNT', 100);
        cursor = nextCursor;
        if (keys.length > 0) {
          const values = await redis.mget(...keys);
          keys.forEach((key, i) => {
            const orgId = key.replace(`${REDIS_KEY_PREFIX}`, '');
            orgCounts[orgId] = parseInt(values[i] || '0', 10);
          });
        }
      } while (cursor !== '0');

      return { global: globalCount, perOrg: orgCounts };
    } catch {
      // Fall through to memory
    }
  }

  const perOrg: Record<string, number> = {};
  for (const [key, count] of memoryCounters) {
    if (count > 0) perOrg[key] = count;
  }
  return { global: globalCounter, perOrg };
}
