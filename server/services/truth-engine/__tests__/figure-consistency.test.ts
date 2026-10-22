/**
 * compareLabelledFigures gives a verdict only where the two texts each state
 * one value for a figure, read as it is written.
 *
 * Its first version (e2c37f32) marked a figure "conflict" whenever the
 * reconciliation engine saw more than one value across BOTH texts, so a Module
 * 2.7.3 stating two p-values conflicted with an identical copy of itself; it
 * dropped the "<" of "p<0.001", compared "HR 0.71" with "HR 0.712" at three
 * decimals, matched one arm's size against a total, and never said which of
 * the claim's figures a source did not state. Each case below was run against
 * that version by an adversarial review.
 *
 * 2026-10-19: the figures now come from the platform's one labelled-figure lexicon
 * (intelligence/cross-artifact-consistency), not from the second copy of it in
 * ana/dossierReconciliation, which is deleted. Two label names changed with the fold, and
 * the labels are what this module reports: `enrolled_n` and `sample_size_n` are both
 * `sample_size`, and `primary_p_value` is `p_value`. One name per quantity is the point.
 * The verdict rules below are unchanged and every case above still holds.
 */
import { describe, expect, it } from 'vitest';
import { compareLabelledFigures } from '../figure-consistency';

const one = (left: string, right: string) => compareLabelledFigures({ ref: 'M2.7.3', text: left }, [{ ref: 'CSR', text: right }]);

describe('compareLabelledFigures', () => {
  it.each([
    ['Primary endpoint p<0.001; key secondary endpoint p=0.03.', 'Primary endpoint p<0.001; key secondary endpoint p=0.03.'],
    ['PFS HR 0.62; OS HR 0.81.', 'The PFS hazard ratio was 0.62 in the pooled population.'],
    ['312 primary events were observed; 3 deaths occurred.', 'A total of 312 primary events were observed.'],
  ])('gives no verdict on a figure a text states more than once: %s', (left, right) => {
    const r = one(left, right);
    expect(r.findings.filter((f) => f.status === 'conflict')).toEqual([]);
    expect(r.notCompared.some((n) => /more than one value/.test(n.reason))).toBe(true);
  });

  it('reads "p<0.001" as a bound: consistent with 0.0004, in conflict with 0.03, never a match', () => {
    expect(one('Primary endpoint p<0.001.', 'Primary endpoint p = 0.0004.').findings).toEqual([]);
    const c = one('Primary endpoint p<0.001.', 'Primary endpoint p = 0.03.').findings;
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ status: 'conflict', label: 'p_value' });
    expect(c[0].detail).toBe('p_value: M2.7.3 gives <0.001; CSR gives 0.03.');
  });

  it('compares at the coarser precision of the two', () => {
    expect(one('The hazard ratio was 0.71.', 'The hazard ratio was 0.712.').findings).toEqual([
      expect.objectContaining({ status: 'match', detail: 'hazard_ratio: M2.7.3 gives 0.71; CSR gives 0.712.' }),
    ]);
    expect(one('The hazard ratio was 0.7104.', 'The hazard ratio was 0.7096.').findings[0].status).toBe('conflict');
  });

  it('gives no verdict on an alpha that may differ only by sidedness', () => {
    const r = one('An alpha of 0.025 was used.', 'An alpha of 0.05 was used.');
    expect(r.findings).toEqual([]);
    expect(r.notCompared[0].reason).toMatch(/sided/);
  });

  it('does not compare one arm\'s size with a total', () => {
    const r = one('The study randomized 120 patients to drug and 118 to placebo.', 'The study randomized 120 patients.');
    expect(r.findings).toEqual([]);
    expect(r.notCompared[0]).toMatchObject({ rightRef: 'CSR', label: 'sample_size' });
  });

  it('names each figure of the claim a source does not state', () => {
    const r = one('The study randomized 186 subjects; the hazard ratio was 0.71.', 'The study randomized 186 subjects.');
    expect(r.findings).toEqual([expect.objectContaining({ status: 'match', label: 'sample_size' })]);
    expect(r.notCompared).toEqual([{ rightRef: 'CSR', label: 'hazard_ratio', reason: 'not stated in the source' }]);
  });

  it('names a source that states none of the claim\'s figures', () => {
    const r = one('The study randomized 186 subjects.', 'Hepatotoxicity has been reported.');
    expect(r.findings).toEqual([]);
    expect(r.notCompared).toEqual([{ rightRef: 'CSR', label: 'sample_size', reason: 'not stated in the source' }]);
  });

  it('records a plain disagreement as a conflict with each side\'s own value', () => {
    expect(one('The study randomized 186 subjects.', 'The study randomized 120 subjects.').findings).toEqual([
      expect.objectContaining({ status: 'conflict', detail: 'sample_size: M2.7.3 gives 186; CSR gives 120.' }),
    ]);
  });

  it('a source too short for the extractor to read is "not stated", never a match', () => {
    /* extractNumericalFacts reads nothing from fewer than 20 characters — the canonical
       extractor's own minimum, which this module inherited with the fold. The honest
       report for such a source is that the figure is not stated in it; what must never
       happen is a verdict, in either direction, from a text nothing was read from. */
    const r = one('The study randomized 186 subjects in total.', 'HR 0.62');
    expect(r.findings).toEqual([]);
    expect(r.notCompared).toEqual([
      { rightRef: 'CSR', label: 'sample_size', reason: 'not stated in the source' },
    ]);
  });
});
