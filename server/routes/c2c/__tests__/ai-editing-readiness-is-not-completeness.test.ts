/**
 * The AI editor's project context does not call document completeness "submission readiness".
 *
 * The section editor and the template generator told the model "Submission
 * readiness: 75% overall (completeness 75%, quality not measured, …)" when the
 * readiness engine had measured completeness alone — its scoreBasis says the
 * 75 is document completeness. Until 2026-10-15 the line printed
 * overallScore whatever it covered; it now prints a figure only when an
 * assessment measured more than completeness (readinessFigure).
 *
 * Harness: the one in ai-editing-retrieval-status.test.ts, with the readiness
 * engine's own readinessFigure.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const { searchHybrid, gatewayRoute, query } = vi.hoisted(() => ({
  searchHybrid: vi.fn(),
  gatewayRoute: vi.fn(),
  query: vi.fn(),
}));

vi.mock('../../../db', () => ({ db: {}, pool: { query: (...a: unknown[]) => query(...a) } }));
vi.mock('../../../auth', () => ({ authMiddleware: (_q: unknown, _s: unknown, n: () => void) => n() }));
vi.mock('../../../middleware/tenantContext', () => ({
  tenantContextMiddleware: (_q: unknown, _s: unknown, n: () => void) => n(),
  requireOrganizationContext: (_q: unknown, _s: unknown, n: () => void) => n(),
}));
vi.mock('../shared', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  concept2cureRateLimiter: (_q: unknown, _s: unknown, n: () => void) => n(),
  logAuditEntry: vi.fn(async () => undefined),
  getUserId: () => 42,
  getOrganizationId: () => 7,
}));
vi.mock('../../../services/enhancedEmbeddingService', () => ({
  getEmbeddingService: () => ({ searchHybrid: (...a: unknown[]) => searchHybrid(...a) }),
}));
vi.mock('../../../services/ai-gateway/gateway.js', () => ({
  getGateway: () => ({ getEnabledProviders: () => ['anthropic'], route: (...a: unknown[]) => gatewayRoute(...a) }),
}));
const { readiness } = vi.hoisted(() => ({ readiness: vi.fn() }));
vi.mock('../../../services/intelligence/index.js', async () => {
  const engine = await vi.importActual<typeof import('../../../services/intelligence/readiness-scoring-engine.js')>(
    '../../../services/intelligence/readiness-scoring-engine.js',
  );
  return {
    computeReadinessScore: (...a: unknown[]) => readiness(...a),
    generateRecommendations: async () => null,
    readinessFigure: engine.readinessFigure,
  };
});

import { runWithTenantScope } from '../../../db/tenantStore';
import router from '../ai-editing';

const ORG_UUID = '77777777-7777-4777-8777-777777777777';

function app() {
  const a = express();
  a.use(express.json());
  a.use((_req: Request, _res: Response, next: NextFunction) =>
    runWithTenantScope(
      { tenantId: '7', orgUuid: ORG_UUID, role: 'member', source: 'request', caller: 'ai-editing.test' },
      () => next(),
    ),
  );
  a.use('/api/concept2cure', router);
  return a;
}


const COMPLETENESS_ONLY = {
  overallScore: 75,
  dimensions: { completeness: 75, quality: null, consistency: null, compliance: null },
  moduleBreakdown: [],
  gaps: [],
  trend: { direction: 'unknown', delta: null, dataPoints: 0 },
  predictions: { approvalProbability: null, estimatedReviewDays: null, estimatedDeficiencies: null, basis: 'no_assessment_on_record' },
  scoreBasis: { source: 'no_assessment_on_record', measured: ['completeness'], notMeasured: ['quality', 'consistency', 'compliance'] },
  scoredAt: '2026-10-15T00:00:00.000Z',
};
const ASSESSED = {
  ...COMPLETENESS_ONLY,
  overallScore: 68,
  dimensions: { completeness: 75, quality: 60, consistency: 70, compliance: 65 },
  scoreBasis: { source: 'twin_assessment', measured: ['completeness', 'quality', 'consistency', 'compliance'], notMeasured: [] },
};

beforeEach(() => {
  searchHybrid.mockReset().mockResolvedValue([]);
  gatewayRoute.mockReset().mockResolvedValue({
    content: 'Edited text.',
    provider: 'anthropic',
    model: 'claude-sonnet-5',
    usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    latencyMs: 1,
  });
  query.mockReset().mockResolvedValue({ rows: [{ id: 'row-1' }], rowCount: 1 });
  readiness.mockReset();
});

const prompt = () => JSON.stringify(gatewayRoute.mock.calls.map((c) => c[0]));
const edit = () =>
  request(app()).post('/api/concept2cure/ai/edit-section').send({ action: 'rewrite', text: 'Draft text.', projectId: 11 });
const generate = () =>
  request(app())
    .post('/api/concept2cure/ai/templates/csr-synopsis/generate')
    .send({
      projectId: 11,
      variables: {
        STUDY_TITLE: 'Study 101',
        PROTOCOL: 'P-101',
        PRODUCT_NAME: 'ABC-123',
        INDICATION: 'CKD stage 3',
        DESIGN: 'randomized, double-blind',
        PRIMARY_ENDPOINT: 'eGFR change at week 24',
      },
    });

describe.each([
  ['edit-section', edit],
  ['template generation', generate],
])('%s project context', (_name, call) => {
  it('says readiness was not assessed when only document completeness was measured', async () => {
    readiness.mockResolvedValue(COMPLETENESS_ONLY);
    await call();
    expect(gatewayRoute).toHaveBeenCalled();
    expect(prompt()).toContain('Submission readiness: not assessed (only document completeness was measured)');
    expect(prompt()).not.toMatch(/Submission readiness: 75%/);
  });

  it('gives the figure when an assessment measured more than completeness (positive control)', async () => {
    readiness.mockResolvedValue(ASSESSED);
    await call();
    expect(prompt()).toMatch(/Submission readiness: 68%/);
  });
});
