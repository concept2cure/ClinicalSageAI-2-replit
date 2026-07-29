/**
 * Tests for the pure PTRS core: phase normalization, feature extraction, the
 * published cold-start prior, training, and the serving/blending contract.
 *
 * Scope: pure functions only. The DB-backed service is tested separately with a
 * fake source.
 */

import { describe, it, expect } from 'vitest';
import {
  normalizePhase,
  extractFeatures,
  approvalPrior,
  HAY_2014,
  trainPtrs,
  predictPtrs,
  MIN_TRAIN_SAMPLES,
  PTRS_FEATURE_NAMES,
  type TrialDesign,
  type PtrsModelWeights,
  type PtrsPrior,
} from '../ptrs-model';

function design(overrides: Partial<TrialDesign> = {}): TrialDesign {
  return {
    indication: 'oncology',
    phase: 'Phase 2',
    sampleSize: 120,
    durationWeeks: 52,
    designFeatures: ['randomized', 'double-blind', 'placebo'],
    ...overrides,
  };
}

// Deterministic, perfectly separable dataset: success iff the trial is large +
// randomized. Used to confirm the trainer learns a real, high-AUC signal.
function separableSamples(n: number): Array<{ design: TrialDesign; label: boolean }> {
  const out: Array<{ design: TrialDesign; label: boolean }> = [];
  for (let i = 0; i < n; i++) {
    const big = i % 2 === 0;
    const phase = (i % 3) + 1;
    out.push({
      design: design({
        phase: `Phase ${phase}`,
        sampleSize: big ? 400 : 30,
        designFeatures: big ? ['randomized', 'double-blind', 'placebo', 'multicenter'] : ['open-label'],
      }),
      label: big,
    });
  }
  return out;
}

describe('normalizePhase', () => {
  it('parses arabic and roman forms', () => {
    expect(normalizePhase('Phase 1')).toBe(1);
    expect(normalizePhase('phase ii')).toBe(2);
    expect(normalizePhase('Phase 3')).toBe(3);
    expect(normalizePhase('IV')).toBe(4);
  });
  it('maps combined phases to the higher (harder) bar', () => {
    expect(normalizePhase('Phase 1/2')).toBe(2);
    expect(normalizePhase('Phase 2/3')).toBe(3);
  });
  it('returns null for empty or unrecognized input', () => {
    expect(normalizePhase('')).toBeNull();
    expect(normalizePhase(null)).toBeNull();
    expect(normalizePhase('preclinical')).toBeNull();
  });
});

describe('extractFeatures', () => {
  it('one-hot encodes phase with phase 1 as the reference level', () => {
    const f1 = extractFeatures(design({ phase: 'Phase 1' }));
    expect(f1.phase_2).toBe(0);
    expect(f1.phase_3).toBe(0);
    expect(f1.phase_4).toBe(0);
    const f3 = extractFeatures(design({ phase: 'Phase 3' }));
    expect(f3.phase_3).toBe(1);
    expect(f3.phase_2).toBe(0);
  });

  it('centers known numeric features on the log scale and flags knownness', () => {
    const f = extractFeatures(design({ sampleSize: 100, durationWeeks: 52 }));
    expect(f.log10_sample_size_centered).toBeCloseTo(0, 6); // log10(100) - 2
    expect(f.sample_size_known).toBe(1);
    expect(f.log10_duration_centered).toBeCloseTo(0, 6); // log10(52) - log10(52)
    expect(f.duration_known).toBe(1);
  });

  it('represents missing numerics as zero contribution with a 0 known-flag', () => {
    const f = extractFeatures(design({ sampleSize: null, durationWeeks: null }));
    expect(f.log10_sample_size_centered).toBe(0);
    expect(f.sample_size_known).toBe(0);
    expect(f.duration_known).toBe(0);
  });

  it('parses design tokens, treating double-blind as both blinded and double-blind', () => {
    const f = extractFeatures(design({ designFeatures: ['randomized', 'double-blind', 'placebo'] }));
    expect(f.randomized).toBe(1);
    expect(f.any_blinding).toBe(1);
    expect(f.double_blind).toBe(1);
    expect(f.placebo_controlled).toBe(1);
  });

  it('does not count open-label as blinded', () => {
    const f = extractFeatures(design({ designFeatures: ['open-label', 'single arm'] }));
    expect(f.any_blinding).toBe(0);
    expect(f.double_blind).toBe(0);
  });

  it('detects multicenter, adaptive, and biomarker enrichment', () => {
    const f = extractFeatures(
      design({ designFeatures: ['multi-center', 'adaptive', 'biomarker enrichment'] }),
    );
    expect(f.multicenter).toBe(1);
    expect(f.adaptive).toBe(1);
    expect(f.biomarker_selection).toBe(1);
  });

  it('produces a value for every declared feature name', () => {
    const f = extractFeatures(design());
    for (const name of PTRS_FEATURE_NAMES) {
      expect(Number.isFinite(f[name])).toBe(true);
    }
  });
});

describe('approvalPrior (Hay 2014)', () => {
  it('derives cumulative LOA by phase consistent with the published transitions', () => {
    const { phase1to2, phase2to3, phase3toReg, regToApproval } = HAY_2014.transitions;
    expect(approvalPrior(1)!.probability).toBeCloseTo(
      phase1to2 * phase2to3 * phase3toReg * regToApproval,
      10,
    );
    expect(approvalPrior(1)!.probability).toBeCloseTo(0.1045, 3); // ~10.4% headline
    expect(approvalPrior(2)!.probability).toBeCloseTo(phase2to3 * phase3toReg * regToApproval, 10);
    expect(approvalPrior(3)!.probability).toBeCloseTo(phase3toReg * regToApproval, 10);
  });

  it('is monotonically increasing as a program advances', () => {
    const p1 = approvalPrior(1)!.probability;
    const p2 = approvalPrior(2)!.probability;
    const p3 = approvalPrior(3)!.probability;
    expect(p1).toBeLessThan(p2);
    expect(p2).toBeLessThan(p3);
  });

  it('returns null for post-approval (phase 4) and unknown phases', () => {
    expect(approvalPrior(4)).toBeNull();
    expect(approvalPrior(null)).toBeNull();
  });
});

