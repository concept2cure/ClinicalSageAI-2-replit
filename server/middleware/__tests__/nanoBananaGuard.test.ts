import { describe, it, expect, vi } from 'vitest';
import { nanoBananaRateLimit, getUsageStats } from '../nanoBananaGuard';

function makeReq(userId: string, path = '/api/nano-banana/generate') {
  return {
    path,
    body: { prompt: 'hello' },
    ip: '127.0.0.1',
    user: { id: userId, tier: 'free' },
  } as any;
}

function makeRes() {
  const res: any = {};
  res.setHeader = vi.fn();
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

describe('nanoBananaRateLimit — memory safety', () => {
  it('does not retain more than the configured number of users', () => {
    const next = vi.fn();
    // Issue ~50k+ unique users; the map should not grow without bound.
    for (let i = 0; i < 60_000; i++) {
      const req = makeReq(`user-${i}`);
      nanoBananaRateLimit(req, makeRes() as any, next);
    }
    // The internal cap is 50k; the helper exposes the map size as totalUsers
    // for today, which should never exceed that cap.
    const stats = getUsageStats();
    expect(stats.totalUsers).toBeLessThanOrEqual(50_000);
  });

  it('counts repeated calls from the same user against their daily limit', () => {
    const next = vi.fn();
    const userId = `repeat-${Math.random()}`;
    // Free tier allows 5 image generations per day.
    for (let i = 0; i < 5; i++) {
      const res = makeRes();
      nanoBananaRateLimit(makeReq(userId), res as any, next);
      expect(res.status).not.toHaveBeenCalled();
    }
    const blockedRes = makeRes();
    nanoBananaRateLimit(makeReq(userId), blockedRes as any, next);
    expect(blockedRes.status).toHaveBeenCalledWith(429);
  });
});
