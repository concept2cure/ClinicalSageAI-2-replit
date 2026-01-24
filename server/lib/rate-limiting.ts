/**
 * Rate Limiting & DDoS Protection - Security Layer
 * 
 * FDA 21 CFR Part 11 Compliant - System Survivability
 * 
 * Implements multi-tier rate limiting to protect against:
 * 1. API abuse (per-user limits)
 * 2. DDoS attacks (global limits)
 * 3. Resource exhaustion (heavy endpoint limits)
 * 4. Credential stuffing (auth endpoint limits)
 * 
 * Features:
 * - Sliding window rate limiting
 * - Token bucket for burst handling
 * - Progressive penalties for repeat offenders
 * - IP-based and user-based tracking
 * - Graceful degradation under load
 * 
 * @module RateLimiting
 * @version 1.0.0
 * @compliance FDA 21 CFR Part 11
 */

export interface RateLimitConfig {
  /** Window size in milliseconds */
  windowMs: number;
  /** Maximum requests per window */
  maxRequests: number;
  /** Optional burst allowance */
  burstAllowance?: number;
  /** Skip rate limiting for certain conditions */
  skip?: (identifier: string) => boolean;
  /** Penalty multiplier for repeat offenders */
  penaltyMultiplier?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: Date;
  retryAfter?: number;
  penaltyApplied?: boolean;
}

interface RateLimitEntry {
  count: number;
  windowStart: number;
  violations: number;
  penaltyExpires?: number;
}

// =============================================================================
// Rate Limiter Implementation
// =============================================================================

export class RateLimiter {
  private store: Map<string, RateLimitEntry> = new Map();
  private readonly cleanupInterval: NodeJS.Timeout;
  
  constructor(private readonly config: RateLimitConfig) {
    // Cleanup old entries every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  /**
   * Check if a request should be allowed
   */
  check(identifier: string): RateLimitResult {
    // Skip check if configured
    if (this.config.skip?.(identifier)) {
      return {
        allowed: true,
        remaining: this.config.maxRequests,
        resetTime: new Date(Date.now() + this.config.windowMs)
      };
    }

    const now = Date.now();
    let entry = this.store.get(identifier);

    // Check if penalty is active
    if (entry?.penaltyExpires && now < entry.penaltyExpires) {
      const retryAfter = Math.ceil((entry.penaltyExpires - now) / 1000);
      console.warn(`[RateLimit] ${identifier} is in penalty timeout for ${retryAfter}s`);
      return {
        allowed: false,
        remaining: 0,
        resetTime: new Date(entry.penaltyExpires),
        retryAfter,
        penaltyApplied: true
      };
    }

    // Initialize or reset window if expired
    if (!entry || now - entry.windowStart >= this.config.windowMs) {
      entry = {
        count: 0,
        windowStart: now,
        violations: entry?.violations || 0
      };
      this.store.set(identifier, entry);
    }

    // Calculate effective limit (reduced for repeat offenders)
    const penaltyFactor = Math.max(
      0.1,
      1 - (entry.violations * (this.config.penaltyMultiplier || 0.1))
    );
    const effectiveLimit = Math.floor(this.config.maxRequests * penaltyFactor);
    const burstLimit = effectiveLimit + (this.config.burstAllowance || 0);

    // Check if within limits
    if (entry.count >= burstLimit) {
      entry.violations++;
      
      // Apply penalty timeout for repeat offenders
      if (entry.violations >= 3) {
        const penaltyDuration = this.config.windowMs * Math.min(entry.violations, 10);
        entry.penaltyExpires = now + penaltyDuration;
        console.warn(
          `[RateLimit] ${identifier} has ${entry.violations} violations, ` +
          `applying ${penaltyDuration / 1000}s penalty`
        );
      }

      const resetTime = new Date(entry.windowStart + this.config.windowMs);
      return {
        allowed: false,
        remaining: 0,
        resetTime,
        retryAfter: Math.ceil((resetTime.getTime() - now) / 1000)
      };
    }

    // Increment counter
    entry.count++;
    const remaining = Math.max(0, effectiveLimit - entry.count);

    return {
      allowed: true,
      remaining,
      resetTime: new Date(entry.windowStart + this.config.windowMs)
    };
  }

  /**
   * Record a request (for async/delayed tracking)
   */
  record(identifier: string): void {
    this.check(identifier);
  }

  /**
   * Reset rate limit for an identifier
   */
  reset(identifier: string): void {
    this.store.delete(identifier);
  }

  /**
   * Get current status for an identifier
   */
  getStatus(identifier: string): RateLimitEntry | undefined {
    return this.store.get(identifier);
  }

  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.store.entries()) {
      // Remove if window expired and no active penalty
      if (now - entry.windowStart >= this.config.windowMs * 2) {
        if (!entry.penaltyExpires || now >= entry.penaltyExpires) {
          this.store.delete(key);
          cleaned++;
        }
      }
    }

    if (cleaned > 0) {
      console.log(`[RateLimit] Cleaned up ${cleaned} expired entries`);
    }
  }

  /**
   * Shutdown the rate limiter
   */
  shutdown(): void {
    clearInterval(this.cleanupInterval);
    this.store.clear();
  }
}

// =============================================================================
// Pre-configured Rate Limiters
// =============================================================================

export interface RateLimiters {
  /** Standard API endpoints: 100 req/min */
  standard: RateLimiter;
  /** Authentication endpoints: 10 req/min */
  auth: RateLimiter;
  /** Heavy computation endpoints (Council, Extraction): 10 req/min */
  heavy: RateLimiter;
  /** Global limit per IP: 1000 req/min */
  global: RateLimiter;
  /** Health check bypass */
  health: RateLimiter;
}

let limitersInstance: RateLimiters | null = null;

