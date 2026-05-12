/**
 * Nano Banana Cost-Control Middleware
 *
 * Guards all /api/nano-banana/* routes with:
 *   1. Per-user rate limiting (configurable by tier)
 *   2. Prompt-based response caching (same prompt = cached image)
 *   3. Tier gating (free users get fewer generations)
 *
 * Stores counts in-memory (swap to Redis for multi-instance).
 */

import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

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

// ─── In-Memory Counters (per user per day) ────────────────────────────────────

interface UserUsage {
  images: number;
  presentations: number;
  date: string; // YYYY-MM-DD
}

// Hard cap on the number of users tracked in-memory. Without this, every new
// anonymous IP (especially before auth attaches a real userId) creates a fresh
// entry and the map grows without bound.
const USAGE_MAP_MAX_USERS = 50_000;
const usageMap = new Map<string, UserUsage>();

function getTodayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function pruneStaleUsage(today: string): void {
  for (const [userId, entry] of usageMap) {
    if (entry.date !== today) usageMap.delete(userId);
  }
}

function evictOldestUsage(): void {
  // Map preserves insertion order; the first key is the least-recently-added.
  const oldest = usageMap.keys().next().value;
  if (oldest !== undefined) usageMap.delete(oldest);
}

function getUserUsage(userId: string): UserUsage {
  const today = getTodayKey();
  let usage = usageMap.get(userId);
  if (!usage || usage.date !== today) {
    if (usageMap.size >= USAGE_MAP_MAX_USERS) {
      // First try cheap pruning of yesterday's entries; if still saturated,
      // evict the oldest entry to make room for this one.
      pruneStaleUsage(today);
      if (usageMap.size >= USAGE_MAP_MAX_USERS) evictOldestUsage();
    }
    usage = { images: 0, presentations: 0, date: today };
    usageMap.set(userId, usage);
  }
  return usage;
}

// ─── Prompt Cache (LRU-style, in-memory) ──────────────────────────────────────

interface CachedResult {
  data: any;
  createdAt: number;
}

const promptCache = new Map<string, CachedResult>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_CACHE_SIZE = 500;

function cacheKey(prompt: string, style?: string, quality?: string): string {
  const raw = `${prompt}|${style || ''}|${quality || ''}`.toLowerCase().trim();
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

function getCached(key: string): any | null {
  const entry = promptCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > CACHE_TTL_MS) {
    promptCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key: string, data: any): void {
  // Evict oldest if over limit
  if (promptCache.size >= MAX_CACHE_SIZE) {
    const firstKey = promptCache.keys().next().value;
    if (firstKey) promptCache.delete(firstKey);
  }
  promptCache.set(key, { data, createdAt: Date.now() });
}

// ─── Rate Limit Middleware ────────────────────────────────────────────────────

export function nanoBananaRateLimit(req: Request, res: Response, next: NextFunction): void {
  // Determine user and tier
  const userId = String((req as any).userId || (req as any).user?.id || req.ip || 'anonymous');
  const userTier = String((req as any).userTier || (req as any).user?.tier || 'free');
  const limits = TIER_LIMITS[userTier] || TIER_LIMITS.free;
  const usage = getUserUsage(userId);

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
  // Only cache GET-like generation requests (POST /generate, POST /chat with image intent)
  if (req.method !== 'POST') return next();
  if (!req.body?.prompt && !req.body?.message) return next();

  const key = cacheKey(
    req.body.prompt || req.body.message || '',
    req.body.style,
    req.body.quality,
  );

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
    cacheSize: promptCache.size,
  };
}
