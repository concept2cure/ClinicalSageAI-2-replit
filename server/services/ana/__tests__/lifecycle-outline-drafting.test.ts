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

  it('a section the outline does not hold is named, never left to memory', () => {
    const r = resolveDraftingRequirements('US_TYPE_B_MEETING', '2.4 Nonclinical Overview');
    expect(r.requirementsSource).toBe('record:lifecycle:not-in-outline');
    expect(r.requirements).toContain('do not supply its requirements from memory');
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

  it('a section a component record does not hold is named, never left to memory', () => {
    const r = resolveDraftingRequirements('EU_PSUR', '99 Invented Section');
    expect(r.requirements).toContain('do not supply its requirements from memory');
  });
});

