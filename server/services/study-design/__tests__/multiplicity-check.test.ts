/**
 * Multiplicity check.
 *
 * What the suite holds:
 *  - every rate is the engine's `estimateFWER` from the fixed seed: an equal
 *    recorded Holm split reproduces `holmReject` exactly, a fixed sequence with
 *    alpha on its first hypothesis reproduces `fixedSequenceReject` exactly, and
 *    the unadjusted rate for three hypotheses sits at 1 − (1 − α)³ within Monte
 *    Carlo error;
 *  - the RECORDED allocation is what is simulated: a partial Holm split spends
 *    only its total, and a Holm or Hochberg allocation of the full alpha to
 *    every endpoint is refused, not simulated as the textbook procedure;
 *  - the weighted-Holm graph is weighted Holm (checked against an independent
 *    step-down oracle);
 *  - "controlled" is decided against the stated SE tolerance, on both sides;
 *  - the allocation is checked against the family: coverage, duplicates, the
 *    closed interval [0, alpha] (0 is a legitimate initial level) and the total;
 *    a hypothesis that can never receive alpha is named;
 *  - a method name is looked up as data: 'constructor' or '__proto__' is a gap,
 *    never an inherited property;
 *  - no confirmatory endpoint is not_assessable, one is not_applicable, primary
 *    endpoints with no procedure are not_assessable (co-primary vs multiple
 *    primary is not recorded), a hierarchy with no procedure is missing;
 *  - malformed persisted input is a gap, never a throw.
 */
import { describe, expect, it } from 'vitest';

import { estimateFWER, fixedSequenceReject, graphicalReject, hochbergReject, holmReject } from '../../stats/multiplicity';
import { hashInputs } from '../../stats/computation-provenance';
import type { StudyDesign } from '../study-design-types';
import {
  FWER_SEED, FWER_SIMULATIONS, FWER_TOLERANCE_SE, MULTIPLICITY_CHECK_BASIS, checkMultiplicity, fwerVerdict, weightedHolmGraph,
} from '../multiplicity-check';

const FAMILY = ['CV death or HF hospitalisation', 'KCCQ-TSS change', 'All-cause death'];
const split = (levels: number[]) => FAMILY.map((endpointName, i) => ({ endpointName, alpha: levels[i] }));
const THIRD = 0.05 / 3;

function design(method = 'holm', levels: number[] = [THIRD, THIRD, THIRD]): StudyDesign {
  return {
    title: 'A phase 3 study of Drug X in heart failure',
    phase: '3',
    indication: 'heart failure',
    objectives: [],
    estimands: [],
    endpoints: [
      { name: FAMILY[0], role: 'primary', type: 'time_to_event', definition: 'time to first event' },
      { name: FAMILY[1], role: 'key_secondary', type: 'continuous', definition: 'change at month 8' },
      { name: FAMILY[2], role: 'key_secondary', type: 'time_to_event', definition: 'time to death' },
      { name: 'NT-proBNP', role: 'exploratory', type: 'continuous', definition: 'change at month 8' },
    ],
    framework: { inferentialFrame: 'superiority', structuralDesign: 'parallel_group', controlType: 'placebo' },
    population: { targetDescription: 'adults with HFrEF', analysisPopulations: [], eligibility: [] },
    arms: [],
    statisticalPlan: { plannedAnalyses: [], alpha: 0.05, multiplicity: { method, alphaAllocation: split(levels) } },
  } as StudyDesign;
}

const engineRate = (reject: (p: number[]) => boolean[]) => estimateFWER(reject, 3, 0.05, FWER_SIMULATIONS, FWER_SEED).fwer;

