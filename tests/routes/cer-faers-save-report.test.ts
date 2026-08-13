/**
 * POST /api/cer/faers/save-report — the FAERS narrative save path.
 *
 * Pre-fix the raw INSERT named columns (title, content TEXT, ndc_code,
 * product_name, manufacturer) that the real cer_reports schema does not have,
 * so it failed on EVERY request and silently "continued with file storage" —
 * into a FLAT directory the tenant-scoped reader never looks at. Under test:
 *
 *   - org comes from the verified JWT (403 without it);
 *   - the insert maps onto the REAL schema: generated report_id, deviceName ←
 *     productName (falling back to the NDC identifier), json content/metadata;
 *   - the file copy lands in the per-tenant org-{orgId}/ directory that
 *     GET /reports/:id actually serves;
 *   - a DB failure is REPORTED in the response (database.saved=false +
 *     reason), never swallowed as full success;
 *   - GET /reports is org-scoped to the same per-tenant directory.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRequest, createMockResponse } from '../setup';

const { fsState, fakeDb, insertedValues } = vi.hoisted(() => ({
  fsState: {
    existsSync: vi.fn(() => true),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readdirSync: vi.fn(() => [] as string[]),
    readFileSync: vi.fn(() => '{}'),
  },
  fakeDb: { insert: vi.fn(), select: vi.fn(), update: vi.fn() } as any,
  insertedValues: { current: null as any, fail: false },
}));

vi.mock('fs', () => ({ default: fsState, ...fsState }));

vi.mock('../../server/db/requestDb', () => ({ requestDb: () => fakeDb }));

vi.mock('../../server/services/ai-gateway', () => ({ getGateway: vi.fn() }));
vi.mock('../../server/services/auditService', () => ({
  default: { logAction: vi.fn(async () => undefined) },
}));
vi.mock('../../server/services/cer', () => ({
  UnifiedCERService: class {},
  cerGenerationService: {},
}));

fakeDb.insert = vi.fn(() => ({
  values: vi.fn((v: any) => {
    insertedValues.current = v;
    return {
      returning: vi.fn(async () => {
        if (insertedValues.fail) throw new Error('column "nope" does not exist');
        return [{ id: 321 }];
      }),
    };
  }),
}));

import cerRoutes from '../../server/routes/cer-routes';

function getHandler(path: string, method: 'get' | 'post') {
  const layer = (cerRoutes as any).stack.find(
    (l: any) => l.route?.path === path && l.route?.methods?.[method],
  );
  if (!layer) throw new Error(`Missing route ${method.toUpperCase()} ${path}`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

const BODY = {
  title: 'CER narrative for NDC 0169-7501-11',
  content: 'Narrative body derived from FAERS data.',
  ndcCode: '0169-7501-11',
  productName: 'Ozempic',
  manufacturer: 'Novo Nordisk',
  metadata: { faersRecordCount: 25 },
};

function makeReq(body: Record<string, unknown>, orgId: number | null = 7) {
  const req = createMockRequest({ body }) as any;
  if (orgId !== null) req.user = { id: 12, organizationId: orgId };
  return req;
}

describe('POST /api/cer/faers/save-report', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertedValues.current = null;
    insertedValues.fail = false;
    fsState.existsSync.mockReturnValue(true);
  });

  it('403s without an authenticated org — no anonymous tenant-less writes', async () => {
    const req = makeReq(BODY, null);
    const res = createMockResponse() as any;

    await getHandler('/faers/save-report', 'post')(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(fakeDb.insert).not.toHaveBeenCalled();
    expect(fsState.writeFileSync).not.toHaveBeenCalled();
  });

  it('maps the drug narrative onto the real cer_reports schema and reports db success', async () => {
    const req = makeReq(BODY);
    const res = createMockResponse() as any;

    await getHandler('/faers/save-report', 'post')(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    const payload = res.json.mock.calls[0][0];
    expect(payload.saved).toBe(true);
    expect(payload.database).toEqual({ saved: true, id: 321 });
    expect(payload.id).toMatch(/^FAERS-/);

    const v = insertedValues.current;
    expect(v.organizationId).toBe(7); // from JWT, never the body
    expect(v.reportId).toBe(payload.id); // generated, NOT NULL UNIQUE column
    expect(v.deviceName).toBe('Ozempic'); // product naming
    expect(v.deviceManufacturer).toBe('Novo Nordisk');
    expect(v.content).toEqual({ title: BODY.title, narrative: BODY.content });
    expect(v.metadata).toMatchObject({ ndcCode: BODY.ndcCode, source: 'FAERS' });
    // None of the phantom columns of the old raw INSERT.
    expect(v).not.toHaveProperty('title');
    expect(v).not.toHaveProperty('ndc_code');

    // File copy lands in the per-tenant directory the reader serves.
    const writePath = String(fsState.writeFileSync.mock.calls[0][0]);
    expect(writePath).toContain(`org-7`);
    expect(writePath).toContain(payload.id);
  });

  it('falls back to the NDC identifier for deviceName when productName is absent', async () => {
    const { productName: _omit, manufacturer: _omit2, ...rest } = BODY;
    const req = makeReq(rest);
    const res = createMockResponse() as any;

    await getHandler('/faers/save-report', 'post')(req, res);

    expect(insertedValues.current.deviceName).toBe(`NDC ${BODY.ndcCode}`);
    expect(insertedValues.current.deviceManufacturer).toBeNull();
  });

  it('reports a database failure honestly instead of swallowing it', async () => {
    insertedValues.fail = true;
    const req = makeReq(BODY);
    const res = createMockResponse() as any;

    await getHandler('/faers/save-report', 'post')(req, res);

    expect(res.status).toHaveBeenCalledWith(201); // tenant file copy succeeded
    const payload = res.json.mock.calls[0][0];
    expect(payload.database.saved).toBe(false);
    expect(payload.database.reason).toMatch(/column/);
    expect(payload.message).toMatch(/database insert failed/i);
  });

  it('400s an invalid body', async () => {
    const req = makeReq({ title: '' });
    const res = createMockResponse() as any;

    await getHandler('/faers/save-report', 'post')(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(fakeDb.insert).not.toHaveBeenCalled();
  });
});

describe('GET /api/cer/reports (list)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('403s without an authenticated org', async () => {
    const req = makeReq({}, null);
    const res = createMockResponse() as any;

    await getHandler('/reports', 'get')(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('lists only the caller org directory — legacy flat files are not exposed', async () => {
    fsState.existsSync.mockReturnValue(true);
    fsState.readdirSync.mockReturnValue([]);
    const req = makeReq({});
    const res = createMockResponse() as any;

    await getHandler('/reports', 'get')(req, res);

    const listedDir = String(fsState.readdirSync.mock.calls[0][0]);
    expect(listedDir).toContain('org-7');
    expect(res.json).toHaveBeenCalledWith({ reports: [] });
  });
});
