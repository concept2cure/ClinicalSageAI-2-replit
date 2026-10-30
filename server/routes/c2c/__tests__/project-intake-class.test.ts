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
    // 2026-10-29: the sBLA is its own class, bla_pas (its 601.12(b) record), not pas.
    expect(productTypeFixedByFiling('us_bla_supp')).toBe('biologic');
    expect(productTypeForIntake('bla_pas', '', 'us_bla_supp')).toEqual({ productType: 'biologic' });
    expect(productTypeForIntake('bla_pas', 'biologic', 'us_bla_supp')).toEqual({ productType: 'biologic' });
    const refused = productTypeForIntake('bla_pas', 'drug', 'us_bla_supp');
    expect(refused).toHaveProperty('refusal');
    expect((refused as { refusal: string }).refusal).toMatch(/for a biologic, not "drug"/);
  });

  it('an NDA/BLA Prior Approval Supplement fixes nothing: the person states it', () => {
    expect(productTypeFixedByFiling('us_nda_supp')).toBeNull();
    const asked = productTypeForIntake('pas', '', 'us_nda_supp') as { refusal: string };
    expect(asked.refusal).toBe(
      'State whether the product is a drug or a biologic: a Prior Approval Supplement filing covers both, and the class is recorded on the project.',
    );
    expect(productTypeForIntake('pas', 'drug', 'us_nda_supp')).toEqual({ productType: 'drug' });
  });

  it('a filing that is its own class is created as that class, never as its parent application', () => {
    // 2026-10-29: 'bla' with an sBLA was accepted and scaffolded the initial BLA.
    // A subtype start must not silently become the initial IND/NDA/BLA.
    for (const [programType, filing] of [
      ['bla', 'us_bla_supp'], ['pas', 'us_bla_supp'], ['ind', 'us_bla_supp'],
      ['bla', 'us_bla_cbe30'], ['cbe', 'us_bla_cbe0'], ['nda', 'us_bla_annual'], ['annual_report', 'us_bla_annual'],
      ['ind', 'us_expanded_access_individual'], ['briefing', 'us_type_d_meeting'], ['ind', 'us_interact'],
      ['bla', 'us_bpdr'], ['pader', 'us_bla_pae_report'], ['dmf', 'us_cber_master_file'],
    ] as const) {
      const r = productTypeForIntake(programType, 'biologic', filing);
      expect(r, `${programType} / ${filing}`).toHaveProperty('refusal');
      expect((r as { refusal: string }).refusal).toMatch(/create it as that filing/);
    }
    expect(productTypeForIntake('bla_cbe30', '', 'us_bla_cbe30')).toEqual({ productType: 'biologic' });
    expect(productTypeForIntake('type_d_meeting', 'drug', 'us_type_d_meeting')).toEqual({ productType: 'drug' });
    expect(productTypeForIntake('expanded_access_individual', 'biologic', 'us_expanded_access_individual')).toEqual({ productType: 'biologic' });
    // An application keeps its own rule when no class filing is named.
    expect(productTypeForIntake('bla', '', 'us_bla')).toEqual({ productType: 'biologic' });
  });

  it('the question names the filing in a sentence a person reads', () => {
    expect(filingTypeInSentence('ind_safety_report')).toBe('An IND safety report');
    expect(filingTypeInSentence('annual_report')).toBe('An NDA/BLA annual report');
    expect(filingTypeInSentence('briefing')).toBe('An FDA formal meeting package');
    expect(filingTypeInSentence('orphan')).toBe('An orphan drug designation request');
    expect(filingTypeInSentence('ib')).toBe("An investigator's brochure");
    expect(filingTypeInSentence('csr')).toBe('A clinical study report');
    expect(filingTypeInSentence('rems')).toBe('A REMS');
    // One class per FD&C Act 506 designation (second review, 2026-10-18).
    expect(filingTypeInSentence('rmat')).toBe('An RMAT designation request');
    expect(filingTypeInSentence('fast_track')).toBe('A fast track designation request');
    expect(filingTypeInSentence('designation')).toBe('A breakthrough therapy designation request');
    expect(filingTypeInSentence('ind')).toBe('An IND');
    expect(filingTypeInSentence('cta')).toBe('A CTA');
    expect((productTypeForIntake('ind', '') as { refusal: string }).refusal).toMatch(/: an IND filing covers both/);
  });
});


