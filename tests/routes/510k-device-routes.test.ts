import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRequest, createMockResponse } from '../setup';

const { mockSelectRows, mockUpdateWhere, mockLogAction, mockClassification, mockClearances, mockStandards } = vi.hoisted(() => ({
  mockSelectRows: vi.fn<[], unknown[]>(() => []),
  mockUpdateWhere: vi.fn(async () => undefined),
  mockLogAction: vi.fn(async () => ({ persisted: true, chained: true, tamperProof: true })),
  /* The recognized-standards service is mocked so these tests assert the
     ROUTE's job — org scoping, ident → product-code resolution, and passing the
     service's labelled envelope through untouched. The service's own three
     outcomes are pinned in
     server/services/fda-recognized-standards/__tests__/recognized-standards.test.ts. */
  mockStandards: vi.fn(async (productCode: string | null | undefined) => ({
    productCode: productCode ? String(productCode).toUpperCase() : null,
    available: false,
    unavailableReason: 'The FDA recognized-consensus-standards dataset has not been vendored',
    datasetLoaded: false,
    standards: [],
    matched: 0,
    source: 'fda-recognized-consensus-standards' as const,
  })),
  mockClassification: vi.fn(async () => ({
    available: false,
    unavailableReason: 'openFDA device/classification.json unreachable: test',
    results: [],
    source: 'openfda',
  })),
  mockClearances: vi.fn(async () => ({
    available: true,
    results: [
      {
        kNumber: 'K250001',
        deviceName: 'Continuous Glucose Monitor',
        applicant: 'Acme Medical',
        productCode: 'QBD',
        decisionDate: '2025-04-01',
        decisionCode: 'SESE',
        clearanceType: 'Traditional',
      },
    ],
    source: 'openfda',
  })),
}));

vi.mock('../../server/auth', () => ({
  authMiddleware: (_req: any, _res: any, next: any) => next(),
}));

// The route reads and writes through `requestDb(req)` — the REQUEST-SCOPED
// drizzle client — rather than the shared pool, so that its queries run on the
// connection carrying the tenant session vars. Mocking `server/db` alone stopped
// intercepting anything when that changed; the fake is now returned from
// `requestDb` so these tests exercise the same handler logic against the same
// shape. `requestDb` deliberately THROWS when the middleware has not attached a
// client, which is what surfaced this.
// Built inside vi.hoisted: vi.mock is hoisted above ordinary top-level consts,
// so a factory closing over a plain `const fakeDb` reads it before initialization.
const { fakeDb } = vi.hoisted(() => ({
  fakeDb: {
    select: vi.fn(),
    update: vi.fn(),
  } as any,
}));
vi.mock('../../server/db', () => ({ db: fakeDb }));
vi.mock('../../server/db/requestDb', () => ({ requestDb: () => fakeDb }));

vi.mock('../../server/services/auditService', () => ({
  default: { logAction: mockLogAction },
  logAction: mockLogAction,
}));

vi.mock('../../server/services/integrations/openfda-device-client', () => ({
  searchDeviceClassification: mockClassification,
  search510kClearances: mockClearances,
}));

vi.mock('../../server/services/fda-recognized-standards/recognized-standards.service', () => ({
  lookupRecognizedStandards: mockStandards,
}));

// Behaviour is attached AFTER the hoisted shell exists, where mockSelectRows /
// mockUpdateWhere are in scope.
fakeDb.select = vi.fn(() => ({
  from: vi.fn(() => ({
    where: vi.fn(() => ({ limit: vi.fn(async () => mockSelectRows()) })),
  })),
}));
fakeDb.update = vi.fn(() => ({ set: vi.fn(() => ({ where: mockUpdateWhere })) }));

import deviceRoutes from '../../server/routes/510k-device-routes';

