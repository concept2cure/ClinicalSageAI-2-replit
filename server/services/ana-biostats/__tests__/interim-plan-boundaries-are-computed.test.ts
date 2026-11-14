/**
 * The interim analysis plan prints the boundaries the group-sequential engine
 * solves, or none.
 *
 * Until 2026-11-12 `generateInterimAnalysisPlan` wrote, under the name
 * "O'Brien–Fleming-type alpha-spending function":
 *
 *     const z = (2.96 - 0.6 * frac).toFixed(2); // indicative
 *     … | Final | 100% | ±1.97 |
 *
 * For two interim looks that is ±2.76 and ±2.56. The Lan–DeMets O'Brien–Fleming
 * boundaries for those looks are ±3.71 and ±2.51 — the first look was crossed
 * under the null about thirty times as often as the design the text named — and
 * the final ±1.97 was printed whatever α was. The exact engine was already in
 * the repository (server/services/stats/group-sequential-oc.ts) and the plan
 * did not call it. RULE 2: a figure in governed content comes from a
 * deterministic engine.
 *
 * The cases check the printed table against that engine, the engine against the
 * published tables, and that a design the boundaries are not for gets no number
 * and the reason.
 */
import { describe, expect, it } from 'vitest';
import { computationEngine } from '../computation-engine';
import { judgmentEngine } from '../judgment-engine';
import { domainAdapter } from '../domain-adapter';
import { documentGenerator } from '../document-generator';
import { MAX_INTERIM_LOOKS, interimBoundaries } from '../interim-boundaries';
import type { StatisticalInput } from '../types';
import { computeOperatingCharacteristic, solveSpendingBoundaries } from '../../stats/group-sequential-oc';
import { normalQuantile } from '../../stats/normal';

const SURVIVAL: StatisticalInput = {
  clientTrack: 'biotech_pharma',
  regulatoryBody: 'FDA',
  studyType: 'superiority',
  objectiveType: 'efficacy',
  endpointType: 'time_to_event',
  alpha: 0.05,
  powerTarget: 0.9,
  effectSize: 0.38,
  eventRate: 0.55,
  attritionRate: 0.15,
  allocationRatio: 1,
  numberOfGroups: 2,
  numberOfEndpoints: 1,
  interimAnalyses: 2,
  comparatorType: 'placebo',
  phase: 'Phase III',
};

const NI: StatisticalInput = {
  clientTrack: 'biotech_pharma',
  regulatoryBody: 'EMA',
  studyType: 'non_inferiority',
  objectiveType: 'efficacy',
  endpointType: 'continuous',
  alpha: 0.025,
  powerTarget: 0.9,
  effectSize: 0,
  nonInferiorityMargin: -0.4,
  variance: 1,
  attritionRate: 0.1,
  allocationRatio: 1,
  numberOfGroups: 2,
  interimAnalyses: 1,
  comparatorType: 'active',
};

const plan = (input: StatisticalInput) => {
  const computation = computationEngine.compute(input);
  const judgment = judgmentEngine.judge(input, computation);
  const domain = domainAdapter.adapt(input, computation, judgment);
  const doc = documentGenerator.generate('interim_analysis_plan', input, computation, judgment, domain, undefined, {
    projectId: 1, organizationId: 1, userId: 1,
  });
  return { content: doc.content, computation };
};

/** The table's rows, as [look (information fraction), boundary, nominal p, cumulative α]. */
const rows = (content: string): string[][] => {
  const section = content.slice(content.indexOf('## 3. Alpha Spending'), content.indexOf('## 4. Stopping Rules'));
  return section.split('\n')
    .filter((l) => l.startsWith('| ') && !l.startsWith('| Look') && !l.startsWith('|---'))
    .map((l) => l.split('|').slice(1, -1).map((cell) => cell.trim()));
};
const section3 = (content: string) =>
  content.slice(content.indexOf('## 3. Alpha Spending'), content.indexOf('## 4. Stopping Rules'));

