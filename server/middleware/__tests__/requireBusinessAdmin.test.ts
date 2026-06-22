/**
 * Access tests for the Business Center guard.
 *
 * The Business Center is the finance tier — STRICTER than Master Admin. These
 * tests pin that boundary: support/platform_admin (which DO reach Master Admin)
 * must NOT reach the Business Center; only business roles or the
 * BUSINESS_CENTER_EMAILS allowlist do.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isBusinessAdmin, requireBusinessAdmin } from '../requireBusinessAdmin';

function mkReq(over: Record<string, unknown> = {}): any {
  return {
    user: undefined,
    userRole: undefined,
    userEmail: undefined,
    userId: undefined,
    originalUrl: '/api/admin/business/cost-accounting',
    ...over,
  };
}

function mkRes(): any {
  const res: any = { statusCode: 200, body: undefined };
  res.status = vi.fn((c: number) => {
    res.statusCode = c;
    return res;
  });
  res.json = vi.fn((b: unknown) => {
    res.body = b;
    return res;
  });
  return res;
}

describe('isBusinessAdmin', () => {
  const saved = process.env.BUSINESS_CENTER_EMAILS;
  beforeEach(() => {
    delete process.env.BUSINESS_CENTER_EMAILS;
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.BUSINESS_CENTER_EMAILS;
    else process.env.BUSINESS_CENTER_EMAILS = saved;
  });

  it.each(['owner', 'business_admin', 'super_admin'])('accepts business role %s', role => {
    expect(isBusinessAdmin(mkReq({ userRole: role }))).toBe(true);
  });

  it.each(['support', 'platform_admin', 'admin', 'member', 'viewer'])(
    'rejects non-business role %s (stricter than Master Admin)',
    role => {
      expect(isBusinessAdmin(mkReq({ userRole: role }))).toBe(false);
    }
  );

  it('honours BUSINESS_CENTER_EMAILS (case-insensitive)', () => {
    process.env.BUSINESS_CENTER_EMAILS = 'owner@x.io, finance@x.io';
    expect(isBusinessAdmin(mkReq({ userRole: 'member', userEmail: 'Finance@X.io' }))).toBe(true);
    expect(isBusinessAdmin(mkReq({ userRole: 'member', userEmail: 'other@x.io' }))).toBe(false);
  });
});

describe('requireBusinessAdmin', () => {
  beforeEach(() => {
    delete process.env.BUSINESS_CENTER_EMAILS;
  });

  it('401s when unauthenticated', () => {
    const res = mkRes();
    const next = vi.fn();
    requireBusinessAdmin(mkReq(), res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('403s a support user (has Master Admin, not Business Center)', () => {
    const res = mkRes();
    const next = vi.fn();
    requireBusinessAdmin(mkReq({ userId: 3, user: { id: 3 }, userRole: 'support' }), res, next);
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() for a business admin', () => {
    const res = mkRes();
    const next = vi.fn();
    requireBusinessAdmin(mkReq({ userId: 1, user: { id: 1 }, userRole: 'business_admin' }), res, next);
    expect(next).toHaveBeenCalledOnce();
  });
});
