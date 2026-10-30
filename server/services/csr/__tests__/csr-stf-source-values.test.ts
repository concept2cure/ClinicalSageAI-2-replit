/**
 * Independent oracle read from ICH STF v2.6.1, §III.B, printed pp8–9,
 * https://www.fda.gov/media/159383/download (read 2026-10-30).
 * PDF SHA256: 63132c3751682193f6f13db125ee03583b740680851c0f0e6412561438b482da.
 * These identifiers are source facts, not values copied from the plan's maps.
 * This proves CSR role carryover only, not XML/DTD or agency acceptance.
 */
import { describe, expect, it } from 'vitest';
import { basisProblems, type RegulatoryBasis } from '../../../../shared/regulatory/regulatory-basis';
import * as basisOwner from '../../ind/ctd/regulatory-basis';
import { generateStfFiles } from '../../ectd/stf-generator';
import * as plan from '../csr-assembly-plan';

const APPENDIX_SOURCE_ROLES = [
  ['16.1.1', 'protocol-or-amendment'],
  ['16.1.2', 'sample-case-report-form'],
  ['16.1.3', 'iec-irb-consent-form-list'],
  ['16.1.4', 'list-description-investigator-site'],
  ['16.1.5', 'signatures-investigators'],
  ['16.1.6', 'list-patients-with-batches'],
  ['16.1.7', 'randomisation-scheme'],
  ['16.1.8', 'audit-certificates-report'],
  ['16.1.9', 'statistical-methods-interim-analysis-plan'],
  ['16.1.10', 'inter-laboratory-standardisation-methods-quality-assurance'],
  ['16.1.11', 'publications-based-on-study'],
  ['16.1.12', 'publications-referenced-in-report'],
  ['16.2.1', 'discontinued-patients'],
  ['16.2.2', 'protocol-deviations'],
  ['16.2.3', 'patients-excluded-from-efficacy-analysis'],
  ['16.2.4', 'demographic-data'],
  ['16.2.5', 'compliance-and-drug-concentration-data'],
  ['16.2.6', 'individual-efficacy-response-data'],
  ['16.2.7', 'adverse-event-listings'],
  ['16.2.8', 'listing-individual-laboratory-measurements-by-patient'],
  ['16.3', 'case-report-forms'],
] as const;
const BODY_PARTS = ['body', '14', '14.3.3'] as const;
const resolveRole = () => Reflect.get(plan, 'csrAssemblyFileTag') as ((appendix: string) => string | undefined) | undefined;

describe('the existing CSR plan carries the source-verified ICH roles', () => {
  it('uses study-report-body for the body and the parts within E3 1,3–15', () => {
    expect(plan.CSR_BODY_FILE_TAG).toBe('study-report-body');
    expect(plan.CSR_NARRATIVES_FILE_TAG).toBe('study-report-body');
  });

  it('keeps exactly the 21 source-defined appendix mappings', () => {
    expect({ ...plan.CSR_SUPPLIED_APPENDICES, ...plan.CSR_LISTING_APPENDICES }).toEqual(Object.fromEntries(APPENDIX_SOURCE_ROLES));
  });

  it('reaches the existing shared regulatory-basis owner with scoped source provenance', () => {
    const basis = Reflect.get(plan, 'CSR_STF_ROLE_BASIS') as RegulatoryBasis | undefined;
    expect(basis).toMatchObject({
      confidence: 'regulator-text',
      checked: '2026-10-30',
      url: 'https://www.fda.gov/media/159383/download',
    });
    expect(basis).toBe(Reflect.get(basisOwner, 'ICH_STF_SPEC_261'));
    if (basis) {
      expect(basisProblems(basis)).toEqual([]);
      expect(basis.ref).toMatch(/STF.*2\.6\.1/);
    }
  });

  it('exposes one canonical exact expected-role function for retained assembly consumers', () => {
    expect(plan).toHaveProperty('csrAssemblyFileTag', expect.any(Function));
  });

  it.each(BODY_PARTS)('maps the source-supported body part %s without a legacy alias', appendix => {
    expect(resolveRole()?.(appendix)).toBe('study-report-body');
  });

  it.each(APPENDIX_SOURCE_ROLES)('maps E3 %s to the independently recorded %s role', (appendix, expected) => {
    expect(resolveRole()?.(appendix)).toBe(expected);
    expect(plan.appendixFileTag(appendix)).toBe(expected);
  });

  it.each(['constructor', '__proto__', 'toString', 'BODY', '14 ', '14.3.3 ', '16.1.01', '2', 'not-an-appendix'])('does not infer a role for %s', appendix => {
    expect(resolveRole()?.(appendix)).toBeUndefined();
  });

  it('serializes the current CSR role values with ich info-type, including all appendix mappings', () => {
    const current = [
      ...BODY_PARTS.map(appendix => ({ appendix, tag: plan.CSR_BODY_FILE_TAG })),
      ...APPENDIX_SOURCE_ROLES.map(([appendix]) => ({ appendix, tag: plan.appendixFileTag(appendix) })),
    ];
    const result = generateStfFiles(current.map(({ appendix, tag }, i) => ({
      studyId: 'SOURCE-STUDY', fileTag: tag, ctdSection: '5.3.5.1', href: `part-${i}.pdf`,
      title: appendix, operation: 'new', indexLeafId: `leaf-${i}`, indexRelPath: '../../../index.xml',
    })));
    const xml = result.files[0].xml;
    expect(xml.match(/<file-tag name="study-report-body" info-type="ich"\/>/g)).toHaveLength(3);
    expect(xml).not.toContain('<file-tag name="study-report"');
    for (const [, expected] of APPENDIX_SOURCE_ROLES) expect(xml).toContain(`<file-tag name="${expected}" info-type="ich"/>`);
    expect(result.warnings).toEqual([]);
  });
});