function routeLayer(path: string, method: 'get' | 'put') {
  const layer = deviceRoutes.stack.find(
    (l: any) => l.route?.path === path && l.route?.methods?.[method],
  );
  if (!layer) throw new Error(`Missing route ${method.toUpperCase()} ${path}`);
  return layer;
}

function getHandler(path: string, method: 'get' | 'put') {
  const layer = routeLayer(path, method);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

/**
 * The WHOLE middleware chain of a route, in order — the role gate and the
 * entitlement gate included. `getHandler` above reaches straight for the final
 * handler, which is right for the handler's own contract and blind to every
 * gate in front of it; an authorization test has to run the chain.
 */
function runChain(path: string, method: 'get' | 'put') {
  const handlers = routeLayer(path, method).route.stack.map((s: any) => s.handle);
  return async (req: any, res: any) => {
    for (const handle of handlers) {
      let advanced = false;
      await handle(req, res, () => {
        advanced = true;
      });
      if (!advanced) return;
    }
  };
}

const PROGRAM = {
  id: '2b6d4a80-6a35-4b1e-9f6e-3a9d2c1e5f70',
  name: 'BX-204 CGM',
  code: 'BX-204',
  productName: 'BX-204 Continuous Glucose Monitor',
  productType: 'device',
  deviceClass: 'II',
  regulatoryPath: '510k',
  productCode: 'QBD',
  intendedUse: 'Continuous measurement of interstitial glucose.',
  indication: null,
  predicateDevices: [],
};

/**
 * An EDITOR principal with a real numeric actor id — what the platform's
 * authentication middleware attaches. Both matter to the governed profile
 * WRITE: it is role-gated (GOVERNED_WRITE_ROLES) and audited against the session's actor
 * (no actor ⇒ refused rather than audited against an invented id).
 */
function makeReq(overrides: Record<string, unknown> = {}) {
  const req = createMockRequest(overrides) as any;
  req.user = { id: 7, organizationId: 2, role: 'manager' };
  req.userId = 7;
  req.userRole = 'manager';
  return req;
}

/** The same principal with a numeric tenant context, for chain-level tests. */
function makeChainReq(role: string, overrides: Record<string, unknown> = {}) {
  const req = makeReq({ tenantContext: { organizationId: 2 }, ...overrides });
  req.user.role = role;
  req.userRole = role;
  return req;
}

describe('510(k) device profile + openFDA lookups', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectRows.mockReturnValue([PROGRAM]);
  });

  it('serves the org-scoped device profile', async () => {
    const req = makeReq({ query: { ident: PROGRAM.id } });
    const res = createMockResponse() as any;

    await getHandler('/profile', 'get')(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ profile: expect.objectContaining({ code: 'BX-204' }) });
  });

  it('404s a profile outside the caller org without leaking data', async () => {
    mockSelectRows.mockReturnValue([]);
    const req = makeReq({ query: { ident: PROGRAM.id } });
    const res = createMockResponse() as any;

    await getHandler('/profile', 'get')(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    const payload = res.json.mock.calls[0][0];
    expect(JSON.stringify(payload)).not.toContain('BX-204');
  });

  it('updates intake fields and returns the fresh profile', async () => {
    const req = makeReq({
      query: { ident: 'BX-204' },
      body: { deviceClass: 'II', productCode: 'QBD', intendedUse: 'CGM for adults.' },
    });
    const res = createMockResponse() as any;

    await getHandler('/profile', 'put')(req, res);

    expect(mockUpdateWhere).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('rejects an invalid device class instead of writing it', async () => {
    const req = makeReq({ query: { ident: 'BX-204' }, body: { deviceClass: 'IV' } });
    const res = createMockResponse() as any;

    await getHandler('/profile', 'put')(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockUpdateWhere).not.toHaveBeenCalled();
  });

  it('passes through an honest unavailable classification result', async () => {
    const req = makeReq({ query: { deviceName: 'glucose monitor' } });
    const res = createMockResponse() as any;

    await getHandler('/classification', 'get')(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ available: false, results: [] }),
    );
  });

  it('labels predicate fallback results as reduced', async () => {
    const req = makeReq({ query: { productCode: 'QBD' } });
    const res = createMockResponse() as any;

    await getHandler('/predicates', 'get')(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        reduced: true,
        source: 'openfda',
        results: [expect.objectContaining({ kNumber: 'K250001' })],
      }),
    );
  });
});

