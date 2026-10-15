/**
 * The tenant lifecycle guard, pinned in isolation.
 *
 * The posture service is mocked so the guard's own behaviour — carve-outs,
 * platform bypass, read-only method split, and the fail-closed arm — is asserted
 * without a database. The policy the service implements is tested next door in
 * services/tenant/__tests__/tenant-lifecycle.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TenantAccessPosture } from '../../services/tenant/tenant-lifecycle';

// vi.mock is hoisted above the imports, so the spy has to be created inside
// vi.hoisted or the factory closes over a not-yet-initialized binding.
const { getTenantAccessPosture, query, logAuditEvent, grants } = vi.hoisted(() => ({
  getTenantAccessPosture: vi.fn(),
  query: vi.fn(),
  logAuditEvent: vi.fn(async (..._a: unknown[]) => ({ persisted: true })),
  /** user id -> platform roles that user holds an ACTIVE platform_role_grants row for. */
  grants: new Map<number, string[]>(),
}));

vi.mock('../../services/tenant/tenant-lifecycle', async importOriginal => {
  const actual = await importOriginal<typeof import('../../services/tenant/tenant-lifecycle')>();
  return { ...actual, getTenantAccessPosture };
});

// D6, 2026-10-05: the platform override is decided by holdsPlatformRole
// (./requirePlatformAdmin), which reads platform_role_grants through ../db's
// `query` — production's only source of platform standing besides the owner's
// e-mail allowlist. The REAL decision runs; only the table is faked, answering
// a row when params[0] is a user in `grants` holding one of the roles asked
// (params[1]). docs/evidence/D6/2026-10-05-cross-tenant-staff/
vi.mock('../../db', () => ({ query }));
function answerGrantsFromTable() {
  query.mockImplementation(async (sql: string, params?: unknown[]) => {
    if (/FROM platform_role_grants/.test(sql) && Array.isArray(params)) {
      const held = grants.get(Number(params[0])) ?? [];
      const asked = Array.isArray(params[1]) ? (params[1] as string[]) : [];
      return { rows: held.some(role => asked.includes(role)) ? [{ '?column?': 1 }] : [] };
    }
    return { rows: [] };
  });
}
/** How many platform_role_grants lookups the guard made (for any user). */
const grantLookups = () =>
  query.mock.calls.filter(([sql]) => /FROM platform_role_grants/.test(String(sql))).length;

// The override's audit row is written fire-and-forget through a lazy import of
// the audit logger. Faked so the override can be OBSERVED (and so the real
// logger does not reach for a database this suite does not have).
vi.mock('../../services/audit/auditLogger', () => ({ logAuditEvent }));

import { enforceTenantLifecycle, isLifecycleCarveOut } from '../tenantLifecycleGuard';
import { tenantLifecycleDecisions } from '../tenantLifecycleMetrics';

/** The guard's decision counter, observed (it still counts for real). */
const decisionInc = vi.spyOn(tenantLifecycleDecisions, 'inc');

function posture(overrides: Partial<TenantAccessPosture> = {}): TenantAccessPosture {
  return {
    organizationId: 42,
    state: 'active',
    decision: 'allow',
    code: 'TENANT_ACTIVE',
    reason: 'Active.',
    ...overrides,
  };
}

function makeReq(overrides: Record<string, any> = {}): any {
  return {
    method: 'GET',
    baseUrl: '',
    path: '/api/widgets',
    user: { userId: '7', organizationId: '42', role: 'member' },
    ...overrides,
  };
}

function makeRes() {
  const res: any = { statusCode: 0, body: undefined };
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body: unknown) => {
    res.body = body;
    return res;
  };
  return res;
}

/** The guard resolves the posture asynchronously; give the microtask queue a turn. */
const settle = () => new Promise(resolve => setImmediate(resolve));

beforeEach(() => {
  vi.clearAllMocks();
  getTenantAccessPosture.mockResolvedValue(posture());
  grants.clear();
  answerGrantsFromTable();
  delete process.env.PLATFORM_ADMIN_EMAILS;
});

