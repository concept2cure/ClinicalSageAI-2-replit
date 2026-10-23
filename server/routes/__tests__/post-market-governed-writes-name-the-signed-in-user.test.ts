/**
 * Governed post-market writes are attributed to the signed-in user, and a
 * reporting period the caller declared is stored as declared or refused.
 *
 * Before (to 2026-10-15), in server/routes/gspr-postmarket.ts:
 *  - both generate routes recorded `userIdFromReq(req) ?? 'system'` as the
 *    creator, and PATCH, approve and supersede recorded 'system' as the editor,
 *    the approver and the creator of the new version, whenever the request
 *    carried no user. The write and its §11.10(e) row went through, attributed
 *    to nobody.
 *  - an unparseable reportingPeriodStart / reportingPeriodEnd became undefined,
 *    i.e. "not declared": a period the caller did state was dropped silently.
 *  - a start after the end was stored as the period
 *    (post-market-authoring.ts accepted it).
 *
 * The engine (post-market-authoring.ts) is real here; the store under it is not.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';

const ORG = 31;
const PROGRAM = '00000000-0000-4000-8000-0000000000a1';

const h = vi.hoisted(() => ({
  user: null as Record<string, unknown> | null,
  createDocument: vi.fn(),
  updateDocument: vi.fn(),
  approveDocument: vi.fn(),
  supersedeDocument: vi.fn(),
  generatePmcfPlan: vi.fn(),
  logAction: vi.fn(),
}));

vi.mock('../../middleware/auth', () => ({
  authenticateToken: (req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: unknown }).user = h.user;
    next();
  },
}));

vi.mock('../../db', () => ({
  // The engine reads cer_reports only for a relatedCerReportId, which no case sends.
  db: {},
  // programInOrganization: $1 is the program, $2 the organization.
  pool: {
    query: async (_sql: string, params: unknown[]) =>
      params[0] === PROGRAM && params[1] === ORG ? { rows: [{ id: PROGRAM }] } : { rows: [] },
  },
}));

vi.mock('../../services/gspr-postmarket/post-market.service', () => ({
  DOCUMENT_EDITABLE: ['title', 'reportingPeriodStart', 'reportingPeriodEnd'],
  DOCUMENT_GOVERNED: ['status', 'locked', 'approvedBy', 'approvedAt', 'signatureId', 'version', 'createdBy', 'updatedBy'],
  createDocument: (...a: unknown[]) => h.createDocument(...a),
  getDocument: async (organizationId: number, id: string) => ({ id, organizationId, locked: false }),
  listProgramDocuments: async () => [],
  updateDocument: (...a: unknown[]) => h.updateDocument(...a),
  approveDocument: (...a: unknown[]) => h.approveDocument(...a),
  supersedeDocument: (...a: unknown[]) => h.supersedeDocument(...a),
  validateDocument: () => ({ passesGate: false, criticalCount: 0, warningCount: 0, findings: [] }),
}));

vi.mock('../../services/gspr-postmarket/pmcf-plan-generator', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/gspr-postmarket/pmcf-plan-generator')>()),
  generatePmcfPlan: (...a: unknown[]) => h.generatePmcfPlan(...a),
}));

vi.mock('../../services/gspr-postmarket/programme-eu-device-record', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/gspr-postmarket/programme-eu-device-record')>()),
  loadProgrammeEuDeviceRow: async () => ({ productType: 'medical_device', euMdrClass: 'IIa', euIvdrClass: null, metadata: {} }),
}));

vi.mock('../../services/gspr-postmarket/gspr.service', () => ({
  computeCoverage: vi.fn(),
  listCatalog: vi.fn(),
  listProgramMappings: vi.fn(),
  loadGsprProgramProfile: vi.fn(),
  upsertMapping: vi.fn(),
}));
vi.mock('../../services/gspr-postmarket/post-market-readiness', () => ({ getPostMarketDocStatus: vi.fn() }));
vi.mock('../../services/gspr-postmarket/pmcf-enrollment.service', () => ({
  isPmcfEnrollmentStoreAbsent: () => false,
  listPmcfEnrollmentRecords: vi.fn(),
  summariseRecords: vi.fn(),
  upsertPmcfEnrollmentRecord: vi.fn(),
  STORE_ABSENT: 'store absent',
}));
vi.mock('../../services/auditService', () => ({
  default: { logAction: (...a: unknown[]) => h.logAction(...a) },
}));

import { postMarketRouter } from '../gspr-postmarket';

const app = express();
app.use(express.json());
app.use('/api/post-market', postMarketRouter);

const SIGNED_IN = { id: 5, organizationId: String(ORG) };
/** A session that carries the organization but no user — or no numeric one. */
const NO_USER: ReadonlyArray<[string, Record<string, unknown>]> = [
  ['no user id', { organizationId: String(ORG) }],
  ["a user id of 'system'", { id: 'system', organizationId: String(ORG) }],
];

const generate = (body: Record<string, unknown>) =>
  request(app).post(`/api/post-market/programs/${PROGRAM}/documents/pms-report/generate`).send(body);

