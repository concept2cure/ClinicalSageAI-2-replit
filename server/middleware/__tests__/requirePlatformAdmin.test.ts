/**
 * Security boundary tests for the Master Administration access guard.
 *
 * This is the single gate protecting cross-tenant platform data, so its
 * behaviour is pinned hard:
 *   - only platform roles (super_admin / platform_admin / support) pass
 *   - org-scoped roles (admin / manager / member / viewer) are REJECTED
 *     (no org-admin bypass — unlike the generic requireRole helper)
 *   - the PLATFORM_ADMIN_EMAILS allowlist is honoured as a bootstrap path
 *   - unauthenticated requests get 401, authenticated-but-unauthorized 403
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isPlatformAdmin, requirePlatformAdmin } from '../requirePlatformAdmin';

function mkReq(over: Record<string, unknown> = {}): any {
  return {
    user: undefined,
    userRole: undefined,
    userEmail: undefined,
    userId: undefined,
    originalUrl: '/api/admin/master/overview',
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

describe('isPlatformAdmin', () => {
  const savedEnv = process.env.PLATFORM_ADMIN_EMAILS;
  beforeEach(() => {
    delete process.env.PLATFORM_ADMIN_EMAILS;
  });
  afterEach(() => {
    if (savedEnv === undefined) delete process.env.PLATFORM_ADMIN_EMAILS;
    else process.env.PLATFORM_ADMIN_EMAILS = savedEnv;
  });

  it.each(['super_admin', 'platform_admin', 'support'])('accepts platform role %s', role => {
    expect(isPlatformAdmin(mkReq({ userRole: role }))).toBe(true);
  });

  it('accepts a platform role from req.user.role', () => {
    expect(isPlatformAdmin(mkReq({ user: { role: 'super_admin' } }))).toBe(true);
  });

  it('accepts a platform role from req.user.roles[]', () => {
    expect(isPlatformAdmin(mkReq({ user: { roles: ['member', 'support'] } }))).toBe(true);
  });

  it.each(['admin', 'manager', 'member', 'viewer', ''])('rejects org role %s (no bypass)', role => {
    expect(isPlatformAdmin(mkReq({ userRole: role }))).toBe(false);
  });

  it('honours the PLATFORM_ADMIN_EMAILS allowlist (case-insensitive)', () => {
    process.env.PLATFORM_ADMIN_EMAILS = 'owner@concept2cure.ai, second@x.io';
    expect(isPlatformAdmin(mkReq({ userRole: 'member', userEmail: 'OWNER@concept2cure.AI' }))).toBe(true);
    expect(isPlatformAdmin(mkReq({ userRole: 'member', userEmail: 'nope@x.io' }))).toBe(false);
  });
});

describe('requirePlatformAdmin', () => {
  beforeEach(() => {
    delete process.env.PLATFORM_ADMIN_EMAILS;
  });

  it('401s when unauthenticated', () => {
    const req = mkReq();
    const res = mkRes();
    const next = vi.fn();
    requirePlatformAdmin(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('403s an authenticated non-platform user', () => {
    const req = mkReq({ userId: 7, user: { id: 7 }, userRole: 'admin' });
    const res = mkRes();
    const next = vi.fn();
    requirePlatformAdmin(req, res, next);
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() for a platform admin', () => {
    const req = mkReq({ userId: 1, user: { id: 1 }, userRole: 'super_admin' });
    const res = mkRes();
    const next = vi.fn();
    requirePlatformAdmin(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });
});
