import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Whether a set of stability batches may be combined into ONE registered shelf
 * life — ICH Q1E, run against the studies of record.
 *
 * The statistics themselves are already pinned by
 * `services/cmc/__tests__/shelf-life-poolability.test.ts`, including a
 * determinism assertion. What is untested until here is everything the ROUTE
 * decides before the engine is allowed to run, and that is where the regulatory
 * risk lives: a poolability verdict computed from mismatched inputs looks
 * exactly like one computed from sound inputs, and would be filed as evidence.
 *
 * So these tests are mostly about refusals — the conditions under which the
 * route must decline to produce a number at all, and must say which study and
 * which attribute is responsible.
 */

const rows = vi.fn();

/** Minimal drizzle stand-in: `select(...).from(...).where(...)` resolves to rows. */
vi.mock('../../../db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: (..._a: unknown[]) => Promise.resolve(rows()),
      }),
    }),
  },
  getPool: () => ({ query: vi.fn() }),
}));

vi.mock('../../../services/cmc-write-through', () => ({
  writeThroughDrugSubstance: vi.fn(),
  writeThroughDrugProduct: vi.fn(),
  writeThroughAnalyticalMethod: vi.fn(),
  writeThroughStabilityStudy: vi.fn(),
  writeThroughProcessValidation: vi.fn(),
  writeThroughChangeControl: vi.fn(),
  writeThroughComparability: vi.fn(),
}));

import router from '../routes';

const app = express();
app.use(express.json());
app.use((req: any, _res, next) => {
  req.tenantId = 101;
  req.tenantContext = { organizationId: 101 };
  next();
});
app.use('/api/cmc', router);

const post = (body: unknown) =>
  request(app).post('/api/cmc/stability-studies/poolability').send(body as object);

/**
 * A decaying series: `start` at t=0, losing `slope` per month.
 *
 * `noise` is analytical scatter, supplied explicitly rather than generated, so
 * every assertion below is reproducible. It is not decoration: a PERFECTLY
 * collinear batch has zero residual, the ANCOVA denominator collapses, and the
 * slope F-statistic diverges for any difference at all — so noiseless fixtures
 * can never demonstrate pooling. That is a property of the test, not a defect;
 * real assay data always scatters.
 */
const series = (
  parameter: string,
  spec: string,
  start: number,
  slope: number,
  noise: number[] = [0, 0, 0, 0, 0],
) =>
  [0, 3, 6, 9, 12].map((t, i) => ({
    timePoint: `${t}`,
    parameter,
    result: `${(start - slope * t + noise[i]).toFixed(3)}%`,
    specification: spec,
  }));

const study = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 1,
  studyTitle: 'S',
  productName: 'Compound A',
  batchNumber: 'B-001',
  storageConditions: ['LT'],
  duration: 24,
  stabilityData: { results: series('Assay', '>= 95.0%', 100, 0.2) },
  ...over,
});

beforeEach(() => rows.mockReset());

