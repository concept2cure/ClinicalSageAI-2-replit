/**
 * Follow-ups on the within-document arithmetic check (dacbc67b), so it does not
 * cry wolf on versions, European decimals or a list that belongs to another
 * population, and so the writer is told what is actually wrong.
 *
 * Each probe below produced a false finding, or the terminology message, at HEAD.
 */
import { describe, expect, it } from 'vitest';

import { checkFigureArithmetic } from '../dossierReconciliation';
import { critiqueDraft } from '../writing-precision-gate';

describe('checkFigureArithmetic — a version or amendment slash is not n/N', () => {
  it.each([
    'Subjects enrolled under protocol amendment 3/4 (10%) were re-consented.',
    'Sites still on protocol version 2/3 (25%) were retrained.',
    'Sites on v2/3 (25%) were retrained.',
    'Deviations under Amendment No. 3/4 (10%) were reviewed.',
  ])('%s', text => {
    const r = checkFigureArithmetic(text);
    expect(r.findings).toEqual([]);
    expect(r.percentPairsChecked).toBe(0);
  });

  it('still recomputes the same figures when no version word precedes them', () => {
    const r = checkFigureArithmetic('Rash was reported in 3/4 (10%) of subjects.');
    expect(r.percentPairsChecked).toBe(1);
    expect(r.findings).toMatchObject([{ kind: 'percent_of', stated: 10, recomputed: 75 }]);
  });

  it('still checks a pair after "v" meaning versus, and after "release" naming a formulation', () => {
    const versus = checkFigureArithmetic('Responders: Drug X 10/20 (50%) v 3/4 (75%).');
    expect(versus.percentPairsChecked).toBe(2);
    expect(versus.findings).toEqual([]);
    const formulation = checkFigureArithmetic(
      'Nausea with the extended release 10/20 (40%) formulation.'
    );
    expect(formulation.percentPairsChecked).toBe(1);
    expect(formulation.findings).toMatchObject([
      { kind: 'percent_of', stated: 40, recomputed: 50 },
    ]);
  });
});

describe('checkFigureArithmetic — a decimal comma is a decimal point', () => {
  it('reads "4,9 %" as 4.9%, which 15/305 (4.92%) supports', () => {
    const r = checkFigureArithmetic('Schwerwiegende UE: 4,9 % (15/305).');
    expect(r.percentPairsChecked).toBe(1);
    expect(r.findings).toEqual([]);
  });

  it('reads "4,6 %" as 4.6%, not 6%, when it is wrong', () => {
    const r = checkFigureArithmetic('Schwerwiegende UE: 4,6 % (15/305).');
    expect(r.percentPairsChecked).toBe(1);
    expect(r.findings).toMatchObject([{ kind: 'percent_of', stated: 4.6, recomputed: 4.92 }]);
  });

  it('reads the n/N (x,y %) order', () => {
    expect(checkFigureArithmetic('Kopfschmerz 15/305 (4,9 %).')).toMatchObject({
      percentPairsChecked: 1,
      findings: [],
    });
    expect(checkFigureArithmetic('Kopfschmerz 15/305 (6,6 %).').findings).toMatchObject([
      { kind: 'percent_of', stated: 6.6, recomputed: 4.92 },
    ]);
  });

  it('keeps an English list separated by commas intact', () => {
    const r = checkFigureArithmetic('Headache 8% (24/305), nausea 6% (18/305).');
    expect(r.percentPairsChecked).toBe(2);
    expect(r.findings).toEqual([]);
  });
});

describe('checkFigureArithmetic — an arm list is summed only when it names the total', () => {
  it.each([
    '612 subjects were randomized but only those who took study drug are shown (300 to Drug X and 298 to placebo).',
    'A total of 612 subjects were randomized of whom those with a baseline scan are summarised (300 in Drug X and 298 in placebo).',
    '612 patients were enrolled and the subset with genotype data is tabulated below (300 to Drug X and 298 to placebo).',
    // "to each arm" / "in each group" makes the count per arm, not the total.
    '150 subjects were randomized to each arm (Drug X (n=150) and placebo (n=150)).',
    '150 subjects were randomized in each group (150 to Drug X and 150 to placebo).',
  ])('does not sum a list after a bridge to another population: %s', text => {
    const r = checkFigureArithmetic(text);
    expect(r.findings).toEqual([]);
    expect(r.armSumsChecked).toBe(0);
  });

  it.each([
    ['A total of 612 subjects were randomized (306 to Drug X and 305 to placebo).', 612],
    ['612 subjects were randomized in the study (306 to Drug X and 305 to placebo).', 612],
    [
      '612 subjects were randomized equally to the two treatment groups (306 to Drug X and 305 to placebo).',
      612,
    ],
    [
      '612 subjects were randomized and included in the full analysis set (306 to Drug X and 305 to placebo).',
      612,
    ],
    ['The study randomized a total of 612 subjects (Drug X (n=306) and placebo (n=305)).', 612],
  ] as const)('still sums a list whose bridge keeps the same population: %s', (text, stated) => {
    const r = checkFigureArithmetic(text);
    expect(r.armSumsChecked).toBe(1);
    expect(r.findings).toMatchObject([{ kind: 'arm_sum', stated, recomputed: 611 }]);
  });
});

describe('critiqueDraft — an arithmetic finding says what is wrong', () => {
  it('states the percentage and what its own n/N gives', () => {
    const report = critiqueDraft({
      text: 'Serious adverse events were reported in 4.6% (15/305) of Drug X subjects.',
    });
    const f = report.findings.find(x => x.category === 'consistency');
    expect(f).toBeTruthy();
    expect(f!.severity).toBe('high');
    expect(f!.message).not.toMatch(/Use one term consistently/);
    expect(f!.message).toContain('4.6%');
    expect(f!.message).toContain('4.92%');
    expect(f!.message).toMatch(/n\/N/);
    expect(f!.evidence).toEqual(['4.6% (15/305)']);
  });

  it('states the arm sum against the stated total', () => {
    const report = critiqueDraft({
      text: 'A total of 612 subjects were randomized (306 to Drug X and 305 to placebo).',
    });
    const f = report.findings.find(x => x.category === 'consistency');
    expect(f).toBeTruthy();
    expect(f!.message).not.toMatch(/Use one term consistently/);
    expect(f!.message).toMatch(/sum to 611/);
    expect(f!.message).toMatch(/total of 612/);
  });
});
