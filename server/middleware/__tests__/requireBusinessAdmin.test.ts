/**
 * Access tests for the Business Center guard.
 *
 * The Business Center is the finance tier — STRICTER than Master Admin. These
 * tests pin that boundary: support/platform_admin (which DO reach Master Admin)
 * must NOT reach the Business Center; only business roles or the
 * BUSINESS_CENTER_EMAILS allowlist do.
 *
 * NOTE: these cases all exercise the SYNCHRONOUS fast-path (role / email
 * allowlist) of the guard, which short-circuits before any DB access. The
 * db module is mocked only so the async grant fallback (used when the sync
 * checks fail) resolves to "no grant" without touching a real connection —
 * the access-management route tests cover the DB-grant path itself.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { query } = vi.hoisted(() => ({ query: vi.fn(async (..._a: unknown[]) => ({ rows: [] as unknown[] })) }));
vi.mock('../../db', () => ({ query }));

import { isBusinessAdmin, requireBusinessAdmin } from '../requireBusinessAdmin';

/** An active platform_role_grants row for `userId`, as Access Management writes it. */
function grantFor(userId: number) {
  query.mockImplementation(async (_sql: unknown, params?: unknown) =>
    ({ rows: Array.isArray(params) && params[0] === userId ? [{ ok: 1 }] : [] }));
}

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

  /* D6, 2026-10-05 (docs/evidence/D6/2026-10-05-business-center-standing/).
     This used to read "accepts business role %s" and pinned the defect.
     req.userRole and req.user.role are the TENANT membership role
     (server/auth.ts reads organization_users), and `owner` is a tenant
     administrative role (tenant-users.ts, tenant-export.ts,
     ORG_ROLE_FUNCTIONAL_GRANTS). The Business Center shows every client's
     financials, so standing is platform standing: a platform_role_grants
     row, or the owner's own address on the allowlist. */
  it.each(['owner', 'business_admin', 'super_admin'])(
    'a tenant membership role of %s is not platform standing',
    role => {
      expect(isBusinessAdmin(mkReq({ userRole: role }))).toBe(false);
      expect(isBusinessAdmin(mkReq({ user: { id: 9, role, roles: [role] } }))).toBe(false);
    }
  );

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

  it('401s when unauthenticated', async () => {
    const res = mkRes();
    const next = vi.fn();
    await requireBusinessAdmin(mkReq(), res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('403s a support user (has Master Admin, not Business Center; no grant)', async () => {
    const res = mkRes();
    const next = vi.fn();
    await requireBusinessAdmin(mkReq({ userId: 3, user: { id: 3 }, userRole: 'support' }), res, next);
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('403s a tenant owner with no platform grant — every client\'s financials are not a tenant\'s', async () => {
    query.mockImplementation(async () => ({ rows: [] }));
    const res = mkRes();
    const next = vi.fn();
    await requireBusinessAdmin(
      mkReq({ userId: 5, user: { id: 5, role: 'owner', roles: ['owner', 'regulatory-author'] }, userRole: 'owner' }),
      res,
      next,
    );
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() for a platform business grant, whatever the tenant role', async () => {
    grantFor(1);
    const res = mkRes();
    const next = vi.fn();
    await requireBusinessAdmin(mkReq({ userId: 1, user: { id: 1, role: 'member' }, userRole: 'member' }), res, next);
    expect(next).toHaveBeenCalledOnce();
  });
});

/**
 * The e-mail allowlist names the platform owner's OWN (password) sign-in, as
 * PLATFORM_ADMIN_EMAILS does (requirePlatformAdmin, audit IAM-03). A federated
 * sign-in asserts whatever e-mail its identity provider says, so a tenant's
 * IdP claiming the owner's address reached cost and margin data for every
 * client. Dormant while nothing set BUSINESS_CENTER_EMAILS; the stack sets it
 * to the owner from 2026-10-01 (terraform/stack, platform_owner_emails).
 */
describe('BUSINESS_CENTER_EMAILS does not apply to a federated (SAML) identity', () => {
  const OWNER = 'owner@concept2cure.ai';
  const saved = process.env.BUSINESS_CENTER_EMAILS;
  beforeEach(() => {
    process.env.BUSINESS_CENTER_EMAILS = OWNER;
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.BUSINESS_CENTER_EMAILS;
    else process.env.BUSINESS_CENTER_EMAILS = saved;
  });

  it('refuses the owner\'s address asserted by an IdP — 403, grants consulted', async () => {
    const req = mkReq({
      userId: 7,
      userRole: 'member',
      userEmail: OWNER,
      user: { id: 7, email: OWNER, role: 'member' },
      identity: { provider: 'saml', email: OWNER },
    });
    expect(isBusinessAdmin(req)).toBe(false);
    const res = mkRes();
    const next = vi.fn();
    await requireBusinessAdmin(req, res, next);
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('still admits the same address on the owner\'s own password sign-in', () => {
    expect(isBusinessAdmin(mkReq({ userRole: 'member', userEmail: OWNER, identity: { provider: 'local-jwt' } }))).toBe(true);
    expect(isBusinessAdmin(mkReq({ userRole: 'member', userEmail: OWNER, user: { id: 7, provider: 'saml' } }))).toBe(false);
  });
});
