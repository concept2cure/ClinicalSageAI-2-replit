import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRequest, createMockResponse } from '../setup';

const { mockSelectRows, mockUpdateWhere, mockClassification, mockClearances, mockStandards } = vi.hoisted(() => ({
  mockSelectRows: vi.fn<[], unknown[]>(() => []),
  mockUpdateWhere: vi.fn(async () => undefined),
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

function getHandler(path: string, method: 'get' | 'put') {
  const layer = deviceRoutes.stack.find(
    (l: any) => l.route?.path === path && l.route?.methods?.[method],
  );
  if (!layer) throw new Error(`Missing route ${method.toUpperCase()} ${path}`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
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

function makeReq(overrides: Record<string, unknown> = {}) {
  const req = createMockRequest(overrides) as any;
  req.user = { organizationId: 2 };
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
