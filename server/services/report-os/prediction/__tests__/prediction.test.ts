import { describe, expect, it } from 'vitest';
import {
  assemblePredictionReport,
  assertHasDisclosure,
  buildDisclosure,
  type PredictionReportMeta,
} from '../assembler';
import type {
  DeficiencyRiskInput,
  PredictionInput,
  ReadinessTrajectoryInput,
  TrialPosInput,
} from '../types';
import type { ReportBlock, RenderedReport } from '../../render/types';

const FIXED_AT = '2026-06-15T00:00:00.000Z';

const META: PredictionReportMeta = {
  reportTypeId: 'prediction',
  reportTypeLabel: 'Prediction',
  scopeType: 'project',
  scopeId: '42',
  generatedAt: FIXED_AT,
};

function deficiencyInput(overrides: Partial<DeficiencyRiskInput> = {}): DeficiencyRiskInput {
  return {
    kind: 'deficiency_risk',
    rtfProbability: 0.12,
    crlProbability: 0.25,
    firstCycleApprovalProbability: 0.63,
    sampleSize: 250,
    usingNetworkPrior: false,
    modelConfidence: 0.7,
    ...overrides,
  };
}

function readinessInput(overrides: Partial<ReadinessTrajectoryInput> = {}): ReadinessTrajectoryInput {
  return {
    kind: 'readiness_trajectory',
    overallScore: 78,
    predictedApprovalProbability: 0.66,
    predictedReviewTimeDays: 304,
    predictedDeficiencyCount: 4,
    trend: [{ asOf: FIXED_AT, score: 78 }],
    ...overrides,
  };
}

function trialInput(overrides: Partial<TrialPosInput> = {}): TrialPosInput {
  return {
    kind: 'trial_pos',
    probabilityOfSuccess: 0.58,
    powerAtPriorMean: 0.82,
    typeIError: 0.05,
    effectivePerArm: 120,
    nRuns: 10000,
    hasEvidence: true,
    assumptions: ['effect size from prior trial', 'fixed enrollment'],
    ...overrides,
  };
}

function metricBlocks(report: RenderedReport): Array<Extract<ReportBlock, { kind: 'metric' }>> {
  return report.sections
    .flatMap(s => s.blocks)
    .filter((b): b is Extract<ReportBlock, { kind: 'metric' }> => b.kind === 'metric');
}

function disclosureBlocks(report: RenderedReport): Array<Extract<ReportBlock, { kind: 'disclosure' }>> {
  return report.sections
    .flatMap(s => s.blocks)
    .filter((b): b is Extract<ReportBlock, { kind: 'disclosure' }> => b.kind === 'disclosure');
}

const ALL_INPUTS: PredictionInput[] = [deficiencyInput(), readinessInput(), trialInput()];

describe('assemblePredictionReport', () => {
  it.each(ALL_INPUTS.map(input => [input.kind, input] as const))(
    'produces metrics and exactly one validated:false disclosure for %s',
    (_kind, input) => {
      const report = assemblePredictionReport(input, META);

      expect(report.status).toBe('partial');
      expect(metricBlocks(report).length).toBeGreaterThanOrEqual(1);

      const disclosures = disclosureBlocks(report);
      expect(disclosures).toHaveLength(1);
      expect(disclosures[0].validated).toBe(false);

      expect(() => assertHasDisclosure(report)).not.toThrow();
    },
  );

  it('classifies deficiency cold-start and mentions the network prior', () => {
    const input = deficiencyInput({ sampleSize: 10, usingNetworkPrior: true });
    const disclosure = buildDisclosure(input);

    expect(disclosure.method).toBe('logistic_regression');
    expect(disclosure.sampleRegime).toBe('cold_start');
    expect(disclosure.note).toContain('not validated against historical regulatory decisions');
    expect(disclosure.note.toLowerCase()).toContain('network prior');

    const report = assemblePredictionReport(input, META);
    const disclosures = disclosureBlocks(report);
    expect(disclosures[0].note.toLowerCase()).toContain('network prior');
  });

  it('classifies sample regimes by size', () => {
    expect(buildDisclosure(deficiencyInput({ sampleSize: 29 })).sampleRegime).toBe('cold_start');
    expect(buildDisclosure(deficiencyInput({ sampleSize: 30 })).sampleRegime).toBe('warm_up');
    expect(buildDisclosure(deficiencyInput({ sampleSize: 99 })).sampleRegime).toBe('warm_up');
    expect(buildDisclosure(deficiencyInput({ sampleSize: 100 })).sampleRegime).toBe('mature');
  });

  it('uses heuristic_gap_score method for readiness trajectory', () => {
    const disclosure = buildDisclosure(readinessInput());
    expect(disclosure.method).toBe('heuristic_gap_score');
    expect(disclosure.note.toLowerCase()).toContain('heuristic');
    expect(disclosure.note.toLowerCase()).toContain('not a trained probability');
  });

  it('uses monte_carlo_simulation method for trial pos', () => {
    const disclosure = buildDisclosure(trialInput());
    expect(disclosure.method).toBe('monte_carlo_simulation');
    expect(disclosure.note.toLowerCase()).toContain('evidence prior');
    expect(disclosure.note.toLowerCase()).toContain('not a guarantee');
  });

  it('omits the POS metric and includes a refusal summary when hasEvidence is false', () => {
    const report = assemblePredictionReport(trialInput({ hasEvidence: false }), META);

    const posMetric = metricBlocks(report).find(b => b.label === 'Probability of success');
    expect(posMetric).toBeUndefined();

    const summaries = report.sections
      .flatMap(s => s.blocks)
      .filter((b): b is Extract<ReportBlock, { kind: 'summary' }> => b.kind === 'summary');
    expect(summaries.some(s => s.text.toLowerCase().includes('refuses'))).toBe(true);

    // Disclosure is still mandatory even on refusal.
    expect(disclosureBlocks(report)).toHaveLength(1);
    expect(() => assertHasDisclosure(report)).not.toThrow();
  });

  it('presents a POS metric when evidence is supplied', () => {
    const report = assemblePredictionReport(trialInput({ hasEvidence: true }), META);
    const posMetric = metricBlocks(report).find(b => b.label === 'Probability of success');
    expect(posMetric).toBeDefined();
    expect(posMetric?.unit).toBe('%');
  });

  it('is deterministic when generatedAt is provided', () => {
    const a = assemblePredictionReport(deficiencyInput(), META);
    const b = assemblePredictionReport(deficiencyInput(), META);
    expect(a).toEqual(b);
    expect(a.generatedAt).toBe(FIXED_AT);
  });
});

describe('assertHasDisclosure', () => {
  it('passes on an assembled report', () => {
    const report = assemblePredictionReport(readinessInput(), META);
    expect(() => assertHasDisclosure(report)).not.toThrow();
  });

  it('throws on a hand-made report with no disclosure block', () => {
    const report: RenderedReport = {
      reportTypeId: 'prediction',
      scopeType: 'project',
      scopeId: '42',
      generatedAt: FIXED_AT,
      status: 'partial',
      sections: [
        {
          id: 'executive-summary',
          title: 'Executive summary',
          blocks: [{ kind: 'summary', text: 'No disclosure here.' }],
        },
      ],
    };
    expect(() => assertHasDisclosure(report)).toThrow(/disclosure/i);
  });
});
