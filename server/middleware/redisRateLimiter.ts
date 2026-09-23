/**
 * Redis-based Distributed Rate Limiter
 *
 * Enterprise-grade rate limiting for multi-node deployments.
 * Uses Redis for shared state across all server instances.
 *
 * Features:
 * - Sliding window algorithm for smooth rate limiting
 * - Per-user, per-credential, per-organization, and per-IP limits
 * - Configurable rules per endpoint category
 * - Graceful fallback to in-memory when Redis unavailable
 *
 * ── Keyed by credential before auth (VSR-001 F-5, 2026-09-21) ────────────────
 * `createRedisRateLimiter()` is mounted on `/api` by startup/middleware.ts
 * BEFORE the auth boundary, so `req.userId` — the key the generator preferred
 * — was never set when it ran. Every request was keyed by IP at `api`
 * 100/minute, and one browser session (or one office behind a NAT) tripped it
 * during ordinary use.
 *
 * A request this early cannot be verified, but its credential can be SEEN. So:
 *   • a verified identity (`req.userId`, when the limiter runs after auth)
 *     → key `user:<id>`, ceiling `maxRequestsAuthenticated`;
 *   • else a presented bearer credential → key `cred:<sha256 prefix>`,
 *     ceiling `maxRequestsAuthenticated`, AND a second count against
 *     `ipcred:<ip>` at `maxRequestsPerIpAuthenticated`, because an unverified
 *     credential can be minted per request and the guard is what bounds that;
 *   • else → key `ip:<ip>`, ceiling `maxRequests`. Nothing anonymous got looser.
 * A bucket that declares no authenticated ceiling is keyed the same way at
 * its one ceiling. The numbers and their reasoning live in
 * server/config/platform-limits.ts.
 *
 * @module server/middleware/redisRateLimiter
 * @version 1.0.0
 */

import { createHash } from 'node:crypto';
import { Request, Response, NextFunction } from 'express';
import Redis from 'ioredis';
import { createScopedLogger } from '../utils/logger';
import {
  RATE_LIMITS,
  RATE_LIMIT_FAIL_CLOSED_CATEGORIES,
  RATE_LIMIT_STORE,
  REDIS,
} from '../config/platform-limits';

const logger = createScopedLogger('redis-rate-limiter');

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface RateLimitRule {
  /** Time window in milliseconds */
  windowMs: number;
  /** Maximum requests allowed in window, per IP, for traffic presenting no identity */
  maxRequests: number;
  /** Ceiling for ONE identity (verified user id, or presented credential). Absent → `maxRequests`. */
  maxRequestsAuthenticated?: number;
  /** Ceiling for ALL credentialed traffic from one IP (bounds credential rotation). Absent → no guard. */
  maxRequestsPerIpAuthenticated?: number;
  /** Message to return when rate limited */
  message: string;
  /** Optional: skip limit for certain roles */
  skipRoles?: string[];
}

interface RateLimitConfig {
  /** Rules per category */
  rules: Record<string, RateLimitRule>;
  /** Redis key prefix */
  keyPrefix?: string;
  /** Whether to use organization-based limiting */
  perOrganization?: boolean;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfter?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// REDIS CONNECTION
// ─────────────────────────────────────────────────────────────────────────────

let redisClient: Redis | null = null;
let redisAvailable = false;

/**
 * Initialize Redis connection for rate limiting.
 * Call this during server startup.
 */
export async function initializeRedisRateLimiter(): Promise<boolean> {
  const redisUrl = process.env.REDIS_URL || process.env.REDIS_TLS_URL;

  if (!redisUrl) {
    logger.warn('REDIS_URL not configured - using in-memory rate limiting');
    return false;
  }

  try {
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: REDIS.maxRetriesPerRequest,
      retryStrategy: times => Math.min(times * REDIS.retryBackoffStepMs, REDIS.retryBackoffCapMs),
      enableReadyCheck: true,
      connectTimeout: REDIS.connectTimeoutMs,
      lazyConnect: true,
    });

    // Test connection
    await redisClient.connect();
    await redisClient.ping();

    redisAvailable = true;
    logger.info('Redis rate limiter initialized successfully');

    // Handle connection errors gracefully
    redisClient.on('error', err => {
      logger.error('Redis connection error', { error: err.message });
      redisAvailable = false;
    });

    redisClient.on('connect', () => {
      redisAvailable = true;
      logger.info('Redis reconnected');
    });

    return true;
  } catch (error) {
    logger.error('Failed to initialize Redis', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    redisClient = null;
    redisAvailable = false;
    return false;
  }
}

/**
 * Gracefully close Redis connection.
 * Call during server shutdown.
 */
