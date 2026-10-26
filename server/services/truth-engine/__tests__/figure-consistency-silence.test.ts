/**
 * Silence is reported as silence, never as agreement.
 *
 * ## The defect
 *
 * `compareLabelledFigures` loops over the claim's recognised figures. When the
 * claim yields NONE, the loop never runs and it returns
 * `{ findings: [], notCompared: [] }` — which every caller reads as "compared,
 * nothing to flag". Nothing was compared.
 *
 * `notCompared` exists for exactly that distinction. The route that serves this
 * says so in its own words — *"an empty array is 'nothing compared' as often as
 * 'no conflict'"* — and sets `X-Consistency-Not-Compared` from it. The one case
 * where the distinction matters most defeated it.
 *
 * Measured against the running app on 2026-10-26, through the real route:
 *
 *     POST /api/submissions/1/consistency
 *     left  §2.7.3 Table 4   "A total of 248 subjects were randomised."
 *     right CSR-0042 §10.1   "In total 251 subjects were randomised to treatment."
 *     -> 200 []   X-Consistency-Not-Compared: 0
 *
 * Two numbers that plainly disagree, and the answer read as a clean check. The
 * extractor wants `N = 248` or `randomised: 248`; widening what it recognises
 * is its own change, and is NOT what this fixes. What it fixes is reporting
 * silence as agreement.
 */
import { describe, it, expect } from 'vitest';
import { compareLabelledFigures } from '../figure-consistency';

const PROSE = { ref: '§2.7.3 Table 4', text: 'A total of 248 subjects were randomised in the pivotal study.' };
const SOURCE = { ref: 'CSR-0042 §10.1', text: 'In total 251 subjects were randomised to treatment in this study.' };
const LABELLED = { ref: '§2.7.3 Table 4', text: 'Primary endpoint p = 0.001 in the pivotal study population.' };
const LABELLED_SOURCE = { ref: 'CSR-0042 §10.1', text: 'Primary endpoint p = 0.03 in the treated population of this report.' };

describe('a claim with no recognised figure is not a clean check', () => {
  it('reports that nothing was compared, instead of an empty all-clear', () => {
    const out = compareLabelledFigures(PROSE, [SOURCE]);
    expect(out.findings).toEqual([]);
    expect(out.notCompared).toHaveLength(1);
    expect(out.notCompared[0].rightRef).toBe('CSR-0042 §10.1');
    expect(out.notCompared[0].reason).toMatch(/no figure this engine recognises/i);
  });

  it('says it against every source the claim was to be checked against', () => {
    /* A reader needs to know which comparisons did not happen, not merely
       that some did not. */
    const out = compareLabelledFigures(PROSE, [SOURCE, { ref: 'CSR-0043 §10.1', text: 'A further 99 subjects were randomised.' }]);
    expect(out.notCompared.map((n) => n.rightRef)).toEqual(['CSR-0042 §10.1', 'CSR-0043 §10.1']);
  });

  it('names the absence rather than inventing a label for it', () => {
    const out = compareLabelledFigures(PROSE, [SOURCE]);
    expect(out.notCompared[0].label).toBe('(no figure recognised)');
  });

  it('still reports nothing compared when there is no source at all', () => {
    const out = compareLabelledFigures(PROSE, []);
    expect(out.findings).toEqual([]);
    expect(out.notCompared).toEqual([]);
  });
});

describe('a claim the engine does recognise is still compared as before', () => {
  it('finds the conflict between two figures that disagree', () => {
    const out = compareLabelledFigures(LABELLED, [LABELLED_SOURCE]);
    expect(out.findings).toHaveLength(1);
    expect(out.findings[0].status).toBe('conflict');
    expect(out.findings[0].leftRef).toBe('§2.7.3 Table 4');
    expect(out.findings[0].rightRef).toBe('CSR-0042 §10.1');
    expect(out.findings[0].detail).toMatch(/0\.001/);
    expect(out.findings[0].detail).toMatch(/0\.03/);
  });

  it('agrees when they agree', () => {
    const same = { ref: 'CSR-0042 §10.1', text: 'Primary endpoint p = 0.001 in the treated population of this report.' };
    const out = compareLabelledFigures(LABELLED, [same]);
    expect(out.findings).toHaveLength(1);
    expect(out.findings[0].status).toBe('match');
  });

  it('still reports a figure the SOURCE does not state as not compared', () => {
    /* The pre-existing behaviour, which this change must not disturb: the
       claim has a figure, the source has none of that label. */
    const out = compareLabelledFigures(LABELLED, [{ ref: 'CSR-0099', text: 'This report states no comparable figure of any kind in this passage.' }]);
    expect(out.findings).toEqual([]);
    expect(out.notCompared).toHaveLength(1);
    expect(out.notCompared[0].reason).toMatch(/not stated in the source/);
  });
});
