/**
 * Within-document figure arithmetic a reviewer does in their head: a stated
 * percentage must equal its own n/N at the precision it is written to, and arm
 * counts listed after a randomized/treated/enrolled total must add up to it.
 *
 * Before this check, "4.6% (15/305)" (15/305 is 4.92%) and "612 randomized
 * (306 … and 305 …)" (sum 611) passed every deterministic check in the
 * platform — the stale-synopsis pitfall the ICH E3 tree itself names
 * (csr-e3-sections-plan.ts, csr-e3-sections-results.ts).
 */
import { describe, expect, it } from 'vitest';

import { checkFigureArithmetic } from '../dossierReconciliation';
import { checkTerminologyConsistency } from '../terminology-consistency';

const STALE = 'Serious adverse events were reported in 4.6% (15/305) of Drug X subjects.';

describe('checkFigureArithmetic — percent of n/N', () => {
  it('flags a percentage that does not match its own n/N, with the recomputed value', () => {
    const r = checkFigureArithmetic(STALE);
    expect(r.percentPairsChecked).toBe(1);
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]).toMatchObject({ kind: 'percent_of', stated: 4.6, recomputed: 4.92 });
    expect(r.findings[0].clause).toContain('4.6% (15/305)');
  });

  it('accepts a percentage that rounds correctly at its stated precision', () => {
    // 14/305 = 4.590% → 4.6 at one decimal.
    const r = checkFigureArithmetic('Serious adverse events were reported in 4.6% (14/305) of Drug X subjects.');
    expect(r.percentPairsChecked).toBe(1);
    expect(r.findings).toEqual([]);
  });

  it('judges an integer percentage at integer precision (USPI §6 convention)', () => {
    // 24/305 = 7.869% → 8 at zero decimals.
    const r = checkFigureArithmetic('Headache 8% (24/305), nausea 6% (18/305).');
    expect(r.percentPairsChecked).toBe(2);
    expect(r.findings).toEqual([]);
  });

  it('reads the n/N (x%) order and thousands separators', () => {
    const r = checkFigureArithmetic('Any TEAE: 1,234/2,468 (45.0%); deaths 3/2,468 (0.1%).');
    expect(r.percentPairsChecked).toBe(2);
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]).toMatchObject({ kind: 'percent_of', stated: 45, recomputed: 50 });
  });

  it('still recomputes a pair whose N merely falls in the year range', () => {
    // 45/2023 = 2.22%, so 45% is a real error; n > 12 cannot be a month.
    const r = checkFigureArithmetic('Any TEAE: 45/2023 (45%).');
    expect(r.percentPairsChecked).toBe(1);
    expect(r.findings).toMatchObject([{ kind: 'percent_of', stated: 45, recomputed: 2.2 }]);
  });

  it('accepts an exact half either way', () => {
    // 1/8 = 12.5% exactly.
    expect(checkFigureArithmetic('Rash 12% (1/8).').findings).toEqual([]);
    expect(checkFigureArithmetic('Rash 13% (1/8).').findings).toEqual([]);
  });

  it('skips bounded percentages, impossible pairs and a pair the parenthesis does not close on', () => {
    for (const text of [
      'Anaphylaxis <1% (2/305).',
      'Responders had a ≥50% reduction (15/30).',
      'Pruritus 2/305 (<1%).',
      'Rate 5% (0/0).',
      'Rate 5% (12/10).',
      'Rate 5% (15/305 at Week 12).',
      'Overall, 12/2023 (45%).', // a month/year, not a count over a denominator
    ]) {
      const r = checkFigureArithmetic(text);
      expect(r.findings, text).toEqual([]);
      expect(r.percentPairsChecked, text).toBe(0);
    }
  });
});