describe('regional device intake preserves exact application and product family', () => {
  const classes = [
    ['hde', 'device', 'US_HDE'], ['mdl', 'device', 'CA_MDL'], ['ivd_licence', 'ivd', 'CA_IVD_LICENCE'],
    ['shonin', 'device', 'JP_SHONIN'], ['ninsho', 'device', 'JP_NINTEI'], ['todokede', 'device', 'JP_TODOKEDE'],
    ['ivd_approval', 'ivd', 'JP_IVD_APPROVAL'], ['jp_cdx', 'cdx', 'JP_CDX'],
  ] as const;
  it.each(classes)('%s fixes its default family without a redundant selection', (type, product, filing) => {
    expect(productTypeForIntake(type, '')).toEqual({ productType: product });
    expect(productTypeForIntake(type, product, filing)).toEqual({ productType: product });
    expect(productTypeForIntake(type, 'drug', filing)).toHaveProperty('refusal');
    expect(productTypeForIntake(type, product, 'unknown_filing')).toHaveProperty('refusal');
    expect(productTypeForIntake(type, product, 'US_NDA')).toHaveProperty('refusal');
  });
  it.each([
    ['mdl', 'ivd', 'CA_MDL'], ['shonin', 'cdx', 'JP_SHONIN'], ['ninsho', 'ivd', 'JP_NINTEI'],
    ['todokede', 'cdx', 'JP_TODOKEDE'], ['ivd_licence', 'device', 'CA_IVD_LICENCE'],
    ['ivd_approval', 'samd', 'JP_IVD_APPROVAL'], ['jp_cdx', 'ivd', 'JP_CDX'],
  ])('%s refuses a contradictory %s product', (type, product, filing) => {
    expect(productTypeForIntake(type, product, filing)).toHaveProperty('refusal');
  });
  it.each([
    ['mdl', 'samd', 'CA_MDL'], ['ivd_licence', 'cdx', 'CA_IVD_LICENCE'],
    ['ivd_approval', 'cdx', 'JP_IVD_APPROVAL'], ['hde', 'ivd', 'US_HDE'],
  ])('%s permits its compatible %s product', (type, product, filing) => {
    expect(productTypeForIntake(type, product, filing)).toEqual({ productType: product });
  });
});

describe('named device filings retain their product identity', () => {
  it.each([
    ['pma', 'US_CDX_PMA', 'cdx'], ['pma', 'cdx_pma', 'cdx'],
    ['510k', 'us_cdx_510k', 'cdx'], ['ivdr', 'cdx_ivdr_d', 'cdx'],
    ['device', 'us_samd_presub', 'samd'],
  ])('%s / %s defaults to %s and refuses another subtype', (type, filing, product) => {
    expect(productTypeForIntake(type, '', filing)).toEqual({ productType: product });
    expect(productTypeForIntake(type, product, filing)).toEqual({ productType: product });
    expect(productTypeForIntake(type, product === 'cdx' ? 'ivd' : 'device', filing)).toHaveProperty('refusal');
  });
  it.each([
    ['510k', 'cdx', 'US_CDX_PMA'], ['pma', 'cdx', 'US_CDX_510K'],
    ['ind', 'drug', 'US_CDX_PMA'], ['510k', 'device', 'US_NDA'],
    ['ivdr', 'samd', 'EU_IVDR'], ['mdr', 'cdx', 'EU_MDR_TECHDOC'],
    ['pma', 'samd', 'US_PMA_IVD'],
    ['ivd', 'cdx', 'US_COMPLEMENTARY_DX'],
  ])('refuses incompatible %s / %s / %s', (type, product, filing) => {
    expect(productTypeForIntake(type, product, filing)).toHaveProperty('refusal');
  });
  it('retains compatible refinements and generic-family controls', () => {
    expect(productTypeForIntake('510k', 'samd', 'US_510K')).toEqual({ productType: 'samd' });
    expect(productTypeForIntake('pma', 'cdx', 'US_PMA_IVD')).toEqual({ productType: 'cdx' });
    expect(productTypeForIntake('510k', 'ivd', 'US_510K')).toEqual({ productType: 'ivd' });
    expect(productTypeForIntake('ivd', '', 'US_COMPLEMENTARY_DX')).toEqual({ productType: 'ivd' });
  });
});
