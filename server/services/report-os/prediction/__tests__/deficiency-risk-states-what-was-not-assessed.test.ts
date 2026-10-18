/**
 * The CRL/RTF pre-mortem states what was not assessed. It prints no number for
 * it, and no confidence nobody computed.
 *
 * Until 2026-10-15 a cold start reached report-os as RTF, CRL and first-cycle
 * approval of exactly 0.5 (risk-model.ts `prior ?? 0.5`), and the report read
 * "Predicted first-cycle approval probability is 50%, with a 50% refuse-to-file
 * risk and a 50% complete-response-letter risk." Beside it the disclosure said
 * the figures came from "a cross-tenant network prior (cold-start)" — there was
 * no prior — and "Model confidence" was blendedReadiness / 100: the rule-based
 * completeness score, relabelled.
 *
 * Now the projection is null when no target was assessed (the pre-mortem route
 * refuses with 422), a target nobody estimated reads "not assessed", the
 * disclosure names a network prior only when one contributed, and no model
 * confidence is reported.
 */

import { describe, it, expect } from 'vitest';
import { scoreDraftToDeficiencyRiskInput } from '../model-adapters';
import { assemblePredictionReport } from '../assembler';
import type { DeficiencyRiskInput } from '../types';
import type { ScoreDraftResult } from '../../../intelligence/regulatory-intelligence';

const BASIS_COLD = { source: 'cold_start', modelVersionId: null, localWeight: 0, priorWeight: 0, priorProbability: null, sampleSize: 0 } as const;
const BASIS_PRIOR = (p: number) =>
  ({ source: 'network_prior', modelVersionId: null, localWeight: 0, priorWeight: 1, priorProbability: p, sampleSize: 0 }) as const;
const BASIS_LOCAL = { source: 'trained_model', modelVersionId: 'v1', localWeight: 1, priorWeight: 0, priorProbability: null, sampleSize: 140 } as const;

function result(over: Partial<ScoreDraftResult>): ScoreDraftResult {
  return {
    engineVersion: '1.1.0',
    completeness: {} as ScoreDraftResult['completeness'],
    rtf: { target: 'rtf', probability: null, score: null, band: null, ...BASIS_COLD },
    crl: { target: 'crl', probability: null, score: null, band: null, ...BASIS_COLD },
    firstCycleApproval: { target: 'first_cycle_approval', probability: null, nonApprovalBand: null, ...BASIS_COLD },
    refuseToFileScore: 9,
    recommendations: [],
    ...over,
  } as ScoreDraftResult;
}

const META = { reportTypeId: 'prediction.crl_rtf_premortem', reportTypeLabel: 'CRL / RTF Pre-Mortem', scopeType: 'project', scopeId: '11', generatedAt: '2026-10-15T00:00:00.000Z' };

describe('scoreDraftToDeficiencyRiskInput', () => {
  it('projects nothing when no target was assessed — the route refuses instead of printing 50%', () => {
    expect(scoreDraftToDeficiencyRiskInput(result({}))).toBeNull();
  });

  it('carries a null for each target nobody estimated, and no relabelled completeness as "model confidence"', () => {
    const input = scoreDraftToDeficiencyRiskInput(
      result({ rtf: { target: 'rtf', probability: 0.3, score: 70, band: 'high', ...BASIS_PRIOR(0.3) } }),
    ) as DeficiencyRiskInput;
    expect(input).toMatchObject({ rtfProbability: 0.3, crlProbability: null, firstCycleApprovalProbability: null });
    expect(input).not.toHaveProperty('modelConfidence');
    expect(input.usingNetworkPrior).toBe(true);
  });

  it('does not claim a network prior that did not contribute (a cold-start RTF used to say it did)', () => {
    // RTF at cold start, CRL from a local model: no prior was used anywhere.
    const input = scoreDraftToDeficiencyRiskInput(
      result({ crl: { target: 'crl', probability: 0.2, score: 80, band: 'medium', ...BASIS_LOCAL } }),
    ) as DeficiencyRiskInput;
    expect(input.rtfProbability).toBeNull();
    expect(input.usingNetworkPrior).toBe(false);
  });
});

describe('assemblePredictionReport for a partly assessed pre-mortem', () => {
  const partial: DeficiencyRiskInput = {
    kind: 'deficiency_risk',
    rtfProbability: 0.3,
    crlProbability: null,
    firstCycleApprovalProbability: null,
    sampleSize: 0,
    usingNetworkPrior: true,
  };

  it('states "not assessed" for a missing figure and prints no percentage for it', () => {
    const report = assemblePredictionReport(partial, META);
    const text = JSON.stringify(report);
    expect(text).not.toMatch(/approval probability is \d/i);
    expect(text).toMatch(/first-cycle approval probability[^"]*not assessed/i);
    const blocks = report.sections.flatMap((s) => s.blocks);
    const approval = blocks.find((b) => b.kind === 'metric' && b.label === 'First-cycle approval probability');
    expect(approval).toMatchObject({ value: 'not assessed', status: 'missing' });
    expect(approval).not.toHaveProperty('unit');
    expect(blocks.find((b) => b.kind === 'metric' && b.label === 'Refuse-to-file (RTF) risk')).toMatchObject({ value: 30, unit: '%' });
  });

  it('reports no model confidence', () => {
    const report = assemblePredictionReport(partial, META);
    const blocks = report.sections.flatMap((s) => s.blocks);
    expect(blocks.find((b) => b.kind === 'metric' && /confidence/i.test(b.label))).toBeUndefined();
    const disclosure = blocks.find((b) => b.kind === 'disclosure');
    expect(disclosure).toBeDefined();
    expect(disclosure).not.toHaveProperty('confidence', expect.anything());
  });

  it('claims no network-prior fallback when none contributed, and says why a target is not assessed', () => {
    const report = assemblePredictionReport({ ...partial, usingNetworkPrior: false }, META);
    const disclosure = report.sections.flatMap((s) => s.blocks).find((b) => b.kind === 'disclosure');
    const note = JSON.stringify(disclosure);
    expect(note).not.toMatch(/falls back to a cross-tenant network prior/i);
    expect(note).toMatch(/not assessed has no trained model and no network prior/i);
  });
});