describe('checkMultiplicity — the engine\'s rates, from the recorded allocation', () => {
  it('an equal Holm split is Holm: the rate reproduces holmReject exactly, and holds alpha', () => {
    const c = checkMultiplicity(design());
    expect(c.family).toEqual(FAMILY);
    expect(c.status).toBe('rendered');
    expect(c.gaps).toEqual([]);
    expect(c.procedure).toMatchObject({ rule: 'holm', simulated: 'recorded_allocation', controlled: true, simulations: FWER_SIMULATIONS });
    expect(c.procedure!.level).toBeCloseTo(0.05, 12);
    expect(c.procedure!.fwer).toBe(engineRate((p) => holmReject(p, 0.05)));
    const exact = 1 - Math.pow(0.95, 3);
    expect(c.unadjusted!.rule).toBe('unadjusted');
    expect(Math.abs(c.unadjusted!.fwer - exact)).toBeLessThan(4 * c.unadjusted!.monteCarloSe);
    expect(c.unadjusted!.provenance).not.toHaveProperty('generatedAt');
    expect(c.basis).toBe(MULTIPLICITY_CHECK_BASIS);
  });

  it('a partial Holm split spends only its total — the allocation, not a textbook procedure, is simulated', () => {
    const c = checkMultiplicity(design('holm', [0.01, 0.01, 0.01]));
    expect(c.status).toBe('rendered');
    expect(c.procedure!.level).toBeCloseTo(0.03, 12);
    const exact = 1 - Math.pow(0.99, 3);
    expect(Math.abs(c.procedure!.fwer - exact)).toBeLessThan(4 * c.procedure!.monteCarloSe);
    expect(c.procedure!.fwer).toBeLessThan(engineRate((p) => holmReject(p, 0.05)) - 4 * c.procedure!.monteCarloSe);
  });

  it('a fixed sequence with alpha on its first hypothesis and 0 on the rest is the textbook sequence, and 0 is no defect', () => {
    const c = checkMultiplicity(design('fixed_sequence', [0.05, 0, 0]));
    expect(c.status).toBe('rendered');
    expect(c.gaps).toEqual([]);
    expect(c.procedure!.fwer).toBe(engineRate((p) => fixedSequenceReject(p, 0.05)));
    expect(c.procedure!.controlled).toBe(true);
    expect(c.procedure!.monteCarloSe).toBeCloseTo(Math.sqrt((c.procedure!.fwer * (1 - c.procedure!.fwer)) / FWER_SIMULATIONS), 12);
    expect(c.notes).toContain('the fixed sequence is taken in the order the allocation lists the endpoints');
  });

  it('an equal Hochberg split is Hochberg at the allocated total, with its dependence caveat', () => {
    const c = checkMultiplicity(design('hochberg'));
    expect(c.status).toBe('rendered');
    expect(c.procedure!.fwer).toBe(engineRate((p) => hochbergReject(p, c.procedure!.level)));
    expect(c.notes[0]).toMatch(/independence or positive dependence/);
  });

  it('a weighted Hochberg has no engine here, and is a gap rather than the unweighted procedure', () => {
    const c = checkMultiplicity(design('hochberg', [0.03, 0.01, 0.01]));
    expect(c.status).toBe('partial');
    expect(c.procedure).toBeNull();
    expect(c.gaps[0]).toMatch(/^a Hochberg procedure with an unequal allocation \(weighted Hochberg\) has no engine here/);
  });

  it('with no allocation the textbook split is simulated, and the note says so', () => {
    const d = design();
    delete d.statisticalPlan.multiplicity!.alphaAllocation;
    const c = checkMultiplicity(d);
    expect(c.gaps).toEqual(['no alpha allocation is recorded for the family']);
    expect(c.procedure).toMatchObject({ simulated: 'textbook_split', level: 0.05 });
    expect(c.procedure!.fwer).toBe(engineRate((p) => holmReject(p, 0.05)));
    expect(c.notes.join(' ')).toMatch(/no allocation is recorded, so holm is simulated with its textbook split/);
  });

  it.each([
    ['hochberg', (p: number[]) => hochbergReject(p, 0.05)],
    ['fixed_sequence', (p: number[]) => fixedSequenceReject(p, 0.05)],
  ] as const)('with no allocation, %s is simulated with its own textbook rule, exactly', (method, rule) => {
    // Both hold the FWER at alpha under the global null, so only exact equality
    // with the engine's own rule tells one procedure from the other.
    const d = design(method);
    delete d.statisticalPlan.multiplicity!.alphaAllocation;
    const c = checkMultiplicity(d);
    expect(c.procedure).toMatchObject({ simulated: 'textbook_split', level: 0.05 });
    expect(c.procedure!.fwer).toBe(engineRate(rule));
  });

  it('no two rules share a provenance: textbook Holm, Hochberg and fixed sequence, and recorded Hochberg at two levels', () => {
    const textbook = (['holm', 'hochberg', 'fixed_sequence'] as const).map((m) => {
      const d = design(m);
      delete d.statisticalPlan.multiplicity!.alphaAllocation;
      return checkMultiplicity(d).procedure!;
    });
    expect(textbook.map((p) => p.simulated)).toEqual(['textbook_split', 'textbook_split', 'textbook_split']);
    expect(new Set(textbook.map((p) => p.provenance.inputsSha256)).size).toBe(3);
    const low = checkMultiplicity(design('hochberg', [0.01, 0.01, 0.01])).procedure!;
    const full = checkMultiplicity(design('hochberg')).procedure!;
    expect(low.level).not.toBe(full.level);
    expect(low.provenance.inputsSha256).not.toBe(full.provenance.inputsSha256);
  });

  it('each rate names the rule that produced it, and the engine hashes that rule into its provenance', () => {
    const c = checkMultiplicity(design());
    expect(c.procedure!.rule).not.toBe(c.unadjusted!.rule);
    expect(c.procedure!.provenance.inputsSha256).not.toBe(c.unadjusted!.provenance.inputsSha256);
    for (const r of [c.procedure!, c.unadjusted!]) {
      expect(r.provenance.inputsSha256).toBe(hashInputs({ m: 3, alpha: 0.05, nSim: r.simulations, seed: r.provenance.seed, rule: r.simulatedRule }));
    }
    // Two recorded allocations of the same method are two rules: the weights are in the identifier.
    const partial = checkMultiplicity(design('holm', [0.01, 0.01, 0.01]));
    expect(partial.procedure!.rule).toBe(c.procedure!.rule);
    expect(partial.procedure!.simulatedRule).not.toBe(c.procedure!.simulatedRule);
    expect(partial.procedure!.provenance.inputsSha256).not.toBe(c.procedure!.provenance.inputsSha256);
  });

  it('is deterministic', () => {
    expect(JSON.stringify(checkMultiplicity(design()))).toBe(JSON.stringify(checkMultiplicity(design())));
  });
});

