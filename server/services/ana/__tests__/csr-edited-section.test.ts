/** 2026-10-30 (edited-section re-check): what an edited CSR section's current
 * text does with each claimed cell. Pure. */
import { describe, expect, it } from 'vitest';
import { editedClaimOutcome } from '../csr-edited-section';

const CELL = { value: '16/305 (5.2%)' };
const PLACEBO = '10/300 (3.3%)';

describe('editedClaimOutcome', () => {
  it('is stated when the cell is verbatim, or every number of it survives a reformat', () => {
    expect(editedClaimOutcome('Cure: 16/305 (5.2%) subjects.', CELL, [CELL.value])).toEqual({ state: 'stated' });
    expect(editedClaimOutcome('Cure in 16 of 305 subjects (5.2%).', CELL, [CELL.value])).toEqual({ state: 'stated' });
  });

  it('names the changed figure in the cell\'s shape, or an n/N with its denominator', () => {
    expect(editedClaimOutcome('Cure: 18/305 (5.9%) subjects.', CELL, [CELL.value])).toEqual({ state: 'changed', stated: '18/305 (5.9%)' });
    expect(editedClaimOutcome('Cure in 18 of 305 subjects.', CELL, [CELL.value])).toEqual({ state: 'changed', stated: '18 of 305' });
  });

  it('does not take another claimed cell for a changed figure', () => {
    expect(editedClaimOutcome(`Placebo: ${PLACEBO}.`, CELL, [CELL.value, PLACEBO])).toEqual({ state: 'removed' });
  });

  // Review (2026-10-30): a numerator another claimed cell happens to carry is
  // not that cell's figure. 18 of 305 is no claimed n/N, so it is FIGURE_CHANGED.
  it('names an n/N whose numerator coincides with another claimed cell\'s number', () => {
    const other = '18/300 (6.0%)';
    expect(editedClaimOutcome(`Cure in 18 of 305 subjects (5.2%). Placebo: ${other}.`, CELL, [CELL.value, other]))
      .toEqual({ state: 'changed', stated: '18 of 305' });
    expect(editedClaimOutcome(`Cure in 18 of 305 subjects. Placebo: ${other}.`, CELL, [CELL.value, other]))
      .toEqual({ state: 'changed', stated: '18 of 305' });
  });

  it('gives a one-number cell no shape: a different number is left to the unclaimed check', () => {
    expect(editedClaimOutcome('Randomized: 306.', { value: '305' }, ['305'])).toEqual({ state: 'removed' });
    expect(editedClaimOutcome('Randomized: 305.', { value: '305' }, ['305'])).toEqual({ state: 'stated' });
  });
});
