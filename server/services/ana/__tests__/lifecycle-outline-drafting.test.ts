/**
 * AnA drafts a section of a lifecycle-record outline from the record that
 * outline is read from (review finding, 2026-10-18).
 *
 * getRegistryDocumentTemplate serves the PAS and sBLA, the CBE, the NDA and IND
 * annual reports and the Type A/B/C meeting packages from lifecycle records
 * (lifecycle-record-outlines.ts), and their governed packs are minted from
 * those outlines. Drafting still read the retired project blueprint, so it
 * resolved none of their sections: the supplement's own "Summary and
 * Description of the Change" was drafted with no requirements and no "do not
 * supply from memory" line. Measured before the fix: 0/7 US_NDA_SUPP,
 * 0/8 US_CBE, 0/6 US_IND_ANNUAL, 0/6 for each meeting type.
 */
import { describe, expect, it } from 'vitest';
import { resolveDraftingRequirements } from '../AnaDocumentDraftingService';
import { getRegistryDocumentTemplate, type TemplateSection } from '../../market-specs/document-template-library';

const LIFECYCLE_IDS = [
  'US_NDA_SUPP', 'US_BLA_SUPP', 'US_CBE', 'US_IND_ANNUAL', 'US_NDA_ANNUAL',
  'US_TYPE_A_MEETING', 'US_TYPE_B_MEETING', 'US_TYPE_C_MEETING',
  // 2026-10-29: the US biotech filing completion identities, each from its own record.
  'US_TYPE_D_MEETING', 'US_INTERACT',
  'US_EXPANDED_ACCESS_INDIVIDUAL', 'US_EXPANDED_ACCESS_INTERMEDIATE', 'US_EXPANDED_ACCESS_TREATMENT',
  'US_BLA_ANNUAL', 'US_BLA_PEDIATRIC_ANNUAL', 'US_BLA_PMR_ANNUAL', 'US_BLA_DISTRIBUTION', 'US_BPDR', 'US_BLA_PAE_REPORT',
  'US_BLA_CBE30', 'US_BLA_CBE0', 'US_CBER_MASTER_FILE', 'US_CBER_LOT_RELEASE', 'US_EUA_THERAPEUTIC',
];

function every(sections: TemplateSection[]): TemplateSection[] {
  return sections.flatMap((s) => [s, ...every(s.subsections ?? [])]);
}

