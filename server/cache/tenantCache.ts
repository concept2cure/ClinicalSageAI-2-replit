type CacheKey = string;

type CacheEntry<T> = {
  value: T;
  createdAt: number;
  expiresAt?: number;
};

type CacheStats = {
  hits: number;
  misses: number;
  hitRate: number;
  totalItems: number;
  evictions: number;
};

// Bounded LRU cache: the Map preserves insertion order, so we treat the first
// key as the least-recently-used entry and re-insert on access to mark recency.
const MAX_ENTRIES = 1000;
// A sane default TTL used when callers omit a ttl or pass a non-positive/invalid
// value. Some call sites historically passed a tiny value (e.g. `2`) intending a
// "priority" hint, which would otherwise expire entries almost immediately.
const DEFAULT_TTL_MS = 60_000;
// Minimum meaningful TTL. A sub-second TTL makes a cache entry effectively
// useless and only ever results from a misuse (e.g. the legacy `2` "priority"
// hint), so anything below this floor is treated as "use the default".
const MIN_TTL_MS = 1_000;

const cacheStore = new Map<CacheKey, CacheEntry<unknown>>();
let hits = 0;
let misses = 0;
let evictions = 0;

function buildKey(
  tenantId: number | string,
  entityType: string,
  entityId: number | string
): CacheKey {
  return `${tenantId}:${entityType}:${entityId}`;
}

function isExpired(entry: CacheEntry<unknown>): boolean {
  return entry.expiresAt !== undefined && Date.now() > entry.expiresAt;
}

// Evict least-recently-used entries until the store is within the size cap.
function enforceSizeLimit(): void {
  while (cacheStore.size > MAX_ENTRIES) {
    const lruKey = cacheStore.keys().next().value;
    if (lruKey === undefined) {
      break;
    }
    cacheStore.delete(lruKey);
    evictions += 1;
  }
}

export function storeInCache<T>(
  tenantId: number | string,
  entityType: string,
  entityId: number | string,
  value: T,
  ttlMs?: number
): void {
  // Treat a missing, non-numeric, non-positive, or sub-second ttl as the default
  // TTL rather than as "never expires" (which would leak stale data forever) or
  // an almost-immediate expiry (which would make the entry useless).
  const effectiveTtl =
    typeof ttlMs === 'number' && Number.isFinite(ttlMs) && ttlMs >= MIN_TTL_MS
      ? ttlMs
      : DEFAULT_TTL_MS;

  const entry: CacheEntry<T> = {
    value,
    createdAt: Date.now(),
    expiresAt: Date.now() + effectiveTtl,
  };

  const key = buildKey(tenantId, entityType, entityId);
  // Delete-then-set so the key moves to the most-recently-used position.
  cacheStore.delete(key);
  cacheStore.set(key, entry);
  enforceSizeLimit();
}

export function getFromCache<T>(
  tenantId: number | string,
  entityType: string,
  entityId: number | string
): T | null {
  const key = buildKey(tenantId, entityType, entityId);
  const entry = cacheStore.get(key);

  if (!entry) {
    misses += 1;
    return null;
  }

  if (isExpired(entry)) {
    cacheStore.delete(key);
    evictions += 1;
    misses += 1;
    return null;
  }

  hits += 1;
  // Mark as most-recently-used by re-inserting at the end of the Map.
  cacheStore.delete(key);
  cacheStore.set(key, entry);
  return entry.value as T;
}

export function invalidateCache(
  tenantId: number | string,
  entityType: string,
  entityId: number | string
): void {
  const key = buildKey(tenantId, entityType, entityId);
  if (cacheStore.delete(key)) {
    evictions += 1;
  }
}

export function invalidateTenantCache(tenantId: number | string): void {
  const prefix = `${tenantId}:`;
  for (const key of cacheStore.keys()) {
    if (key.startsWith(prefix)) {
      cacheStore.delete(key);
      evictions += 1;
    }
  }
}

export function getCacheStats(): CacheStats {
  const totalRequests = hits + misses;
  const hitRate = totalRequests > 0 ? (hits / totalRequests) * 100 : 0;

  return {
    hits,
    misses,
    hitRate,
    totalItems: cacheStore.size,
    evictions,
  };
}
