/**
 * Per-tool rate limiter tests — uses the existing RateLimiter class so
 * we only verify the shape of the decision and the per-tool ceilings.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  checkAnaToolRateLimit,
  _resetMdxToolRateLimitersForTests,
} from '../mdx-tool-rate-limit';

const ctx = { userId: 7, organizationId: 11 } as any;

beforeEach(() => _resetMdxToolRateLimitersForTests());

describe('checkAnaToolRateLimit', () => {
  it('allows the first call to a fresh limiter', () => {
    const r = checkAnaToolRateLimit(ctx, 'q_sub.create');
    expect(r.allowed).toBe(true);
    expect(r.result).toBeNull();
  });

  it('refuses the 6th transmit within an hour (ceiling = 5)', () => {
    for (let i = 0; i < 5; i++) {
      const r = checkAnaToolRateLimit(ctx, 'k510_workflow.transmit');
      expect(r.allowed).toBe(true);
    }
    const r6 = checkAnaToolRateLimit(ctx, 'k510_workflow.transmit');
    expect(r6.allowed).toBe(false);
    expect(r6.result?.error).toBe('RATE_LIMITED');
    expect(r6.result?.message).toContain('Rate limit reached');
  });

  it('isolates per-tenant counters', () => {
    const ctxA = { userId: 1, organizationId: 1 } as any;
    const ctxB = { userId: 1, organizationId: 2 } as any;
    for (let i = 0; i < 5; i++) {
      checkAnaToolRateLimit(ctxA, 'k510_workflow.transmit');
    }
    // Org A is at ceiling; org B is fresh.
    expect(checkAnaToolRateLimit(ctxA, 'k510_workflow.transmit').allowed).toBe(false);
    expect(checkAnaToolRateLimit(ctxB, 'k510_workflow.transmit').allowed).toBe(true);
  });

  it('isolates per-tool counters', () => {
    for (let i = 0; i < 5; i++) {
      checkAnaToolRateLimit(ctx, 'k510_workflow.transmit');
    }
    // q_sub.create has its own counter (ceiling 60).
    expect(checkAnaToolRateLimit(ctx, 'q_sub.create').allowed).toBe(true);
  });

  it('skips when organizationId is invalid', () => {
    const r = checkAnaToolRateLimit({ userId: 1 } as any, 'q_sub.create');
    expect(r.allowed).toBe(true);
  });

  it('audit.explain has the most generous ceiling (200/hr + 30 burst)', () => {
    for (let i = 0; i < 200; i++) {
      const r = checkAnaToolRateLimit(ctx, 'audit.explain');
      expect(r.allowed).toBe(true);
    }
    // Burst kicks in here.
    for (let i = 0; i < 30; i++) {
      expect(checkAnaToolRateLimit(ctx, 'audit.explain').allowed).toBe(true);
    }
    // 231st should refuse.
    expect(checkAnaToolRateLimit(ctx, 'audit.explain').allowed).toBe(false);
  });
});
