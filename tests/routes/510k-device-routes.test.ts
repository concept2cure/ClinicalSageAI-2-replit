import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRequest, createMockResponse } from '../setup';

const { mockSelectRows, mockUpdateWhere, mockClassification, mockClearances } = vi.hoisted(() => ({
  mockSelectRows: vi.fn<[], unknown[]>(() => []),
  mockUpdateWhere: vi.fn(async () => undefined),
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

vi.mock('../../server/db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit: vi.fn(async () => mockSelectRows()) })),
      })),
    })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: mockUpdateWhere })) })),
  },
}));

vi.mock('../../server/services/integrations/openfda-device-client', () => ({
  searchDeviceClassification: mockClassification,
  search510kClearances: mockClearances,
}));

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
