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
 */
import { describe, expect, it } from 'vitest';
import { compareLabelledFigures } from '../figure-consistency';

const one = (left: string, right: string) => compareLabelledFigures({ ref: 'M2.7.3', text: left }, [{ ref: 'CSR', text: right }]);

describe('compareLabelledFigures', () => {
  it.each([
    ['Primary endpoint p<0.001; key secondary endpoint p=0.03.', 'Primary endpoint p<0.001; key secondary endpoint p=0.03.'],
    ['PFS HR 0.62; OS HR 0.81.', 'PFS HR 0.62'],
    ['312 primary events were observed; 3 deaths occurred.', '312 events'],
  ])('gives no verdict on a figure a text states more than once: %s', (left, right) => {
    const r = one(left, right);
    expect(r.findings.filter((f) => f.status === 'conflict')).toEqual([]);
    expect(r.notCompared.some((n) => /more than one value/.test(n.reason))).toBe(true);
  });

  it('reads "p<0.001" as a bound: consistent with 0.0004, in conflict with 0.03, never a match', () => {
    expect(one('Primary endpoint p<0.001.', 'Primary endpoint p = 0.0004.').findings).toEqual([]);
    const c = one('Primary endpoint p<0.001.', 'Primary endpoint p = 0.03.').findings;
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ status: 'conflict', label: 'primary_p_value' });
    expect(c[0].detail).toBe('primary_p_value: M2.7.3 gives <0.001; CSR gives 0.03.');
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
    expect(r.notCompared[0]).toMatchObject({ rightRef: 'CSR', label: 'enrolled_n' });
  });

  it('names each figure of the claim a source does not state', () => {
    const r = one('The study randomized 186 subjects; the hazard ratio was 0.71.', 'The study randomized 186 subjects.');
    expect(r.findings).toEqual([expect.objectContaining({ status: 'match', label: 'enrolled_n' })]);
    expect(r.notCompared).toEqual([{ rightRef: 'CSR', label: 'hazard_ratio', reason: 'not stated in the source' }]);
  });

  it('names a source that states none of the claim\'s figures', () => {
    const r = one('The study randomized 186 subjects.', 'Hepatotoxicity has been reported.');
    expect(r.findings).toEqual([]);
    expect(r.notCompared).toEqual([{ rightRef: 'CSR', label: 'enrolled_n', reason: 'not stated in the source' }]);
  });

  it('records a plain disagreement as a conflict with each side\'s own value', () => {
    expect(one('The study randomized 186 subjects.', 'The study randomized 120 subjects.').findings).toEqual([
      expect.objectContaining({ status: 'conflict', detail: 'enrolled_n: M2.7.3 gives 186; CSR gives 120.' }),
    ]);
  });
});
