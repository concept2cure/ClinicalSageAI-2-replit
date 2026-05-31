/**
 * Tests for the PTRS service orchestration, using an in-memory fake corpus so the
 * honesty, prior-derivation, training, and blending logic is exercised without a
 * database.
 */

import { describe, it, expect } from 'vitest';
import { PtrsService, type LabeledTrial, type LabeledTrialSource } from '../ptrs-service';
import { approvalPrior, normalizePhase, type TrialDesign } from '../ptrs-model';

function design(overrides: Partial<TrialDesign> = {}): TrialDesign {
  return {
    indication: 'oncology',
    phase: 'Phase 2',
    sampleSize: 120,
    durationWeeks: 52,
    designFeatures: ['randomized', 'double-blind'],
    ...overrides,
  };
}

class FakeSource implements LabeledTrialSource {
  calls: Array<{ indication?: string; phase?: string }> = [];
  constructor(private readonly trials: LabeledTrial[]) {}
  async fetchLabeledTrials(filter: { indication?: string; phase?: string }): Promise<LabeledTrial[]> {
    this.calls.push(filter);
    return this.trials.filter(t => {
      if (filter.indication && t.design.indication !== filter.indication) return false;
      if (filter.phase && t.design.phase !== filter.phase) return false;
      return true;
    });
  }
}

// A separable labelled corpus: large randomized trials complete, small open-label
// ones terminate. Enough rows to train (≥40) plus a comparable subset.
function corpus(n: number): LabeledTrial[] {
  const out: LabeledTrial[] = [];
  for (let i = 0; i < n; i++) {
    const big = i % 2 === 0;
    out.push({
      design: design({
        indication: 'oncology',
        phase: 'Phase 2',
        sampleSize: big ? 400 : 30,
        designFeatures: big ? ['randomized', 'double-blind', 'multicenter'] : ['open-label'],
      }),
      outcome: big, // completed vs terminated
    });
  }
  return out;
}

describe('PtrsService — registry_completion', () => {
  it('trains on the corpus and serves a trained/blended estimate', async () => {
    const svc = new PtrsService({ source: new FakeSource(corpus(60)) });
    const p = await svc.predict('registry_completion', design({ sampleSize: 400, designFeatures: ['randomized', 'double-blind'] }));
    expect(['trained_model', 'blended']).toContain(p.source);
    expect(p.probability).not.toBeNull();
    expect(p.probability!).toBeGreaterThan(0.5); // a large randomized design should score well
    expect(p.sampleSize).toBeGreaterThanOrEqual(40);
  });

  it('is not_assessable on an empty corpus (no model, no prior)', async () => {
    const svc = new PtrsService({ source: new FakeSource([]) });
    const p = await svc.predict('registry_completion', design());
    expect(p.source).toBe('not_assessable');
    expect(p.probability).toBeNull();
  });

  it('falls back to the corpus-wide pooled rate when the comparable set is thin', async () => {
    // 30 trials in a DIFFERENT indication (enough for a corpus-wide prior, none comparable).
    const trials = corpus(30).map(t => ({ ...t, design: { ...t.design, indication: 'cardiology' } }));
    const svc = new PtrsService({ source: new FakeSource(trials) });
    const p = await svc.predict('registry_completion', design({ indication: 'dermatology' }));
    // No comparable trials, but a corpus-wide prior exists → prior or blended, never not_assessable.
    expect(p.source).not.toBe('not_assessable');
    expect(p.priorSource).toContain('all indications');
  });
});

describe('PtrsService — regulatory_approval', () => {
  it('serves the published Hay 2014 LOA prior in cold-start, model stays null', async () => {
    const svc = new PtrsService({ source: new FakeSource(corpus(60)) });
    const model = await svc.train('regulatory_approval');
    expect(model).toBeNull(); // not trainable from registry-completion labels

    const p = await svc.predict('regulatory_approval', design({ phase: 'Phase 2' }));
    expect(p.source).toBe('network_prior');
    expect(p.probability).toBeCloseTo(approvalPrior(normalizePhase('Phase 2'))!.probability, 10);
    expect(p.interval).toBeNull(); // no local approval-labelled evidence
    expect(p.priorSource).toContain('Hay');
    expect(p.labelSemantics.toLowerCase()).toContain('approv');
  });

  it('is not_assessable for a post-approval phase (no development-risk prior)', async () => {
    const svc = new PtrsService({ source: new FakeSource(corpus(60)) });
    const p = await svc.predict('regulatory_approval', design({ phase: 'Phase 4' }));
    expect(p.source).toBe('not_assessable');
    expect(p.probability).toBeNull();
  });
});
