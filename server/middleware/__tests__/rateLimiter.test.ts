import { describe, it, expect, vi } from 'vitest';
import { createRateLimiter } from '../rateLimiter';

function makeReq(overrides: Partial<{ path: string; ip: string; headers: Record<string, string | string[]> }> = {}) {
  return { path: '/api/widgets', ip: '1.2.3.4', headers: {}, ...overrides } as any;
}

function makeRes() {
  const res: any = {};
  res.setHeader = vi.fn();
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

describe('createRateLimiter', () => {
  it('uses the leftmost X-Forwarded-For entry instead of the rightmost', () => {
    // Two different rightmost values, same leftmost — both must share a counter.
    // Use a unique leftmost IP so this test is robust against shared module state.
    const leftmost = `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
    const limiter = createRateLimiter();
    const reqA = makeReq({ ip: '', headers: { 'x-forwarded-for': `${leftmost}, 1.1.1.1` } });
    const reqB = makeReq({ ip: '', headers: { 'x-forwarded-for': `${leftmost}, 2.2.2.2` } });
    const resA = makeRes();
    const resB = makeRes();
    const next = vi.fn();
    limiter(reqA, resA as any, next);
    limiter(reqB, resB as any, next);
    // Remaining should decrement across the two requests (same key).
    const remainA = Number(resA.setHeader.mock.calls.find((c: any[]) => c[0] === 'X-RateLimit-Remaining')?.[1]);
    const remainB = Number(resB.setHeader.mock.calls.find((c: any[]) => c[0] === 'X-RateLimit-Remaining')?.[1]);
    expect(remainB).toBe(remainA - 1);
  });

  it('skips health endpoints', () => {
    const limiter = createRateLimiter();
    const req = makeReq({ path: '/api/health/live' });
    const res = makeRes();
    const next = vi.fn();
    limiter(req, res as any, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.setHeader).not.toHaveBeenCalled();
  });

  it('returns 429 once the configured limit is exceeded', () => {
    const limiter = createRateLimiter({
      api: { windowMs: 60_000, maxRequests: 2, message: 'slow down' },
    });
    const ip = `9.9.9.${Math.floor(Math.random() * 250) + 1}`;
    const next = vi.fn();
    let lastRes: any;
    for (let i = 0; i < 3; i++) {
      lastRes = makeRes();
      limiter(makeReq({ ip, path: '/api/widgets' }), lastRes, next);
    }
    expect(lastRes.status).toHaveBeenCalledWith(429);
    expect(lastRes.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'slow down' }));
  });
});
