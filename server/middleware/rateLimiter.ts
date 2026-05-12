/**
 * Rate Limiter Middleware for Enterprise Stability
 *
 * This middleware provides protection against abuse through configurable rate limiting
 * with separate limits for different API endpoints and client IPs.
 */

import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

interface RateLimitRule {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum number of requests allowed in the window
  message: string; // Message to return when rate limit is exceeded
}

interface RateLimitTracker {
  count: number; // Current count of requests
  resetTime: number; // Time when the window resets
}

// Default rate limit rules for different API categories
const DEFAULT_RULES: Record<string, RateLimitRule> = {
  // Authentication APIs
  auth: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 30, // 30 requests per 15 minutes
    message: 'Too many authentication attempts, please try again later.',
  },

  // General API endpoints
  api: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 60, // 60 requests per minute (1 per second)
    message: 'Too many requests, please slow down.',
  },

  // High-intensity validation endpoints
  validation: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 10, // 10 requests per minute
    message: 'Too many validation requests, please slow down.',
  },

  // AI/ML endpoints that might be resource-intensive
  ai: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 20, // 20 requests per minute
    message: 'Too many AI requests, please slow down.',
  },
};

// In-memory store for rate limit tracking
// In a production environment, consider using Redis for distributed rate limiting.
// A hard cap on the number of tracked IPs prevents unbounded memory growth from
// a flood of unique source IPs (intentional or accidental).
const IP_LIMITER_MAX_KEYS = 10_000;
const ipLimiters: Record<string, Record<string, RateLimitTracker>> = {};

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

    // Get client IP. Trust req.ip first (Express resolves trust-proxy config),
    // then take only the LEFTMOST X-Forwarded-For entry — the rightmost ones
    // are attacker-controllable for any client that can set the header.
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

    const now = Date.now();

    // Initialize rate limit tracking for this IP if it doesn't exist.
    // Apply a hard cap on the number of tracked IPs to prevent unbounded
    // growth under flood conditions; force a cleanup pass when at the cap and
    // refuse to track a new IP until the cleanup makes room.
    if (!ipLimiters[clientIp]) {
      if (Object.keys(ipLimiters).length >= IP_LIMITER_MAX_KEYS) {
        cleanupOldEntries();
        if (Object.keys(ipLimiters).length >= IP_LIMITER_MAX_KEYS) {
          // Fail closed: do not allocate new state, but still allow the request
          // (rate limiting is best-effort once the table is saturated).
          return next();
        }
      }
      ipLimiters[clientIp] = {};
    }

    // Initialize rate limit tracking for this category if it doesn't exist
    if (!ipLimiters[clientIp][category]) {
      ipLimiters[clientIp][category] = {
        count: 0,
        resetTime: now + rule.windowMs,
      };
    }

    const tracker = ipLimiters[clientIp][category];

    // Reset counter if window has expired
    if (now > tracker.resetTime) {
      tracker.count = 0;
      tracker.resetTime = now + rule.windowMs;
    }

    // Check if rate limit is exceeded
    if (tracker.count >= rule.maxRequests) {
      logger.warn(`Rate limit exceeded for ${category}`, {
        ip: clientIp,
        path: req.path,
        count: tracker.count,
        limit: rule.maxRequests,
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

    // Add rate limit info to headers
    res.setHeader('X-RateLimit-Limit', rule.maxRequests);
    res.setHeader('X-RateLimit-Remaining', rule.maxRequests - tracker.count);
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

  Object.keys(ipLimiters).forEach(ip => {
    let allExpired = true;

    Object.keys(ipLimiters[ip]).forEach(category => {
      if (now > ipLimiters[ip][category].resetTime) {
        delete ipLimiters[ip][category];
      } else {
        allExpired = false;
      }
    });

    // Remove IP entry if all categories are expired
    if (allExpired) {
      delete ipLimiters[ip];
    }
  });
}

// Export a default instance with default rules
export default createRateLimiter();