/**
 * PUT /profile writes the device trade name, common name, classification name,
 * regulation number and product codes that get PRINTED ON A FILED FDA
 * SUBMISSION. It used to carry only `requireEntitlement`, which is a
 * subscription-TIER check and a no-op unless ENTITLEMENTS_ENFORCE is set — so
 * any authenticated member of the org, a read-only viewer included, could
 * rewrite them, and nothing recorded who did.
 *
 * WHO MAY WRITE is now one decision in one place: GOVERNED_WRITE_ROLES in
 * middleware/orgMembership.ts. The organization vocabulary is
 * `admin | manager | member | viewer`, so `viewer` is the single org role
 * refused here — a viewer reads, everyone else in the organization can work.
 * The four private copies this route used to carry admitted
 * `{admin, owner, editor, super_admin}`, of which only `admin` is an
 * organization role at all: `manager` was refused despite sitting above
 * `member`, and `member` — what SSO provisioning assigns — was refused too, so
 * every SSO-onboarded user was locked out of the whole workflow.
 */
describe('PUT /profile — the governed write is role-gated and audited', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectRows.mockReturnValue([PROGRAM]);
  });

  it('runs the role gate BEFORE the entitlement gate', () => {
    const names = routeLayer('/profile', 'put').route.stack.map((s: any) => s.handle.name);
    expect(names.slice(0, 2)).toEqual(['requireEditorAccess', 'requireEntitlementMiddleware']);
  });

  it.each(['viewer', 'reviewer', 'guest', ''])(
    'a %s is refused 403 and NO row is updated and NO audit row is written',
    async (role) => {
      const req = makeChainReq(role, {
        query: { ident: 'BX-204' },
        body: { productName: 'Rewritten By A Viewer' },
      });
      const res = createMockResponse() as any;

      await runChain('/profile', 'put')(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Insufficient permissions' });
      expect(mockUpdateWhere).not.toHaveBeenCalled();
      expect(mockLogAction).not.toHaveBeenCalled();
    },
  );

  it.each(['admin', 'manager', 'member', 'owner', 'super_admin'])('a %s succeeds', async (role) => {
    const req = makeChainReq(role, { query: { ident: 'BX-204' }, body: { commonName: 'CGM' } });
    const res = createMockResponse() as any;

    await runChain('/profile', 'put')(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockUpdateWhere).toHaveBeenCalledTimes(1);
  });

  it('a successful patch writes exactly ONE audit row naming the changed fields', async () => {
    const req = makeChainReq('manager', {
      query: { ident: 'BX-204' },
      body: { commonName: 'Continuous glucose monitor', regulationNumber: '21 CFR 862.1355' },
    });
    const res = createMockResponse() as any;

    await runChain('/profile', 'put')(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockLogAction).toHaveBeenCalledTimes(1);
    expect(mockLogAction.mock.calls[0][0]).toEqual({
      organizationId: 2,
      userId: 7,
      action: 'DEVICE_PROFILE_UPDATED',
      resourceType: 'regulatory_program',
      resourceId: PROGRAM.id,
      details: { fields: ['commonName', 'regulationNumber'] },
    });
  });

  it('a rejected patch writes NO audit row', async () => {
    const req = makeChainReq('manager', { query: { ident: 'BX-204' }, body: { deviceClass: 'IV' } });
    const res = createMockResponse() as any;

    await runChain('/profile', 'put')(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockUpdateWhere).not.toHaveBeenCalled();
    expect(mockLogAction).not.toHaveBeenCalled();
  });

  it('a program outside the caller org writes no audit row either', async () => {
    mockSelectRows.mockReturnValue([]);
    const req = makeChainReq('manager', { query: { ident: 'BX-204' }, body: { commonName: 'CGM' } });
    const res = createMockResponse() as any;

    await runChain('/profile', 'put')(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockLogAction).not.toHaveBeenCalled();
  });

  it('refuses the write when no actor resolves — never audits an invented id', async () => {
    const req = makeChainReq('manager', { query: { ident: 'BX-204' }, body: { commonName: 'CGM' } });
    delete req.userId;
    delete req.user.id;
    const res = createMockResponse() as any;

    await runChain('/profile', 'put')(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Authenticated actor required' });
    expect(mockUpdateWhere).not.toHaveBeenCalled();
    expect(mockLogAction).not.toHaveBeenCalled();
  });

  it('leaves the READS open — a viewer can still read the profile', async () => {
    const req = makeChainReq('viewer', { query: { ident: PROGRAM.id } });
    const res = createMockResponse() as any;

    await runChain('/profile', 'get')(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe('GET /standards — recognized consensus standards for a product code', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectRows.mockReturnValue([PROGRAM]);
  });

  it('refuses without an organization context', async () => {
    const req = createMockRequest({ query: { productCode: 'QBD' } }) as any;
    req.user = undefined; // tenantContext id is a slug, so nothing numeric resolves
    const res = createMockResponse() as any;

    await getHandler('/standards', 'get')(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockStandards).not.toHaveBeenCalled();
  });

  it('rejects a query naming neither a program nor a product code', async () => {
    const req = makeReq({ query: {} });
    const res = createMockResponse() as any;

    await getHandler('/standards', 'get')(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockStandards).not.toHaveBeenCalled();
  });

  it("resolves the org's own program to its product code", async () => {
    const req = makeReq({ query: { ident: PROGRAM.id } });
    const res = createMockResponse() as any;

    await getHandler('/standards', 'get')(req, res);

    expect(mockStandards).toHaveBeenCalledWith('QBD');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('404s a program outside the caller org without looking anything up or leaking it', async () => {
    mockSelectRows.mockReturnValue([]);
    const req = makeReq({ query: { ident: PROGRAM.id } });
    const res = createMockResponse() as any;

    await getHandler('/standards', 'get')(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockStandards).not.toHaveBeenCalled();
    expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain('QBD');
  });

  it('prefers an explicit product code over the saved one — an unsaved edit is checkable', async () => {
    const req = makeReq({ query: { ident: PROGRAM.id, productCode: 'MDS' } });
    const res = createMockResponse() as any;

    await getHandler('/standards', 'get')(req, res);

    expect(mockStandards).toHaveBeenCalledWith('MDS');
  });

  it('answers 200 with the labelled unavailable envelope, not an error or an empty list', async () => {
    const req = makeReq({ query: { productCode: 'QBD' } });
    const res = createMockResponse() as any;

    await getHandler('/standards', 'get')(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        available: false,
        datasetLoaded: false,
        standards: [],
        matched: 0,
        source: 'fda-recognized-consensus-standards',
        unavailableReason: expect.stringContaining('not been vendored'),
      }),
    );
  });

  it('passes a real, empty answer through as available — distinct from no dataset', async () => {
    mockStandards.mockResolvedValueOnce({
      productCode: 'QBD',
      available: true,
      datasetLoaded: true,
      standards: [],
      matched: 0,
      source: 'fda-recognized-consensus-standards',
    } as any);
    const req = makeReq({ query: { productCode: 'QBD' } });
    const res = createMockResponse() as any;

    await getHandler('/standards', 'get')(req, res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.available).toBe(true);
    expect(payload.datasetLoaded).toBe(true);
    expect(payload.matched).toBe(0);
  });
});
