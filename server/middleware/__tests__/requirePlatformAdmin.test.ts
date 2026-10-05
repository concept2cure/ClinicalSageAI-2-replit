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

  /* D6, 2026-10-05 (docs/evidence/D6/2026-10-05-platform-standing/). These
     three cases read "accepts platform role %s" and pinned the defect.
     Behind server/auth.ts the request role IS the tenant membership role
     (organization_users.role), and that column has no CHECK: a membership row
     that said super_admin, platform_admin or support, whether legacy, from a
     future writer or hand-edited, opened every organisation's data. Platform
     standing is the allowlist (the owner's own sign-in) or a
     platform_role_grants row, never a membership. */
  it.each(['super_admin', 'platform_admin', 'support'])('a tenant membership role of %s is not platform standing', role => {
    expect(isPlatformAdmin(mkReq({ userRole: role }))).toBe(false);
    expect(isPlatformAdmin(mkReq({ user: { role } }))).toBe(false);
    expect(isPlatformAdmin(mkReq({ user: { roles: ['member', role] } }))).toBe(false);
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

  it('401s when unauthenticated', async () => {
    const req = mkReq();
    const res = mkRes();
    const next = vi.fn();
    await requirePlatformAdmin(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('403s an authenticated non-platform user (no role, no grant)', async () => {
    const req = mkReq({ userId: 7, user: { id: 7 }, userRole: 'admin' });
    const res = mkRes();
    const next = vi.fn();
    await requirePlatformAdmin(req, res, next);
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('403s a membership role of super_admin with no platform grant', async () => {
    query.mockImplementation(async () => ({ rows: [] }));
    const req = mkReq({ userId: 9, user: { id: 9, role: 'super_admin' }, userRole: 'super_admin' });
    const res = mkRes();
    const next = vi.fn();
    await requirePlatformAdmin(req, res, next);
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() for a platform grant holder, whatever the tenant role', async () => {
    query.mockImplementation(async (_sql: unknown, params?: unknown) =>
      ({ rows: Array.isArray(params) && params[0] === 1 ? [{ ok: 1 }] : [] }));
    const req = mkReq({ userId: 1, user: { id: 1, role: 'member' }, userRole: 'member' });
    const res = mkRes();
    const next = vi.fn();
    await requirePlatformAdmin(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });
});

/**
 * The e-mail allowlist is a bootstrap path for the platform owner's OWN
 * password sign-in. A federated sign-in asserts whatever e-mail the identity
 * provider says, so a tenant's IdP (or anyone who can make one assert an
 * address) claiming an allowlisted e-mail would otherwise reach every
 * organisation's data (audit IAM-03, plan P0-3). The allowlist therefore does
 * not apply to an identity whose token provider is `saml`; the
 * platform_role_grants path is unchanged and still decides for that identity.
 */
describe('PLATFORM_ADMIN_EMAILS does not apply to a federated (SAML) identity', () => {
  const OWNER = 'owner@concept2cure.ai';
  const savedEnv = process.env.PLATFORM_ADMIN_EMAILS;
  beforeEach(() => {
    process.env.PLATFORM_ADMIN_EMAILS = OWNER;
  });
  afterEach(() => {
    if (savedEnv === undefined) delete process.env.PLATFORM_ADMIN_EMAILS;
    else process.env.PLATFORM_ADMIN_EMAILS = savedEnv;
  });

  const identity = (provider: string) => ({
    externalSubject: '7',
    provider,
    legacyUserId: 7,
    organizationId: 42,
    role: 'member',
    email: OWNER,
  });

  it('refuses an allowlisted e-mail asserted by an IdP (provider saml) — 403, grants consulted', async () => {
    const req = mkReq({
      userId: 7,
      userRole: 'member',
      userEmail: OWNER,
      user: { id: 7, email: OWNER, role: 'member' },
      identity: identity('saml'),
    });
    const res = mkRes();
    const next = vi.fn();
    expect(isPlatformAdmin(req)).toBe(false);
    await requirePlatformAdmin(req, res, next);
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('still admits the same e-mail on a password session (provider password)', async () => {
    const req = mkReq({
      userId: 7,
      userRole: 'member',
      userEmail: OWNER,
      user: { id: 7, email: OWNER, role: 'member' },
      identity: identity('password'),
    });
    const res = mkRes();
    const next = vi.fn();
    expect(isPlatformAdmin(req)).toBe(true);
    await requirePlatformAdmin(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('reads the provider from req.user when req.identity is absent', () => {
    expect(
      isPlatformAdmin(
        mkReq({ userRole: 'member', userEmail: OWNER, user: { id: 7, email: OWNER, provider: 'saml' } })
      )
    ).toBe(false);
    expect(
      isPlatformAdmin(
        mkReq({ userRole: 'member', userEmail: OWNER, user: { id: 7, email: OWNER, provider: 'local-jwt' } })
      )
    ).toBe(true);
  });
});
