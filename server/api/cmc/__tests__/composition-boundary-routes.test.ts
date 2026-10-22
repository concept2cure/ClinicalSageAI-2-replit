import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Every CMC route that states regulatory content for a program asks the
 * composition boundary first (decision P-28: small-molecule Module 3 for a US
 * IND; services/cmc/composition-scope.ts).
 *
 * Compose was the only caller of the boundary. Yet the QbD analysis, the ICH
 * compliance verdict, the control strategy, the ICH Q1E shelf life and batch
 * poolability all state small-molecule CMC content or figures for a program,
 * and gave them to a monoclonal antibody without a word: Q3A(R2) impurity
 * bases, Q6A release defaults, a Q1E-extrapolated "supported" shelf life.
 * Found by the 2026-10-15 launch-boundary re-proof, three skeptics per finding
 * (docs/evidence/D2-API-SCOPE/2026-10-15-reproof/cmc-boundary/).
 *
 * What is pinned here is the WIRING: each route asks the ONE boundary decision
 * (assessProgramCompositionScope) with the program it is about to judge, and
 * on a refusal answers the boundary's 409 body WITHOUT running its engine. The
 * decision itself runs against a real schema in
 * services/cmc/__tests__/composition-scope.pglite.test.ts.
 */

const assessProgramCompositionScope = vi.fn();
vi.mock('../../../services/cmc/module3-compile', async (orig) => ({
  ...(await orig<object>()),
  assessProgramCompositionScope: (...a: unknown[]) => assessProgramCompositionScope(...a),
}));

const analyzeQbdFromSources = vi.fn(async () => ({ cqas: [], cpps: [] }));
vi.mock('../../../services/cmc/qbd-analyzer', () => ({ analyzeQbdFromSources: (...a: unknown[]) => analyzeQbdFromSources(...(a as [])) }));
const runIchComplianceCheck = vi.fn(async () => ({ overallStatus: 'compliant', findings: [] }));
vi.mock('../../../services/cmc/ich-compliance-checker', () => ({ runIchComplianceCheck: (...a: unknown[]) => runIchComplianceCheck(...(a as [])) }));
const generateControlStrategy = vi.fn(async () => ({ controlElements: [] }));
vi.mock('../../../services/cmc/control-strategy-generator', () => ({ generateControlStrategy: (...a: unknown[]) => generateControlStrategy(...(a as [])) }));
vi.mock('../../../services/cmc/project-membership', () => ({ projectBelongsToTenant: vi.fn(async () => true) }));

const estimateRecordedShelfLife = vi.fn(async () => ({ ok: true, data: { estimates: [] } }));
const assessRecordedPoolability = vi.fn(async () => ({ ok: true, data: { pooled: true } }));
vi.mock('../../../services/cmc/recorded-stability', async (orig) => ({
  ...(await orig<object>()),
  estimateRecordedShelfLife: (...a: unknown[]) => estimateRecordedShelfLife(...(a as [])),
  assessRecordedPoolability: (...a: unknown[]) => assessRecordedPoolability(...(a as [])),
}));

/** The stability rows the study routes read: `select().from().where()`. */
let studyRows: Array<Record<string, unknown>> = [];
vi.mock('../../../db', () => ({
  db: { select: () => ({ from: () => ({ where: async () => studyRows }) }) },
  getPool: () => ({ query: vi.fn(async () => ({ rows: [] })) }),
}));
vi.mock('../../../services/cmc-write-through', () => ({
  writeThroughDrugSubstance: vi.fn(), writeThroughDrugProduct: vi.fn(), writeThroughAnalyticalMethod: vi.fn(),
  writeThroughStabilityStudy: vi.fn(), writeThroughProcessValidation: vi.fn(), writeThroughChangeControl: vi.fn(),
  writeThroughComparability: vi.fn(),
}));

import router from '../routes';

const ORG = 101;
const P = '0b6f0f86-6f2d-4c1b-9a2e-0d1c7f5d0a11';
const app = express();
app.use(express.json());
app.use((req: any, _res, next) => {
  req.tenantId = ORG;
  req.tenantContext = { organizationId: ORG };
  next();
});
app.use('/api/cmc', router);

const MAB_REFUSAL = {
  code: 'CMC_MODALITY_OUT_OF_SCOPE',
  modality: 'biologic',
  message: "This program's drug substance is biologically derived — CHO cell culture — and Module 3 for a biologic is not composed here.",
};

