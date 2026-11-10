import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Two engines that answered only through AnA now answer on their registers
 * (P-122 inventory, B3 and B4).
 *
 *   POST /api/cmc/dissolution-profiles/compare  — f2 between two recorded
 *        profiles, through compareRecordedDissolutionProfiles, the function
 *        AnA's compare_recorded_dissolution calls;
 *   GET  /api/cmc/impurity-profiles/assessment  — each recorded impurity
 *        against its guideline (ICH Q3A/Q3B, Q3C, Q3D, M7), through
 *        assessRecordedImpurity, the function §3.2.S.3.2 composes from.
 *
 * The engines run for real here; only the database and the boundary decision
 * are stood in for. What is pinned: the routes answer the engines' own
 * figures and refusals, scope the read to the organisation, never compare
 * against a missing profile, and put the project to the composition boundary
 * before an impurity is judged against small-molecule guidelines.
 */

const assessProgramCompositionScope = vi.fn();
vi.mock('../../../services/cmc/module3-compile', async (orig) => ({
  ...(await orig<object>()),
  assessProgramCompositionScope: (...a: unknown[]) => assessProgramCompositionScope(...a),
}));
vi.mock('../../../services/cmc/project-membership', () => ({ projectBelongsToTenant: vi.fn(async () => true) }));

let rows: Array<Record<string, unknown>> = [];
vi.mock('../../../db', () => ({
  db: { select: () => ({ from: () => ({ where: async () => rows }) }) },
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

const point = (t: number, mean: number, sd: number) => ({ timepoint: String(t), meanPercent: String(mean), sd: String(sd), n: '12' });
const METHOD = { apparatus: 'USP II (paddle)', medium: 'pH 6.8 phosphate buffer', rotationSpeed: '50 rpm', unitsTested: 12 };
const REF = { id: 7, batchNumber: 'DP-2503', ...METHOD, results: [point(10, 52, 4.1), point(15, 71, 3.6), point(20, 84, 2.9), point(30, 93, 1.8)] };
const TEST = { id: 8, batchNumber: 'DP-2601', ...METHOD, results: [point(10, 48, 4.4), point(15, 68, 3.9), point(20, 82, 3.1), point(30, 92, 2.0)] };

beforeEach(() => {
  vi.clearAllMocks();
  assessProgramCompositionScope.mockResolvedValue(null);
  rows = [];
});

describe('POST /api/cmc/dissolution-profiles/compare', () => {
  it('answers the engine’s f2 over the two recorded profiles', async () => {
    rows = [REF, TEST];
    const res = await request(app).post('/api/cmc/dissolution-profiles/compare').send({ referenceId: 7, testId: 8 });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('computed');
    expect(res.body.data.methodsMatch).toBe(true);
    expect(res.body.data.result.f2Similar).toBe(true);
    expect(Number(res.body.data.result.f2Reported)).toBeGreaterThan(50);
    expect(res.body.data.result.inputsUsed.unitsTested).toEqual({ reference: 12, test: 12 });
  });

  it('answers the engine’s refusal as its answer, not as a failure', async () => {
    rows = [REF, { ...TEST, unitsTested: null, results: TEST.results.map(({ n: _n, ...p }) => p) }];
    const res = await request(app).post('/api/cmc/dissolution-profiles/compare').send({ referenceId: 7, testId: 8 });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('not_comparable');
    expect(res.body.data.result.code).toBe('UNITS_NOT_RECORDED');
  });

  it('compares nothing when a profile is missing or the two are one', async () => {
    rows = [REF];
    expect((await request(app).post('/api/cmc/dissolution-profiles/compare').send({ referenceId: 7, testId: 8 })).status).toBe(404);
    expect((await request(app).post('/api/cmc/dissolution-profiles/compare').send({ referenceId: 7, testId: 7 })).status).toBe(400);
  });
});

describe('GET /api/cmc/impurity-profiles/assessment', () => {
  const base = { materialName: 'C2C-201', levelUnit: '%', maximumDailyDose: '15 mg', routeOfAdministration: 'oral', scope: 'drug_substance' };
  it('answers each impurity against the guideline that governs it', async () => {
    rows = [
      { id: 1, ...base, impurityName: 'Impurity A', impurityType: 'process-related', observedLevel: '0.08' },
      { id: 2, ...base, impurityName: 'PGI-1', impurityType: 'mutagenic', observedLevel: '12', levelUnit: 'ppm', amesResult: 'not-tested', structuralAlert: 'yes', carcinogenicityData: 'not-tested', treatmentDuration: '1-to-12-months', cohortOfConcern: 'not_coc' },
      { id: 3, ...base, impurityName: 'Ethanol', impurityType: 'residual-solvent', observedLevel: '820', levelUnit: 'ppm' },
    ];
    const res = await request(app).get(`/api/cmc/impurity-profiles/assessment?projectId=${P}`);
    expect(res.status).toBe(200);
    const byId = new Map(res.body.data.map((r: { id: number }) => [r.id, r]));
    expect((byId.get(1) as any).assessments[0]).toMatchObject({ side: 'drug_substance', ok: true, basis: 'ICH Q3A(R2)/Q3B(R2)' });
    expect((byId.get(2) as any).assessments[0]).toMatchObject({ ok: true, basis: 'ICH M7(R2)', impurityClass: 3 });
    expect((byId.get(2) as any).assessments[0].controlApproach).toBeTruthy();
    expect((byId.get(3) as any).assessments[0]).toMatchObject({ ok: true });
  });

  it('answers a refusal as the row’s answer, never dropping the row', async () => {
    rows = [{ id: 4, ...base, maximumDailyDose: null, impurityName: 'Impurity Z', impurityType: 'process-related', observedLevel: '0.3' }];
    const res = await request(app).get(`/api/cmc/impurity-profiles/assessment?projectId=${P}`);
    expect(res.body.data[0].assessments[0]).toMatchObject({ ok: false, code: 'MDD_MISSING' });
  });

  it('puts the project to the composition boundary before judging anything', async () => {
    assessProgramCompositionScope.mockResolvedValue({ code: 'CMC_MODALITY_OUT_OF_SCOPE', modality: 'biologic', message: 'A biologic is not composed here.' });
    rows = [{ id: 1, ...base, impurityName: 'Impurity A', impurityType: 'process-related', observedLevel: '0.08' }];
    const res = await request(app).get(`/api/cmc/impurity-profiles/assessment?projectId=${P}`);
    expect(res.status).toBe(409);
    expect(assessProgramCompositionScope).toHaveBeenCalledWith(ORG, P);
  });
});
