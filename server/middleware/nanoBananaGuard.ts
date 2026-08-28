/**
 * Nano Banana Cost-Control Middleware
 *
 * Guards all /api/nano-banana/* routes with:
 *   1. Per-user rate limiting (configurable by tier)
 *   2. Response caching (same caller, same request = cached result)
 *   3. Tier gating (free users get fewer generations)
 *
 * Stores counts in-memory (swap to Redis for multi-instance).
 *
 * ── The cross-tenant leak this file used to carry ────────────────────────────
 * The response cache was a process-global Map keyed on
 * `sha256(prompt|style|quality)` with NO tenant scoping, mounted on both
 * POST /generate and POST /chat. Every tenant on the instance shared one
 * bucket, so:
 *
 *   Sponsor A  POST /generate { prompt: "phase 3 readout cover, ACME-401" }
 *   Sponsor B  POST /generate { prompt: "phase 3 readout cover, ACME-401" }
 *              -> X-NanoBanana-Cache: HIT, serving A's response to B.
 *
 * Identity was available the whole time. /api/nano-banana sits behind the
 * global /api auth gate, which sets req.user.organizationId, req.tenantId and
 * req.userId from the verified JWT (server/auth.ts, authMiddleware). The rate
 * limiter in this same file already read req.userId. The cache never looked.
 *
 * On /chat the leak was worse than a repeated image: `conversationHistory` was
 * not in the key either, so a cached entry was a reply computed from ANOTHER
 * caller's conversation and handed to whoever next sent the same `message`
 * string.
 *
 * Three things close it, and all three matter:
 *   1. The key is scoped to the verified organization AND user.
 *   2. The key covers the WHOLE request body, canonicalised — not a hand-picked
 *      field list. `count` and `conversationHistory` were both missing from the
 *      old list; a field-list key re-opens this the next time someone adds a
 *      parameter and forgets to update it here.
 *   3. An unresolvable identity gets NO cache participation — no read, no
 *      write. Falling back to a constant ("anonymous") would rebuild the exact
 *      shared bucket being removed, and would do it precisely when identity is
 *      least certain. Same reasoning, and the same fail-closed shape, as the
 *      CSR analytics cache in routes/csr-intelligence-routes.ts.
 */

import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { getSecureOrgId } from '../utils/tenantContext';

// ─── Rate Limit Config by Tier ────────────────────────────────────────────────

interface TierLimits {
  imagesPerDay: number;
  presentationsPerDay: number;
  maxResolution: '2k' | '4k';
}

const TIER_LIMITS: Record<string, TierLimits> = {
  free:       { imagesPerDay: 5,   presentationsPerDay: 2,   maxResolution: '2k' },
  starter:    { imagesPerDay: 25,  presentationsPerDay: 10,  maxResolution: '2k' },
  professional: { imagesPerDay: 100, presentationsPerDay: 50,  maxResolution: '4k' },
  enterprise: { imagesPerDay: 500, presentationsPerDay: 200, maxResolution: '4k' },
  admin:      { imagesPerDay: 9999, presentationsPerDay: 9999, maxResolution: '4k' },
};

// ─── Verified caller identity ─────────────────────────────────────────────────

/**
 * The verified principal behind a request, or null when one cannot be derived.
 *
 * `organizationId` comes from getSecureOrgId — the repo's canonical accessor,
 * which reads the JWT-derived fields set by auth middleware and deliberately
 * ignores client-supplied `x-organization-id` / `x-org-id` headers (it warns
 * when they disagree). Nothing here may be sourced from the request body,
 * query string or headers: those are attacker-controlled, and a cache key an
 * attacker can choose is a cache an attacker can read out of.
 */
interface CallerIdentity {
  organizationId: string;
  userId: string;
}

function resolveIdentity(req: Request): CallerIdentity | null {
  const organizationId = getSecureOrgId(req);
  if (!organizationId) return null;

  const rawUserId =
    (req as any).userId ??
    (req as any).user?.id ??
    (req as any).user?.userId ??
    (req as any).tenantContext?.userId ??
    null;
  if (rawUserId === null || rawUserId === undefined || String(rawUserId).trim() === '') {
    return null;
  }

  return { organizationId, userId: String(rawUserId) };
}

// ─── In-Memory Counters (per user per day) ────────────────────────────────────

interface UserUsage {
  images: number;
  presentations: number;
  date: string; // YYYY-MM-DD
}

// Hard cap on the number of callers tracked in-memory. Without this,
// every new anonymous IP (especially before auth attaches a real
// userId) creates a fresh entry and the map grows without bound.
const USAGE_MAP_MAX_USERS = 50_000;
const usageMap = new Map<string, UserUsage>();

function getTodayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function pruneStaleUsage(today: string): void {
  for (const [usageKey, entry] of usageMap) {
    if (entry.date !== today) usageMap.delete(usageKey);
  }
}

function evictOldestUsage(): void {
  // Map preserves insertion order; the first key is the least-recently-added.
  const oldest = usageMap.keys().next().value;
  if (oldest !== undefined) usageMap.delete(oldest);
}

function getUserUsage(usageKey: string): UserUsage {
  const today = getTodayKey();
  let usage = usageMap.get(usageKey);
  if (!usage || usage.date !== today) {
    if (usageMap.size >= USAGE_MAP_MAX_USERS) {
      // First try cheap pruning of yesterday's entries; if still
      // saturated, evict the oldest entry to make room for this one.
      pruneStaleUsage(today);
      if (usageMap.size >= USAGE_MAP_MAX_USERS) evictOldestUsage();
    }
    usage = { images: 0, presentations: 0, date: today };
    usageMap.set(usageKey, usage);
  }
  return usage;
}

// ─── Response Cache (in-memory, per organization + user) ──────────────────────

interface CachedResult {
  data: any;
  createdAt: number;
}

const responseCache = new Map<string, CachedResult>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_CACHE_SIZE = 500;

/**
 * Per-entry payload ceiling.
 *
 * Scoping the key to organization + user is correct, and it multiplies the
 * number of distinct keys the map can hold — the old global bucket collapsed
 * every tenant onto one entry per prompt. /chat responses can carry a
 * base64-encoded PPTX, so 500 entries of unbounded size is now a plausible way
 * to exhaust the heap. An oversized payload is served normally and simply not
 * retained.
 */
const MAX_CACHED_PAYLOAD_BYTES = 2 * 1024 * 1024; // 2 MiB serialized

/**
 * Deterministic JSON with recursively sorted object keys.
 *
 * Two requests that differ only in property order are the same request and must
 * land on the same key; two requests that differ in ANY value must not. Express
 * has already JSON-parsed the body, so the input is a plain JSON value — no
 * cycles, no functions, no Dates.
 */
function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    const encoded = JSON.stringify(value);
    return encoded === undefined ? 'null' : encoded;
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const entries = Object.keys(value as Record<string, unknown>)
    .sort()
    .map(k => `${JSON.stringify(k)}:${canonicalize((value as Record<string, unknown>)[k])}`);
  return `{${entries.join(',')}}`;
}

/**
 * Build the cache key for a request, or null when the request must not
 * participate in the cache at all.
 *
 * The key binds four things, each for its own reason:
 *   - organizationId — the tenant boundary. This is the fix.
 *   - userId         — the confidentiality boundary INSIDE a tenant. A hit
 *                      otherwise tells colleague B what colleague A asked for,
 *                      and on /chat hands B a reply built from A's private
 *                      conversation history.
 *   - route          — /generate and /chat take different body shapes and
 *                      return different response shapes; they never share.
 *   - body           — the entire request, canonicalised, so no parameter can
 *                      be silently absent from the key.
 *
 * The digest is not truncated. The previous 16-hex-char (64-bit) prefix left a
 * birthday collision within reach of a determined caller, and a collision here
 * means serving one principal's response to another — the exact failure the key
 * exists to prevent. A full sha256 costs nothing at this call rate.
 */
function buildCacheKey(req: Request): string | null {
  const identity = resolveIdentity(req);
  if (!identity) return null;

  const route = `${req.baseUrl || ''}${req.path || ''}`;
  const material = [
    `org:${identity.organizationId}`,
    `user:${identity.userId}`,
    `method:${req.method}`,
    `route:${route}`,
    `body:${canonicalize(req.body ?? null)}`,
  ].join(' ');

  return crypto.createHash('sha256').update(material).digest('hex');
}

function getCached(key: string): any | null {
  const entry = responseCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > CACHE_TTL_MS) {
    responseCache.delete(key);
    return null;
  }
  return entry.data;
}

/**
 * Drop every entry past its TTL. Cheap at this map size, and it means a burst
 * of new keys evicts dead entries before it evicts live ones.
 */
function pruneExpired(now: number): void {
  for (const [key, entry] of responseCache) {
    if (now - entry.createdAt > CACHE_TTL_MS) responseCache.delete(key);
  }
}

