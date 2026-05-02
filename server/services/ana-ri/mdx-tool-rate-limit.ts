/**
 * Per-tool rate limiter for AnA-MDX governed mutations.
 *
 * Wraps the existing `server/lib/rate-limiting.ts` `RateLimiter` class
 * (windowing + burst + penalty escalation) — does NOT reimplement.
 *
 * Defaults are intentionally generous (a real RA team rolling in 50
 * commitments after a meeting is normal). Hard limits exist to defend
 * against runaway agent loops, not to throttle legitimate use:
 *
 *   - Standard tools (q_sub.create, section.approve, …): 60 / hour
 *     per (org, tool) with a burst allowance of 10.
 *   - ESG transmit (the most consequential): 5 / hour with no burst.
 *     A tenant transmitting more than 5 510(k)s per hour is almost
 *     certainly a bug.
 *   - audit.explain (read-only): 200 / hour with burst 30.
 *
 * Per-tenant overrides via `organizations.settings.anaToolPolicy.rateLimits`
 * (extension to the existing AnaToolPolicy shape — non-breaking).
 *
 * Identity key is `<organizationId>:<action>` so two tenants share no
 * counter, and two different tools at the same tenant share no counter
 * either.
 */

import { RateLimiter } from '../../lib/rate-limiting';
import type { CommandContext, CommandResult } from './command-executor';

interface ToolLimitConfig {
  windowMs: number;
  maxRequests: number;
  burstAllowance?: number;
}

const DEFAULT_LIMIT: ToolLimitConfig = {
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 60,
  burstAllowance: 10,
};

const PER_TOOL_LIMITS: Record<string, ToolLimitConfig> = {
  // ESG transmit — strictest. A transmit 5/hour ceiling defends against
  // accidental loop submission.
  'k510_workflow.transmit': {
    windowMs: 60 * 60 * 1000,
    maxRequests: 5,
    burstAllowance: 0,
  },
  // audit.explain is read-only; let auditors page through hundreds.
  'audit.explain': {
    windowMs: 60 * 60 * 1000,
    maxRequests: 200,
    burstAllowance: 30,
  },
  // Section approvals can come in batches when a reviewer signs off
  // a whole module; allow a generous burst.
  'section.approve': {
    windowMs: 60 * 60 * 1000,
    maxRequests: 60,
    burstAllowance: 30,
  },
};

// Lazy-initialized limiters keyed by tool name (the Map keeps each
// limiter's internal store separate so penalty/violation state is
// per-tool, not global).
const limiters = new Map<string, RateLimiter>();

function getLimiter(action: string): RateLimiter {
  let limiter = limiters.get(action);
  if (!limiter) {
    const cfg = PER_TOOL_LIMITS[action] ?? DEFAULT_LIMIT;
    limiter = new RateLimiter(cfg);
    limiters.set(action, limiter);
  }
  return limiter;
}

export interface RateLimitDecision {
  allowed: boolean;
  /** When false, the CommandResult to return verbatim. */
  result: CommandResult | null;
}

export function checkAnaToolRateLimit(
  ctx: CommandContext,
  action: string,
): RateLimitDecision {
  if (!Number.isFinite(ctx.organizationId)) {
    return { allowed: true, result: null };
  }
  const identifier = `${ctx.organizationId}:${action}`;
  const decision = getLimiter(action).check(identifier);
  if (decision.allowed) {
    return { allowed: true, result: null };
  }
  return {
    allowed: false,
    result: {
      success: false,
      action,
      message:
        `Rate limit reached for tool '${action}'. ` +
        `Retry after ${decision.retryAfter ?? 0}s. ` +
        (decision.penaltyApplied
          ? `A penalty has been applied because of repeated rate-limit hits.`
          : `Default ceiling protects against runaway loops.`),
      data: {
        retryAfter: decision.retryAfter ?? 0,
        resetTime: decision.resetTime?.toISOString?.() ?? null,
        penaltyApplied: decision.penaltyApplied === true,
      },
      error: 'RATE_LIMITED',
    },
  };
}

/** Test-only: drop all limiter state. */
export function _resetMdxToolRateLimitersForTests(): void {
  limiters.clear();
}