describe('POST /stability-studies/poolability — what it refuses', () => {
  it('needs two studies, and two DIFFERENT ones', async () => {
    expect((await post({ studyIds: [1] })).status).toBe(400);
    const dup = await post({ studyIds: [1, 1] });
    expect(dup.status).toBe(400);
    expect(dup.body.error).toMatch(/at least two DIFFERENT studies/);
  });

  it('names the studies it could not find rather than silently pooling the rest', async () => {
    rows.mockReturnValue([study({ id: 1 })]);
    const r = await post({ studyIds: [1, 7] });
    expect(r.status).toBe(404);
    expect(r.body.error).toMatch(/not found: 7/);
  });

  it('will not pool across storage conditions', async () => {
    rows.mockReturnValue([
      study({ id: 1, batchNumber: 'B-001', storageConditions: ['LT'] }),
      study({ id: 2, batchNumber: 'B-002', storageConditions: ['ACC'] }),
    ]);
    const r = await post({ studyIds: [1, 2] });
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/within one storage condition/);
    expect(r.body.error).toMatch(/LT/);
    expect(r.body.error).toMatch(/ACC/);
  });

  it('treats a condition SET as the unit, so order is not a difference', async () => {
    // ['LT','ACC'] and ['ACC','LT'] are the same placement; a naive string
    // compare would reject this pair for a reason that is not real. Both are
    // still refused — but for spanning two conditions, not for differing.
    rows.mockReturnValue([
      study({ id: 1, batchNumber: 'B-001', storageConditions: ['LT', 'ACC'] }),
      study({ id: 2, batchNumber: 'B-002', storageConditions: ['ACC', 'LT'] }),
    ]);
    const r = await post({ studyIds: [1, 2] });
    expect(r.status).toBe(409);
    expect(r.body.error).not.toMatch(/within one storage condition/);
    expect(r.body.error).toMatch(/more than one storage condition/);
  });

  it('will not fit a study that spans conditions, because its points cannot be told apart', async () => {
    rows.mockReturnValue([
      study({ id: 1, batchNumber: 'B-001', storageConditions: ['LT'] }),
      study({ id: 2, batchNumber: 'B-002', storageConditions: ['LT', 'ACC'] }),
    ]);
    const r = await post({ studyIds: [1, 2] });
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/Study 2/);
    expect(r.body.error).toMatch(/more than one storage condition/);
    expect(r.body.error).toMatch(/one study per condition/);
  });

  it('will not pool batches of different products', async () => {
    rows.mockReturnValue([
      study({ id: 1, batchNumber: 'B-001', productName: 'Compound A' }),
      study({ id: 2, batchNumber: 'B-002', productName: 'Compound B' }),
    ]);
    const r = await post({ studyIds: [1, 2] });
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/batches of one product/);
    expect(r.body.error).toMatch(/Compound A/);
    expect(r.body.error).toMatch(/Compound B/);
  });

  it('will not count one batch twice', async () => {
    rows.mockReturnValue([
      study({ id: 1, batchNumber: 'B-001' }),
      study({ id: 2, batchNumber: 'B-001' }),
    ]);
    const r = await post({ studyIds: [1, 2] });
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/B-001/);
    expect(r.body.error).toMatch(/between-batch variability/);
  });

  it('will not treat an unlabelled batch as a batch', async () => {
    rows.mockReturnValue([study({ id: 1, batchNumber: 'B-001' }), study({ id: 2, batchNumber: '  ' })]);
    const r = await post({ studyIds: [1, 2] });
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/must record a batch number/);
  });

  it('says there is nothing to fit rather than returning an empty verdict', async () => {
    rows.mockReturnValue([
      study({ id: 1, batchNumber: 'B-001', stabilityData: null }),
      study({ id: 2, batchNumber: 'B-002', stabilityData: { results: [] } }),
    ]);
    const r = await post({ studyIds: [1, 2] });
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/nothing to fit/);
  });

  it('requires organization context', async () => {
    const bare = express();
    bare.use(express.json());
    bare.use('/api/cmc', router);
    const r = await request(bare).post('/api/cmc/stability-studies/poolability').send({ studyIds: [1, 2] });
    expect(r.status).toBe(401);
  });
});

describe('POST /stability-studies/poolability — per-attribute honesty', () => {
  it('reports an attribute as unassessable when the batches disagree on the limit', async () => {
    rows.mockReturnValue([
      study({ id: 1, batchNumber: 'B-001', stabilityData: { results: series('Assay', '>= 95.0%', 100, 0.2) } }),
      study({ id: 2, batchNumber: 'B-002', stabilityData: { results: series('Assay', '>= 90.0%', 100, 0.2) } }),
    ]);
    const r = await post({ studyIds: [1, 2] });
    expect(r.status).toBe(200);
    const assay = r.body.data.assessments.find((a: any) => a.parameter === 'Assay');
    expect(assay.assessable).toBe(false);
    expect(assay.reason).toMatch(/different acceptance criteria/);
    // The conflict is named on both sides so it can actually be resolved.
    expect(assay.conflictingCriteria).toEqual([
      { batchId: 'B-001', limit: 95, direction: 'decreasing' },
      { batchId: 'B-002', limit: 90, direction: 'decreasing' },
    ]);
    // And no number is offered.
    expect(r.body.data.supportedShelfLife).toBeNull();
  });

  it('excludes an unfittable batch by name, and says why', async () => {
    rows.mockReturnValue([
      study({ id: 1, batchNumber: 'B-001' }),
      study({ id: 2, batchNumber: 'B-002' }),
      study({
        id: 3,
        batchNumber: 'B-003',
        stabilityData: {
          results: [{ timePoint: '0', parameter: 'Assay', result: 'conforms', specification: '>= 95.0%' }],
        },
      }),
    ]);
    const r = await post({ studyIds: [1, 2, 3] });
    const assay = r.body.data.assessments.find((a: any) => a.parameter === 'Assay');
    expect(assay.contributingBatches).toEqual(['B-001', 'B-002']);
    expect(assay.excludedBatches).toEqual([
      { batchId: 'B-003', reason: expect.stringMatching(/at least 3 numeric results/) },
    ]);
    // Two batches still qualify, so the assessment itself proceeds.
    expect(assay.assessable).toBe(true);
  });

  it('will not assess an attribute only one batch recorded', async () => {
    rows.mockReturnValue([
      study({ id: 1, batchNumber: 'B-001', stabilityData: { results: [...series('Assay', '>= 95.0%', 100, 0.2), ...series('Water', '<= 2.0%', 0.5, -0.05)] } }),
      study({ id: 2, batchNumber: 'B-002' }),
    ]);
    const r = await post({ studyIds: [1, 2] });
    const water = r.body.data.assessments.find((a: any) => a.parameter === 'Water');
    expect(water.assessable).toBe(false);
    expect(water.reason).toMatch(/at least 2 fittable batches; 1 of 2 qualifies/);
    expect(water.excludedBatches).toEqual([
      { batchId: 'B-002', reason: 'Did not record Water.' },
    ]);
  });
});

