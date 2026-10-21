/**
 * HARMONIZE's numeric cross-check, on the one labelled-figure lexicon.
 *
 * `checkNumerics` held a third inline copy of the platform's figure lexicon and had no test
 * of any kind. It was migrated onto `extractNumericalFacts` on 2026-10-19; these are the
 * three defects the migration fixed, each written so it fails against the old method.
 */
import { describe, it, expect } from 'vitest';

import { HarmonizeEngine, type HarmonizeIssue } from '../harmonize-engine';

const numerics = async (sections: Record<string, string>): Promise<HarmonizeIssue[]> => {
  const out = await new HarmonizeEngine().check({ sections, submissionType: 'NDA' });
  return out.issues.filter((i) => i.type === 'numeric');
};

describe('a figure is compared as a number, not as the string it was written as', () => {
  it('"0.70" and "0.7" are one hazard ratio, not a discrepancy', async () => {
    // The old method compared raw strings, so these conflicted.
    const issues = await numerics({
      '2.5': 'The primary analysis gave a hazard ratio of 0.70 in the pooled population.',
      '5.3.5': 'The primary analysis gave a hazard ratio of 0.7 in the pooled population.',
    });
    expect(issues.map((i) => i.description)).toEqual([]);
  });

  it('a real disagreement is still reported, with both values and both sections', async () => {
    const issues = await numerics({
      '2.5': 'A total of enrolled 240 patients contributed to the primary analysis.',
      '5.3.5': 'A total of enrolled 238 patients contributed to the primary analysis.',
    });
    const n = issues.find((i) => /sample size/.test(i.description));
    expect(n, issues.map((i) => i.description).join(' | ')).toBeTruthy();
    expect(n!.severity).toBe('critical');
    expect([n!.sectionA, n!.sectionB].sort()).toEqual(['2.5', '5.3.5']);
    expect(`${n!.valueA} ${n!.valueB}`).toMatch(/240/);
    expect(`${n!.valueA} ${n!.valueB}`).toMatch(/238/);
  });
});

describe('a label stated more than once is compared as a set', () => {
  it('two sections listing the same two counts in opposite order agree', async () => {
    /* The old method paired every value of a label in A against every value in B, so this
       produced a cartesian product of false critical blockers — the same defect
       cross-artifact-consistency had already fixed for itself ("Drug X n=305; placebo
       n=303" against a CSR that lists placebo first). */
    const issues = await numerics({
      '2.7.3': 'The trial randomized 305 patients to drug and randomized 303 patients to placebo.',
      '5.3.5': 'The trial randomized 303 patients to placebo and randomized 305 patients to drug.',
    });
    expect(issues.map((i) => i.description)).toEqual([]);
  });

  it('…and one section holding a count the other does not is reported once, not per pair', async () => {
    const issues = await numerics({
      '2.7.3': 'The trial randomized 305 patients to drug and randomized 303 patients to placebo.',
      '5.3.5': 'The trial randomized 305 patients to drug and randomized 290 patients to placebo.',
    });
    expect(issues.filter((i) => /sample size/.test(i.description))).toHaveLength(1);
  });
});

describe("a confidence interval's bounds are compared, not its level", () => {
  it('two different intervals at the same level disagree', async () => {
    /* The old pattern captured the LEVEL — the 95 in "95% CI 0.10 to 0.30" — so two
       sections stating different intervals at 95% never conflicted. */
    const issues = await numerics({
      '2.5': 'The treatment difference was 0.20 (95% CI 0.10 to 0.30) at week 24.',
      '5.3.5': 'The treatment difference was 0.20 (95% CI 0.05 to 0.35) at week 24.',
    });
    expect(issues.some((i) => /confidence interval/.test(i.description))).toBe(true);
  });

  it('the same interval reported at 95% and at 99% is not a disagreement about the interval', async () => {
    // The old pattern compared 95 against 99 and called the interval inconsistent.
    const issues = await numerics({
      '2.5': 'The treatment difference was 0.20 (95% CI 0.10 to 0.30) at week 24.',
      '5.3.5': 'The treatment difference was 0.20 (99% CI 0.10 to 0.30) at week 24.',
    });
    expect(issues.some((i) => /confidence interval/.test(i.description))).toBe(false);
  });
});

describe('nothing is invented when nothing is shared', () => {
  it('a figure in one section only is not a discrepancy', async () => {
    const issues = await numerics({
      '2.5': 'A two-sided alpha = 0.05 was assumed throughout the study design.',
      '5.3.5': 'This section states no labelled figure of any kind whatsoever.',
    });
    expect(issues).toEqual([]);
  });

  it('a predicate K-number is not a figure, and is never read as one', async () => {
    const issues = await numerics({
      'se-1': 'The subject device is substantially equivalent to predicate K123456.',
      'se-2': 'The subject device is substantially equivalent to predicate K987654.',
    });
    // Not numeric, so not reconciled here — and never coerced to 0, which would agree.
    expect(issues).toEqual([]);
  });
});