describe('carve-outs', () => {
  it('recognises the billing prefix', () => {
    // Locking the paywall behind the paywall is the classic version of this bug:
    // a past-due tenant must be able to reach checkout to stop being past due.
    expect(isLifecycleCarveOut('/api/billing')).toBe(true);
    expect(isLifecycleCarveOut('/api/billing/checkout')).toBe(true);
  });

  it('recognises the data-portability surfaces', () => {
    expect(isLifecycleCarveOut('/api/tenant-export')).toBe(true);
    expect(isLifecycleCarveOut('/api/admin/audit/export')).toBe(true);
  });

  it('does not let a lookalike path ride on a prefix entry', () => {
    expect(isLifecycleCarveOut('/api/billingsomething')).toBe(false);
    expect(isLifecycleCarveOut('/api/tenant-exports')).toBe(false);
  });

  it('passes a carve-out through without consulting the posture at all', async () => {
    const next = vi.fn();
    const req = makeReq({ path: '/api/billing/checkout', method: 'POST' });
    enforceTenantLifecycle(req, makeRes(), next);
    await settle();
    expect(next).toHaveBeenCalledOnce();
    expect(getTenantAccessPosture).not.toHaveBeenCalled();
  });
});

describe('platform actors', () => {
  const staff = { userId: '1', organizationId: '42', role: 'super_admin' };
  // D6, 2026-10-05: `staff` is platform staff because user 1 holds an active
  // super_admin platform_role_grants row, as production decides it. Its
  // membership role is left as it was and decides nothing; the D6 describe
  // below proves a membership role alone gets no override.
  beforeEach(() => {
    grants.set(1, ['super_admin']);
  });

  it('lets a platform super_admin through on a healthy tenant', async () => {
    const next = vi.fn();
    enforceTenantLifecycle(makeReq({ user: staff }), makeRes(), next);
    await settle();
    expect(next).toHaveBeenCalledOnce();
  });

  it('lets a platform super_admin through a DENY posture — the bypass', async () => {
    // Support has to be able to operate on a suspended tenant to un-suspend it.
    getTenantAccessPosture.mockResolvedValue(
      posture({ decision: 'deny', state: 'suspended', code: 'TENANT_SUSPENDED' })
    );
    const next = vi.fn();
    const res = makeRes();
    enforceTenantLifecycle(makeReq({ user: staff, method: 'POST' }), res, next);
    await settle();
    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(0);
  });

  it('EVALUATES the posture rather than skipping it, so the bypass is auditable', async () => {
    // The bypass short-circuited before the lookup in an earlier revision, which
    // made staff access to a suspended tenant leave no trace at all. "Who looked
    // at the suspended customer's data, and what did they touch" is precisely
    // what an access review asks, so the posture must be read even when the
    // answer cannot refuse the request.
    getTenantAccessPosture.mockResolvedValue(
      posture({ decision: 'deny', state: 'suspended', code: 'TENANT_SUSPENDED' })
    );
    const next = vi.fn();
    enforceTenantLifecycle(makeReq({ user: staff }), makeRes(), next);
    await settle();
    expect(getTenantAccessPosture).toHaveBeenCalledWith(42);
    expect(next).toHaveBeenCalledOnce();
  });

  it('proceeds — not 503 — when the posture is unreadable', async () => {
    // Staff must be able to act precisely when the platform is unhealthy.
    // Refusing here would lock out the people whose job is to fix it.
    getTenantAccessPosture.mockResolvedValue(null);
    const next = vi.fn();
    const res = makeRes();
    enforceTenantLifecycle(makeReq({ user: staff }), res, next);
    await settle();
    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(0);
  });

  it('proceeds when the posture lookup throws', async () => {
    getTenantAccessPosture.mockRejectedValue(new Error('db is on fire'));
    const next = vi.fn();
    const res = makeRes();
    enforceTenantLifecycle(makeReq({ user: staff }), res, next);
    await settle();
    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(0);
  });

  // Inverted 2026-10-05 (D6): the request role is the tenant membership role; standing is a platform grant — docs/evidence/D6/2026-10-05-cross-tenant-staff/
  it('does NOT recognise a platform role carried in the membership roles array', async () => {
    grants.clear(); // this identity holds no platform_role_grants row; only its membership roles name platform_admin
    getTenantAccessPosture.mockResolvedValue(posture({ decision: 'deny', code: 'TENANT_SUSPENDED' }));
    const next = vi.fn();
    const res = makeRes();
    enforceTenantLifecycle(
      makeReq({ user: { userId: '1', organizationId: '42', roles: ['viewer', 'platform_admin'] } }),
      res,
      next
    );
    await settle();
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.body.error.code).toBe('TENANT_SUSPENDED');
  });

  it('does NOT bypass for an org-scoped admin', async () => {
    // An org `admin` is a customer, not staff. Letting them shrug off their own
    // organization's suspension would defeat the control entirely.
    getTenantAccessPosture.mockResolvedValue(posture({ decision: 'deny', code: 'TENANT_SUSPENDED' }));
    const next = vi.fn();
    const res = makeRes();
    enforceTenantLifecycle(makeReq({ user: { userId: '2', organizationId: '42', role: 'admin' } }), res, next);
    await settle();
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.body.error.code).toBe('TENANT_SUSPENDED');
  });
});

