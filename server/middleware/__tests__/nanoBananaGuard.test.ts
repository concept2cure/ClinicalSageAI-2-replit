/**
 * nanoBananaRateLimit — bounded memory and per-principal daily quota.
 *
 * Ported from PR #495 and adapted. The limiter now keys usage by the verified
 * (organization, user) pair and falls back to the caller's IP when either is
 * missing. The PR's requests carried a user id but no organization, so every
 * one of its 60 000 "users" collapsed onto the single `ip:127.0.0.1` counter:
 * the memory-cap case asserted `1 <= 50 000` and the quota case inherited that
 * exhausted counter. Requests here carry an organization so each is a
 * distinct principal, and state is cleared between cases.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { nanoBananaRateLimit, getUsageStats, __clearNanoBananaState } from '../nanoBananaGuard';

function makeReq(userId: string, opts: { organizationId?: number | null; path?: string; ip?: string } = {}) {
  const { organizationId = 7, path = '/api/nano-banana/generate', ip = '127.0.0.1' } = opts;
  return {
    path,
    method: 'POST',
    headers: {},
    body: { prompt: 'hello' },
    ip,
    user: { id: userId, tier: 'free', ...(organizationId === null ? {} : { organizationId }) },
  } as any;
}

function makeRes() {
  const res: any = {};
  res.setHeader = vi.fn();
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

beforeEach(() => __clearNanoBananaState());

describe('nanoBananaRateLimit — memory safety', () => {
  it('does not retain more than the configured number of principals', () => {
    const next = vi.fn();
    // Just past the cap: enough to exercise the saturation branch without the
    // O(n) stale-prune it runs per new principal once full dominating the run.
    for (let i = 0; i < 50_050; i++) {
      nanoBananaRateLimit(makeReq(`user-${i}`), makeRes() as any, next);
    }
    const stats = getUsageStats();
    // Exactly the cap: the map filled with distinct principals (not one IP
    // bucket, which would read 1) and was held at 50k, not 50 050.
    expect(stats.totalUsers).toBe(50_000);
  });
});

describe('nanoBananaRateLimit — daily quota', () => {
  it('counts repeated calls from the same principal against their daily limit', () => {
    const next = vi.fn();
    const userId = `repeat-${Math.random()}`;
    // Free tier allows 5 image generations per day.
    for (let i = 0; i < 5; i++) {
      const res = makeRes();
      nanoBananaRateLimit(makeReq(userId), res as any, next);
      expect(res.status).not.toHaveBeenCalled();
    }
    expect(next).toHaveBeenCalledTimes(5);
    const blockedRes = makeRes();
    nanoBananaRateLimit(makeReq(userId), blockedRes as any, next);
    expect(blockedRes.status).toHaveBeenCalledWith(429);
    expect(next).toHaveBeenCalledTimes(5);
  });

  it('keeps the same user id in two organizations on separate counters', () => {
    const next = vi.fn();
    for (let i = 0; i < 5; i++) nanoBananaRateLimit(makeReq('u1', { organizationId: 1 }), makeRes() as any, next);
    const otherOrg = makeRes();
    nanoBananaRateLimit(makeReq('u1', { organizationId: 2 }), otherOrg as any, next);
    expect(otherOrg.status).not.toHaveBeenCalled();
  });

  it('falls back to one per-IP counter when no organization is verified', () => {
    const next = vi.fn();
    for (let i = 0; i < 5; i++) {
      nanoBananaRateLimit(makeReq(`anon-${i}`, { organizationId: null, ip: '10.0.0.9' }), makeRes() as any, next);
    }
    const blocked = makeRes();
    nanoBananaRateLimit(makeReq('anon-new', { organizationId: null, ip: '10.0.0.9' }), blocked as any, next);
    expect(blocked.status).toHaveBeenCalledWith(429);
  });
});
