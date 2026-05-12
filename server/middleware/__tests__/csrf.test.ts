import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';
import { csrfProtection } from '../csrf';

type MockRes = {
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
  cookie: ReturnType<typeof vi.fn>;
};

function makeRes(): MockRes {
  const res: any = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  res.cookie = vi.fn(() => res);
  return res;
}

function makeReq(overrides: Partial<{ method: string; path: string; cookies: Record<string, string>; headers: Record<string, string> }>) {
  return {
    method: 'GET',
    path: '/api/anything',
    cookies: {},
    headers: {},
    ...overrides,
  } as any;
}

const validToken = () => crypto.randomBytes(32).toString('hex');

describe('csrfProtection', () => {
  let next: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    next = vi.fn();
  });

  it('issues a csrf cookie on first GET and passes through', () => {
    const req = makeReq({ method: 'GET' });
    const res = makeRes();
    csrfProtection(req, res as any, next);
    expect(res.cookie).toHaveBeenCalledWith('csrf_token', expect.any(String), expect.objectContaining({ sameSite: 'strict', path: '/' }));
    expect(next).toHaveBeenCalledOnce();
  });

  it('rejects state-changing request when token cookie is missing', () => {
    const req = makeReq({ method: 'POST' });
    const res = makeRes();
    csrfProtection(req, res as any, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'CSRF_VALIDATION_FAILED' }));
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects state-changing request when header does not match cookie', () => {
    const cookie = validToken();
    const header = validToken();
    const req = makeReq({ method: 'POST', cookies: { csrf_token: cookie }, headers: { 'x-csrf-token': header } });
    const res = makeRes();
    csrfProtection(req, res as any, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects when token lengths differ (no timing-leak fallthrough)', () => {
    const cookie = validToken();
    const req = makeReq({ method: 'POST', cookies: { csrf_token: cookie }, headers: { 'x-csrf-token': cookie.slice(0, -1) } });
    const res = makeRes();
    csrfProtection(req, res as any, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects tokens that are not the expected hex length', () => {
    // Same value in cookie and header but wrong length — must not pass.
    const short = 'abc';
    const req = makeReq({ method: 'POST', cookies: { csrf_token: short }, headers: { 'x-csrf-token': short } });
    const res = makeRes();
    csrfProtection(req, res as any, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('accepts state-changing request when header matches cookie and rotates the token', () => {
    const token = validToken();
    const req = makeReq({ method: 'POST', cookies: { csrf_token: token }, headers: { 'x-csrf-token': token } });
    const res = makeRes();
    csrfProtection(req, res as any, next);
    expect(next).toHaveBeenCalledOnce();
    // A fresh cookie should have been set (rotation), with a different value.
    expect(res.cookie).toHaveBeenCalled();
    const lastCookieCall = res.cookie.mock.calls.at(-1)!;
    expect(lastCookieCall[0]).toBe('csrf_token');
    expect(lastCookieCall[1]).not.toBe(token);
  });

  it('exempts webhook path exactly and as a subpath', () => {
    const res1 = makeRes();
    csrfProtection(makeReq({ method: 'POST', path: '/api/billing/webhooks' }), res1 as any, next);
    expect(next).toHaveBeenCalledTimes(1);

    const res2 = makeRes();
    csrfProtection(makeReq({ method: 'POST', path: '/api/billing/webhooks/stripe' }), res2 as any, next);
    expect(next).toHaveBeenCalledTimes(2);
  });

  it('does NOT exempt a path that merely starts with an exempt name', () => {
    // Regression: previous startsWith() matching exempted '/healthzevil'.
    const req = makeReq({ method: 'POST', path: '/healthzevil/api/mutate' });
    const res = makeRes();
    csrfProtection(req, res as any, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