export async function closeRedisRateLimiter(): Promise<void> {
  if (redisClient) {
    try {
      await redisClient.quit();
      logger.info('Redis rate limiter connection closed');
    } catch (error) {
      logger.error('Error closing Redis connection', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
    redisClient = null;
    redisAvailable = false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// IN-MEMORY FALLBACK
// ─────────────────────────────────────────────────────────────────────────────

const MEMORY_STORE_MAX_SIZE = RATE_LIMIT_STORE.memoryStoreMaxSize;
const memoryStore = new Map<string, { count: number; resetAt: number }>();

/**
 * Clean up expired entries from memory store periodically.
 * Interval is unref'd so it doesn't prevent process exit.
 * Also enforces a hard cap to prevent unbounded growth when Redis is down.
 */
const memoryStoreCleanup = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of memoryStore) {
    if (entry.resetAt < now) {
      memoryStore.delete(key);
    }
  }
  // Hard cap: if still over limit after expiry cleanup, evict oldest entries
  if (memoryStore.size > MEMORY_STORE_MAX_SIZE) {
    const excess = memoryStore.size - MEMORY_STORE_MAX_SIZE;
    const iter = memoryStore.keys();
    for (let i = 0; i < excess; i++) {
      const key = iter.next().value;
      if (key) memoryStore.delete(key);
    }
  }
}, RATE_LIMIT_STORE.memoryStoreCleanupIntervalMs);
memoryStoreCleanup.unref();

/**
 * Check rate limit using in-memory store (fallback).
 */
function checkMemoryRateLimit(key: string, maxRequests: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const entry = memoryStore.get(key);

  if (!entry || entry.resetAt < now) {
    memoryStore.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1, resetAt: now + windowMs };
  }

  if (entry.count >= maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
      retryAfter: Math.ceil((entry.resetAt - now) / 1000),
    };
  }

  entry.count++;
  return { allowed: true, remaining: maxRequests - entry.count, resetAt: entry.resetAt };
}

// ─────────────────────────────────────────────────────────────────────────────
// REDIS RATE LIMITING (SLIDING WINDOW)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check rate limit using Redis with sliding window algorithm.
 */
