/**
 * AnA's /readiness, /next and /signals context states only what an engine measured.
 *
 * What the code used to do (2026-10-15): the readiness block printed
 * "**Overall Score: 75/100**" when 75 was document completeness alone (the
 * engine's scoreBasis says so) and a dimension nobody measured as "—/100";
 * /next printed "[urgency/impact]" — "[immediate/null]", impact being
 * estimated by nothing — and said the list was prioritized "by urgency and
 * impact"; /signals printed "Trend: **null**" and an "Average score" with
 * nothing saying it is not a readiness figure.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ query: vi.fn(), readiness: vi.fn(), next: vi.fn(), signals: vi.fn() }));
vi.mock('../../../db.js', () => ({ pool: { query: h.query }, getPool: () => ({ query: h.query }) }));
vi.mock('../../../db', () => ({ pool: { query: h.query }, getPool: () => ({ query: h.query }) }));
vi.mock('../../intelligence/project-intelligence-service.js', () => ({ getProjectIntelligence: async () => null }));
vi.mock('../workflow-orchestration.js', () => ({ buildWorkflowContext: async () => '' }));
vi.mock('../../intelligence/readiness-scoring-engine.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../intelligence/readiness-scoring-engine.js')>()),
  computeReadinessScore: h.readiness,
}));
vi.mock('../../intelligence/next-best-action-engine.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../intelligence/next-best-action-engine.js')>()),
  generateNextActions: h.next,
}));
vi.mock('../../intelligence/rim.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../intelligence/rim.js')>()),
  getProjectSignals: h.signals,
}));

import { enrichContextForChat } from '../context-enrichment';

const ask = (message: string) => enrichContextForChat({ message, projectId: 42, organizationId: 7, submissionType: 'IND' });

beforeEach(() => {
  h.query.mockReset().mockResolvedValue({ rows: [] });
  h.readiness.mockReset().mockResolvedValue({
    overallScore: 75,
    dimensions: { completeness: 75, quality: null, consistency: null, compliance: null },
    moduleBreakdown: [],
    gaps: [],
    trend: { direction: 'unknown', delta: null, dataPoints: 0 },
    predictions: { approvalProbability: null, estimatedReviewDays: null, estimatedDeficiencies: null, basis: 'no_assessment_on_record' },
    scoreBasis: { source: 'no_assessment_on_record', measured: ['completeness'], notMeasured: ['quality', 'consistency', 'compliance'] },
    scoredAt: '2026-10-15T00:00:00.000Z',
  });
  h.next.mockReset().mockResolvedValue({
    actions: [
      {
        actionId: 'a1', rank: 1, title: 'Resolve the stability gap', description: 'Module 3 stability data are missing.',
        category: 'gap_closure', urgency: 'immediate', impactEstimate: null, effortEstimate: null,
        sourceRecommendationId: null, sourceGapId: 'g1', targetObjectType: 'module',
      },
    ],
    generatedAt: '2026-10-15T00:00:00.000Z',
    totalActions: 1,
    readinessScore: null,
    topCategory: 'gap_closure',
    failedGenerators: [],
  });
  h.signals.mockReset().mockReturnValue({
    totalSignals: 3,
    byRiskLevel: { high: 1, medium: 2 },
    averageScore: 60,
    overallTrend: null,
    trendConfidence: 'insufficient',
    trendSampleSize: 1,
    topPatternIds: [],
  });
});

describe('the readiness block', () => {
  it('does not present document completeness as an overall readiness score', async () => {
    const { block } = await ask('/readiness');
    expect(block).not.toMatch(/Overall Score: 75\/100/);
    expect(block).toContain('Readiness not assessed — document completeness 75%');
    expect(block).toContain('| quality | not measured |');
    expect(block).not.toContain('—/100');
  });
});

describe('the next-actions block', () => {
  it('prints no impact nobody estimated', async () => {
    const { block } = await ask('/next');
    expect(block).toContain('**Resolve the stability gap** [immediate]');
    expect(block).not.toMatch(/\/null\]/);
    expect(block).not.toMatch(/urgency and impact/);
  });
});

describe('the signals block', () => {
  it('says a trend was not determined and that the mean is not a readiness figure', async () => {
    const { block } = await ask('/signals');
    expect(block).toContain('Trend: **not determined**');
    expect(block).not.toContain('**null**');
    expect(block).toContain('Mean signal score: **60** (not a readiness figure)');
  });
});
