/**
 * Rate Limiter Middleware for Enterprise Stability
 *
 * This middleware provides protection against abuse through configurable rate limiting
 * with separate limits for different API endpoints and client IPs.
 *
 * ── Keyed by verified identity when there is one (VSR-001 F-5, 2026-09-21) ──
 * Eleven routers mount `createRateLimiter()` after `authenticateToken`, and
 * every instance shares the ONE store below. Keying that store by client IP
 * meant one browser session loading Tasks, Vault and the Submission Center —
 * more than sixty calls across those routers in a minute — tripped the `api`
 * bucket on the first attempt, and an office behind one NAT address shared it.
 *
 * The identity this limiter sees is verified (it runs after auth), so an
 * authenticated request is now keyed `user:<id>` with the bucket's
 * `maxRequestsAuthenticated` ceiling (platform-limits.ts). A request with no
 * verified identity keeps the per-IP key and the per-IP ceiling: nothing
 * anonymous got looser.
 */

import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';
import { LEGACY_RATE_LIMITS, RATE_LIMIT_STORE } from '../config/platform-limits';

interface RateLimitRule {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum number of requests allowed in the window (per IP)
  /** Ceiling for ONE verified identity; absent → the per-IP ceiling applies to it too. */
  maxRequestsAuthenticated?: number;
  message: string; // Message to return when rate limit is exceeded
}

interface RateLimitTracker {
  count: number; // Current count of requests
  resetTime: number; // Time when the window resets
}

// Default rate limit rules for different API categories.
// Values are centralized in server/config/platform-limits.ts (LEGACY_RATE_LIMITS).
const DEFAULT_RULES: Record<string, RateLimitRule> = {
  auth: { ...LEGACY_RATE_LIMITS.auth },
  api: { ...LEGACY_RATE_LIMITS.api },
  validation: { ...LEGACY_RATE_LIMITS.validation },
  ai: { ...LEGACY_RATE_LIMITS.ai },
};

// In-memory store for rate limit tracking, keyed by SUBJECT: `user:<id>` for a
// verified identity, `ip:<address>` otherwise.
// In a production environment, consider using Redis for distributed rate limiting.
// A hard cap on the number of tracked subjects prevents unbounded memory growth
// from a flood of unique source IPs (intentional or accidental).
const IP_LIMITER_MAX_KEYS = RATE_LIMIT_STORE.maxTrackedKeys;
const ipLimiters: Record<string, Record<string, RateLimitTracker>> = {};

/**
 * The verified identity on the request, or null. `req.userId` is published by
 * the auth boundary / tenant context; `req.user.id` by `authenticateToken`.
 * Both are set only after a token verified, which is why this limiter — which
 * every mounting router places after auth — may trust them.
 */
function verifiedUserId(req: Request): string | null {
  const r = req as Request & { userId?: unknown; user?: { id?: unknown } };
  const raw = r.userId ?? r.user?.id;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return String(raw);
  if (typeof raw === 'string' && raw.trim() !== '') return raw.trim();
  return null;
}

/**
 * Determine the appropriate rate limit category for a given request path
 */
function getRateLimitCategory(path: string): string {
  if (
    path.startsWith('/api/login') ||
    path.startsWith('/api/register') ||
    path.startsWith('/api/logout')
  ) {
    return 'auth';
  } else if (path.startsWith('/api/validate')) {
    return 'validation';
  } else if (
    path.startsWith('/api/ai') ||
    path.startsWith('/api/gpt') ||
    path.startsWith('/api/openai') ||
    path.startsWith('/api/generate')
  ) {
    return 'ai';
  } else {
    return 'api';
  }
}

/** The subject a request counts against, and the ceiling that subject gets. */
function resolveSubject(req: Request, clientIp: string, rule: RateLimitRule): { subject: string; maxRequests: number } {
  const userId = verifiedUserId(req);
  if (userId) {
    return { subject: `user:${userId}`, maxRequests: rule.maxRequestsAuthenticated ?? rule.maxRequests };
  }
  return { subject: `ip:${clientIp}`, maxRequests: rule.maxRequests };
}

/**
 * The subject's tracker for this category, allocated on first sight and reset
 * when its window has expired. Returns null when the table is at its hard cap
 * and a cleanup pass could not make room — the cap exists to bound memory under
 * a flood of unique subjects, and once it is reached limiting is best-effort.
 */
