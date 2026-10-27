import { describe, expect, it } from 'vitest';
import { filingLifecycleReferenceFor, filingReferenceFactsFor, FILING_LOOP } from '../filing-lifecycle-reference';

const projectMatches = [
  ['US_IND', 'ind', 'FDA', 'clinical'], ['US_IDE', 'ide', 'FDA', 'clinical'],
  ['US_NDA', 'nda', 'FDA', 'marketing'], ['US_BLA', 'bla', 'FDA', 'marketing'],
  ['US_ANDA', 'anda', 'FDA', 'marketing'], ['US_505B2', 'nda', 'FDA', 'marketing'],
  ['US_351K', 'bla', 'FDA', 'marketing'], ['EU_MAA', 'maa', 'EMA', 'marketing'],
  ['EU_BIOSIMILAR_MAA', 'maa', 'EMA', 'marketing'],
  ['US_510K', '510k', 'FDA', 'device'], ['US_PMA', 'pma', 'FDA', 'device'],
  ['US_DE_NOVO', 'de_novo', 'FDA', 'device'], ['US_510K_IVD', '510k', 'FDA', 'device'],
  ['US_PMA_IVD', 'pma', 'FDA', 'device'], ['US_DE_NOVO_IVD', 'de_novo', 'FDA', 'device'],
  ['US_CDX_PMA', 'pma', 'FDA', 'device'], ['US_CDX_510K', '510k', 'FDA', 'device'],
  ['US_QSUB', 'device', 'FDA', 'presub'], ['US_IVD_QSUB', 'ivd', 'FDA', 'presub'],
  ['US_BTD', 'designation', 'FDA', 'designation'], ['US_FAST_TRACK', 'fast_track', 'FDA', 'designation'],
  ['US_ORPHAN', 'orphan', 'FDA', 'designation'],
  ['EU_MDR_CLASS_IIA', 'mdr', 'Notified_Body', 'euconformity'],
  ['EU_IVDR_CLASS_B', 'ivdr', 'EU / Notified Body', 'euconformity'],
  ['US_NDA_SUPP', 'pas', 'FDA', 'postmarket'], ['US_BLA_SUPP', 'pas', 'FDA', 'postmarket'],
  ['US_CBE', 'cbe', 'FDA', 'postmarket'], ['US_DMF', 'dmf', 'FDA', 'cmc'],
  ['EU_ASMF', 'dmf', 'EMA', 'cmc'], ['ICH_CSR', 'csr', 'ICH', 'clindoc'],
  ['ICH_PROTOCOL', 'protocol', 'ICH / Global', 'clindoc'],
] as const;

const withheld = [
  undefined, null, '', 'IND', 'ind', 'fda_510k', 'not_a_filing', '__proto__',
  'EU_CTA', 'CA_CTA', 'CA_ANDS', 'JP_SHONIN', 'CA_MDL', 'JP_TODOKEDE',
  'EU_MDR_CLASS_I', 'EU_IVDR_CLASS_A', 'EU_CER', 'US_PRIORITY_REVIEW', 'US_RFD',
];

describe('the existing authored lifecycle reference has one shared owner', () => {
  it('retains all nine complete authored guides in the shared owner', () => {
    expect(Object.keys(FILING_LOOP).sort()).toEqual(['clinical', 'clindoc', 'cmc', 'designation', 'device', 'euconformity', 'marketing', 'postmarket', 'presub'].sort());
    for (const guide of Object.values(FILING_LOOP)) {
      expect(guide.label.trim()).not.toBe('');
      expect(guide.clock.trim()).not.toBe('');
      expect(guide.stages.length).toBeGreaterThanOrEqual(5);
      expect(guide.ret.label.trim()).not.toBe('');
      expect(guide.ret.desc.trim()).not.toBe('');
    }
  });

  it('retains the old clinical and marketing prose without turning it into a computed deadline', () => {
    expect(FILING_LOOP.clinical.clock).toBe('IND: 30-day default review -- IDE: 30-day FDA decision');
    expect(FILING_LOOP.marketing.clock).toContain('PDUFA 10 mo standard / 6 mo priority');
    expect(FILING_LOOP.clinical.ret.label).toBe('Clinical Hold');
    const guide = filingLifecycleReferenceFor('US_IND');
    expect(guide).toMatchObject({ basis: 'authored_reference', state: 'matched', scope: 'filing_family' });
    expect(guide?.loop).toBe(FILING_LOOP.clinical);
    expect(guide).not.toHaveProperty('deadline');
    expect(guide).not.toHaveProperty('readiness');
  });
});

describe('lifecycle reference selection uses exact filing and recorded context', () => {
  it.each(projectMatches)('%s matches only its recorded %s / %s context', (id, programType, primaryAgency, archetype) => {
    const guide = filingLifecycleReferenceFor(id, { programType, primaryAgency });
    expect(guide).toMatchObject({ basis: 'authored_reference', state: 'matched', scope: 'filing_family', archetype,
      filing: { id: id.toLowerCase(), registryId: id } });
    expect(guide?.loop).toBe(FILING_LOOP[archetype]);
    expect(filingLifecycleReferenceFor(id.toLowerCase(), { programType: programType.toUpperCase(), primaryAgency: primaryAgency.toLowerCase() })).toEqual(guide);
  });

  it.each(withheld)('withholds unknown, generic or inapplicable identity %s', id => {
    expect(filingLifecycleReferenceFor(id)).toBeNull();
  });

  it.each([
    { programType: null, primaryAgency: 'FDA' }, { programType: 'ind', primaryAgency: null },
    { programType: undefined, primaryAgency: undefined }, { programType: 'nda', primaryAgency: 'FDA' },
    { programType: 'ind', primaryAgency: 'EMA' }, { programType: 'ind', primaryAgency: 'US' },
    { programType: 'device', primaryAgency: 'FDA' }, { programType: 1, primaryAgency: 'FDA' },
  ])('withholds US_IND for missing or contradictory recorded context %j', recorded => {
    expect(filingLifecycleReferenceFor('US_IND', recorded)).toBeNull();
  });

  it('keeps intake-only family references separate from an unmodeled project type', () => {
    for (const id of ['EU_SCIENTIFIC_ADVICE', 'EU_PRIME', 'EU_ORPHAN', 'EU_VARIATION_II']) {
      expect(filingLifecycleReferenceFor(id)).toMatchObject({ basis: 'authored_reference', scope: 'filing_family' });
      expect(filingLifecycleReferenceFor(id, { programType: 'ind', primaryAgency: 'EMA' })).toBeNull();
      expect(filingLifecycleReferenceFor(id, { programType: 'maa', primaryAgency: 'EMA' })).toBeNull();
    }
  });
});

// Metadata/search resolution must not widen the stricter lifecycle admission.
describe('catalogue metadata does not imply a lifecycle admission', () => {
  it('keeps Canada clinical-trial facts inspectable without attaching a US review clock', () => {
    const reference = filingReferenceFactsFor('CA_CTA');
    expect(reference?.entry).toMatchObject({ id: 'ca_cta', agency: 'Health Canada' });
    expect(reference).not.toHaveProperty('loop');
    expect(filingLifecycleReferenceFor('CA_CTA')).toBeNull();
    expect(filingLifecycleReferenceFor('CA_CTA', { programType: 'ind', primaryAgency: 'FDA' })).toBeNull();
  });
  it.each(['IND', 'ind', 'fda_510k', '__proto__', 'not_a_filing'])('does not use a broad legacy alias for metadata identity %s', id => {
    expect(filingReferenceFactsFor(id)).toBeNull();
  });
});
