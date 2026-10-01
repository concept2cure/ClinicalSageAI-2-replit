/**
 * Per-Organization Concurrency Limiter
 *
 * Prevents any single tenant from monopolizing server resources by
 * limiting the number of concurrent AI actions per organization.
 *
 * The per-organisation cap counts every server process's running actions:
 * each action holds a slot lease in Postgres (coordination-leases.ts), in the
 * organisation's own scope. Production runs no Redis (decision B6,
 * 2026-10-01); this was Redis with an in-memory fallback, so there the cap was
 * multiplied by the number of API tasks (U21). The global cap protects this
 * process's own resources, so it stays per process.
 *
 * Falls back to in-memory counting when the store cannot be reached.
 */

import { randomUUID } from 'crypto';
import { acquireSlot, releaseLease } from './coordination-leases';
import { createScopedLogger } from '../../utils/logger';

const logger = createScopedLogger('concurrency-limiter');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DEFAULT_MAX_CONCURRENT_PER_ORG = 5;
const DEFAULT_MAX_CONCURRENT_GLOBAL = 50;
/** A slot lapses on its own after this, so a crashed process never holds one for good. */
const SLOT_TTL_MS = 120_000;

/** This process's running actions, per organisation (metrics, and the fallback cap). */
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
  if (globalCounter >= maxGlobal) {
    logger.warn('Global concurrency limit reached', { current: globalCounter, max: maxGlobal });
    return null;
  }

  const owner = randomUUID();
  const taken = await acquireSlot(organizationId, owner, maxPerOrg, SLOT_TTL_MS);
  if (taken === false) {
    logger.warn('Concurrency limit reached', { organizationId, orgKey });
    return null;
  }
  if (taken === null) return acquireMemory(orgKey, maxPerOrg);

  count(orgKey, +1);
  return {
    orgKey,
    release: async () => {
      count(orgKey, -1);
      const released = await releaseLease(organizationId, `slot:${owner}`, owner);
      if (released === null) logger.warn('Slot could not be released in the store; it lapses on its own', { organizationId });
    },
  };
}

// ---------------------------------------------------------------------------
// In-memory accounting and fallback
// ---------------------------------------------------------------------------

function count(orgKey: string, delta: 1 | -1): void {
  memoryCounters.set(orgKey, Math.max(0, (memoryCounters.get(orgKey) || 0) + delta));
  globalCounter = Math.max(0, globalCounter + delta);
}

function acquireMemory(orgKey: string, maxPerOrg: number): ConcurrencySlot | null {
  const current = memoryCounters.get(orgKey) || 0;
  if (current >= maxPerOrg) {
    logger.warn('Org concurrency limit reached (memory)', { orgKey, current, max: maxPerOrg });
    return null;
  }
  count(orgKey, +1);
  return {
    orgKey,
    release: async () => {
      count(orgKey, -1);
    },
  };
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

/** This process's running actions: in total, and per organisation. */
export async function getConcurrencyMetrics(): Promise<{
  global: number;
  perOrg: Record<string, number>;
}> {
  const perOrg: Record<string, number> = {};
  for (const [key, n] of memoryCounters) {
    if (n > 0) perOrg[key] = n;
  }
  return { global: globalCounter, perOrg };
}