describe('decisions', () => {
  it('allows an active tenant and attaches the posture to the request', async () => {
    const next = vi.fn();
    const req = makeReq({ method: 'POST' });
    enforceTenantLifecycle(req, makeRes(), next);
    await settle();
    expect(next).toHaveBeenCalledOnce();
    expect(req.tenantPosture.code).toBe('TENANT_ACTIVE');
  });

  it('refuses a suspended tenant with 403 and the machine-readable code', async () => {
    getTenantAccessPosture.mockResolvedValue(
      posture({ decision: 'deny', state: 'suspended', code: 'TENANT_SUSPENDED', reason: 'nope' })
    );
    const next = vi.fn();
    const res = makeRes();
    enforceTenantLifecycle(makeReq(), res, next);
    await settle();
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: { code: 'TENANT_SUSPENDED', message: 'nope' } });
  });

  it('read-only: lets a GET through', async () => {
    getTenantAccessPosture.mockResolvedValue(
      posture({ decision: 'read_only', state: 'past_due', code: 'TENANT_PAST_DUE' })
    );
    const next = vi.fn();
    enforceTenantLifecycle(makeReq({ method: 'GET' }), makeRes(), next);
    await settle();
    expect(next).toHaveBeenCalledOnce();
  });

  it('read-only: blocks a POST', async () => {
    getTenantAccessPosture.mockResolvedValue(
      posture({ decision: 'read_only', state: 'past_due', code: 'TENANT_PAST_DUE', reason: 'settle up' })
    );
    const next = vi.fn();
    const res = makeRes();
    enforceTenantLifecycle(makeReq({ method: 'POST' }), res, next);
    await settle();
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.body.error.code).toBe('TENANT_PAST_DUE');
  });
});

describe('fail-closed', () => {
  it('refuses with 503 when the posture is indeterminate', async () => {
    // Never assume active. A suspension must not lapse because a lookup failed.
    getTenantAccessPosture.mockResolvedValue(null);
    const next = vi.fn();
    const res = makeRes();
    enforceTenantLifecycle(makeReq(), res, next);
    await settle();
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(503);
    expect(res.body.error.code).toBe('TENANT_STATE_UNVERIFIED');
  });

  it('refuses with 503 when the posture lookup throws', async () => {
    getTenantAccessPosture.mockRejectedValue(new Error('db is on fire'));
    const next = vi.fn();
    const res = makeRes();
    enforceTenantLifecycle(makeReq(), res, next);
    await settle();
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(503);
    expect(res.body.error.code).toBe('TENANT_STATE_UNVERIFIED');
  });
});

describe('identities with no tenant', () => {
  it('passes through when the identity carries no numeric organization', async () => {
    // Platform-level tokens. Downstream tenant guards still apply and an
    // unscoped DB touch fails closed, so passing through is the correct outcome
    // rather than fabricating a tenant to evaluate.
    const next = vi.fn();
    enforceTenantLifecycle(makeReq({ user: { userId: '7' } }), makeRes(), next);
    await settle();
    expect(next).toHaveBeenCalledOnce();
    expect(getTenantAccessPosture).not.toHaveBeenCalled();
  });

  it('rejects a non-integer organization claim rather than coercing it', async () => {
    // A bare parseInt would turn a UUID subject into a plausible-looking org id.
    const next = vi.fn();
    enforceTenantLifecycle(
      makeReq({ user: { userId: '7', organizationId: '3f1c2a10-dead-beef' } }),
      makeRes(),
      next
    );
    await settle();
    expect(getTenantAccessPosture).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
  });
});

