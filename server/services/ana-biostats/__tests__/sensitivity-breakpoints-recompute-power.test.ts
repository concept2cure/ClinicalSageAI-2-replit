/**
 * Sensitivity points come from a real power recomputation (GA-DEMO-05).
 *
 * Until 2026-11-10 `assessFragility` estimated power at a reduced effect as
 * 1 − Φ(z_{1−α/2} − mult·z_{power}), which is below 80% for every design at the
 * first step it tried, so every design printed a 5% effect-size margin. The
 * attrition point was `min(1.5 × attrition, 0.5)` with a fixed 50% margin,
 * which printed 0.22499999999999998 for a 15% dropout rate.
 *
 * The breakpoint is now where the design's evaluable N stops giving 80% power,
 * recomputed with the computation engine itself; these cases check it against
 * that engine and against the normal-approximation closed form.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ComputationRefusal, computationEngine } from '../computation-engine';
import { judgmentEngine } from '../judgment-engine';
import { domainAdapter } from '../domain-adapter';
import { documentGenerator } from '../document-generator';
import type { StatisticalInput } from '../types';
import { normalQuantile } from '../../stats/normal';

const BASE: StatisticalInput = {
  clientTrack: 'biotech_pharma',
  studyType: 'superiority',
  objectiveType: 'efficacy',
  endpointType: 'continuous',
  alpha: 0.05,
  powerTarget: 0.9,
  effectSize: 0.4,
  attritionRate: 0.1,
  allocationRatio: 1,
  numberOfGroups: 2,
  comparatorType: 'placebo',
  missingDataMethod: 'MMRM',
  phase: 'Phase 3',
};

const run = (over: Partial<StatisticalInput> = {}) => {
  const input = { ...BASE, ...over };
  const computation = computationEngine.compute(input);
  const judgment = judgmentEngine.judge(input, computation);
  return { input, computation, judgment };
};
const point = (j: ReturnType<typeof run>['judgment'], p: string) =>
  j.fragility.sensitiveParameters.find((s) => s.parameter === p);
const decimals = (v: number) => (String(v).split('.')[1] ?? '').length;
const evaluableAt80 = (input: StatisticalInput, effectSize: number) =>
  computationEngine.compute({ ...input, effectSize, powerTarget: 0.8 }).sampleSize.total;

describe('effect-size breakpoint', () => {
  it('worked figure: d = 0.4 at 90% power has about a 13.6% margin, not 5%', () => {
    const { judgment, computation } = run();
    const sp = point(judgment, 'effect_size');
    expect(sp).toBeDefined();
    // Normal approximation: 1 − (z_.975 + z_.80) / (z_.975 + z_power).
    const z = normalQuantile(0.975);
    const closed = (1 - (z + normalQuantile(0.8)) / (z + normalQuantile(computation.power))) * 100;
    expect(sp!.percentMargin).not.toBe(5);
    expect(Math.abs(sp!.percentMargin - closed)).toBeLessThan(1.5);
    expect(sp!.percentMargin).toBeGreaterThan(11);
    expect(sp!.percentMargin).toBeLessThan(16);
  });

  it.each([
    ['continuous superiority', {}],
    ['continuous at 80% power', { powerTarget: 0.8 }],
    ['binary from rates', { endpointType: 'binary', controlRate: 0.3, treatmentRate: 0.45, effectSize: 0.15 }],
    ['time to event', { endpointType: 'time_to_event', effectSize: 0.3, eventRate: 0.6 }],
  ] as Array<[string, Partial<StatisticalInput>]>)(
    '%s: the engine needs about the current evaluable N for 80%% power at the breakpoint',
    (_label, over) => {
      const { input, computation, judgment } = run(over);
      const sp = point(judgment, 'effect_size');
      expect(sp).toBeDefined();
      expect(decimals(sp!.breakpointValue)).toBeLessThanOrEqual(4);
      const n = computation.sampleSize.total;
      const scale = (v: number) => {
        if (typeof input.controlRate === 'number' && typeof input.treatmentRate === 'number') {
          const m = v / input.effectSize;
          return computationEngine.compute({
            ...input, effectSize: v, powerTarget: 0.8,
            treatmentRate: input.controlRate + (input.treatmentRate - input.controlRate) * m,
          }).sampleSize.total;
        }
        return evaluableAt80(input, v);
      };
      if (sp!.percentMargin > 0) {
        expect(scale(sp!.breakpointValue * 1.02)).toBeLessThanOrEqual(n);
        expect(scale(sp!.breakpointValue * 0.98)).toBeGreaterThan(n);
      }
    },
  );
});

describe('attrition breakpoint', () => {
  it('worked figure: 10% dropout on N enrolled for 90% power tolerates about 33%', () => {
    const { input, computation, judgment } = run();
    const sp = point(judgment, 'attrition_rate');
    expect(sp).toBeDefined();
    const enrolled = computation.adjustedTotal ?? computation.sampleSize.total;
    const expected = 1 - evaluableAt80(input, input.effectSize) / enrolled;
    expect(sp!.breakpointValue).toBeCloseTo(expected, 3);
    expect(sp!.breakpointValue).toBeGreaterThan(0.3);
    expect(sp!.breakpointValue).toBeLessThan(0.36);
    expect(sp!.percentMargin).not.toBe(50);
    expect(sp!.percentMargin).toBeCloseTo(((expected - 0.1) / 0.1) * 100, 0);
  });

  it('a 15% dropout rate prints no floating-point tail', () => {
    const { judgment } = run({ attritionRate: 0.15 });
    for (const sp of judgment.fragility.sensitiveParameters) {
      expect(decimals(sp.breakpointValue)).toBeLessThanOrEqual(4);
      expect(decimals(sp.percentMargin)).toBeLessThanOrEqual(1);
    }
    expect(point(judgment, 'attrition_rate')!.breakpointValue).not.toBe(0.22499999999999998);
  });
});

describe('the governed document prints the recomputed points', () => {
  it('sample size rationale and assumption note carry rounded breakpoints and name the 80% threshold', () => {
    const { input, computation, judgment } = run({ attritionRate: 0.15 });
    const domain = domainAdapter.adapt(input, computation, judgment);
    const meta = { projectId: 1, organizationId: 1, userId: 1 };
    for (const type of ['sample_size_rationale', 'design_assumption_note'] as const) {
      const content = documentGenerator.generate(type, input, computation, judgment, domain, undefined, meta).content;
      expect(content).not.toMatch(/\d\.\d{6,}/);
      expect(content).toMatch(/below 80% power/);
      expect(content).not.toMatch(/\(5% margin\)/);
    }
  });
});

/* Repair of 2026-11-12 (verifier findings V2, V3, V5, V6). */
const META = { projectId: 1, organizationId: 1, userId: 1 };
const docs = (r: ReturnType<typeof run>) => {
  const domain = domainAdapter.adapt(r.input, r.computation, r.judgment);
  return (['sample_size_rationale', 'design_assumption_note'] as const).map(
    (type) => documentGenerator.generate(type, r.input, r.computation, r.judgment, domain, undefined, META).content,
  );
};

