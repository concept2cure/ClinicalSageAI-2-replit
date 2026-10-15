/**
 * Next-best-actions carry no effort or impact estimate nobody made, and no
 * readiness score that is only completeness (findings 25 and 4, 2026-10-15).
 *
 * What the code used to do:
 *   - every recommendation got effortEstimate 'moderate' ('quick' for a
 *     validation failure), and every readiness gap without an hours estimate —
 *     all of them — got 'moderate'. Nothing estimated effort.
 *   - impactEstimate restated severity (critical/high → 'high', else 'medium')
 *     under the name of an impact estimate, and both fed the ranking.
 *   - readinessScore was the engine's overallScore, which without a recorded
 *     assessment is document completeness alone.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ recs: vi.fn(), readiness: vi.fn() }));

vi.mock('../../../db', () => ({ db: {}, pool: {}, getPool: () => ({}) }));
vi.mock('../recommendation-engine', () => ({ generateRecommendations: h.recs }));
vi.mock('../readiness-scoring-engine', async importOriginal => ({
  ...(await importOriginal<typeof import('../readiness-scoring-engine')>()),
  computeReadinessScore: h.readiness,
}));

import { generateNextActions } from '../next-best-action-engine';

const rec = (id: string, severity: 'critical' | 'high' | 'medium', type = 'risk_mitigation') => ({
  recommendationId: id,
  type,
  severity,
  sourceType: 'rules_based',
  targetObjectType: 'document',
  targetObjectId: id,
  reason: `reason ${id}`,
  evidence: [],
  confidence: null,
  suggestedAction: `Act on ${id}`,
  requiresApproval: false,
  status: 'active',
  createdAt: '2026-10-15T00:00:00.000Z',
});

const COMPLETENESS_ONLY = {
  overallScore: 75,
  dimensions: { completeness: 75, quality: null, consistency: null, compliance: null },
  moduleBreakdown: [],
  gaps: [{ id: 'gap-ms-0', module: 'milestones', description: 'Milestone "Kickoff" is overdue', severity: 'critical', remediation: 'Finish kickoff', estimatedEffortHours: null }],
  trend: { direction: 'unknown', delta: null, dataPoints: 0 },
  predictions: { approvalProbability: null, estimatedReviewDays: null, estimatedDeficiencies: null, basis: 'no_assessment_on_record' },
  scoreBasis: { source: 'no_assessment_on_record', measured: ['completeness'], notMeasured: ['quality', 'consistency', 'compliance'] },
  scoredAt: '2026-10-15T00:00:00.000Z',
};

beforeEach(() => {
  h.recs.mockReset();
  h.readiness.mockReset();
  h.recs.mockResolvedValue({
    recommendations: [rec('r1', 'medium'), rec('r2', 'high', 'validation_failure'), rec('r3', 'critical')],
    generatedAt: '2026-10-15T00:00:00.000Z',
    totalGenerated: 3,
    bySeverity: { critical: 1, high: 1, medium: 1, low: 0 },
    bySource: { rules_based: 3, validation_based: 0, ai_inferred: 0 },
    assessedTypes: [],
    failedGenerators: [],
  });
  h.readiness.mockResolvedValue(COMPLETENESS_ONLY);
});

describe('generateNextActions', () => {
  it('states no effort or impact estimate that nothing produced', async () => {
    const set = await generateNextActions({ organizationId: 1, projectId: 2, triggeredBy: 'test' });
    expect(set.actions.map(a => [a.title, a.effortEstimate, a.impactEstimate])).toEqual([
      ['Act on r3', null, null],
      ['Finish kickoff', null, null],
      ['Act on r2', null, null],
      ['Act on r1', null, null],
    ]);
  });

  it('ranks on urgency alone, keeping the engines’ order inside one urgency', async () => {
    const set = await generateNextActions({ organizationId: 1, projectId: 2, triggeredBy: 'test' });
    expect(set.actions.map(a => [a.rank, a.urgency])).toEqual([
      [1, 'immediate'],
      [2, 'immediate'],
      [3, 'this_week'],
      [4, 'this_sprint'],
    ]);
  });

  it('reports no readiness score when only completeness was measured', async () => {
    const set = await generateNextActions({ organizationId: 1, projectId: 2, triggeredBy: 'test' });
    expect(set.readinessScore).toBeNull();
  });

  it('names the recommendation generators whose read failed (finding 11)', async () => {
    h.recs.mockResolvedValue({
      recommendations: [],
      generatedAt: '2026-10-15T00:00:00.000Z',
      totalGenerated: 0,
      bySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
      bySource: { rules_based: 0, validation_based: 0, ai_inferred: 0 },
      assessedTypes: [],
      failedGenerators: ['stale_drafts'],
    });
    const set = await generateNextActions({ organizationId: 1, projectId: 2, triggeredBy: 'test' });
    expect(set.failedGenerators).toEqual(['stale_drafts']);
  });
});