function trackerFor(subject: string, category: string, rule: RateLimitRule, now: number): RateLimitTracker | null {
  if (!ipLimiters[subject]) {
    if (Object.keys(ipLimiters).length >= IP_LIMITER_MAX_KEYS) {
      cleanupOldEntries();
      if (Object.keys(ipLimiters).length >= IP_LIMITER_MAX_KEYS) {
        return null;
      }
    }
    ipLimiters[subject] = {};
  }
  const byCategory = ipLimiters[subject];
  if (!byCategory[category]) {
    byCategory[category] = { count: 0, resetTime: now + rule.windowMs };
  }
  const tracker = byCategory[category];
  // Reset counter if window has expired
  if (now > tracker.resetTime) {
    tracker.count = 0;
    tracker.resetTime = now + rule.windowMs;
  }
  return tracker;
}

/**
 * Create rate limiter middleware with optional custom rules
 */
export function createRateLimiter(customRules?: Record<string, RateLimitRule>) {
  // Merge custom rules with defaults
  const rules = { ...DEFAULT_RULES, ...customRules };

  return function rateLimiterMiddleware(req: Request, res: Response, next: NextFunction) {
    // Skip rate limiting for health check endpoints
    if (req.path.startsWith('/api/health')) {
      return next();
    }

    // Get client IP. Trust req.ip first (Express resolves trust-proxy
    // config), then take only the LEFTMOST X-Forwarded-For entry — the
    // rightmost ones are attacker-controllable for any client that can
    // set the header.
    const forwardedHeader = req.headers['x-forwarded-for'];
    const forwarded = Array.isArray(forwardedHeader) ? forwardedHeader[0] : forwardedHeader;
    const clientIp = req.ip || forwarded?.split(',')[0]?.trim() || 'unknown';

    // Determine appropriate rate limit category based on request path
    const category = getRateLimitCategory(req.path);
    const rule = rules[category];

    // Skip if no rule exists for this category (shouldn't happen with defaults)
    if (!rule) {
      return next();
    }

    // The subject this request counts against, and the ceiling that subject
    // gets. A verified identity is its own subject with the authenticated
    // ceiling; everything else is the address with the per-IP ceiling.
    const { subject, maxRequests } = resolveSubject(req, clientIp, rule);

    const now = Date.now();

    const tracker = trackerFor(subject, category, rule, now);
    // No tracker means the table is saturated and cleanup could not make room:
    // rate limiting is best-effort from here (better than OOM).
    if (!tracker) {
      return next();
    }

    // Check if rate limit is exceeded
    if (tracker.count >= maxRequests) {
      logger.warn(`Rate limit exceeded for ${category}`, {
        subject,
        ip: clientIp,
        path: req.path,
        count: tracker.count,
        limit: maxRequests,
        remainingMs: tracker.resetTime - now,
      });

      // Set rate limit headers
      res.setHeader('Retry-After', Math.ceil((tracker.resetTime - now) / 1000));

      return res.status(429).json({
        error: rule.message,
        retryAfter: Math.ceil((tracker.resetTime - now) / 1000),
      });
    }

    // Increment counter and proceed
    tracker.count++;

    // Add rate limit info to headers — the ceiling that applied to THIS subject
    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', maxRequests - tracker.count);
    res.setHeader('X-RateLimit-Reset', Math.ceil(tracker.resetTime / 1000));

    // Clean up old entries periodically (every 100 requests)
    if (Math.random() < 0.01) {
      cleanupOldEntries();
    }

    next();
  };
}

/**
 * Clean up expired rate limit trackers to prevent memory growth
 */
function cleanupOldEntries() {
  const now = Date.now();

  Object.keys(ipLimiters).forEach(subject => {
    let allExpired = true;

    Object.keys(ipLimiters[subject]).forEach(category => {
      if (now > ipLimiters[subject][category].resetTime) {
        delete ipLimiters[subject][category];
      } else {
        allExpired = false;
      }
    });

    // Remove the subject's entry if all categories are expired
    if (allExpired) {
      delete ipLimiters[subject];
    }
  });
}

// Export a default instance with default rules
export default createRateLimiter();
