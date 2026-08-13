/**
 * The storage quota guard, pinned in isolation.
 *
 * The accounting service and the pool are mocked so the guard's own decisions —
 * which requests it looks at, the carve-outs, report mode, and the deliberate
 * fail-OPEN arm — are asserted without a database. The quota policy itself is
 * tested next door in services/tenant/__tests__/tenant-storage.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock is hoisted above the imports, so every spy has to be created inside
// vi.hoisted or the factory closes over a not-yet-initialized binding.
const { getTenantStorage, isStorageEnforcementOn, recordAdmittedBytes, query } = vi.hoisted(() => ({
  getTenantStorage: vi.fn(),
  isStorageEnforcementOn: vi.fn(),
  recordAdmittedBytes: vi.fn(),
  query: vi.fn(),
}));

vi.mock('../../services/tenant/tenant-storage', async importOriginal => {
  const actual = await importOriginal<typeof import('../../services/tenant/tenant-storage')>();
  // evaluateStorageQuota stays REAL: mocking the decision would leave this file
  // asserting only that a mock was called, and the guard's job is to act on a
  // real decision.
  return { ...actual, getTenantStorage, isStorageEnforcementOn, recordAdmittedBytes };
});

vi.mock('../../db', () => ({ getPool: () => ({ query }) }));

import { CONTENT_BEARING_BYTES, enforceStorageQuota, isContentBearing } from '../storageQuotaGuard';

const GB = 1024 ** 3;

function makeReq(overrides: Record<string, any> = {}): any {
  const headers: Record<string, string> = {
    'content-type': 'multipart/form-data; boundary=x',
    'content-length': String(10 * 1024 * 1024),
    ...(overrides.headers ?? {}),
  };
  return {
    method: 'POST',
    baseUrl: '',
    path: '/api/documents/upload',
    user: { userId: '7', organizationId: '42', role: 'member' },
    get: (name: string) => headers[name.toLowerCase()],
    ...overrides,
    headers,
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

/** The guard resolves usage asynchronously; give the microtask queue a turn. */
const settle = () => new Promise(resolve => setImmediate(resolve));

/** Set the tenant's measured usage and its max_storage (GB). */
function withTenant(usedBytes: number, maxStorageGb: number | null) {
  getTenantStorage.mockResolvedValue({
    organizationId: 42,
    bytes: usedBytes,
    measured: 'partial',
    tablesCounted: 11,
    tablesFailed: [],
  });
  query.mockResolvedValue({ rows: [{ max_storage: maxStorageGb }] });
}

beforeEach(() => {
  vi.clearAllMocks();
  isStorageEnforcementOn.mockReturnValue(true);
});

describe('which requests the guard looks at', () => {
  it('evaluates a multipart upload', () => {
    expect(isContentBearing(makeReq())).toBe(true);
  });

  it('evaluates a raw octet-stream body', () => {
    expect(
      isContentBearing(
        makeReq({ headers: { 'content-type': 'application/octet-stream', 'content-length': '500' } })
      )
    ).toBe(true);
  });

  it('evaluates any write with a large declared body, whatever its type', () => {
    // A base64 payload inside a JSON POST stores bytes just as surely as multer
    // does, and the guard must not depend on a route choosing a content type.
    expect(
      isContentBearing(
        makeReq({
          headers: {
            'content-type': 'application/json',
            'content-length': String(CONTENT_BEARING_BYTES),
          },
        })
      )
    ).toBe(true);
  });

  it('ignores a small JSON mutation', () => {
    // A storage limit must block STORAGE, not every write. Refusing a project
    // rename because a tenant is near its disk quota conflates metering with
    // suspension, and suspension is the lifecycle guard's job.
    expect(
      isContentBearing(
        makeReq({ headers: { 'content-type': 'application/json', 'content-length': '412' } })
      )
    ).toBe(false);
  });

  it('ignores reads entirely, however large the response will be', () => {
    expect(isContentBearing(makeReq({ method: 'GET' }))).toBe(false);
    expect(isContentBearing(makeReq({ method: 'DELETE' }))).toBe(false);
  });

  it('treats a chunked upload as content-bearing with zero declared bytes', () => {
    // No Content-Length. The check degrades to "is this tenant already over?",
    // which is still a real refusal — just not a pre-flight one.
    const req = makeReq({
      headers: { 'content-type': 'multipart/form-data; boundary=x' },
    });
    delete req.headers['content-length'];
    expect(isContentBearing(req)).toBe(true);
  });

  it('ignores a malformed Content-Length rather than trusting it', () => {
    expect(
      isContentBearing(
        makeReq({ headers: { 'content-type': 'application/json', 'content-length': 'not-a-number' } })
      )
    ).toBe(false);
  });
});

