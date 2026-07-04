import { describe, it, expect } from 'vitest';
import { scoreDraftToDeficiencyRiskInput } from '../model-adapters';
import { assemblePredictionReport, assertHasDisclosure } from '../assembler';
import type { ScoreDraftResult, RiskTargetScore } from '../../../intelligence/regulatory-intelligence';

function target(over: Partial<RiskTargetScore>): RiskTargetScore {
  return {
    target: 'rtf',
    probability: 0.2,
    score: 80,
    band: 'medium',
    source: 'trained_model',
    modelVersionId: 'v1',
    localWeight: 1,
    priorWeight: 0,
    priorProbability: null,
    sampleSize: 120,
    ...over,
  };
}

function draftResult(over: Partial<ScoreDraftResult> = {}): ScoreDraftResult {
  return {
    engineVersion: '1.0.0',
    completeness: {} as ScoreDraftResult['completeness'],
    rtf: target({ target: 'rtf', probability: 0.3 }),
    crl: target({ target: 'crl', probability: 0.25 }),
    firstCycleApproval: target({ target: 'first_cycle_approval', probability: 0.6 }),
    blendedReadiness: 72,
    recommendations: [],
    ...over,
  };
}

describe('scoreDraftToDeficiencyRiskInput', () => {
  it('projects the three risk probabilities verbatim', () => {
    const input = scoreDraftToDeficiencyRiskInput(draftResult());
    expect(input).toMatchObject({
      kind: 'deficiency_risk',
      rtfProbability: 0.3,
      crlProbability: 0.25,
      firstCycleApprovalProbability: 0.6,
      sampleSize: 120,
    });
  });

  it('flags network-prior use when the RTF model is not a pure local model', () => {
    const coldStart = scoreDraftToDeficiencyRiskInput(
      draftResult({ rtf: target({ source: 'cold_start', priorWeight: 0, sampleSize: 0 }) }),
    );
    expect(coldStart.usingNetworkPrior).toBe(true);

    const blended = scoreDraftToDeficiencyRiskInput(
      draftResult({ rtf: target({ source: 'blended', priorWeight: 0.4 }) }),
    );
    expect(blended.usingNetworkPrior).toBe(true);
  });

  it('does not flag network-prior for a purely local trained model', () => {
    const local = scoreDraftToDeficiencyRiskInput(
      draftResult({ rtf: target({ source: 'trained_model', priorWeight: 0 }) }),
    );
    expect(local.usingNetworkPrior).toBe(false);
  });

  it('normalizes blended readiness into a 0..1 model confidence', () => {
    expect(scoreDraftToDeficiencyRiskInput(draftResult({ blendedReadiness: 72 })).modelConfidence).toBeCloseTo(0.72);
    expect(scoreDraftToDeficiencyRiskInput(draftResult({ blendedReadiness: 140 })).modelConfidence).toBe(1);
    expect(scoreDraftToDeficiencyRiskInput(draftResult({ blendedReadiness: -5 })).modelConfidence).toBe(0);
  });

  it('always assembles into a partial report with a mandatory disclosure block', () => {
    const input = scoreDraftToDeficiencyRiskInput(draftResult());
    const report = assemblePredictionReport(input, {
      reportTypeId: 'prediction.crl_rtf_premortem',
      reportTypeLabel: 'CRL / RTF Pre-Mortem',
      scopeType: 'submission',
      scopeId: 'sub-1',
      generatedAt: '2026-07-04T00:00:00.000Z',
    });
    expect(report.status).toBe('partial');
    expect(() => assertHasDisclosure(report)).not.toThrow();
  });
});