describe('a lifecycle-record outline is drafted from its own record', () => {
  it.each(LIFECYCLE_IDS)('%s: every section the outline serves resolves, asked by code + title or by title', async (id) => {
    const template = await getRegistryDocumentTemplate(id);
    expect(template?.outlineSource?.kind).toBe('lifecycle-record');
    const unresolved: string[] = [];
    for (const s of every([...(template?.frontMatter ?? []), ...(template?.sections ?? [])])) {
      for (const asked of [`${s.number} ${s.heading}`, s.heading]) {
        const r = resolveDraftingRequirements(id, asked);
        if (!r.requirements || /none|not-indexed|not-in-outline/.test(r.requirementsSource)) unresolved.push(`${asked} → ${r.requirementsSource}`);
      }
    }
    expect(unresolved).toEqual([]);
  });

  it('the supplement\'s change section carries the record\'s brief and its key content', () => {
    const r = resolveDraftingRequirements('US_NDA_SUPP', 'PAS-SUMMARY Summary and Description of the Change');
    expect(r.requirementsSource).toBe('record:lifecycle:LIFECYCLE_DOCUMENT_TYPES:nda_pas:PAS-SUMMARY');
    expect(r.requirements).toContain('Approved (current) condition vs. proposed condition presented in parallel');
    expect(r.requirements).toContain('do not add requirements from memory');
  });

  it('a CTD section the change updates is answered by the CTD record', () => {
    const r = resolveDraftingRequirements('US_CBE', '3.2.P');
    expect(r.requirementsSource).toMatch(/^record:ctd-section:3\.2\.P/);
  });

  it('a section neither the outline nor the earlier blueprint holds is named, never left to memory', () => {
    const r = resolveDraftingRequirements('US_TYPE_B_MEETING', 'Totally Invented Section');
    expect(r.requirementsSource).toBe('record:lifecycle:not-in-outline');
    expect(r.requirements).toContain('do not supply its requirements from memory');
  });

  // Second review, 2026-10-18: a final miss refused what the earlier path answered.
  it('a section bound to the earlier blueprint still resolves the way it did', () => {
    // A project bootstrapped from the blueprint keeps its numeric codes.
    expect(resolveDraftingRequirements('US_IND_ANNUAL', '3 Summary of Clinical Safety Information').requirements).toBeTruthy();
    // A Module 1 code the supplement's record does not hold as a part.
    expect(resolveDraftingRequirements('US_NDA_SUPP', '1.3').requirementsSource).not.toMatch(/not-in-outline|none/);
    // A meeting package section the old outline (the pre-IND rows) had.
    expect(resolveDraftingRequirements('US_TYPE_B_MEETING', '4 Proposed Nonclinical Program Summary').requirementsSource).toBe('blueprint');
  });

  it('a CTD section the outline holds, asked with another title, is the CTD record\'s', () => {
    expect(resolveDraftingRequirements('US_CBE', '3.2.P Drug Product (name, manufacturer)').requirementsSource).toMatch(/^record:ctd-section:3\.2\.P/);
  });

  // 2026-10-29: the sBLA reads its own 601.12(b) record, so no line has to tell
  // AnA to swap the NDA rule for the BLA one.
  it('an sBLA section is drafted from the BLA PAS record, never the NDA PAS record', () => {
    const cover = resolveDraftingRequirements('US_BLA_SUPP', 'bla_pas.cover Cover Letter');
    expect(cover.requirementsSource).toBe('record:lifecycle:LIFECYCLE_DOCUMENT_TYPES:us_bla_pas:bla_pas.cover');
    expect(cover.requirements).toContain('601.12');
    expect(cover.requirements).not.toContain('nda_pas');
    expect(cover.requirements).not.toContain('314.70');
    // The NDA PAS part is not a section of the sBLA outline.
    expect(resolveDraftingRequirements('US_BLA_SUPP', 'PAS-COVER Cover Letter').requirementsSource).not.toContain('nda_pas');
  });

  it('a Type D package section is drafted from the Type D record, with its own scope part', () => {
    const r = resolveDraftingRequirements('US_TYPE_D_MEETING', 'MTG-D-SCOPE');
    expect(r.requirementsSource).toBe('record:lifecycle:LIFECYCLE_DOCUMENT_TYPES:us_type_d_meeting:MTG-D-SCOPE');
    expect(resolveDraftingRequirements('US_INTERACT', 'MTG-INTERACT-NOVEL').requirementsSource)
      .toBe('record:lifecycle:LIFECYCLE_DOCUMENT_TYPES:us_interact_meeting:MTG-INTERACT-NOVEL');
    // Neither carries the generic core-plus-support outline A/B/C read.
    expect(resolveDraftingRequirements('US_TYPE_D_MEETING', 'MTG-SUPPORT').requirementsSource).toBe('record:lifecycle:not-in-outline');
  });

  // Review critic, 2026-10-18.
  it('a Module 3 leaf below a supplement\'s 3.2.P is the CTD record\'s, never "not a section"', () => {
    for (const id of ['US_NDA_SUPP', 'US_BLA_SUPP', 'US_CBE']) {
      const r = resolveDraftingRequirements(id, '3.2.P.5.1');
      expect(r.requirementsSource, id).toMatch(/^record:ctd-section:3\.2\.P\.5\.1/);
    }
    expect(resolveDraftingRequirements('US_NDA_SUPP', '5.3.5.1').requirementsSource).toMatch(/^record:ctd-section:5\.3\.5\.1/);
  });

  it('the CBE change description gives the CBE-0 brief beside the CBE-30 one, named by variant', () => {
    const r = resolveDraftingRequirements('US_CBE', 'Description and Justification of the Change');
    expect(r.requirements).toContain('For a CBE-30:');
    expect(r.requirements).toContain('For a CBE-0:');
    expect(r.requirements).toContain('314.70(c)(6)');
    expect(r.requirements).toMatch(/filer's classification of the change \(CBE-30 or CBE-0\)/);
  });
});

describe('a component document is drafted to its whole outline, not its first level (review critic, 2026-10-18)', () => {
  it.each([
    ['EU_PSUR', 'executive_summary Executive Summary'],
    ['EU_PSUR', '16.2 Signal Evaluation'],
    ['EU_PSUR', 'Appendices to the PBRER'],
    ['ICH_IB', 'Title Page'],
  ])('%s "%s" carries requirements', (id, asked) => {
    const r = resolveDraftingRequirements(id, asked);
    expect(r.requirements, r.requirementsSource).toBeTruthy();
    expect(r.requirementsSource).not.toMatch(/none|not-indexed/);
  });

  it('a CSR section is answered from the E3 tree its pack is built from', () => {
    const r = resolveDraftingRequirements('ICH_CSR', '9.4.1 Treatments Administered');
    expect(r.requirementsSource).toBe('record:outline:csr-e3:9.4.1:exact');
    expect(r.requirements).toContain('ICH E3 record');
  });

  it('a CSR title that starts with a number is a title, not that E3 section', () => {
    const r = resolveDraftingRequirements('ICH_CSR', '12-Week Efficacy Results');
    expect(r.requirementsSource).toBe('record:outline:csr-e3:not-indexed');
    expect(resolveDraftingRequirements('ICH_CSR', '12 Week Results').requirementsSource).toBe('record:outline:csr-e3:not-indexed');
    expect(resolveDraftingRequirements('ICH_CSR', '12 Safety Evaluation').requirementsSource).toBe('record:outline:csr-e3:12:exact');
  });

  it('a CSR title E3 holds twice is listed, never resolved to the first', () => {
    const r = resolveDraftingRequirements('ICH_CSR', 'Protocol Deviations');
    expect(r.requirementsSource).toBe('record:outline:csr-e3:candidates');
    expect(r.requirements).toContain('10.2 and 16.2.2');
  });

  it('a retitled row still answers to its former title', () => {
    expect(resolveDraftingRequirements('US_FAST_TRACK', 'Unmet Medical Need Analysis').requirementsSource).toBe('blueprint');
    expect(resolveDraftingRequirements('US_PADER', 'FDA Form 3500A Reports (Non-Expedited Cases)').requirementsSource).toBe('blueprint');
  });

  // Completeness critic, 2026-10-19.
  it('a section bound to an earlier outline answers to the heading it had there', () => {
    // A CBE bound to fda-cbe-lifecycle-v1.0 holds the CBE-30-suffixed headings.
    const cbe = resolveDraftingRequirements('US_CBE', 'Description and Justification of the Change (CBE-30)');
    expect(cbe.requirementsSource).toBe('record:lifecycle:LIFECYCLE_DOCUMENT_TYPES:cbe_30+LIFECYCLE_DOCUMENT_TYPES:cbe_0:CBE30-CHANGE');
    expect(resolveDraftingRequirements('US_NDA_SUPP', 'Program/User Fee Cover Sheet and Field Copy Certification').requirementsSource)
      .toBe('record:lifecycle:LIFECYCLE_DOCUMENT_TYPES:nda_pas:PAS-FEE');
    // A PSUR bound to ich-e2c-r2-v2.0 holds the earlier §3 and §7 wording.
    expect(resolveDraftingRequirements('EU_PSUR', 'Actions Taken for Safety Reasons').requirementsSource).not.toMatch(/not-indexed|none/);
    expect(resolveDraftingRequirements('EU_PSUR', '7 Summaries of Significant Findings from Clinical Trials').requirementsSource).not.toMatch(/not-indexed|none/);
  });

  it('a meeting section no record part backs is the outline\'s own, never attributed to the record', () => {
    const r = resolveDraftingRequirements('US_TYPE_A_MEETING', 'MTG-SUPPORT');
    expect(r.requirementsSource).toBe('record:lifecycle:outline:lifecycle-record:US_TYPE_A_MEETING:MTG-SUPPORT');
    expect(r.requirements).toContain("outline's own section; no record part backs it");
  });

  it('a section a component record does not hold is named, never left to memory', () => {
    const r = resolveDraftingRequirements('EU_PSUR', '99 Invented Section');
    expect(r.requirements).toContain('do not supply its requirements from memory');
  });
});