async function checkRedisRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): Promise<RateLimitResult> {
  if (!redisClient || !redisAvailable) {
    return checkMemoryRateLimit(key, maxRequests, windowMs);
  }

  try {
    const now = Date.now();
    const windowStart = now - windowMs;
    const fullKey = `ratelimit:${key}`;

    // Use Redis transaction for atomic operations
    const pipeline = redisClient.pipeline();

    // Remove old entries outside the window
    pipeline.zremrangebyscore(fullKey, 0, windowStart);

    // Count entries in current window
    pipeline.zcard(fullKey);

    // Add current request with timestamp as score. Keep the member id so a
    // rejected request can be removed again below — otherwise denied retries
    // would keep refilling the window and a client at its limit could stay
    // locked out indefinitely (and behavior would diverge from the in-memory
    // fallback, which only counts allowed requests).
    const member = `${now}:${Math.random().toString(36).slice(2)}`;
    pipeline.zadd(fullKey, now, member);

    // Set expiry on the key
    pipeline.pexpire(fullKey, windowMs);

    const results = await pipeline.exec();

    if (!results) {
      // Pipeline failed, fall back to memory
      return checkMemoryRateLimit(key, maxRequests, windowMs);
    }

    const count = (results[1]?.[1] as number) || 0;

    if (count >= maxRequests) {
      // Rejected — un-count this request so denied retries don't extend the
      // window. Best-effort: on failure the entry ages out with the window.
      await redisClient.zrem(fullKey, member).catch(() => {});

      // Get the oldest entry to calculate retry time
      const oldest = await redisClient.zrange(fullKey, 0, 0, 'WITHSCORES');
      const oldestTime = oldest.length >= 2 ? parseInt(oldest[1], 10) : now;
      const resetAt = oldestTime + windowMs;

      return {
        allowed: false,
        remaining: 0,
        resetAt,
        retryAfter: Math.ceil((resetAt - now) / 1000),
      };
    }

    return {
      allowed: true,
      remaining: maxRequests - count - 1,
      resetAt: now + windowMs,
    };
  } catch (error) {
    logger.error('Redis rate limit check failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      key,
    });
    // Fall back to memory
    return checkMemoryRateLimit(key, maxRequests, windowMs);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DEFAULT RULES
// ─────────────────────────────────────────────────────────────────────────────

// Values are centralized in server/config/platform-limits.ts (RATE_LIMITS).
// Spread into fresh mutable objects so this record satisfies the local
// RateLimitRule type and remains independently overridable per-call.
const DEFAULT_RULES: Record<string, RateLimitRule> = {
  auth: { ...RATE_LIMITS.auth },
  api: { ...RATE_LIMITS.api },
  ai: { ...RATE_LIMITS.ai, skipRoles: [...RATE_LIMITS.ai.skipRoles] },
  documents: { ...RATE_LIMITS.documents },
  concept2cure: { ...RATE_LIMITS.concept2cure },
  validation: { ...RATE_LIMITS.validation },
  upload: { ...RATE_LIMITS.upload },
};

/**
 * Categories that must FAIL CLOSED when the limiter itself errors (e.g. Redis
 * unreachable AND the in-memory fallback throws). For these sensitive buckets,
 * allowing requests through unthrottled is a worse outcome than a brief denial:
 *
 *  - `auth`: login/register/auth — brute-force and credential-stuffing surface.
 *  - `documents`: governed document/export/pdf generation — data-exfiltration
 *    surface for a multi-tenant regulated SaaS.
 *
 * Non-sensitive categories (api, ai, upload, etc.) keep failing OPEN to favour
 * availability. This only affects the error path; normal Redis-up and
 * in-memory-fallback limiting behaviour is unchanged.
 */
const FAIL_CLOSED_CATEGORIES = new Set<string>(RATE_LIMIT_FAIL_CLOSED_CATEGORIES);

// ─────────────────────────────────────────────────────────────────────────────
// MIDDLEWARE FACTORY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Match against a full path segment (anchored on '/') rather than a raw
 * substring. The previous `path.includes('/auth')` pattern routed
 * `/api/audit/events`, `/api/oauth-clients`, and
 * `/api/data/authoritative-record` into the strict auth bucket
 * (5 requests / 15 min in production), locking legitimate users out.
 */
function hasSegment(path: string, ...segments: string[]): boolean {
  const padded = path.endsWith('/') ? path : `${path}/`;
  return segments.some(seg => padded.includes(`/${seg}/`));
}

export function getCategory(path: string): string {
  if (hasSegment(path, 'login', 'register', 'auth')) {
    return 'auth';
  }
  if (hasSegment(path, 'ai', 'generate', 'openai', 'anthropic')) {
    return 'ai';
  }
  if (hasSegment(path, 'concept2cure')) {
    return 'concept2cure';
  }
  if (hasSegment(path, 'document', 'documents', 'export', 'pdf')) {
    return 'documents';
  }
  if (hasSegment(path, 'validate')) {
    return 'validation';
  }
  if (hasSegment(path, 'upload')) {
    return 'upload';
  }
  return 'api';
}

/** The client address, as the rest of the platform reads it. */
function clientIp(req: Request): string {
  return req.ip || (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || 'unknown';
}

/**
 * A fingerprint of the presented bearer credential, or null when none is
 * presented. The token is not verified here (this can run before auth) and
 * never stored: only a truncated SHA-256 becomes part of a key.
 */
function credentialFingerprint(req: Request): string | null {
  const header = req.headers.authorization;
  if (typeof header !== 'string') return null;
  const m = /^Bearer\s+(\S+)\s*$/i.exec(header);
  if (!m) return null;
  return createHash('sha256').update(m[1]).digest('hex').slice(0, 32);
}

/**
 * Who this request counts against, and at what ceiling.
 *   verified user  → user:<id>   at maxRequestsAuthenticated
 *   credential     → cred:<hash> at maxRequestsAuthenticated, plus the
 *                    per-IP credentialed guard (ipGuard) when the rule sets one
 *   neither        → ip:<ip>     at maxRequests
 */
interface RateLimitSubject {
  key: string;
  limit: number;
  /** Second bucket for credentialed traffic from this address, if the rule guards it. */
  ipGuard: { key: string; limit: number } | null;
}

function resolveSubject(req: Request, category: string, rule: RateLimitRule, perOrganization: boolean): RateLimitSubject {
  const parts: string[] = [category];

  // Add organization ID if per-org limiting enabled
  if (perOrganization && req.tenantContext?.organizationId) {
    parts.push(`org:${req.tenantContext.organizationId}`);
  }

  const authenticatedLimit = rule.maxRequestsAuthenticated ?? rule.maxRequests;

  if (req.userId) {
    return { key: [...parts, `user:${req.userId}`].join(':'), limit: authenticatedLimit, ipGuard: null };
  }

  const cred = credentialFingerprint(req);
  if (cred) {
    const ipGuard =
      rule.maxRequestsPerIpAuthenticated != null
        ? { key: [...parts, `ipcred:${clientIp(req)}`].join(':'), limit: rule.maxRequestsPerIpAuthenticated }
        : null;
    return { key: [...parts, `cred:${cred}`].join(':'), limit: authenticatedLimit, ipGuard };
  }

  return { key: [...parts, `ip:${clientIp(req)}`].join(':'), limit: rule.maxRequests, ipGuard: null };
}

/**
 * Count the request against its subject's bucket and, for credentialed
 * traffic, against its address too — so rotating unverified credentials cannot
 * escape the per-IP bound. The guard only decides when the identity bucket
 * allowed the request; a refusal is reported with the ceiling that refused it.
 */
async function checkSubject(
  keyPrefix: string,
  subject: RateLimitSubject,
  windowMs: number,
): Promise<{ result: RateLimitResult; limit: number }> {
  const result = await checkRedisRateLimit(keyPrefix + subject.key, subject.limit, windowMs);
  if (!result.allowed || !subject.ipGuard) return { result, limit: subject.limit };
  const guard = await checkRedisRateLimit(keyPrefix + subject.ipGuard.key, subject.ipGuard.limit, windowMs);
  return guard.allowed ? { result, limit: subject.limit } : { result: guard, limit: subject.ipGuard.limit };
}

/**
 * Create a Redis-backed rate limiter middleware.
 *
 * @param config - Rate limiting configuration
 * @returns Express middleware
 *
 * @example
 * ```typescript
 * const limiter = createRedisRateLimiter({
 *   rules: {
 *     api: { windowMs: 60000, maxRequests: 100, message: 'Too many requests' }
 *   },
 *   perOrganization: true
 * });
 * app.use('/api', limiter);
 * ```
 */
export function createRedisRateLimiter(config: Partial<RateLimitConfig> = {}) {
  const rules = { ...DEFAULT_RULES, ...config.rules };
  const keyPrefix = config.keyPrefix || '';
  const perOrganization = config.perOrganization ?? true;

  return async function redisRateLimiterMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    // In development, never throttle interactive auth entry points.
    // This prevents local/demo lockouts while keeping production controls intact.
    if (
      process.env.NODE_ENV !== 'production' &&
      (req.path.includes('/auth/login') ||
        req.path.includes('/v1/auth/login') ||
        req.path.includes('/auth/signup') ||
        req.path.includes('/auth/register'))
    ) {
      return next();
    }

    // Skip rate limiting for health checks
    if (req.path.includes('/health') || req.path.includes('/ready')) {
      return next();
    }

    const category = getCategory(req.path);
    const rule = rules[category] || rules.api;

    // Skip for privileged roles if configured
    if (rule.skipRoles && req.userRole && rule.skipRoles.includes(req.userRole)) {
      return next();
    }

    const subject = resolveSubject(req, category, rule, perOrganization);

    try {
      const { result, limit } = await checkSubject(keyPrefix, subject, rule.windowMs);

      // Set rate limit headers — the ceiling that applied to THIS subject
      res.setHeader('X-RateLimit-Limit', limit);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, result.remaining));
      res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetAt / 1000));

      if (!result.allowed) {
        res.setHeader('Retry-After', result.retryAfter || 60);
        res.status(429).json({
          error: 'Rate limit exceeded',
          message: rule.message,
          retryAfter: result.retryAfter,
        });
        return;
      }

      next();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      // Sensitive categories fail CLOSED: when the limiter cannot evaluate the
      // request we deny rather than admit it unthrottled (brute-force /
      // exfiltration surfaces). Non-sensitive categories fail OPEN for
      // availability.
      if (FAIL_CLOSED_CATEGORIES.has(category)) {
        logger.error('Rate limiter error on sensitive category - failing CLOSED', {
          error: message,
          path: req.path,
          category,
        });
        res.setHeader('Retry-After', 60);
        res.status(503).json({
          error: 'Service temporarily unavailable',
          message: 'Rate limiting is temporarily degraded. Please retry shortly.',
          retryAfter: 60,
        });
        return;
      }

      // Non-sensitive: allow the request but log the degradation.
      logger.error('Rate limiter error - failing open (non-sensitive category)', {
        error: message,
        path: req.path,
        category,
      });
      next();
    }
  };
}

/**
 * Get current rate limit status for a key (for monitoring).
 */
export async function getRateLimitStatus(
  key: string,
  windowMs: number = 60000
): Promise<{ count: number; remaining: number; resetAt: number } | null> {
  if (!redisClient || !redisAvailable) {
    const entry = memoryStore.get(key);
    if (!entry) return null;
    return {
      count: entry.count,
      remaining: Math.max(0, 100 - entry.count),
      resetAt: entry.resetAt,
    };
  }

  try {
    const now = Date.now();
    const fullKey = `ratelimit:${key}`;
    const count = await redisClient.zcount(fullKey, now - windowMs, now);

    return {
      count,
      remaining: Math.max(0, 100 - count),
      resetAt: now + windowMs,
    };
  } catch {
    return null;
  }
}

export default createRedisRateLimiter;
