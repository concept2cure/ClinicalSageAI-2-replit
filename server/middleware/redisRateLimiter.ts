/**
 * Redis-based Distributed Rate Limiter
 *
 * Enterprise-grade rate limiting for multi-node deployments.
 * Uses Redis for shared state across all server instances.
 *
 * Features:
 * - Sliding window algorithm for smooth rate limiting
 * - Per-user, per-organization, and per-IP limits
 * - Configurable rules per endpoint category
 * - Graceful fallback to in-memory when Redis unavailable
 *
 * @module server/middleware/redisRateLimiter
 * @version 1.0.0
 */

import { Request, Response, NextFunction } from 'express';
import Redis from 'ioredis';
import { createScopedLogger } from '../utils/logger';

const logger = createScopedLogger('redis-rate-limiter');

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface RateLimitRule {
  /** Time window in milliseconds */
  windowMs: number;
  /** Maximum requests allowed in window */
  maxRequests: number;
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
      maxRetriesPerRequest: 3,
      retryStrategy: times => Math.min(times * 100, 2000),
      enableReadyCheck: true,
      connectTimeout: 5000,
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

const memoryStore = new Map<string, { count: number; resetAt: number }>();

/**
 * Clean up expired entries from memory store periodically.
 */
setInterval(() => {
  const now = Date.now();
  const keys = Array.from(memoryStore.keys());
  for (const key of keys) {
    const entry = memoryStore.get(key);
    if (entry && entry.resetAt < now) {
      memoryStore.delete(key);
    }
  }
}, 60000); // Clean every minute

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

    // Add current request with timestamp as score
    pipeline.zadd(fullKey, now, `${now}:${Math.random().toString(36).slice(2)}`);

    // Set expiry on the key
    pipeline.pexpire(fullKey, windowMs);

    const results = await pipeline.exec();

    if (!results) {
      // Pipeline failed, fall back to memory
      return checkMemoryRateLimit(key, maxRequests, windowMs);
    }

    const count = (results[1]?.[1] as number) || 0;

    if (count >= maxRequests) {
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

const DEFAULT_RULES: Record<string, RateLimitRule> = {
  // Authentication endpoints
  auth: {
    windowMs: process.env.NODE_ENV === 'production' ? 15 * 60 * 1000 : 60 * 1000,
    maxRequests: process.env.NODE_ENV === 'production' ? 20 : 300,
    message:
      process.env.NODE_ENV === 'production'
        ? 'Too many authentication attempts. Please try again later.'
        : 'Too many authentication attempts. Please wait briefly and try again.',
  },

  // General API
  api: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100,
    message: 'Too many requests. Please slow down.',
  },

  // AI/ML endpoints (resource intensive)
  ai: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 30,
    message: 'Too many AI requests. Please wait before making more.',
    skipRoles: ['admin', 'super_admin'],
  },

  // Document generation
  documents: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 20,
    message: 'Too many document requests. Please wait.',
  },

  // Concept2Cure specific
  concept2cure: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100,
    message: 'Rate limit exceeded for Concept2Cure API.',
  },

  // Heavy validation endpoints
  validation: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 10,
    message: 'Too many validation requests.',
  },

  // File uploads
  upload: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 10,
    message: 'Too many file uploads. Please wait.',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// MIDDLEWARE FACTORY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Determine the rate limit category for a request path.
 */
function getCategory(path: string): string {
  if (path.includes('/login') || path.includes('/register') || path.includes('/auth')) {
    return 'auth';
  }
  if (
    path.includes('/ai') ||
    path.includes('/generate') ||
    path.includes('/openai') ||
    path.includes('/anthropic')
  ) {
    return 'ai';
  }
  if (path.includes('/concept2cure')) {
    return 'concept2cure';
  }
  if (path.includes('/document') || path.includes('/export') || path.includes('/pdf')) {
    return 'documents';
  }
  if (path.includes('/validate')) {
    return 'validation';
  }
  if (path.includes('/upload')) {
    return 'upload';
  }
  return 'api';
}

/**
 * Generate rate limit key based on request context.
 */
function getRateLimitKey(req: Request, category: string, perOrganization: boolean): string {
  const parts: string[] = [category];

  // Add organization ID if per-org limiting enabled
  if (perOrganization && req.tenantContext?.organizationId) {
    parts.push(`org:${req.tenantContext.organizationId}`);
  }

  // Add user ID if authenticated
  if (req.userId) {
    parts.push(`user:${req.userId}`);
  } else {
    // Fall back to IP
    const ip =
      req.ip || (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || 'unknown';
    parts.push(`ip:${ip}`);
  }

  return parts.join(':');
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

    const key = keyPrefix + getRateLimitKey(req, category, perOrganization);

    try {
      const result = await checkRedisRateLimit(key, rule.maxRequests, rule.windowMs);

      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', rule.maxRequests);
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
      // On error, allow the request but log the issue
      logger.error('Rate limiter error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        path: req.path,
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
