/**
 * A ChEMBL record with no development phase is not labelled preclinical.
 *
 * What the code used to do: `maxPhaseLabel(null)` and `maxPhaseLabel(undefined)`
 * returned 'Preclinical / not in clinical development', so a molecule whose
 * ChEMBL record carries no `max_phase` (or whose record arrived without the
 * field) reached AnA's search_chembl_compound and screen_compound_liabilities
 * output with a development stage nobody recorded. "Not in clinical
 * development" is a claim about the compound; an empty field is not evidence
 * of it. The label now says what the record holds: no phase.
 */
import { describe, it, expect } from 'vitest';
import { maxPhaseLabel, normalizeMolecule } from '../chembl-client';

describe('ChEMBL development phase that is not recorded', () => {
  it.each([null, undefined])('maxPhaseLabel(%s) says the phase is not recorded, not preclinical', (phase) => {
    const label = maxPhaseLabel(phase);
    expect(label, 'an absent max_phase was labelled as a development stage').not.toMatch(/preclinical|not in clinical development/i);
    expect(label).toMatch(/not recorded/i);
  });

  it('a record without max_phase keeps maxPhase null and does not read as preclinical', () => {
    const m = normalizeMolecule({ molecule_chembl_id: 'CHEMBL999' });
    expect(m.maxPhase).toBeNull();
    expect(m.maxPhaseLabel, 'an absent max_phase was labelled as a development stage').not.toMatch(/preclinical/i);
  });

  it('recorded phases keep their labels', () => {
    expect(maxPhaseLabel(4)).toMatch(/Approved/);
    expect(maxPhaseLabel(1)).toBe('Phase 1');
    expect(maxPhaseLabel(0)).toMatch(/Preclinical/);
  });
});