describe('POST /stability-studies/poolability — the verdict', () => {
  it('pools batches that behave alike and reports the ANCOVA tests verbatim', async () => {
    // Three batches whose slope and intercept differences are small against
    // their own analytical scatter — the case Q1E exists to let you combine.
    rows.mockReturnValue([
      study({ id: 1, batchNumber: 'B-001', stabilityData: { results: series('Assay', '>= 95.0%', 100.0, 0.2, [0.10, -0.05, 0.08, -0.10, 0.03]) } }),
      study({ id: 2, batchNumber: 'B-002', stabilityData: { results: series('Assay', '>= 95.0%', 100.1, 0.21, [-0.07, 0.09, -0.04, 0.06, -0.08]) } }),
      study({ id: 3, batchNumber: 'B-003', stabilityData: { results: series('Assay', '>= 95.0%', 99.9, 0.19, [0.05, -0.09, 0.02, 0.07, -0.05]) } }),
    ]);
    const r = await post({ studyIds: [1, 2, 3] });
    expect(r.status).toBe(200);
    const assay = r.body.data.assessments.find((a: any) => a.parameter === 'Assay');
    expect(assay.assessable).toBe(true);
    expect(assay.decision).toBe('pooled');
    expect(assay.slopeTest.pValue).toBeGreaterThanOrEqual(0.25);
    expect(assay.interceptTest.pValue).toBeGreaterThanOrEqual(0.25);
    expect(assay.perBatchShelfLives).toHaveLength(3);
    expect(r.body.data.limitingParameter).toBe('Assay');
    expect(r.body.data.limitingDecision).toBe('pooled');
    expect(r.body.data.supportedShelfLife).toBe(assay.shelfLife);
  });

  it('falls back to the shortest batch when the slopes diverge', async () => {
    rows.mockReturnValue([
      study({ id: 1, batchNumber: 'B-001', stabilityData: { results: series('Assay', '>= 95.0%', 100, 0.05) } }),
      study({ id: 2, batchNumber: 'B-002', stabilityData: { results: series('Assay', '>= 95.0%', 100, 0.4) } }),
    ]);
    const r = await post({ studyIds: [1, 2] });
    const assay = r.body.data.assessments.find((a: any) => a.parameter === 'Assay');
    expect(assay.slopeTest.poolable).toBe(false);
    expect(assay.decision).toBe('minimum-of-batches');
    // The intercept test is not reached — Q1E is sequential, and reporting a
    // number for a test that was never run would misstate the evidence.
    expect(assay.interceptTest).toBeNull();
    expect(assay.shelfLife).toBe(Math.min(...assay.perBatchShelfLives.map((p: any) => p.shelfLife)));
  });

  it('states its own scope, and writes nothing', async () => {
    rows.mockReturnValue([study({ id: 1, batchNumber: 'B-001' }), study({ id: 2, batchNumber: 'B-002' })]);
    const r = await post({ studyIds: [1, 2] });
    expect(r.body.data.basis).toMatch(/ICH Q1E/);
    expect(r.body.data.basis).toMatch(/0\.25 significance/);
    expect(r.body.data.scopeLimit).toMatch(/not the claim/);
    expect(r.body.data.storageCondition).toBe('LT');
    expect(r.body.data.batches).toEqual(['B-001', 'B-002']);
  });

  it('takes the most constraining attribute as the programme answer', async () => {
    // Water rises fast toward a 2.0% ceiling; assay decays slowly from 100 toward
    // 95. Water is the binding constraint and must be the one reported.
    const both = (waterSlope: number) => ({
      results: [
        ...series('Assay', '>= 95.0%', 100, 0.02),
        ...[0, 3, 6, 9, 12].map(t => ({
          timePoint: `${t}`,
          parameter: 'Water',
          result: `${(0.5 + waterSlope * t).toFixed(3)}%`,
          specification: '<= 2.0%',
        })),
      ],
    });
    rows.mockReturnValue([
      study({ id: 1, batchNumber: 'B-001', stabilityData: both(0.05) }),
      study({ id: 2, batchNumber: 'B-002', stabilityData: both(0.051) }),
    ]);
    const r = await post({ studyIds: [1, 2] });
    expect(r.body.data.limitingParameter).toBe('Water');
    const water = r.body.data.assessments.find((a: any) => a.parameter === 'Water');
    const assay = r.body.data.assessments.find((a: any) => a.parameter === 'Assay');
    expect(water.direction).toBe('increasing');
    // Both attributes run past the ICH Q1E extrapolation limit, so both
    // PROPOSABLE shelf lives are the cap and tie. The statistical crossing —
    // where each attribute's data actually run out — is what makes water the
    // limiting attribute rather than its position in the record.
    expect(water.shelfLife).toBe(assay.shelfLife);
    expect(water.statisticalCrossing).toBeLessThan(assay.statisticalCrossing);
    expect(r.body.data.supportedShelfLife).toBe(water.shelfLife);
  });
});