describe('idempotency', () => {
  it('short-circuits when an outer mount already decided the request', async () => {
    const next = vi.fn();
    const req = makeReq({ tenantPosture: posture() });
    enforceTenantLifecycle(req, makeRes(), next);
    await settle();
    expect(next).toHaveBeenCalledOnce();
    expect(getTenantAccessPosture).not.toHaveBeenCalled();
  });

  it('lets CORS preflight through untouched', async () => {
    const next = vi.fn();
    enforceTenantLifecycle(makeReq({ method: 'OPTIONS' }), makeRes(), next);
    await settle();
    expect(next).toHaveBeenCalledOnce();
    expect(getTenantAccessPosture).not.toHaveBeenCalled();
  });
});

/**
 * D6, 2026-10-05 (docs/evidence/D6/2026-10-05-cross-tenant-staff/): the guard
 * read req.user.role / roles to decide the platform override. Behind the auth
 * gate those are the tenant MEMBERSHIP role (organization_users.role, no
 * CHECK), so a member of a suspended tenant whose membership row named a
 * platform role shrugged off the suspension, while real platform staff (who
 * hold platform_role_grants rows) were refused. Standing is now
 * holdsPlatformRole: the owner's own sign-in on PLATFORM_ADMIN_EMAILS, or an
 * active super_admin / platform_admin grant row.
 */
const suspended = () =>
  posture({ decision: 'deny', state: 'suspended', code: 'TENANT_SUSPENDED', reason: 'Suspended.' });
const overrides = () =>
  decisionInc.mock.calls.filter(([labels]) => (labels as { decision?: string } | undefined)?.decision === 'platform_override');

describe('D6: the platform override is a platform grant, never the membership role: a suspended tenant', () => {
  it.each(['super_admin', 'platform_admin', 'app_super_admin'])(
    'a member of a suspended tenant whose membership role is %s, with no grant, is REFUSED',
    async role => {
      getTenantAccessPosture.mockResolvedValue(suspended());
      const next = vi.fn();
      const res = makeRes();
      enforceTenantLifecycle(makeReq({ method: 'POST', user: { userId: '11', organizationId: '42', role } }), res, next);
      await settle();
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(403);
      expect(res.body).toEqual({ error: { code: 'TENANT_SUSPENDED', message: 'Suspended.' } });
      expect(overrides()).toHaveLength(0);
      expect(logAuditEvent).not.toHaveBeenCalled();
    }
  );

  it.each(['super_admin', 'platform_admin'])(
    'an active %s grant holder PROCEEDS past the suspension, and the override is recorded',
    async role => {
      grants.set(12, [role]);
      getTenantAccessPosture.mockResolvedValue(suspended());
      const next = vi.fn();
      const res = makeRes();
      // An ordinary membership role: the grant row is the whole of the standing.
      enforceTenantLifecycle(
        makeReq({ method: 'POST', user: { userId: '12', organizationId: '42', role: 'member' } }),
        res,
        next
      );
      await settle();
      expect(next).toHaveBeenCalledOnce();
      expect(res.statusCode).toBe(0);
      expect(decisionInc).toHaveBeenCalledWith({ decision: 'platform_override', state: 'suspended' });
      expect(query).toHaveBeenCalledWith(expect.stringMatching(/FROM platform_role_grants/), [12, expect.arrayContaining([role])]);
      await vi.waitFor(() => expect(logAuditEvent).toHaveBeenCalledOnce());
      expect(logAuditEvent.mock.calls[0][0]).toMatchObject({
        action: 'tenant_lifecycle_override',
        userId: '12',
        organizationId: '42',
        success: true,
      });
    }
  );

  it('a grant for a role the override does not accept (support) is not an override', async () => {
    grants.set(13, ['support']);
    getTenantAccessPosture.mockResolvedValue(suspended());
    const next = vi.fn();
    const res = makeRes();
    enforceTenantLifecycle(makeReq({ user: { userId: '13', organizationId: '42', role: 'member' } }), res, next);
    await settle();
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(overrides()).toHaveLength(0);
  });

});