describe('the decision', () => {
  it('admits an upload that fits and charges it against the cached figure', async () => {
    withTenant(GB, 5);
    const req = makeReq();
    const res = makeRes();
    const next = vi.fn();

    enforceStorageQuota(req, res, next);
    await settle();

    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(0);
    // Charging admitted bytes is what stops a bulk import walking through the
    // cache window; without it the quota holds on paper only.
    expect(recordAdmittedBytes).toHaveBeenCalledWith(42, 10 * 1024 * 1024);
  });

  it('refuses an upload that would cross the limit, with the numbers in the body', async () => {
    withTenant(5 * GB, 5);
    const req = makeReq();
    const res = makeRes();
    const next = vi.fn();

    enforceStorageQuota(req, res, next);
    await settle();

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(413);
    expect(res.body.error.code).toBe('TENANT_STORAGE_QUOTA_EXCEEDED');
    // The only useful next action — delete something or buy more — depends on
    // knowing how far over the request is.
    expect(res.body.error.details).toMatchObject({
      usedBytes: 5 * GB,
      limitBytes: 5 * GB,
      incomingBytes: 10 * 1024 * 1024,
    });
    expect(recordAdmittedBytes).not.toHaveBeenCalled();
  });

  it('never refuses a tenant whose plan is unlimited', async () => {
    // billing.ts writes -1 for unlimited plans.
    withTenant(900 * GB, -1);
    const req = makeReq();
    const res = makeRes();
    const next = vi.fn();

    enforceStorageQuota(req, res, next);
    await settle();

    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(0);
  });

  it('attaches the decision for downstream handlers and the UI', async () => {
    withTenant(GB, 5);
    const req = makeReq();
    enforceStorageQuota(req, makeRes(), vi.fn());
    await settle();
    expect(req.storageQuota).toMatchObject({ outcome: 'allowed', limitBytes: 5 * GB });
  });

  it('short-circuits a request an outer mount already evaluated', async () => {
    const req = makeReq({ storageQuota: { outcome: 'allowed', allowed: true } });
    const next = vi.fn();
    enforceStorageQuota(req, makeRes(), next);
    expect(next).toHaveBeenCalledOnce();
    expect(getTenantStorage).not.toHaveBeenCalled();
  });
});

describe('report mode', () => {
  it('lets an over-quota upload through but still counts and logs it', async () => {
    // Report mode is not inert. The reconciliation window needs to show exactly
    // who WOULD be refused before enforcement is switched on; a mode that skips
    // the computation gives an operator nothing to reconcile against.
    isStorageEnforcementOn.mockReturnValue(false);
    withTenant(5 * GB, 5);
    const req = makeReq();
    const res = makeRes();
    const next = vi.fn();

    enforceStorageQuota(req, res, next);
    await settle();

    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(0);
    expect(req.storageQuota.allowed).toBe(false);
  });
});

describe('carve-outs and non-tenant requests', () => {
  it('lets a tenant over quota still reach billing', async () => {
    // Locking the "buy more storage" page behind the storage limit is the same
    // bug as locking the paywall behind the paywall.
    withTenant(50 * GB, 5);
    const req = makeReq({ path: '/api/billing/checkout' });
    const res = makeRes();
    const next = vi.fn();

    enforceStorageQuota(req, res, next);
    await settle();

    expect(next).toHaveBeenCalledOnce();
    expect(getTenantStorage).not.toHaveBeenCalled();
  });

  it('passes through an identity with no numeric organization', async () => {
    const req = makeReq({ user: { userId: '7', role: 'member' }, tenantContext: undefined });
    const next = vi.fn();
    enforceStorageQuota(req, makeRes(), next);
    await settle();
    expect(next).toHaveBeenCalledOnce();
    expect(getTenantStorage).not.toHaveBeenCalled();
  });

  it('does not accept a non-numeric organization id as a tenant', async () => {
    // A bare parseInt would turn a UUID subject into a plausible-looking org id
    // and meter an unrelated tenant.
    const req = makeReq({ user: { userId: '7', organizationId: '9f2c-uuid', role: 'member' } });
    const next = vi.fn();
    enforceStorageQuota(req, makeRes(), next);
    await settle();
    expect(next).toHaveBeenCalledOnce();
    expect(getTenantStorage).not.toHaveBeenCalled();
  });
});

describe('the fail-OPEN arm', () => {
  it('allows the upload when usage cannot be measured', async () => {
    // Deliberately the OPPOSITE of the lifecycle guard, which answers 503.
    // Entitlement is a security property and must fail closed; a storage quota
    // is commercial metering, and failing closed there means one database hiccup
    // stops every upload on the platform — regulated submission work included.
    getTenantStorage.mockRejectedValue(new Error('connection terminated'));
    query.mockResolvedValue({ rows: [{ max_storage: 5 }] });
    const req = makeReq();
    const res = makeRes();
    const next = vi.fn();

    enforceStorageQuota(req, res, next);
    await settle();

    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(0);
    expect(req.storageQuota).toBeUndefined();
  });

  it('allows the upload when the limit cannot be read', async () => {
    withTenant(GB, 5);
    query.mockRejectedValue(new Error('relation "organizations" does not exist'));
    const res = makeRes();
    const next = vi.fn();

    enforceStorageQuota(makeReq(), res, next);
    await settle();

    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(0);
  });

  it('does not refuse when the organization row has vanished', async () => {
    // Note what this does NOT pin: `null` and `0` are indistinguishable here by
    // design, because a non-positive limit already means unlimited (see
    // evaluateStorageQuota, and seat-licensing's identical rule for
    // seats_purchased). A mutation turning the missing-row return into 0 is
    // therefore invisible to this test and harmless in production. What matters
    // is the arm asserted below: a tenant whose row cannot be found mid-migration
    // keeps working rather than losing every upload.
    getTenantStorage.mockResolvedValue({
      organizationId: 42,
      bytes: 50 * GB,
      measured: 'partial',
      tablesCounted: 11,
      tablesFailed: [],
    });
    query.mockResolvedValue({ rows: [] });
    const res = makeRes();
    const next = vi.fn();

    enforceStorageQuota(makeReq(), res, next);
    await settle();

    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(0);
  });
});
