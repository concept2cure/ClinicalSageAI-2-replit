/**
 * Statistical defensibility is judged by the deterministic engine (2026-10-05).
 *
 * The /assess route, the reviewer-risk route and AnA's assess_defensibility
 * command used to ask a model for 0-100 scores on seven dimensions and derive
 * the rating and reviewer-risk level from them. WO-16C finding 45 then stopped
 * the service turning an unscored dimension into a 50; that test is retired
 * with the model path it covered. Under CLAUDE.md Rule 2 a verdict on a
 * study's statistics comes from a deterministic engine, so the service now
 * runs the ana-biostats judgment engine — the one AnA's
 * assess_statistical_defensibility tool runs — and these tests pin that:
 *
 *   - no model is called, for any input;
 *   - a design with its statistical inputs is assessed, identically every time;
 *   - the body the workbench used to send (phase, indication, design, endpoint
 *     name, N) is not enough to judge a design, and the answer says which
 *     inputs are missing instead of forming a verdict;
 *   - reviewer-risk points are exactly the dimensions not judged adequate.
 */
import { describe, expect, it, vi } from 'vitest';

const modelCalled = vi.fn();
vi.mock('../../lib/unified-ai-client', () => ({
  ai: {
    chat: (...a: unknown[]) => modelCalled(...a),
    complete: (...a: unknown[]) => modelCalled(...a),
  },
}));
vi.mock('../../db', () => ({ db: {}, pool: {} }));

import { statisticalDefensibilityService } from '../statistical-defensibility-service';

const DESIGN = {
  clientTrack: 'biotech_pharma',
  regulatoryBody: 'FDA',
  studyType: 'superiority',
  objectiveType: 'efficacy',
  endpointType: 'continuous',
  alpha: 0.05,
  powerTarget: 0.8,
  effectSize: 0.5,
  attritionRate: 0.15,
  allocationRatio: 1,
  indication: 'NSCLC',
  phase: 'III',
  numberOfGroups: 2,
};

describe('assessDefensibility', () => {
  it('assesses a design from its statistical inputs, deterministically and without a model', async () => {
    const a = await statisticalDefensibilityService.assessDefensibility(DESIGN);
    const b = await statisticalDefensibilityService.assessDefensibility(DESIGN);
    expect(a.status).toBe('assessed');
    expect(a).toEqual(b);
    if (a.status !== 'assessed') throw new Error('unreachable');
    expect(a.engine).toBe('deterministic');
    expect(['adequate', 'marginal', 'inadequate', 'insufficient_information']).toContain(a.judgment.overallVerdict);
    expect(a.sampleSize).toBeGreaterThan(0);
    expect(a.judgment.dimensions.length).toBeGreaterThan(0);
    expect(modelCalled).not.toHaveBeenCalled();
  });

  it('names the missing inputs, and forms no verdict, for the body the workbench used to send', async () => {
    const r = await statisticalDefensibilityService.assessDefensibility({
      studyPhase: 'Phase 3',
      indication: 'NSCLC',
      studyDesign: 'randomized double-blind',
      primaryEndpoint: 'PFS',
      sampleSize: 400,
    });
    expect(r.status).toBe('needs_parameters');
    if (r.status !== 'needs_parameters') throw new Error('unreachable');
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r).not.toHaveProperty('judgment');
    expect(modelCalled).not.toHaveBeenCalled();
  });
});

describe('generateReviewerRiskAnnotations', () => {
  it('raises one point per dimension not judged adequate, with severity from its verdict', async () => {
    const weak = { ...DESIGN, effectSize: 0.9, attritionRate: 0.4 };
    const { assessment, annotations } = await statisticalDefensibilityService.generateReviewerRiskAnnotations(weak);
    if (assessment.status !== 'assessed') throw new Error('expected an assessed design');
    const notAdequate = assessment.judgment.dimensions.filter((d) => d.verdict !== 'adequate');
    expect(annotations).toHaveLength(notAdequate.length);
    annotations.forEach((x, i) => {
      expect(x.concern.startsWith(notAdequate[i].name)).toBe(true);
      expect(x.severity).toBe(notAdequate[i].verdict === 'inadequate' ? 'high' : 'medium');
    });
    expect(modelCalled).not.toHaveBeenCalled();
  });

  it('returns no points and the missing inputs when the design cannot be judged', async () => {
    const { assessment, annotations } = await statisticalDefensibilityService.generateReviewerRiskAnnotations({
      phase: 'III',
      indication: 'NSCLC',
      design: 'parallel',
    });
    expect(assessment.status).toBe('needs_parameters');
    expect(annotations).toEqual([]);
  });
});
