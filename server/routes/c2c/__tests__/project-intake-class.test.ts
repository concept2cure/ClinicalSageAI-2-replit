/**
 * The product class of a filing document class (2026-10-18, review finding).
 *
 * A class covers drugs and biologics alike, so the person states it (P-21) —
 * except where the filing names it. Before the classes, an sBLA was created as
 * a 'bla' and fixed 'biologic'; as a 'pas' it was asked, and a biologics licence
 * supplement could be recorded as a drug.
 */
import { describe, it, expect } from 'vitest';
import { productTypeForIntake } from '../project-intake';
import { productTypeFixedByFiling, filingTypeInSentence } from '../../../../shared/regulatory/filing-document-classes';

describe('a filing document class records the product class the filing fixes', () => {
  it('an sBLA is a biologic without being asked, and cannot be recorded as a drug', () => {
    expect(productTypeFixedByFiling('us_bla_supp')).toBe('biologic');
    expect(productTypeForIntake('pas', '', 'us_bla_supp')).toEqual({ productType: 'biologic' });
    expect(productTypeForIntake('pas', 'biologic', 'us_bla_supp')).toEqual({ productType: 'biologic' });
    const refused = productTypeForIntake('pas', 'drug', 'us_bla_supp');
    expect(refused).toHaveProperty('refusal');
    expect((refused as { refusal: string }).refusal).toMatch(/for a biologic, not "drug"/);
  });

  it('an NDA/BLA Prior Approval Supplement fixes nothing: the person states it', () => {
    expect(productTypeFixedByFiling('us_nda_supp')).toBeNull();
    const asked = productTypeForIntake('pas', '', 'us_nda_supp') as { refusal: string };
    expect(asked.refusal).toBe(
      'State whether the product is a drug or a biologic: a Prior Approval Supplement filing covers both, and the class is recorded on the program.',
    );
    expect(productTypeForIntake('pas', 'drug', 'us_nda_supp')).toEqual({ productType: 'drug' });
  });

  it('a filing id only fixes a class for the class it belongs to', () => {
    // An application type keeps its own rule: a BLA is a biologic whatever id is sent.
    expect(productTypeForIntake('bla', '', 'us_bla_supp')).toEqual({ productType: 'biologic' });
    expect(productTypeForIntake('ind', '', 'us_bla_supp')).toHaveProperty('refusal');
  });

  it('the question names the filing in a sentence a person reads', () => {
    expect(filingTypeInSentence('ind_safety_report')).toBe('An IND safety report');
    expect(filingTypeInSentence('annual_report')).toBe('An NDA/BLA annual report');
    expect(filingTypeInSentence('briefing')).toBe('An FDA formal meeting package');
    expect(filingTypeInSentence('orphan')).toBe('An orphan drug designation request');
    expect(filingTypeInSentence('ib')).toBe("An investigator's brochure");
    expect(filingTypeInSentence('csr')).toBe('A clinical study report');
    expect(filingTypeInSentence('rems')).toBe('A REMS');
    expect(filingTypeInSentence('ind')).toBe('An IND');
    expect(filingTypeInSentence('cta')).toBe('A CTA');
    expect((productTypeForIntake('ind', '') as { refusal: string }).refusal).toMatch(/: an IND filing covers both/);
  });
});
