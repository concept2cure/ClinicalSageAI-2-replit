/**
 * ChEMBL's non-integer and sentinel max_phase values are labelled by what
 * ChEMBL says they mean, not printed as phase numbers.
 *
 * What maxPhaseLabel used to do (until 2026-10-15): anything outside 0–4 fell to
 * `Phase ${phase}`, so ChEMBL's -1 ("unknown" clinical phase) read "Phase -1"
 * and 0.5 (ChEMBL's code for Early Phase 1) read "Phase 0.5".
 */
import { describe, expect, it } from 'vitest';
import { maxPhaseLabel } from '../chembl-client';

describe('maxPhaseLabel', () => {
  it('labels 0.5 as Early Phase 1', () => {
    expect(maxPhaseLabel(0.5)).toBe('Early Phase 1');
  });
  it('labels -1 as an unknown phase', () => {
    expect(maxPhaseLabel(-1)).toBe('Clinical phase unknown (ChEMBL -1)');
  });
  it('does not print a value it does not recognise as a phase', () => {
    expect(maxPhaseLabel(7)).not.toMatch(/^Phase /);
  });
});
