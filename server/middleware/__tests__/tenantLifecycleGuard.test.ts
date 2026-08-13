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
const { getTenantAccessPosture } = vi.hoisted(() => ({ getTenantAccessPosture: vi.fn() }));

vi.mock('../../services/tenant/tenant-lifecycle', async importOriginal => {
  const actual = await importOriginal<typeof import('../../services/tenant/tenant-lifecycle')>();
  return { ...actual, getTenantAccessPosture };
});

import { enforceTenantLifecycle, isLifecycleCarveOut } from '../tenantLifecycleGuard';

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
  it('bypasses the guard for a platform super_admin', async () => {
    // Support has to be able to operate on a suspended tenant to un-suspend it.
    const next = vi.fn();
    const req = makeReq({ user: { userId: '1', organizationId: '42', role: 'super_admin' } });
    enforceTenantLifecycle(req, makeRes(), next);
    await settle();
    expect(next).toHaveBeenCalledOnce();
    expect(getTenantAccessPosture).not.toHaveBeenCalled();
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
