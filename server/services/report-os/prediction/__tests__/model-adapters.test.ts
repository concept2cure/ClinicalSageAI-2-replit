import { describe, it, expect } from 'vitest';
import { scoreDraftToDeficiencyRiskInput } from '../model-adapters';
import { assemblePredictionReport, assertHasDisclosure } from '../assembler';
import type {
  ScoreDraftResult,
  RiskTargetScore,
  ApprovalTargetScore,
} from '../../../intelligence/regulatory-intelligence';
import type { DeficiencyRiskInput } from '../types';

const LOCAL = {
  source: 'trained_model',
  modelVersionId: 'v1',
  localWeight: 1,
  priorWeight: 0,
  priorProbability: null,
  sampleSize: 120,
} as const;

function target(over: Partial<RiskTargetScore>): RiskTargetScore {
  return { target: 'rtf', probability: 0.2, score: 80, band: 'medium', ...LOCAL, ...over };
}

function approval(over: Partial<ApprovalTargetScore>): ApprovalTargetScore {
  return { target: 'first_cycle_approval', probability: 0.6, nonApprovalBand: 'high', ...LOCAL, ...over };
}

function draftResult(over: Partial<ScoreDraftResult> = {}): ScoreDraftResult {
  return {
    engineVersion: '1.0.0',
    completeness: {} as ScoreDraftResult['completeness'],
    rtf: target({ target: 'rtf', probability: 0.3 }),
    crl: target({ target: 'crl', probability: 0.25 }),
    firstCycleApproval: approval({ probability: 0.6 }),
    blendedReadiness: 72,
    recommendations: [],
    ...over,
  };
}

/** Every fixture here assesses at least one target, so the projection is not null. */
const project = (result: ScoreDraftResult) => scoreDraftToDeficiencyRiskInput(result) as DeficiencyRiskInput;

describe('scoreDraftToDeficiencyRiskInput', () => {
  it('projects the three risk probabilities verbatim', () => {
    const input = project(draftResult());
    expect(input).toMatchObject({
      kind: 'deficiency_risk',
      rtfProbability: 0.3,
      crlProbability: 0.25,
      firstCycleApprovalProbability: 0.6,
      sampleSize: 120,
    });
  });

  it('flags network-prior use only when a prior contributed', () => {
    // 2026-10-15: a cold-start RTF (no model, no prior) was flagged true here,
    // and the disclosure then named a network prior that did not exist.
    const coldStart = project(
      draftResult({ rtf: target({ source: 'cold_start', probability: null, score: null, band: null, priorWeight: 0, sampleSize: 0 }) }),
    );
    expect(coldStart.usingNetworkPrior).toBe(false);

    const blended = project(draftResult({ rtf: target({ source: 'blended', priorWeight: 0.4 }) }));
    expect(blended.usingNetworkPrior).toBe(true);
  });

  it('does not flag network-prior for a purely local trained model', () => {
    const local = project(draftResult({ rtf: target({ source: 'trained_model', priorWeight: 0 }) }));
    expect(local.usingNetworkPrior).toBe(false);
  });

  it('reports no model confidence: blended readiness is not the model’s confidence', () => {
    // 2026-10-15: this pinned modelConfidence = blendedReadiness / 100, the
    // rule-based completeness score relabelled. No confidence is computed.
    expect(project(draftResult({ blendedReadiness: 72 }))).not.toHaveProperty('modelConfidence');
  });

  it('always assembles into a partial report with a mandatory disclosure block', () => {
    const input = project(draftResult());
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
