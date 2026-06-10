/**
 * eCTD sequence validation against the IND section map. Pure (no DB).
 */

import { describe, it, expect } from 'vitest';
import { validateSequenceLeaves } from '../ind-sequence-validation';
import { getRequiredSections } from '../../../../services/regulatory/ind-ectd-sections';

// All initial-required section codes, as leaves (exact match).
function allRequiredLeaves(filing: 'initial' | 'amendment') {
  return getRequiredSections()
    .filter((s) => (filing === 'amendment' ? s.requiredForAmendment : s.required))
    .map((s) => ({ sectionCode: s.code }));
}

describe('validateSequenceLeaves', () => {
  it('an empty sequence is invalid: every required section is missing', () => {
    const r = validateSequenceLeaves({ filingType: 'initial', leaves: [] });
    expect(r.valid).toBe(false);
    expect(r.presentCount).toBe(0);
    expect(r.missing.length).toBe(r.requiredCount);
  });

  it('a sequence with all required-section leaves is valid', () => {
    const r = validateSequenceLeaves({ filingType: 'initial', leaves: allRequiredLeaves('initial') });
    expect(r.valid).toBe(true);
    expect(r.missing).toHaveLength(0);
    expect(r.presentCount).toBe(r.requiredCount);
  });

  it("normalizes the leading 'm' so 'm2.5' and '2.5' match", () => {
    const required = getRequiredSections().filter((s) => s.required);
    // Provide each required leaf but flip the leading 'm' on/off.
    const leaves = required.map((s) => ({
      sectionCode: s.code.startsWith('m') ? s.code.slice(1) : `m${s.code}`,
    }));
    const r = validateSequenceLeaves({ filingType: 'initial', leaves });
    expect(r.valid).toBe(true);
  });

  it('a descendant leaf satisfies a required parent section', () => {
    const required = getRequiredSections().filter((s) => s.required);
    const leaves = required.map((s) => ({ sectionCode: `${s.code}.99` })); // deeper leaf
    const r = validateSequenceLeaves({ filingType: 'initial', leaves });
    expect(r.valid).toBe(true);
  });

  it('flags leaves that map to no known CTD section', () => {
    const r = validateSequenceLeaves({
      filingType: 'initial',
      leaves: [{ sectionCode: 'm99.42.7' }],
    });
    expect(r.unknownSections).toContain('m99.42.7');
  });

  it('amendment filing uses the amendment-required set', () => {
    const r = validateSequenceLeaves({ filingType: 'amendment', leaves: allRequiredLeaves('amendment') });
    expect(r.valid).toBe(true);
  });
});
