/**
 * A judgment model scores only what was measured, and gives no verdict over
 * too little of it (finding 5, 2026-10-15).
 *
 * What the code used to do:
 *   - an unmeasured readiness dimension (quality, consistency, compliance —
 *     null whenever no readiness assessment is on record) was scored as 50 and
 *     printed "Quality dimension at 50%"; with no readiness read at all,
 *     completeness was 50 too.
 *   - with nothing evaluated, claim_risk and reviewer_sensitivity scored
 *     100 'pass'; counts of recommendation types no generator produces were
 *     read as "0 found", and "0/1 evidence chains are strong" divided by a
 *     chain that did not exist.
 *   - confidence was a constant chosen by whether readiness existed
 *     (80/40, 75/35, 70/30, 65, 75/30).
 *   - the composite summed component weights of 0.85, so perfect inputs topped
 *     out at 85, and nothing assessed came out 65 'needs_attention'.
 */
import { describe, expect, it } from 'vitest';

import {
  evaluateClaimRisk,
  evaluateEvidenceSufficiency,
  evaluateReviewerSensitivity,
  generateJudgmentReport,
} from '../judgment-framework';
import type { ReadinessScore } from '../readiness-scoring-engine';
import type { EvidenceChain } from '../evidence-confidence-model';
import type { RecommendationType } from '../recommendation-engine';

const CTX = { organizationId: 1, projectId: 1 };

/** No readiness assessment on record: completeness measured, the rest null. */
const COMPLETENESS_ONLY: ReadinessScore = {
  overallScore: 80,
  dimensions: { completeness: 80, quality: null, consistency: null, compliance: null },
  moduleBreakdown: [],
  gaps: [],
  trend: { direction: 'unknown', delta: null, dataPoints: 0 },
  predictions: {
    approvalProbability: null,
    estimatedReviewDays: null,
    estimatedDeficiencies: null,
    basis: 'no_assessment_on_record',
  },
  scoreBasis: {
    source: 'no_assessment_on_record',
    measured: ['completeness'],
    notMeasured: ['quality', 'consistency', 'compliance'],
  },
  scoredAt: '2026-10-15T00:00:00.000Z',
};

const PERFECT: ReadinessScore = {
  ...COMPLETENESS_ONLY,
  dimensions: { completeness: 100, quality: 100, consistency: 100, compliance: 100 },
  predictions: { ...COMPLETENESS_ONLY.predictions, estimatedDeficiencies: 0, basis: 'twin_assessment' },
  scoreBasis: {
    source: 'twin_assessment',
    measured: ['completeness', 'quality', 'consistency', 'compliance'],
    notMeasured: [],
  },
};

const STRONG_CHAIN: EvidenceChain = {
  primarySource: { sourceType: 'document_state', sourceId: 'd1', sourceTitle: 'Protocol', relevance: 1 },
  supportingSources: [],
  confidenceBasis: 'rules_based',
  confidenceScore: null,
  chainStrength: 'strong',
};

const ALL_TYPES: RecommendationType[] = [
  'missing_document', 'incomplete_section', 'validation_failure', 'quality_gap',
  'cross_reference_issue', 'readiness_blocker', 'risk_mitigation',
  'workflow_optimization', 'compliance_gap', 'evidence_gap',
];

describe('nothing assessed', () => {
  const report = generateJudgmentReport(CTX, {
    readiness: null,
    gaps: [],
    recommendations: [],
    evidenceChains: [],
  });

  it('gives no overall score or verdict (was 65 needs_attention)', () => {
    expect(report.overallRisk).toBeNull();
    expect(report.overallVerdict).toBe('not_assessed');
  });

  it('claim risk and reviewer sensitivity are not assessed, not 100 "pass"', () => {
    const byModel = Object.fromEntries(report.scores.map(s => [s.model, s]));
    expect([byModel.claim_risk.verdict, byModel.claim_risk.score]).toEqual(['not_assessed', null]);
    expect([byModel.reviewer_sensitivity.verdict, byModel.reviewer_sensitivity.score]).toEqual([
      'not_assessed',
      null,
    ]);
  });

  it('every model claims no confidence and says what it could not measure', () => {
    for (const s of report.scores) {
      expect(s.confidence).toBeNull();
      expect(s.measuredWeight).toBeLessThan(0.5);
      expect(s.notAssessed.length).toBeGreaterThan(0);
    }
  });

  it('with no readiness read, the gap factors are left out too', () => {
    const unread = generateJudgmentReport(CTX, {
      readiness: null,
      gaps: null,
      recommendations: [],
      evidenceChains: [],
    });
    for (const s of unread.scores) expect(s.measuredWeight).toBe(0);
  });
});

describe('an unmeasured dimension is left out, never scored 50', () => {
  const report = generateJudgmentReport(CTX, {
    readiness: COMPLETENESS_ONLY,
    gaps: [],
    recommendations: [],
    evidenceChains: [],
  });
  const details = report.scores.flatMap(s => s.factors.map(f => f.detail));

  it('prints no "at 50%" for a dimension nobody measured', () => {
    expect(details.filter(d => /at 50%|: 50%/.test(d))).toEqual([]);
  });

  it('names the unmeasured dimensions instead', () => {
    const evidence = report.scores.find(s => s.model === 'evidence_sufficiency')!;
    expect(evidence.notAssessed).toContain('quality_score: quality not measured');
  });
});

describe('a measured model still scores, over the weight it measured', () => {
  it('evidence sufficiency renormalises over completeness, chains and recorded evidence gaps', () => {
    const score = evaluateEvidenceSufficiency(
      COMPLETENESS_ONLY,
      [STRONG_CHAIN],
      [],
      new Set<RecommendationType>(['evidence_gap']),
    );
    // (80×0.30 + 100×0.25 + 100×0.25) / 0.80 = 92.5
    expect(score.score).toBe(93);
    expect(score.verdict).toBe('pass');
    expect(score.measuredWeight).toBeCloseTo(0.8);
    expect(score.factors.map(f => f.name)).toEqual([
      'document_completeness',
      'evidence_chain_strength',
      'evidence_gaps',
    ]);
  });

  it('no evidence chain is "no chain", not "0/1 chains are strong"', () => {
    const score = evaluateEvidenceSufficiency(COMPLETENESS_ONLY, [], [], new Set());
    expect(score.factors.map(f => f.detail).filter(d => /\/1 evidence chains/.test(d))).toEqual([]);
  });

  it('claim risk with only the AI-share factor measured is too thin for a verdict', () => {
    const score = evaluateClaimRisk([], [STRONG_CHAIN], new Set());
    expect(score.verdict).toBe('not_assessed');
    expect(score.score).toBeNull();
  });

  it('a recorded high-severity gap is still reported when the model gives no verdict', () => {
    const score = evaluateReviewerSensitivity(
      COMPLETENESS_ONLY,
      [{ id: 'g1', module: 'milestones', description: 'Overdue', severity: 'critical', remediation: 'Do it', estimatedEffortHours: null }],
      [],
      new Set(),
    );
    expect(score.verdict).toBe('not_assessed');
    expect(score.findings.map(f => f.id)).toEqual(['rsm_g1']);
  });
});

describe('the composite is renormalised', () => {
  it('perfect inputs score 100, not 85', () => {
    const report = generateJudgmentReport(CTX, {
      readiness: PERFECT,
      gaps: [],
      recommendations: [],
      assessedRecommendationTypes: ALL_TYPES,
      evidenceChains: [STRONG_CHAIN],
    });
    expect(report.overallRisk).toBe(100);
    expect(report.overallVerdict).toBe('pass');
  });
});
