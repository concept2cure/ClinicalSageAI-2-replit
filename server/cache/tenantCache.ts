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

export function storeInCache<T>(
  tenantId: number | string,
  entityType: string,
  entityId: number | string,
  value: T,
  ttlMs?: number
): void {
  const entry: CacheEntry<T> = {
    value,
    createdAt: Date.now(),
    expiresAt: ttlMs ? Date.now() + ttlMs : undefined,
  };

  cacheStore.set(buildKey(tenantId, entityType, entityId), entry);
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
