/**
 * AI Gateway — Policy Engine
 *
 * Enforces organizational policies, rate limits, content filters,
 * and token budgets before AI requests are executed.
 */

import type { GatewayRequest, PolicyConfig } from './types';
import { detectPromptInjection } from './promptInjection';

export interface PolicyResult {
  allowed: boolean;
  reason?: string;
}

// In-memory rate limit tracking
interface RateBucket {
  count: number;
  windowStart: number;
}

const DEFAULT_POLICY: PolicyConfig = {
  maxTokensPerRequest: 128_000,
  maxRequestsPerMinutePerOrg: 100,
  maxRequestsPerMinutePerUser: 30,
  blockedPatterns: [],
  contentFilters: true,
  piiDetection: false,
};

export class GatewayPolicyEngine {
  private config: PolicyConfig;

  // Rate limit: Map<org/global key, bucket>
  private rateBuckets: Map<string, RateBucket> = new Map();

  // Daily cost accumulator: Map<org/global key, {date: string, totalCost: number}>
  private dailyCost: Map<string, { date: string; total: number }> = new Map();

  constructor(config?: Partial<PolicyConfig>) {
    this.config = { ...DEFAULT_POLICY, ...config };
  }

  /**
   * Evaluate a request against all active policies.
   */
  evaluate(request: GatewayRequest): PolicyResult {
    // 1. Token budget
    const tokenResult = this.checkTokenBudget(request);
    if (!tokenResult.allowed) return tokenResult;

    // 2. Blocked content patterns
    const contentResult = this.checkBlockedPatterns(request);
    if (!contentResult.allowed) return contentResult;

    // 3. Rate limit (per org)
    const rateResult = this.checkRateLimit(request);
    if (!rateResult.allowed) return rateResult;

    return { allowed: true };
  }

  /**
   * Record cost for daily budget tracking.
   */
  recordCost(orgId: string | undefined, cost: number): void {
    const key = orgId || '__global__';
    const today = new Date().toISOString().slice(0, 10);
    const bucket = this.dailyCost.get(key);
    if (bucket && bucket.date === today) {
      bucket.total += cost;
    } else {
      this.dailyCost.set(key, { date: today, total: cost });
    }
  }

  /**
   * Update policy configuration.
   */
  updateConfig(patch: Partial<PolicyConfig>): void {
    this.config = { ...this.config, ...patch };
  }

  /**
   * Get current config (for admin/debug).
   */
  getConfig(): PolicyConfig {
    return { ...this.config };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Individual Policy Checks
  // ─────────────────────────────────────────────────────────────────────────

  private checkTokenBudget(request: GatewayRequest): PolicyResult {
    if (request.maxTokens && request.maxTokens > this.config.maxTokensPerRequest) {
      return {
        allowed: false,
        reason: `Requested maxTokens (${request.maxTokens}) exceeds policy limit (${this.config.maxTokensPerRequest})`,
      };
    }
    return { allowed: true };
  }

  private checkBlockedPatterns(request: GatewayRequest): PolicyResult {
    // Prompt-injection detection (before blocked patterns). Scoped to USER
    // messages — the untrusted input. The system prompt is app-controlled and
    // trusted; scanning it only risks false positives on legitimate directives.
    if (this.config.contentFilters) {
      for (const msg of request.messages) {
        if (msg.role !== 'user') continue;
        const content = typeof msg.content === 'string' ? msg.content : '';
        const hit = detectPromptInjection(content);
        if (hit.detected) {
          return {
            allowed: false,
            reason: `Content filter: potential prompt injection detected (${hit.category})`,
          };
        }
      }
    }

    if (!this.config.blockedPatterns || this.config.blockedPatterns.length === 0) {
      return { allowed: true };
    }

    // Check all message content against blocked patterns
    const textsToCheck: string[] = [];

    if (request.messages) {
      for (const msg of request.messages) {
        if (typeof msg.content === 'string') {
          textsToCheck.push(msg.content);
        }
      }
    }

    for (const pattern of this.config.blockedPatterns) {
      const regex = new RegExp(pattern, 'i');
      for (const text of textsToCheck) {
        if (regex.test(text)) {
          return {
            allowed: false,
            reason: `Content matched blocked pattern: ${pattern}`,
          };
        }
      }
    }

    return { allowed: true };
  }

  private checkRateLimit(request: GatewayRequest): PolicyResult {
    const now = Date.now();
    const windowMs = 60_000; // 1 minute

    // --- Organization-level rate limit ---
    const orgKey = request.organizationId?.toString() || '__global__';
    let orgBucket = this.rateBuckets.get(orgKey);
    if (!orgBucket || now - orgBucket.windowStart > windowMs) {
      orgBucket = { count: 0, windowStart: now };
      this.rateBuckets.set(orgKey, orgBucket);
    }
    orgBucket.count++;

    if (orgBucket.count > this.config.maxRequestsPerMinutePerOrg) {
      return {
        allowed: false,
        reason: `Organization rate limit exceeded: ${orgBucket.count}/${this.config.maxRequestsPerMinutePerOrg} requests per minute`,
      };
    }

    // --- Per-user rate limit ---
    const userId = (request as any).userId;
    if (userId) {
      const userKey = `${orgKey}:user:${userId}`;
      let userBucket = this.rateBuckets.get(userKey);
      if (!userBucket || now - userBucket.windowStart > windowMs) {
        userBucket = { count: 0, windowStart: now };
        this.rateBuckets.set(userKey, userBucket);
      }
      userBucket.count++;

      const perUserLimit = this.config.maxRequestsPerMinutePerUser || 30;
      if (userBucket.count > perUserLimit) {
        return {
          allowed: false,
          reason: `User rate limit exceeded: ${userBucket.count}/${perUserLimit} requests per minute`,
        };
      }
    }

    return { allowed: true };
  }
}