describe('checkFigureArithmetic — arm counts sum to the stated total', () => {
  it('flags arm counts that do not sum to the randomized total', () => {
    const r = checkFigureArithmetic('A total of 612 subjects were randomized (306 to Drug X and 305 to placebo).');
    expect(r.armSumsChecked).toBe(1);
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]).toMatchObject({ kind: 'arm_sum', stated: 612, recomputed: 611 });
  });

  it('reads the total after the verb and the "<arm> (n=<int>)" form', () => {
    const bad = checkFigureArithmetic('The study randomized a total of 612 subjects (Drug X (n=306) and placebo (n=300)).');
    expect(bad.armSumsChecked).toBe(1);
    expect(bad.findings).toMatchObject([{ kind: 'arm_sum', stated: 612, recomputed: 606 }]);
    const good = checkFigureArithmetic('The study randomized a total of 612 subjects (Drug X (n=306) and placebo (n=306)).');
    expect(good.armSumsChecked).toBe(1);
    expect(good.findings).toEqual([]);
  });

  it('accepts arms that add up, including treated totals and thousands separators', () => {
    const r = checkFigureArithmetic('1,224 patients were treated (612 received Drug X, 612 received placebo).');
    expect(r.armSumsChecked).toBe(1);
    expect(r.findings).toEqual([]);
  });

  it('raises no finding on a randomization ratio or a parenthetical that is not an arm list', () => {
    for (const text of [
      '612 randomized (2:1; 408 to X and 204 to placebo).',
      '612 subjects were enrolled (mean age 54 years).',
      '612 subjects were randomized (306 to Drug X).',
    ]) {
      expect(checkFigureArithmetic(text).findings, text).toEqual([]);
    }
  });

  // Each sentence is correct: the parenthetical names analysis sets, not arms,
  // and a total is never compared across populations.
  it.each([
    'A total of 612 subjects were randomized (610 in the FAS and 598 in the PP population).',
    'A total of 612 subjects were randomized (610 received at least one dose and 598 received all doses).',
    '612 subjects were randomized (612 in the ITT and 600 in the safety set).',
    'A total of 612 subjects were randomized (306 to drug and 300 in the per-protocol set).',
    '612 patients were enrolled (612 in the mITT population, 590 completed the study).',
  ])('does not sum a parenthetical that lists analysis populations: %s', text => {
    const r = checkFigureArithmetic(text);
    expect(r.findings).toEqual([]);
    expect(r.armSumsChecked).toBe(0);
  });

  // Each sentence is correct: the total and the arm list belong to different
  // populations, joined by a second clause. The list is compared, if at all,
  // only with the count immediately before it.
  it.each([
    ['Of the 612 subjects randomized, 610 received at least one dose (305 to Drug X and 305 to placebo).', 0],
    ['A total of 612 subjects were randomized, and 598 completed the study (300 in Drug X and 298 in placebo).', 0],
    ['612 subjects were randomized; 610 were treated (305 to Drug X and 305 to placebo).', 1],
    ['Of 612 patients randomized, 600 were treated (300 received Drug X and 300 received placebo).', 1],
    ['612 subjects were randomized and those completing the study were analysed (300 in Drug X and 298 in placebo).', 0],
  ] as const)('does not compare a total with a second population clause: %s', (text, checked) => {
    const r = checkFigureArithmetic(text);
    expect(r.findings).toEqual([]);
    expect(r.armSumsChecked).toBe(checked);
  });

  it('compares the arm list with the count immediately before it', () => {
    const r = checkFigureArithmetic('Of the 612 subjects randomized, 610 were treated (306 to Drug X and 305 to placebo).');
    expect(r.armSumsChecked).toBe(1);
    expect(r.findings).toMatchObject([{ kind: 'arm_sum', stated: 610, recomputed: 611 }]);
  });

  it('reads the "<arm>, n=<int>" form', () => {
    const bad = checkFigureArithmetic('A total of 612 subjects were randomized (Drug X, n=306; placebo, n=300).');
    expect(bad.armSumsChecked).toBe(1);
    expect(bad.findings).toMatchObject([{ kind: 'arm_sum', stated: 612, recomputed: 606 }]);
    const good = checkFigureArithmetic('A total of 612 subjects were randomized (Drug X: n=306; placebo: n=306).');
    expect(good.armSumsChecked).toBe(1);
    expect(good.findings).toEqual([]);
  });
});

describe('checkTerminologyConsistency — arithmetic', () => {
  it('fails a draft whose percentage does not match its own n/N', () => {
    const report = checkTerminologyConsistency(STALE);
    expect(report.ok).toBe(false);
    expect(report.arithmeticInconsistencies).toBe(1);
    expect(report.findings).toContainEqual({
      kind: 'arithmetic',
      label: 'percent_of',
      variants: ['4.6%', '4.92%'],
      evidence: ['4.6% (15/305)'],
      severity: 'high',
    });
  });

  it('stays ok on arithmetic that holds', () => {
    const report = checkTerminologyConsistency('Headache 8% (24/305).');
    expect(report.ok).toBe(true);
    expect(report.arithmeticInconsistencies).toBe(0);
    expect(report.percentPairsChecked).toBe(1);
  });
});