describe('the engine it now calls agrees with the published tables', () => {
  // Lan–DeMets O'Brien–Fleming, one-sided 0.025, equally spaced looks
  // (Jennison & Turnbull; the same figures gsDesign's sfLDOF and EAST give).
  it.each([
    [2, [2.9626, 1.9686]],
    [3, [3.7103, 2.5114, 1.9930]],
    [4, [4.3326, 2.9631, 2.3590, 2.0141]],
  ] as Array<[number, number[]]>)('%i looks', (looks, published) => {
    const fractions = Array.from({ length: looks }, (_, i) => (i + 1) / looks);
    const solved = solveSpendingBoundaries(fractions, 0.025, 'obrien-fleming');
    solved.efficacyBoundaries.forEach((z, i) => expect(Math.abs(z - published[i])).toBeLessThan(0.001));
    const typeI = computeOperatingCharacteristic({ informationFractions: fractions, efficacyBoundaries: solved.efficacyBoundaries }, 0);
    expect(Math.abs(typeI.rejectProbability - 0.025)).toBeLessThan(0.0001);
  });
});

describe('a superiority comparison: the table is the engine’s', () => {
  it('two interim looks print ±3.71, ±2.51 and a final ±1.99 — not ±2.76, ±2.56 and ±1.97', () => {
    const { content } = plan(SURVIVAL);
    const table = rows(content);
    expect(table.map((r) => r[0])).toEqual(['1 (33%)', '2 (67%)', 'Final (100%)']);
    expect(table.map((r) => r[1])).toEqual(['±3.71', '±2.51', '±1.99']);
    expect(table.map((r) => r[2])).toEqual(['0.0001', '0.0060', '0.0231']);
    expect(table.map((r) => r[3])).toEqual(['0.0001', '0.0060', '0.0250']);
    // What it printed before, from 2.96 − 0.6·t and a constant.
    expect(section3(content)).not.toMatch(/2\.76|2\.56|±1\.97/);
  });

  it('every printed boundary is the engine’s own solve, rounded', () => {
    for (const interimAnalyses of [1, 2, 3, 4]) {
      const { content } = plan({ ...SURVIVAL, interimAnalyses });
      const fractions = Array.from({ length: interimAnalyses + 1 }, (_, i) => (i + 1) / (interimAnalyses + 1));
      fractions[fractions.length - 1] = 1;
      const solved = solveSpendingBoundaries(fractions, SURVIVAL.alpha / 2, 'obrien-fleming');
      expect(rows(content).map((r) => r[1])).toEqual(solved.efficacyBoundaries.map((z) => `±${z.toFixed(2)}`));
    }
  });

  it('the final boundary moves with α; it is not a constant', () => {
    const at05 = rows(plan({ ...SURVIVAL, interimAnalyses: 1 }).content).at(-1)![1];
    const at01 = rows(plan({ ...SURVIVAL, interimAnalyses: 1, alpha: 0.01 }).content).at(-1)![1];
    expect(at05).toBe('±1.97');
    const solved = solveSpendingBoundaries([0.5, 1], 0.005, 'obrien-fleming');
    expect(at01).toBe(`±${solved.efficacyBoundaries[1].toFixed(2)}`);
    expect(Number(at01.slice(1))).toBeGreaterThan(2.5);
  });

  it('the cumulative spend at the final analysis is α/2 in each direction, and says so', () => {
    const { content } = plan(SURVIVAL);
    expect(rows(content).at(-1)![3]).toBe('0.0250');
    expect(section3(content)).toMatch(/two-sided at α = 0\.05: each direction spends α\/2 = 0\.025/);
  });

  it('the table has four narrow columns, and says what the short headings mean', () => {
    const s = section3(plan(SURVIVAL).content);
    expect(s).toContain('| Look | Boundary (Z) | Nominal p | α spent |');
    expect(s).toContain('Nominal p is the one-sided p-value at the boundary; α spent is the cumulative one-sided alpha.');
  });

  it('a p-value below the printed precision is written <0.0001, never 0.0000', () => {
    const table = rows(plan({ ...SURVIVAL, interimAnalyses: 3 }).content);
    expect(table[0]).toEqual(['1 (25%)', '±4.33', '<0.0001', '<0.0001']);
    expect(table.flat()).not.toContain('0.0000');
  });

  it('it no longer calls its own figures indicative, and names how they were computed', () => {
    const s = section3(plan(SURVIVAL).content);
    expect(s).not.toMatch(/indicative/i);
    expect(s).toMatch(/Lan–DeMets O'Brien–Fleming/);
    expect(s).toMatch(/Computed by the group-sequential engine/);
    expect(s).toMatch(/recompute from the information observed at each look/);
  });

  it('states what the boundaries cost in power, from the same engine', () => {
    const { content, computation } = plan(SURVIVAL);
    const b = interimBoundaries(SURVIVAL, computation, 2);
    if (b.kind !== 'solved') throw new Error('expected boundaries');
    const drift = normalQuantile(1 - SURVIVAL.alpha / 2) + normalQuantile(computation.power);
    const oc = computeOperatingCharacteristic(
      { informationFractions: b.looks.map((l) => l.informationFraction), efficacyBoundaries: b.looks.map((l) => l.boundary) },
      drift,
    );
    expect(b.powerUnderBoundaries).toBeCloseTo(oc.rejectProbability, 10);
    expect(b.powerUnderBoundaries!).toBeLessThan(computation.power);
    expect(computation.power - b.powerUnderBoundaries!).toBeLessThan(0.01);
    expect(section3(content)).toContain(
      `is ${(b.powerUnderBoundaries! * 100).toFixed(1)}%, against ${(computation.power * 100).toFixed(1)}% for the single-look test`,
    );
  });
});

describe('a non-inferiority comparison is one-sided', () => {
  it('prints an upper boundary with no ±, at α/2', () => {
    const { content } = plan(NI);
    const solved = solveSpendingBoundaries([0.5, 1], NI.alpha / 2, 'obrien-fleming');
    expect(rows(content).map((r) => r[1])).toEqual(solved.efficacyBoundaries.map((z) => z.toFixed(2)));
    expect(section3(content)).toMatch(/one-sided at α\/2 = 0\.0125/);
    expect(section3(content)).not.toContain('±');
  });
});

describe('a design the boundaries are not for gets no number, and the reason', () => {
  const refused = (input: StatisticalInput) => {
    const s = section3(plan(input).content);
    expect(rows(plan(input).content)).toEqual([]);
    expect(s).toMatch(/No boundary is printed for this design: /);
    expect(s).not.toMatch(/±\d|\|\s*\d+\.\d\d\s*\|/);
    return s;
  };

  it('equivalence (two one-sided tests)', () => {
    expect(refused({ ...NI, studyType: 'equivalence', nonInferiorityMargin: undefined, equivalenceMargin: 0.4, alpha: 0.05 }))
      .toMatch(/two one-sided tests/);
  });

  it('diagnostic accuracy with co-primary endpoints', () => {
    expect(refused({
      clientTrack: 'diagnostics_ivd', regulatoryBody: 'FDA', studyType: 'diagnostic_accuracy', objectiveType: 'diagnostic_accuracy',
      endpointType: 'sensitivity_specificity', alpha: 0.05, powerTarget: 0.9, effectSize: 0.9, sensitivity: 0.9, specificity: 0.92,
      prevalence: 0.3, nonInferiorityMargin: 0.05, attritionRate: 0.1, allocationRatio: 1, numberOfGroups: 1, numberOfEndpoints: 2,
      interimAnalyses: 1,
    })).toMatch(/not a superiority or non-inferiority comparison/);
  });

  it('more than two groups', () => {
    expect(refused({ ...SURVIVAL, numberOfGroups: 3 })).toMatch(/more than one comparison/);
  });

  it('more than one primary endpoint', () => {
    expect(refused({ ...SURVIVAL, numberOfEndpoints: 2 })).toMatch(/more than one primary endpoint/);
  });
});

describe('the count of looks arrives unvalidated', () => {
  it('an absurd count is refused at once, not solved', () => {
    const { computation } = plan(SURVIVAL);
    const started = Date.now();
    const b = interimBoundaries(SURVIVAL, computation, 1_000_000);
    expect(Date.now() - started).toBeLessThan(200);
    expect(b).toEqual({ kind: 'not_computed', reason: `boundaries are computed for up to ${MAX_INTERIM_LOOKS} interim analyses, and this design records 1000000` });
    const s = plan({ ...SURVIVAL, interimAnalyses: 1_000_000 }).content;
    expect(s.length).toBeLessThan(20_000);
    expect(s).toMatch(/Timing is listed for a whole number of up to 10/);
  });

  it('a fractional count is not rounded into a design nobody recorded', () => {
    const { computation } = plan(SURVIVAL);
    expect(interimBoundaries(SURVIVAL, computation, 2.5)).toEqual({
      kind: 'not_computed', reason: 'the number of interim analyses is not a whole number of one or more',
    });
  });
});

/* S12 biotech sweep, finding 64 (2026-11-09): with Interims = 0 the plan said "This plan governs 1
   planned interim analysis … at approximately 50% of planned information". cf6b0293f3 (2026-11-12)
   kept the look and said "The design records no interim analysis. This plan is drawn for one" — but
   then printed its timing, a solved boundary table (±2.96 / ±1.97), stopping rules and an unblinded
   interim statistician: a pre-specified interim design that the design, its SAP and its DSMB charter
   all say does not exist. RULE 2: a boundary the design did not produce is not printed. */
describe('a design that plans no interim analysis is told so', () => {
  it.each([
    ['records zero', 0],
    ['records no count', undefined],
  ])('a design that %s gets a plan saying none is planned, with no look, boundary or stopping rule', (_label, interimAnalyses) => {
    const { content } = plan({ ...SURVIVAL, interimAnalyses });
    expect(content).toMatch(/No interim efficacy analysis is planned for a superiority study \(target N = \d+/);
    expect(content).toMatch(/record the number of interim analyses on the design/);
    expect(content).toMatch(/DSMB charter/);
    expect(content).not.toMatch(/planned interim analys/i);
    expect(content).not.toMatch(/drawn for one/);
    expect(content).not.toContain('50%');
    expect(content).not.toContain('## 3. Alpha Spending');
    expect(content).not.toContain('## 4. Stopping Rules');
    expect(content).not.toMatch(/±\d/);
    expect(content).not.toMatch(/Interim analyses are performed/);
    expect(rows(content)).toEqual([]);
  });

  it('agrees with the SAP and the DSMB charter drawn from the same design', () => {
    const input = { ...SURVIVAL, interimAnalyses: 0 };
    const computation = computationEngine.compute(input);
    const judgment = judgmentEngine.judge(input, computation);
    const domain = domainAdapter.adapt(input, computation, judgment);
    const ctx = { projectId: 1, organizationId: 1, userId: 1 };
    const sap = documentGenerator.generate('sap_section_draft', input, computation, judgment, domain, undefined, ctx).content;
    const charter = documentGenerator.generate('dsmb_charter', input, computation, judgment, domain, undefined, ctx).content;
    expect(sap).not.toMatch(/planned interim analys/i);
    expect(charter).not.toMatch(/\d+ planned/);
    expect(plan(input).content).not.toMatch(/planned interim analys/i);
  });

  it('a design that records them is unchanged in its first line', () => {
    expect(plan(SURVIVAL).content).toMatch(/This plan governs 2 planned interim analyses for a superiority study \(target N = /);
  });

  it('writes "an equivalence study", not "a equivalence study"', () => {
    const content = plan({ ...NI, studyType: 'equivalence', nonInferiorityMargin: undefined, equivalenceMargin: 0.4, alpha: 0.05 }).content;
    expect(content).toMatch(/for an equivalence study/);
    expect(plan({ ...SURVIVAL, studyType: 'adaptive' }).content).toMatch(/for an adaptive study/);
  });
});

describe('an adaptive design', () => {
  it('gets the efficacy boundaries and is told what they do not cover', () => {
    const s = section3(plan({ ...SURVIVAL, studyType: 'adaptive' }).content);
    expect(s).toMatch(/±3\.71/);
    expect(s).toMatch(/cover the efficacy looks only/);
    expect(section3(plan(SURVIVAL).content)).not.toMatch(/cover the efficacy looks only/);
  });
});