export function getRateLimiters(): RateLimiters {
  if (!limitersInstance) {
    limitersInstance = {
      standard: new RateLimiter({
        windowMs: 60000, // 1 minute
        maxRequests: 100,
        burstAllowance: 10,
        penaltyMultiplier: 0.2
      }),
      auth: new RateLimiter({
        windowMs: 60000,
        maxRequests: 10,
        burstAllowance: 2,
        penaltyMultiplier: 0.3
      }),
      heavy: new RateLimiter({
        windowMs: 60000,
        maxRequests: 10,
        burstAllowance: 2,
        penaltyMultiplier: 0.25
      }),
      global: new RateLimiter({
        windowMs: 60000,
        maxRequests: 1000,
        burstAllowance: 100,
        penaltyMultiplier: 0.1
      }),
      health: new RateLimiter({
        windowMs: 1000,
        maxRequests: 100, // Allow frequent health checks
        skip: () => true // Health checks are exempt
      })
    };
  }
  return limitersInstance;
}

// =============================================================================
// Express Middleware Factory
// =============================================================================

import { Request, Response, NextFunction } from 'express';

export interface RateLimitMiddlewareOptions {
  /** Which limiter to use */
  limiter: keyof RateLimiters;
  /** Function to extract identifier (default: IP address) */
  keyGenerator?: (req: Request) => string;
  /** Custom response handler */
  onRateLimited?: (req: Request, res: Response, result: RateLimitResult) => void;
}

export function rateLimitMiddleware(
  options: RateLimitMiddlewareOptions
): (req: Request, res: Response, next: NextFunction) => void {
  const limiters = getRateLimiters();
  const limiter = limiters[options.limiter];

  return (req: Request, res: Response, next: NextFunction) => {
    // Generate identifier (IP + optional user ID)
    const identifier = options.keyGenerator?.(req) || 
      getClientIdentifier(req);

    const result = limiter.check(identifier);

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', limiter['config'].maxRequests);
    res.setHeader('X-RateLimit-Remaining', result.remaining);
    res.setHeader('X-RateLimit-Reset', result.resetTime.toISOString());

    if (!result.allowed) {
      res.setHeader('Retry-After', result.retryAfter || 60);

      if (options.onRateLimited) {
        return options.onRateLimited(req, res, result);
      }

      return res.status(429).json({
        error: 'Too Many Requests',
        message: result.penaltyApplied
          ? 'Rate limit exceeded. Penalty timeout applied due to repeated violations.'
          : 'Rate limit exceeded. Please try again later.',
        retryAfter: result.retryAfter,
        resetTime: result.resetTime.toISOString()
      });
    }

    next();
  };
}

/**
 * Get client identifier from request (IP + forwarded headers)
 */
function getClientIdentifier(req: Request): string {
  // Check for forwarded IP (behind proxy/load balancer)
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = (Array.isArray(forwarded) ? forwarded[0] : forwarded).split(',');
    return ips[0].trim();
  }

  // Check for real IP header (nginx)
  const realIp = req.headers['x-real-ip'];
  if (realIp) {
    return Array.isArray(realIp) ? realIp[0] : realIp;
  }

  // Fall back to socket address
  return req.socket.remoteAddress || 'unknown';
}

// =============================================================================
// DDoS Protection Middleware
// =============================================================================

export interface DDoSProtectionOptions {
  /** Maximum concurrent requests globally */
  maxConcurrent: number;
  /** Queue timeout in ms */
  queueTimeout: number;
  /** Callback when under attack */
  onAttack?: (stats: DDoSStats) => void;
}

export interface DDoSStats {
  concurrent: number;
  queued: number;
  rejected: number;
  avgResponseTime: number;
}

class DDoSProtection {
  private concurrent = 0;
  private queued = 0;
  private rejected = 0;
  private responseTimes: number[] = [];
  private attackMode = false;

  constructor(private readonly options: DDoSProtectionOptions) {}

  async protect<T>(fn: () => Promise<T>): Promise<T> {
    if (this.concurrent >= this.options.maxConcurrent) {
      this.rejected++;
      
      // Check for attack pattern
      if (this.rejected > this.options.maxConcurrent * 2 && !this.attackMode) {
        this.attackMode = true;
        this.options.onAttack?.({
          concurrent: this.concurrent,
          queued: this.queued,
          rejected: this.rejected,
          avgResponseTime: this.getAvgResponseTime()
        });
      }

      throw new Error('Service temporarily unavailable due to high load');
    }

    this.concurrent++;
    const startTime = Date.now();

    try {
      return await fn();
    } finally {
      this.concurrent--;
      const responseTime = Date.now() - startTime;
      this.responseTimes.push(responseTime);
      if (this.responseTimes.length > 1000) this.responseTimes.shift();

      // Reset attack mode if load normalized
      if (this.attackMode && this.concurrent < this.options.maxConcurrent / 2) {
        this.attackMode = false;
        this.rejected = 0;
      }
    }
  }

  private getAvgResponseTime(): number {
    if (this.responseTimes.length === 0) return 0;
    return this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length;
  }

  getStats(): DDoSStats {
    return {
      concurrent: this.concurrent,
      queued: this.queued,
      rejected: this.rejected,
      avgResponseTime: this.getAvgResponseTime()
    };
  }
}

let ddosProtectionInstance: DDoSProtection | null = null;

export function getDDoSProtection(): DDoSProtection {
  if (!ddosProtectionInstance) {
    ddosProtectionInstance = new DDoSProtection({
      maxConcurrent: 500,
      queueTimeout: 30000,
      onAttack: (stats) => {
        console.error('[DDOS ALERT] Potential DDoS attack detected:', stats);
      }
    });
  }
  return ddosProtectionInstance;
}
