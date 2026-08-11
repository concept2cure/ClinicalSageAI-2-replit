/**
 * requireRole — no org-`admin` escape hatch (authz-hardening).
 *
 * The generic requireRole() helper used to satisfy ANY guard for a user
 * carrying the org-scoped "admin" role via an unconditional
 * `|| userRoles.includes('admin')` clause. That let a self-service tenant
 * admin clear a platform-role guard (e.g. requireRole('super_admin')) and,
 * through the tenant-management routes, delete other customers' orgs.
 *
 * These cases pin the corrected behaviour: an org "admin" is only granted
 * when its role is explicitly required, never implicitly. DB-free.
 *
 * IMPORTANT (twin modules): a stale legacy `auth.js` sits next to `auth.ts`.
 * Extensionless consumers resolve to `auth.ts` under tsx/esbuild; explicit
 * `../auth.js` consumers (e.g. billing-dashboard) resolve to the twin. BOTH
 * carried the bypass and BOTH are now fixed. This test imports extensionless
 * `../auth` — which the Vite/vitest resolver binds to the `.js` twin, so it
 * exercises the runtime module the `.js` consumers actually load — and asserts
 * only the invariants both implementations share (no body-shape or wildcard
 * assumptions), so it typechecks against `auth.ts` and passes against `auth.js`.
 */
import { describe, it, expect, vi } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  process.env.DATABASE_URL =
    process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
  process.env.JWT_SECRET =
    process.env.JWT_SECRET || 'authz-hardening-test-secret-padded-to-32-chars-plus';
  process.env.SKIP_DB_STARTUP_TEST = 'true';
});

import { requireRole } from '../auth';

function mkReq(over: Record<string, unknown> = {}): any {
  return { user: undefined, ...over };
}

function mkRes(): any {
  const res: any = { statusCode: 200, body: undefined };
  res.status = vi.fn((c: number) => {
    res.statusCode = c;
    return res;
  });
  res.json = vi.fn((b: any) => {
    res.body = b;
    return res;
  });
  return res;
}

describe('requireRole — org-admin has no platform-role bypass', () => {
  it('DENIES an org "admin" against requireRole("super_admin") with 403', () => {
    const req = mkReq({ user: { id: 1, role: 'admin', roles: ['admin'] } });
    const res = mkRes();
    const next = vi.fn();

    requireRole('super_admin')(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  it('DENIES an org "admin" against requireRole("super_admin","platform_admin")', () => {
    const req = mkReq({ user: { id: 1, role: 'admin', roles: ['admin'] } });
    const res = mkRes();
    const next = vi.fn();

    requireRole('super_admin', 'platform_admin')(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  it('still GRANTS when the required role is held explicitly', () => {
    const req = mkReq({ user: { id: 1, role: 'super_admin', roles: ['super_admin'] } });
    const res = mkRes();
    const next = vi.fn();

    requireRole('super_admin')(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('still GRANTS an org "admin" when "admin" is explicitly required', () => {
    const req = mkReq({ user: { id: 1, role: 'admin', roles: ['admin'] } });
    const res = mkRes();
    const next = vi.fn();

    requireRole('admin')(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('401s when there is no authenticated user', () => {
    const req = mkReq();
    const res = mkRes();
    const next = vi.fn();

    requireRole('super_admin')(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });
});