describe('the document says below 80% only when the engine says so', () => {
  it('a 90% design prints its exact margin and never "already below"', () => {
    const r = run();
    const sp = point(r.judgment, 'effect_size')!;
    for (const content of docs(r)) {
      expect(content).toContain(
        `current 0.4, breakpoint ${sp.breakpointValue}; ${sp.percentMargin}% change before the design falls below 80% power`,
      );
      expect(content).toContain('breakpoint 0.3448; 13.8% change before the design falls below 80% power');
      expect(content).not.toMatch(/already below/);
    }
  });

  it('a design sized at exactly 80% power (d 0.1) is at the threshold, not below it', () => {
    const r = run({ powerTarget: 0.8, effectSize: 0.1 });
    expect(r.computation.power).toBeGreaterThanOrEqual(0.8);
    expect(point(r.judgment, 'effect_size')!.percentMargin).toBe(0);
    for (const content of docs(r)) {
      expect(content).not.toMatch(/already below/);
      expect(content).toMatch(/the design is at the 80% power threshold, with no margin/);
    }
  });

  it('a design sized for 70% power has no margin and says it is already below 80%', () => {
    const r = run({ powerTarget: 0.7 });
    expect(r.computation.power).toBeLessThan(0.8);
    const effect = point(r.judgment, 'effect_size')!;
    const attrition = point(r.judgment, 'attrition_rate')!;
    expect(effect.percentMargin).toBe(0);
    expect(effect.breakpointValue).toBe(0.4);
    expect(attrition.percentMargin).toBe(0);
    expect(attrition.breakpointValue).toBe(0.1);
    for (const content of docs(r)) {
      expect(content).toMatch(/\*\*Effect Size\*\*: current 0\.4; the design is already below 80% power at this value/i);
      expect(content).not.toMatch(/change before the design falls below 80% power/);
    }
  });
});

describe('a search floor is never reported as a breakpoint', () => {
  it('non-inferiority (margin 0.3, effect 0.1): power holds as the effect shrinks, so no effect-size breakpoint is claimed', () => {
    const r = run({ studyType: 'non_inferiority', nonInferiorityMargin: 0.3, effectSize: 0.1 });
    expect(point(r.judgment, 'effect_size')).toBeUndefined();
    expect(r.judgment.fragility.narrative).toMatch(/no effect-size breakpoint was found/);
    const [rationale] = docs(r);
    expect(rationale).toMatch(/### Sensitivity Points[\s\S]*Power stays at or above 80% for every effect size tested/);
    expect(rationale).not.toMatch(/breakpoint 0\.001/);
    expect(point(r.judgment, 'attrition_rate')).toBeDefined();
  });
});

describe('a sensitivity that could not be recomputed says so', () => {
  afterEach(() => vi.restoreAllMocks());
  const realCompute = computationEngine.compute.bind(computationEngine);

  it('a refusal at 80% power reads "not assessed" and keeps the fragility penalty', () => {
    const input = { ...BASE };
    const computation = computationEngine.compute(input);
    const assessed = judgmentEngine.judge(input, computation);
    vi.spyOn(computationEngine, 'compute').mockImplementation((i: StatisticalInput) => {
      if (i.powerTarget === 0.8) throw new ComputationRefusal('not_supported', 'cannot size at 80%');
      return realCompute(i);
    });
    const judgment = judgmentEngine.judge(input, computation);
    expect(judgment.fragility.sensitiveParameters).toEqual([]);
    expect(judgment.fragility.narrative).toMatch(/was not assessed/);
    // Missing points never lower the index: this design's effect margin (13.8%) carried the +25 too.
    expect(judgment.fragility.fragilityIndex).toBe(assessed.fragility.fragilityIndex);
    const domain = domainAdapter.adapt(input, computation, judgment);
    const content = documentGenerator.generate('sample_size_rationale', input, computation, judgment, domain, undefined, META).content;
    expect(content).toMatch(/### Sensitivity Points[\s\S]*was not assessed/);
  });

  it('an error that is not a refusal is not swallowed', () => {
    const input = { ...BASE };
    const computation = computationEngine.compute(input);
    vi.spyOn(computationEngine, 'compute').mockImplementation((i: StatisticalInput) => {
      if (i.powerTarget === 0.8) throw new TypeError('engine defect');
      return realCompute(i);
    });
    expect(() => judgmentEngine.judge(input, computation)).toThrow('engine defect');
  });
});
