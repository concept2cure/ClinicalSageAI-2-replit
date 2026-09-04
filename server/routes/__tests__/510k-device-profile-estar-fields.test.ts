/**
 * GET/PUT /api/510k/device/profile — the five device-level eSTAR
 * administrative facts (WO-8 Phase 3): common name, classification name,
 * regulation number, associated product codes, IFU citation.
 *
 * These columns are the governed sources the official eSTAR's 510(k) Summary,
 * Classification and Labeling fields are filled from, so the profile READ must
 * select them and the WRITE must accept them — trimmed, with '' or null
 * CLEARING the column (a fact the platform does not hold is blank on the form,
 * never a stale value). The request-scoped client is faked; what is asserted
 * is the handler's contract: the SELECT's column list and the UPDATE's `set`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRequest, createMockResponse } from '../../../tests/setup';

const { mockSelectRows, mockSelectFields, mockSet, mockUpdateWhere } = vi.hoisted(() => ({
  mockSelectRows: vi.fn<() => unknown[]>(() => []),
  mockSelectFields: vi.fn<(fields: Record<string, unknown>) => void>(),
  mockSet: vi.fn<(values: Record<string, unknown>) => void>(),
  mockUpdateWhere: vi.fn(async () => undefined),
}));

vi.mock('../../auth', () => ({
  authMiddleware: (_req: any, _res: any, next: any) => next(),
}));

const { fakeDb } = vi.hoisted(() => ({
  fakeDb: { select: vi.fn(), update: vi.fn() } as any,
}));
vi.mock('../../db', () => ({ db: fakeDb }));
vi.mock('../../db/requestDb', () => ({ requestDb: () => fakeDb }));

vi.mock('../../services/integrations/openfda-device-client', () => ({
  searchDeviceClassification: vi.fn(),
  search510kClearances: vi.fn(),
}));
vi.mock('../../services/fda-recognized-standards/recognized-standards.service', () => ({
  lookupRecognizedStandards: vi.fn(),
}));

fakeDb.select = vi.fn((fields: Record<string, unknown>) => {
  mockSelectFields(fields);
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => ({ limit: vi.fn(async () => mockSelectRows()) })),
    })),
  };
});
fakeDb.update = vi.fn(() => ({
  set: vi.fn((values: Record<string, unknown>) => {
    mockSet(values);
    return { where: mockUpdateWhere };
  }),
}));

import deviceRoutes from '../510k-device-routes';
import { regulatoryPrograms } from '../../../shared/schema/programs';

function getHandler(path: string, method: 'get' | 'put') {
  const layer = deviceRoutes.stack.find(
    (l: any) => l.route?.path === path && l.route?.methods?.[method],
  ) as any;
  if (!layer?.route) throw new Error(`Missing route ${method.toUpperCase()} ${path}`);
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
  intendedUse: null,
  indication: null,
  predicateDevices: [],
  commonName: 'Continuous glucose monitor',
  classificationName: 'Glucose test system',
  regulationNumber: '21 CFR 862.1355',
  associatedProductCodes: 'QBJ, MDS',
  indicationsForUseCitation: 'Attachment 4, page 1',
};

function makeReq(overrides: Record<string, unknown> = {}) {
  const req = createMockRequest(overrides) as any;
  req.user = { organizationId: 2 };
  return req;
}

const PHASE3_COLUMNS = {
  commonName: regulatoryPrograms.commonName,
  classificationName: regulatoryPrograms.classificationName,
  regulationNumber: regulatoryPrograms.regulationNumber,
  associatedProductCodes: regulatoryPrograms.associatedProductCodes,
  indicationsForUseCitation: regulatoryPrograms.indicationsForUseCitation,
};

describe('GET /profile — the five eSTAR facts are read and returned', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectRows.mockReturnValue([PROGRAM]);
  });

  it('selects the five columns from regulatory_programs and returns them on `profile`', async () => {
    const req = makeReq({ query: { ident: PROGRAM.id } });
    const res = createMockResponse() as any;

    await getHandler('/profile', 'get')(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const selected = mockSelectFields.mock.calls[0][0] as Record<string, unknown>;
    for (const [key, column] of Object.entries(PHASE3_COLUMNS)) {
      expect(selected[key], `findProgram selects ${key}`).toBe(column);
    }
    expect(res.json.mock.calls[0][0].profile).toMatchObject({
      commonName: 'Continuous glucose monitor',
      classificationName: 'Glucose test system',
      regulationNumber: '21 CFR 862.1355',
      associatedProductCodes: 'QBJ, MDS',
      indicationsForUseCitation: 'Attachment 4, page 1',
    });
  });
});

describe('PUT /profile — the five eSTAR facts are written, trimmed, and clearable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectRows.mockReturnValue([PROGRAM]);
  });

  it('writes all five, trimmed, and answers { profile }', async () => {
    const req = makeReq({
      query: { ident: 'BX-204' },
      body: {
        commonName: '  Continuous glucose monitor ',
        classificationName: 'Glucose test system',
        regulationNumber: ' 21 CFR 862.1355',
        associatedProductCodes: 'QBJ, MDS ',
        indicationsForUseCitation: 'Attachment 4, page 1',
      },
    });
    const res = createMockResponse() as any;

    await getHandler('/profile', 'put')(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockUpdateWhere).toHaveBeenCalledTimes(1);
    expect(mockSet.mock.calls[0][0]).toMatchObject({
      commonName: 'Continuous glucose monitor',
      classificationName: 'Glucose test system',
      regulationNumber: '21 CFR 862.1355',
      associatedProductCodes: 'QBJ, MDS',
      indicationsForUseCitation: 'Attachment 4, page 1',
    });
    expect(Object.keys(res.json.mock.calls[0][0])).toEqual(['profile']);
  });

  it("'' and null CLEAR a fact (written as null); an absent fact is not touched", async () => {
    const req = makeReq({
      query: { ident: 'BX-204' },
      body: { commonName: '', regulationNumber: null, associatedProductCodes: '   ' },
    });
    const res = createMockResponse() as any;

    await getHandler('/profile', 'put')(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const written = mockSet.mock.calls[0][0] as Record<string, unknown>;
    expect(written.commonName).toBeNull();
    expect(written.regulationNumber).toBeNull();
    expect(written.associatedProductCodes).toBeNull();
    // Not named in the body ⇒ not in the UPDATE at all (never written as NULL).
    expect(written).not.toHaveProperty('classificationName');
    expect(written).not.toHaveProperty('indicationsForUseCitation');
    expect(written).not.toHaveProperty('productName');
  });

  it('a body that only clears one fact still counts as a change', async () => {
    const req = makeReq({ query: { ident: 'BX-204' }, body: { indicationsForUseCitation: null } });
    const res = createMockResponse() as any;

    await getHandler('/profile', 'put')(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockSet.mock.calls[0][0]).toMatchObject({ indicationsForUseCitation: null });
  });

  it.each<[string, number]>([
    ['commonName', 501],
    ['classificationName', 501],
    ['regulationNumber', 51],
    ['associatedProductCodes', 501],
    ['indicationsForUseCitation', 1001],
  ])('%s over its limit is refused 400 and nothing is written', async (key, length) => {
    const req = makeReq({ query: { ident: 'BX-204' }, body: { [key]: 'x'.repeat(length) } });
    const res = createMockResponse() as any;

    await getHandler('/profile', 'put')(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error).toBe('Invalid profile patch');
    expect(mockUpdateWhere).not.toHaveBeenCalled();
  });

  it('a program outside the caller org is 404 and nothing is written', async () => {
    mockSelectRows.mockReturnValue([]);
    const req = makeReq({ query: { ident: PROGRAM.id }, body: { commonName: 'x' } });
    const res = createMockResponse() as any;

    await getHandler('/profile', 'put')(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockUpdateWhere).not.toHaveBeenCalled();
  });
});
