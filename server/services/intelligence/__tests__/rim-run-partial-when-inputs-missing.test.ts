/**
 * A RIM run that lost an input says so (findings 11 and 13, 2026-10-15).
 *
 * What the code used to do: runRIMAssessment marked a run 'partial' only when
 * an input promise rejected. generateRecommendations never rejects — it logged
 * a failed generator and returned fewer recommendations — and a failed
 * feedback read was not checked at all, so such runs reported 'complete'.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  readiness: vi.fn(),
  recs: vi.fn(),
  crossModule: vi.fn(),
  intel: vi.fn(),
  feedback: vi.fn(),
}));

vi.mock('../../../db', () => ({ db: {}, pool: {}, getPool: () => ({}) }));
vi.mock('../../data-lineage-service', () => ({ persistEvidenceChain: vi.fn(async () => undefined) }));
vi.mock('../readiness-scoring-engine', () => ({ computeReadinessScore: h.readiness }));
vi.mock('../recommendation-engine', () => ({ generateRecommendations: h.recs }));
vi.mock('../cross-module-intelligence', () => ({ analyzeCrossModuleRelationships: h.crossModule }));
vi.mock('../project-intelligence-service', () => ({ getProjectIntelligence: h.intel }));
vi.mock('../learning-loop-service', () => ({ getFeedbackSummary: h.feedback }));

import { runRIMAssessment } from '../rim';

const READINESS = {
  overallScore: 60,
  dimensions: { completeness: 60, quality: null, consistency: null, compliance: null },
  moduleBreakdown: [],
  gaps: [],
  trend: { direction: 'unknown', delta: null, dataPoints: 0 },
  predictions: { approvalProbability: null, estimatedReviewDays: null, estimatedDeficiencies: null, basis: 'no_assessment_on_record' },
  scoreBasis: { source: 'no_assessment_on_record', measured: ['completeness'], notMeasured: ['quality', 'consistency', 'compliance'] },
  scoredAt: '2026-10-15T00:00:00.000Z',
};

const RECS_OK = {
  recommendations: [],
  generatedAt: '2026-10-15T00:00:00.000Z',
  totalGenerated: 0,
  bySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
  bySource: { rules_based: 0, validation_based: 0, ai_inferred: 0 },
  assessedTypes: ['incomplete_section', 'readiness_blocker'],
  failedGenerators: [],
};

let project = 500;

beforeEach(() => {
  for (const fn of Object.values(h)) fn.mockReset();
  h.readiness.mockResolvedValue(READINESS);
  h.recs.mockResolvedValue(RECS_OK);
  h.crossModule.mockResolvedValue({ insights: [] });
  h.intel.mockResolvedValue(null);
  h.feedback.mockResolvedValue({
    totalFeedback: 0, accepted: 0, dismissed: 0, resolved: 0, overridden: 0,
    acceptanceRate: 0, resolutionRate: 0, averageTimeToAction: null, topDismissedTypes: [],
    signalReliability: { validated: 0, partiallyValidated: 0, disputed: 0, totalValidations: 0, reliabilityIndex: null },
  });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('runRIMAssessment', () => {
  it('a failed recommendation generator makes the run partial and is named', async () => {
    h.recs.mockResolvedValue({ ...RECS_OK, failedGenerators: ['program_milestones'] });
    const assessment = await runRIMAssessment({ organizationId: 1, projectId: ++project });
    expect(assessment.run.status).toBe('partial');
    expect(assessment.run.degradedReason).toContain('recommendations (program_milestones)');
  });

  it('a failed feedback read makes the run partial', async () => {
    h.feedback.mockRejectedValue(new Error('connection terminated'));
    const assessment = await runRIMAssessment({ organizationId: 1, projectId: ++project });
    expect(assessment.run.status).toBe('partial');
    expect(assessment.run.degradedReason).toContain('feedback');
  });

  it('with every input read, the run is complete — and with completeness alone there is no RIM score', async () => {
    const assessment = await runRIMAssessment({ organizationId: 1, projectId: ++project });
    expect(assessment.run.status).toBe('complete');
    expect(assessment.rimScore).toBeNull();
    expect(assessment.rimVerdict).toMatch(/^Not assessed/);
  });
});