describe('weightedHolmGraph — the graph is weighted Holm', () => {
  /** Independent oracle: step-down, reject H_i when p_i ≤ α·w_i / Σ(active w). */
  function weightedHolmOracle(p: number[], alpha: number, w: number[]): boolean[] {
    const rejected = p.map(() => false);
    for (;;) {
      const active = p.map((_, i) => i).filter((i) => !rejected[i]);
      const total = active.reduce((s, i) => s + w[i], 0);
      const hit = active.find((i) => w[i] > 0 && p[i] <= (alpha * w[i]) / total);
      if (hit === undefined) return rejected;
      rejected[hit] = true;
    }
  }

  it('agrees with the step-down oracle on every probe vector, for equal and unequal weights', () => {
    const vectors = [[0.01, 0.02, 0.03], [0.001, 0.04, 0.2], [0.03, 0.012, 0.9], [0.2, 0.3, 0.004], [0.026, 0.026, 0.026], [0.016, 0.024, 0.049]];
    for (const w of [[1 / 3, 1 / 3, 1 / 3], [0.6, 0.2, 0.2], [0.5, 0.3, 0.2]]) {
      const G = weightedHolmGraph(w);
      for (const p of vectors) expect(graphicalReject(p, 0.05, w, G)).toEqual(weightedHolmOracle(p, 0.05, w));
    }
  });

  it('a zero-weight hypothesis receives no transition', () => {
    const G = weightedHolmGraph([1, 0, 0]);
    expect(G.map((row) => row[1] + row[2])).toEqual([0, 0, 0]);
  });
});