describe('D6: the platform override is a platform grant, never the membership role: unreadable posture, lookup failure, owner sign-in', () => {
  it.each([
    ['the posture is unreadable', () => getTenantAccessPosture.mockResolvedValue(null)],
    ['the posture lookup throws', () => getTenantAccessPosture.mockRejectedValue(new Error('db is on fire'))],
  ])('%s: a membership super_admin with no grant gets 503, not the staff override', async (_label, arrange) => {
    arrange();
    const next = vi.fn();
    const res = makeRes();
    enforceTenantLifecycle(makeReq({ user: { userId: '11', organizationId: '42', role: 'super_admin' } }), res, next);
    await settle();
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(503);
    expect(res.body.error.code).toBe('TENANT_STATE_UNVERIFIED');
    expect(overrides()).toHaveLength(0);
  });

  it.each([
    ['the posture is unreadable', () => getTenantAccessPosture.mockResolvedValue(null)],
    ['the posture lookup throws', () => getTenantAccessPosture.mockRejectedValue(new Error('db is on fire'))],
  ])('%s: a platform_admin grant holder proceeds, counted as an override', async (_label, arrange) => {
    arrange();
    grants.set(12, ['platform_admin']);
    const next = vi.fn();
    const res = makeRes();
    enforceTenantLifecycle(makeReq({ user: { userId: '12', organizationId: '42', role: 'member' } }), res, next);
    await settle();
    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(0);
    expect(decisionInc).toHaveBeenCalledWith({ decision: 'platform_override', state: 'unknown' });
  });

  it('a grant lookup that errors refuses: fail closed, never an override', async () => {
    query.mockRejectedValue(new Error('platform_role_grants unreachable'));
    getTenantAccessPosture.mockResolvedValue(suspended());
    const next = vi.fn();
    const res = makeRes();
    enforceTenantLifecycle(makeReq({ user: { userId: '11', organizationId: '42', role: 'super_admin' } }), res, next);
    await settle();
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.body.error.code).toBe('TENANT_SUSPENDED');
  });

  it("the owner's own sign-in on PLATFORM_ADMIN_EMAILS proceeds with no grant lookup; a SAML session asserting that e-mail does not", async () => {
    process.env.PLATFORM_ADMIN_EMAILS = 'owner@concept2cure.ai';
    getTenantAccessPosture.mockResolvedValue(suspended());
    const owner = { userId: '14', organizationId: '42', role: 'member', email: 'owner@concept2cure.ai' };

    const next = vi.fn();
    const res = makeRes();
    enforceTenantLifecycle(makeReq({ user: owner }), res, next);
    await settle();
    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(0);
    expect(grantLookups()).toBe(0);

    const fedNext = vi.fn();
    const fedRes = makeRes();
    enforceTenantLifecycle(makeReq({ user: owner, identity: { provider: 'saml' } }), fedRes, fedNext);
    await settle();
    expect(fedNext).not.toHaveBeenCalled();
    expect(fedRes.statusCode).toBe(403);
  });

  it.each([
    ['an active tenant, POST', posture(), 'POST'],
    ['a read-only tenant, GET', posture({ decision: 'read_only', state: 'past_due', code: 'TENANT_PAST_DUE' }), 'GET'],
  ])('a request the posture admits (%s) makes NO platform_role_grants query', async (_label, admitted, method) => {
    grants.set(1, ['super_admin']);
    getTenantAccessPosture.mockResolvedValue(admitted);
    for (const user of [
      { userId: '1', organizationId: '42', role: 'member' }, // a grant holder
      { userId: '11', organizationId: '42', role: 'super_admin' }, // a membership role naming a platform role
      { userId: '7', organizationId: '42', role: 'member' }, // an ordinary member
    ]) {
      const next = vi.fn();
      const res = makeRes();
      enforceTenantLifecycle(makeReq({ method, user }), res, next);
      await settle();
      expect(next).toHaveBeenCalledOnce();
      expect(res.statusCode).toBe(0);
    }
    expect(grantLookups()).toBe(0);
    expect(query).not.toHaveBeenCalled();
  });
});