beforeEach(() => {
  vi.clearAllMocks();
  h.user = SIGNED_IN;
  h.logAction.mockResolvedValue({ persisted: true, chained: true, tamperProof: true });
  h.createDocument.mockImplementation(async (v: Record<string, unknown>) => ({ id: 'd-new', version: 1, ...v }));
  h.generatePmcfPlan.mockResolvedValue({ document: { id: 'd-plan', version: 1 }, validation: {} });
  h.updateDocument.mockResolvedValue({ id: 'd-1' });
  h.approveDocument.mockResolvedValue({ id: 'd-1', status: 'approved' });
  h.supersedeDocument.mockResolvedValue({ id: 'd-2' });
});

describe('governed post-market writes need a signed-in user', () => {
  it.each(NO_USER)('generate with %s is 401 and writes nothing', async (_label, user) => {
    h.user = user;
    const res = await generate({ deviceName: 'Acme Pump', regulation: 'MDR' });
    expect(res.status).toBe(401);
    expect(h.createDocument).not.toHaveBeenCalled();
    expect(h.logAction).not.toHaveBeenCalled();
  });

  it.each(NO_USER)('pmcf-plan generate with %s is 401 and writes nothing', async (_label, user) => {
    h.user = user;
    const res = await request(app)
      .post(`/api/post-market/programs/${PROGRAM}/documents/pmcf-plan/generate`)
      .send({ deviceName: 'Acme Pump' });
    expect(res.status).toBe(401);
    expect(h.generatePmcfPlan).not.toHaveBeenCalled();
  });

  it.each(NO_USER)('PATCH, approve and supersede with %s are 401 and change nothing', async (_label, user) => {
    h.user = user;
    const patch = await request(app).patch('/api/post-market/documents/d-1').send({ title: 'x' });
    const approve = await request(app).post('/api/post-market/documents/d-1/approve').send({});
    const supersede = await request(app).post('/api/post-market/documents/d-1/supersede').send({});
    expect([patch.status, approve.status, supersede.status]).toEqual([401, 401, 401]);
    expect(h.updateDocument).not.toHaveBeenCalled();
    expect(h.approveDocument).not.toHaveBeenCalled();
    expect(h.supersedeDocument).not.toHaveBeenCalled();
    expect(h.logAction).not.toHaveBeenCalled();
  });

  it('a signed-in user is the one recorded on every governed write', async () => {
    expect((await generate({ deviceName: 'Acme Pump', regulation: 'MDR' })).status).toBe(201);
    expect(h.createDocument).toHaveBeenCalledWith(expect.objectContaining({ createdBy: '5', updatedBy: '5' }));
    await request(app).patch('/api/post-market/documents/d-1').send({ title: 'x' }).expect(200);
    expect(h.updateDocument).toHaveBeenCalledWith(ORG, 'd-1', { title: 'x' }, '5');
    await request(app).post('/api/post-market/documents/d-1/approve').send({}).expect(200);
    expect(h.approveDocument).toHaveBeenCalledWith(expect.objectContaining({ approvedBy: '5' }));
    await request(app).post('/api/post-market/documents/d-1/supersede').send({}).expect(201);
    expect(h.supersedeDocument).toHaveBeenCalledWith(ORG, 'd-1', expect.objectContaining({ createdBy: '5' }));
  });
});

describe('a declared reporting period is stored as declared or refused, never dropped', () => {
  it.each([
    ['reportingPeriodStart', 'not-a-date'],
    ['reportingPeriodEnd', 'Q4 2025'],
    // `new Date` rolls an impossible day over into the next month.
    ['reportingPeriodEnd', '2025-02-30'],
    // A bare year would read as 1 January: an end date nobody declared.
    ['reportingPeriodEnd', '2025'],
    ['reportingPeriodStart', 1735689600000],
  ])('%s = %j is 422 naming the field, and nothing is written', async (field, value) => {
    const res = await generate({ deviceName: 'Acme Pump', regulation: 'MDR', [field]: value });
    expect(res.status).toBe(422);
    expect(res.body.error).toContain(field);
    expect(h.createDocument).not.toHaveBeenCalled();
  });

  it.each([
    ['after', '2025-12-31', '2025-01-01'],
    ['equal to', '2025-06-30', '2025-06-30'],
  ])('a start %s the end is 422, and nothing is written', async (_rel, start, end) => {
    const res = await generate({ deviceName: 'Acme Pump', regulation: 'MDR', reportingPeriodStart: start, reportingPeriodEnd: end });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/reportingPeriodStart.*before.*reportingPeriodEnd/);
    expect(h.createDocument).not.toHaveBeenCalled();
  });

  it('a real period is stored as declared', async () => {
    const res = await generate({
      deviceName: 'Acme Pump',
      regulation: 'MDR',
      reportingPeriodStart: '2025-01-01',
      reportingPeriodEnd: '2025-12-31T23:59:59Z',
    });
    expect(res.status).toBe(201);
    expect(h.createDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        reportingPeriodStart: new Date('2025-01-01T00:00:00Z'),
        reportingPeriodEnd: new Date('2025-12-31T23:59:59Z'),
      }),
    );
  });

  it('an omitted or blank date is "not declared", which the gate reports', async () => {
    const res = await generate({ deviceName: 'Acme Pump', regulation: 'MDR', reportingPeriodEnd: '' });
    expect(res.status).toBe(201);
    expect(h.createDocument).toHaveBeenCalledWith(
      expect.objectContaining({ reportingPeriodStart: null, reportingPeriodEnd: null }),
    );
  });
});