describe('fwerVerdict — "controlled" against the stated tolerance, both sides', () => {
  const se = 0.002;
  it('more than the tolerance above alpha is NOT controlled, and says so', () => {
    const v = fwerVerdict(0.05 + (FWER_TOLERANCE_SE + 1) * se, se, 0.05);
    expect(v.controlled).toBe(false);
    expect(v.gap).toBe(`the procedure's simulated family-wise error (${0.05 + (FWER_TOLERANCE_SE + 1) * se}) exceeds alpha (0.05) by more than ${FWER_TOLERANCE_SE} Monte Carlo SEs`);
  });
  it('within the tolerance is controlled, with no gap', () => {
    expect(fwerVerdict(0.05 + (FWER_TOLERANCE_SE - 1) * se, se, 0.05)).toEqual({ controlled: true, gap: null });
    expect(fwerVerdict(0.04, se, 0.05)).toEqual({ controlled: true, gap: null });
  });
});

describe('checkMultiplicity — the allocation is checked, never assumed', () => {
  it('Holm or Hochberg with the full alpha on every endpoint is refused, not simulated as the textbook procedure', () => {
    for (const method of ['holm', 'hochberg']) {
      const c = checkMultiplicity(design(method, [0.05, 0.05, 0.05]));
      expect(c.status).toBe('partial');
      expect(c.procedure).toBeNull();
      expect(c.allocation!.total).toBeCloseTo(0.15, 12);
      expect(c.gaps).toEqual(expect.arrayContaining([
        expect.stringMatching(/^the allocation totals 0\.15, more than the overall alpha \(0\.05\)/),
        `the ${method} procedure is not simulated: the recorded allocation is not a valid initial split of alpha over the family`,
      ]));
    }
  });

  it('the closed interval [0, alpha]: both ends are levels, outside them is not', () => {
    expect(checkMultiplicity(design('fixed_sequence', [0.05, 0, 0])).allocation!.outOfRange).toEqual([]);
    const c = checkMultiplicity(design('fixed_sequence', [0.05 + 1e-6, -1e-6, 0]));
    expect(c.allocation!.outOfRange).toEqual([FAMILY[0], FAMILY[1]]);
    expect(c.gaps).toContain(`the allocation for "${FAMILY[1]}" is not a level in the closed interval [0, 0.05]`);
  });

  it('an allocation that misses a confirmatory endpoint, names another, repeats one, or leaves the range is a gap each', () => {
    const d = design();
    d.statisticalPlan.multiplicity!.alphaAllocation = [
      { endpointName: FAMILY[0], alpha: 0.01 },
      { endpointName: 'NT-proBNP', alpha: 0.01 },
      { endpointName: FAMILY[1], alpha: 0.2 },
      { endpointName: FAMILY[0], alpha: 0.01 },
    ];
    const c = checkMultiplicity(d);
    expect(c.status).toBe('partial');
    expect(c.procedure).toBeNull();
    expect(c.gaps).toEqual([
      `confirmatory endpoint "${FAMILY[2]}" has no alpha allocation`,
      'the allocation names "NT-proBNP", which is not a confirmatory endpoint of this design',
      `the allocation names "${FAMILY[0]}" more than once`,
      `the allocation for "${FAMILY[1]}" is not a level in the closed interval [0, 0.05]`,
      expect.stringMatching(/^the allocation totals 0\.23, more than the overall alpha/),
      'the holm procedure is not simulated: the recorded allocation is not a valid initial split of alpha over the family',
    ]);
  });

  it('a hypothesis that starts at 0 and can never receive alpha is named', () => {
    const holm = checkMultiplicity(design('holm', [0.05, 0, 0]));
    expect(holm.gaps).toEqual([1, 2].map((i) => `under holm, "${FAMILY[i]}" starts with no alpha and receives none when others are rejected, so it can never be rejected`));
    const seq = checkMultiplicity(design('fixed_sequence', [0, 0.05, 0]));
    expect(seq.gaps).toEqual([`under fixed_sequence, "${FAMILY[0]}" starts with no alpha and receives none when others are rejected, so it can never be rejected`]);
    expect(seq.procedure!.controlled).toBe(true);
  });

  it('no alpha: nothing is simulated', () => {
    const d = design();
    delete d.statisticalPlan.alpha;
    const c = checkMultiplicity(d);
    expect(c.procedure).toBeNull();
    expect(c.unadjusted).toBeNull();
    expect(c.gaps).toEqual(['the significance level (alpha) is not recorded']);
  });
});