describe('trainPtrs', () => {
  it('refuses to train below the sample floor, with an honest reason', () => {
    const r = trainPtrs(separableSamples(MIN_TRAIN_SAMPLES - 1), { target: 'registry_completion' });
    expect(r.trained).toBe(false);
    expect(r.model).toBeNull();
    expect(r.reason).toContain('insufficient_samples');
  });

  it('learns a high-AUC model from a separable dataset', () => {
    const r = trainPtrs(separableSamples(60), { target: 'registry_completion' });
    expect(r.trained).toBe(true);
    expect(r.model).not.toBeNull();
    expect(r.auc).not.toBeNull();
    expect(r.auc!).toBeGreaterThan(0.8);
    expect(r.brier!).toBeLessThan(0.25);
    expect(r.model!.featureNames).toEqual(PTRS_FEATURE_NAMES);
  });

  it('is deterministic — identical input yields identical weights', () => {
    const a = trainPtrs(separableSamples(60), { target: 'registry_completion' });
    const b = trainPtrs(separableSamples(60), { target: 'registry_completion' });
    expect(a.model!.weights).toEqual(b.model!.weights);
    expect(a.auc).toBe(b.auc);
  });
});

describe('predictPtrs serving contract', () => {
  const trainedModel: PtrsModelWeights = trainPtrs(separableSamples(60), {
    target: 'registry_completion',
  }).model!;
  const prior: PtrsPrior = {
    probability: 0.4,
    source: 'pooled corpus completion rate (n=20)',
    localKnownN: 20,
    localSuccesses: 8,
  };

  it('is not_assessable with neither model nor prior', () => {
    const p = predictPtrs({ target: 'registry_completion', design: design(), model: null, prior: null });
    expect(p.source).toBe('not_assessable');
    expect(p.probability).toBeNull();
    expect(p.interval).toBeNull();
  });

  it('serves the prior in cold-start, with an evidence interval from local N', () => {
    const p = predictPtrs({ target: 'registry_completion', design: design(), model: null, prior });
    expect(p.source).toBe('network_prior');
    expect(p.probability).toBeCloseTo(0.4, 10);
    expect(p.sampleSize).toBe(20);
    expect(p.interval).not.toBeNull();
    expect(p.interval![0]).toBeLessThan(0.4);
    expect(p.interval![1]).toBeGreaterThan(0.4);
  });

  it('returns a null interval for a prior with no local evidence', () => {
    const p = predictPtrs({
      target: 'regulatory_approval',
      design: design(),
      model: null,
      prior: { probability: 0.16, source: HAY_2014.citation, localKnownN: 0, localSuccesses: 0 },
    });
    expect(p.source).toBe('network_prior');
    expect(p.probability).toBeCloseTo(0.16, 10);
    expect(p.interval).toBeNull();
  });

  it('serves the trained model when no prior, with contributing factors', () => {
    const p = predictPtrs({ target: 'registry_completion', design: design(), model: trainedModel, prior: null });
    expect(p.source).toBe('trained_model');
    expect(p.probability).toBeGreaterThan(0);
    expect(p.probability).toBeLessThan(1);
    expect(p.contributingFactors.length).toBeGreaterThan(0);
    expect(p.localWeight).toBe(1);
  });

  it('blends model and prior between the two values', () => {
    // sampleSize=60 < MIN_TRAIN_SAMPLES*4=160, so the prior still carries weight.
    const p = predictPtrs({ target: 'registry_completion', design: design(), model: trainedModel, prior });
    expect(p.source).toBe('blended');
    expect(p.localWeight).toBeGreaterThan(0);
    expect(p.localWeight).toBeLessThan(1);
    const modelOnly = predictPtrs({ target: 'registry_completion', design: design(), model: trainedModel, prior: null }).probability!;
    const lo = Math.min(modelOnly, prior.probability);
    const hi = Math.max(modelOnly, prior.probability);
    expect(p.probability!).toBeGreaterThanOrEqual(lo - 1e-9);
    expect(p.probability!).toBeLessThanOrEqual(hi + 1e-9);
  });

  it('labels its target semantics so the two targets are never confused', () => {
    const completion = predictPtrs({ target: 'registry_completion', design: design(), model: null, prior });
    const approval = predictPtrs({
      target: 'regulatory_approval',
      design: design(),
      model: null,
      prior: { probability: 0.16, source: HAY_2014.citation, localKnownN: 0, localSuccesses: 0 },
    });
    expect(completion.labelSemantics).not.toBe(approval.labelSemantics);
    expect(completion.labelSemantics.toLowerCase()).toContain('completion');
    expect(approval.labelSemantics.toLowerCase()).toContain('approv');
  });

  it('attaches reproducible provenance — same inputs hash identically', () => {
    const a = predictPtrs({ target: 'registry_completion', design: design(), model: trainedModel, prior: null });
    const b = predictPtrs({ target: 'registry_completion', design: design(), model: trainedModel, prior: null });
    expect(a.provenance.reproducible).toBe(true);
    expect(a.provenance.inputsSha256).toBe(b.provenance.inputsSha256);
    expect(a.probability).toBe(b.probability);
  });
});