const study = (id: number, projectId: string | null) => ({
  id, projectId, studyTitle: `S${id}`, productName: 'X', batchNumber: `B${id}`, storageConditions: '25C/60%RH', duration: '12 months', stabilityData: {},
});

beforeEach(() => {
  vi.clearAllMocks();
  assessProgramCompositionScope.mockResolvedValue(null);
  studyRows = [];
});

const programRoutes: Array<{ name: string; call: () => request.Test; engine: ReturnType<typeof vi.fn> }> = [
  { name: 'GET /quality/qbd/:projectId', call: () => request(app).get(`/api/cmc/quality/qbd/${P}`), engine: analyzeQbdFromSources },
  { name: 'POST /ich-compliance', call: () => request(app).post('/api/cmc/ich-compliance').send({ projectId: P }), engine: runIchComplianceCheck },
  { name: 'POST /control-strategy', call: () => request(app).post('/api/cmc/control-strategy').send({ projectId: P }), engine: generateControlStrategy },
];

describe.each(programRoutes)('$name asks the composition boundary first', ({ call, engine }) => {
  it('refuses a program outside it with the boundary’s 409, and runs nothing', async () => {
    assessProgramCompositionScope.mockResolvedValue(MAB_REFUSAL);
    const res = await call();
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CMC_MODALITY_OUT_OF_SCOPE');
    expect(res.body.hint).toMatch(/Document editor/);
    expect(assessProgramCompositionScope).toHaveBeenCalledWith(ORG, P);
    expect(engine).not.toHaveBeenCalled();
  });

  it('runs for a program inside it', async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(assessProgramCompositionScope).toHaveBeenCalledWith(ORG, P);
    expect(engine).toHaveBeenCalled();
  });
});

describe('POST /stability-studies/:id/shelf-life judges the study’s own program', () => {
  it('refuses a study of a program outside the boundary, and estimates nothing', async () => {
    studyRows = [study(5, P)];
    assessProgramCompositionScope.mockResolvedValue(MAB_REFUSAL);
    const res = await request(app).post('/api/cmc/stability-studies/5/shelf-life').send({});
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CMC_MODALITY_OUT_OF_SCOPE');
    expect(assessProgramCompositionScope).toHaveBeenCalledWith(ORG, P);
    expect(estimateRecordedShelfLife).not.toHaveBeenCalled();
  });

  it('refuses a study filed under no program: its modality is not established', async () => {
    studyRows = [study(5, null)];
    const res = await request(app).post('/api/cmc/stability-studies/5/shelf-life').send({});
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CMC_MODALITY_NOT_ESTABLISHED');
    expect(estimateRecordedShelfLife).not.toHaveBeenCalled();
  });

  it('estimates for a study of a program inside the boundary', async () => {
    studyRows = [study(5, P)];
    const res = await request(app).post('/api/cmc/stability-studies/5/shelf-life').send({});
    expect(res.status).toBe(200);
    expect(estimateRecordedShelfLife).toHaveBeenCalled();
  });
});

describe('POST /stability-studies/poolability judges every study’s program', () => {
  it('refuses when a study’s program is outside the boundary, and pools nothing', async () => {
    studyRows = [study(5, P), study(6, P)];
    assessProgramCompositionScope.mockResolvedValue(MAB_REFUSAL);
    const res = await request(app).post('/api/cmc/stability-studies/poolability').send({ studyIds: [5, 6] });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CMC_MODALITY_OUT_OF_SCOPE');
    expect(assessProgramCompositionScope).toHaveBeenCalledWith(ORG, P);
    expect(assessRecordedPoolability).not.toHaveBeenCalled();
  });

  it('refuses when any study is filed under no program', async () => {
    studyRows = [study(5, P), study(6, null)];
    const res = await request(app).post('/api/cmc/stability-studies/poolability').send({ studyIds: [5, 6] });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CMC_MODALITY_NOT_ESTABLISHED');
    expect(assessRecordedPoolability).not.toHaveBeenCalled();
  });

  it('pools studies of a program inside the boundary', async () => {
    studyRows = [study(5, P), study(6, P)];
    const res = await request(app).post('/api/cmc/stability-studies/poolability').send({ studyIds: [5, 6] });
    expect(res.status).toBe(200);
    expect(assessRecordedPoolability).toHaveBeenCalled();
  });
});