describe('checkMultiplicity — gaps, never substitutes', () => {
  it('a graphical procedure without weights and a transition matrix is not approximated', () => {
    const c = checkMultiplicity(design('graphical'));
    expect(c.status).toBe('partial');
    expect(c.procedure).toBeNull();
    expect(c.unadjusted).not.toBeNull();
    expect(c.gaps[0]).toMatch(/needs its initial weights and transition matrix/);
  });

  it('alpha spending is named for what it is', () => {
    expect(checkMultiplicity(design('alpha_spending')).gaps[0]).toMatch(/not a multiplicity procedure for this family/);
  });

  it('a method name is data: inherited property names and unrecorded methods are a gap, never a rule', () => {
    for (const method of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'bonferroni']) {
      const c = checkMultiplicity(design(method));
      expect(c.status).toBe('partial');
      expect(c.procedure).toBeNull();
      expect(c.method).toBeNull();
      expect(c.gaps[0]).toBe(`procedure "${method}" is not a multiplicity method the design spine records: its error control cannot be checked`);
    }
  });
});

describe('checkMultiplicity — whether there is a family to control', () => {
  it('a hierarchy with no procedure is missing; a single confirmatory hypothesis is not_applicable', () => {
    const d = design();
    d.statisticalPlan.multiplicity = { method: 'none' };
    expect(checkMultiplicity(d).status).toBe('missing');
    d.endpoints = d.endpoints.filter((e) => e.role === 'primary');
    expect(checkMultiplicity(d).status).toBe('not_applicable');
  });

  it('no primary or key-secondary endpoint is an unrecorded input, not an absent need', () => {
    for (const endpoints of [[], [{ name: 'NT-proBNP', role: 'secondary', type: 'continuous', definition: 'x' }]]) {
      const c = checkMultiplicity({ ...design(), endpoints } as unknown as StudyDesign);
      expect(c.status).toBe('not_assessable');
      expect(c.gaps).toEqual(['no primary or key-secondary endpoint is recorded, so there is no confirmatory family to assess']);
    }
  });

  it('primary endpoints alone with no procedure: co-primary vs multiple primary is not recorded', () => {
    const d = design();
    d.statisticalPlan.multiplicity = { method: 'none' };
    d.endpoints = d.endpoints.map((e) => ({ ...e, role: e.role === 'key_secondary' ? 'primary' : e.role }));
    const c = checkMultiplicity(d);
    expect(c.status).toBe('not_assessable');
    expect(c.gaps[0]).toMatch(/^3 primary endpoints and no multiplicity procedure: whether they are co-primary .* is not recorded$/);
  });
});

describe('checkMultiplicity — total over what a passthrough persist can store', () => {
  it('null endpoints, null or non-list allocations and a missing plan do not throw', () => {
    const cases: unknown[] = [
      { ...design(), endpoints: [null, ...design().endpoints] },
      { ...design(), endpoints: 'x' },
      { ...design(), statisticalPlan: { alpha: 0.05, multiplicity: { method: 'holm', alphaAllocation: [null, 'x', ...split([0.01, 0.01, 0.01])] } } },
      { ...design(), statisticalPlan: { alpha: 0.05, multiplicity: { method: 'holm', alphaAllocation: 'x' } } },
      { ...design(), statisticalPlan: undefined },
      { ...design(), statisticalPlan: { alpha: 0.05, multiplicity: 'holm' } },
    ];
    for (const d of cases) expect(() => checkMultiplicity(d as StudyDesign)).not.toThrow();
    const malformed = checkMultiplicity(cases[2] as StudyDesign);
    expect(malformed.gaps[0]).toBe('2 allocation entries do not name an endpoint and a numeric level');
    expect(malformed.procedure).toBeNull();
    expect(checkMultiplicity(cases[3] as StudyDesign).gaps[0]).toBe('the alpha allocation is not a list of endpoint levels');
  });

  it('a confirmatory endpoint named twice makes the allocation ambiguous', () => {
    const d = design();
    d.endpoints = [...d.endpoints, { ...d.endpoints[0] }];
    const c = checkMultiplicity(d);
    expect(c.gaps).toContain(`confirmatory endpoint "${FAMILY[0]}" is named more than once in the design, so its allocation is ambiguous`);
    expect(c.procedure).toBeNull();
  });
});