function setCache(key: string, data: any): void {
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(data);
  } catch {
    return; // Not serializable — nothing useful to hand back on a later hit.
  }
  if (typeof serialized !== 'string') return;
  if (Buffer.byteLength(serialized, 'utf8') > MAX_CACHED_PAYLOAD_BYTES) return;

  const now = Date.now();
  if (responseCache.size >= MAX_CACHE_SIZE) {
    pruneExpired(now);
    // Still full: evict oldest-inserted to make room.
    while (responseCache.size >= MAX_CACHE_SIZE) {
      const firstKey = responseCache.keys().next().value;
      if (firstKey === undefined) break;
      responseCache.delete(firstKey);
    }
  }
  responseCache.set(key, { data, createdAt: now });
}

/** Test/maintenance hook: drop every cached response and usage counter. */
export function __clearNanoBananaState(): void {
  responseCache.clear();
  usageMap.clear();
}

// ─── Rate Limit Middleware ────────────────────────────────────────────────────

export function nanoBananaRateLimit(req: Request, res: Response, next: NextFunction): void {
  // Determine caller and tier.
  //
  // The IP fallback is deliberate HERE and deliberately absent from the cache
  // key. Collapsing several unidentified callers onto one counter only ever
  // over-restricts them, which is the safe direction for a quota. Collapsing
  // them onto one CACHE key hands them each other's responses, which is not.
  const identity = resolveIdentity(req);
  const usageKey = identity
    ? `org:${identity.organizationId}|user:${identity.userId}`
    : `ip:${req.ip || 'anonymous'}`;
  const userTier = String((req as any).userTier || (req as any).user?.tier || 'free');
  const limits = TIER_LIMITS[userTier] || TIER_LIMITS.free;
  const usage = getUserUsage(usageKey);

  const isPresentation = req.path.includes('/presentation');
  const isChat = req.path.includes('/chat');
  const isImage = req.path.includes('/generate') || req.path.includes('/edit');

  // Check limits
  if (isPresentation) {
    if (usage.presentations >= limits.presentationsPerDay) {
      res.status(429).json({
        error: 'Daily presentation limit reached',
        limit: limits.presentationsPerDay,
        used: usage.presentations,
        tier: userTier,
        upgradeHint: userTier === 'free' ? 'Upgrade to Starter for 10 presentations/day' : undefined,
      });
      return;
    }
    usage.presentations++;
  } else if (isImage || isChat) {
    if (usage.images >= limits.imagesPerDay) {
      res.status(429).json({
        error: 'Daily image generation limit reached',
        limit: limits.imagesPerDay,
        used: usage.images,
        tier: userTier,
        upgradeHint: userTier === 'free' ? 'Upgrade to Starter for 25 images/day' : undefined,
      });
      return;
    }
    usage.images++;
  }

  // Enforce resolution cap
  if (limits.maxResolution === '2k' && req.body?.quality === 'pro') {
    req.body.quality = 'fast'; // downgrade silently
  }

  // Set usage headers for frontend
  res.setHeader('X-NanoBanana-Images-Used', String(usage.images));
  res.setHeader('X-NanoBanana-Images-Limit', String(limits.imagesPerDay));
  res.setHeader('X-NanoBanana-Tier', userTier);

  next();
}

// ─── Cache Middleware (for image generation) ──────────────────────────────────

export function nanoBananaCache(req: Request, res: Response, next: NextFunction): void {
  // Only cache generation requests (POST /generate, POST /chat with image intent)
  if (req.method !== 'POST') return next();
  if (!req.body?.prompt && !req.body?.message) return next();

  // No verified organization + user → no cache participation at all. This is
  // the fail-closed branch; it must never be given a fallback key.
  const key = buildCacheKey(req);
  if (!key) {
    res.setHeader('X-NanoBanana-Cache', 'BYPASS');
    return next();
  }

  const cached = getCached(key);
  if (cached) {
    res.setHeader('X-NanoBanana-Cache', 'HIT');
    res.json(cached);
    return;
  }

  // Monkey-patch res.json to intercept and cache the response
  const originalJson = res.json.bind(res);
  res.json = function (body: any) {
    if (res.statusCode === 200 && body?.success !== false) {
      setCache(key, body);
    }
    res.setHeader('X-NanoBanana-Cache', 'MISS');
    return originalJson(body);
  } as any;

  next();
}

// ─── Usage Stats Endpoint (for admin dashboard) ──────────────────────────────

export function getUsageStats(): { totalUsers: number; todayGenerations: number; cacheSize: number } {
  const today = getTodayKey();
  let totalImages = 0;
  let totalPresentations = 0;
  let activeUsers = 0;
  for (const [, usage] of usageMap) {
    if (usage.date === today) {
      totalImages += usage.images;
      totalPresentations += usage.presentations;
      activeUsers++;
    }
  }
  return {
    totalUsers: activeUsers,
    todayGenerations: totalImages + totalPresentations,
    // Aggregate count only — never key material or payloads.
    cacheSize: responseCache.size,
  };
}
