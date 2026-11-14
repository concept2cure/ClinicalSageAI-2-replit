/**
 * F1 (2026-11-12), S12 biotech sweep item 3: an FDA filing with no stated pathway was created as a full NDA.
 *
 * The defect. A catalog filing with no `pathwayKey` and no document class was given the pathway 'ctd' by the New
 * project wizard (`ctx.pathwayKey || 'ctd'`), and 'ctd' becomes the program type 'nda'. So a Post-Marketing
 * Requirement, a SUPAC change, a 15-Day Alert Report, an Environmental Assessment and a Priority Review request were
 * each scaffolded as a 505(b)(1) NDA: an NDA dossier, an NDA submission spine and "NDA number not assigned".
 *
 * This file holds the catalog's half: each filing states what it is, so the wizard's default could be removed
 * without any of these becoming uncreatable. The project-page lane removed it in 790501d69 (2026-11-13): a filing
 * the catalog states no type for now creates no project, and says so in its own name.
 *
 * - `us_accel_approval` and `us_rolling` ARE the NDA/BLA dossier (21 CFR 314 subpart H / 601 subpart E; a rolling
 *   review is the same dossier submitted in units). Their pathway is stated, where it was the wizard's default.
 * - `us_pmr` is its study's protocol: its outline (blueprint "Post-Marketing Requirement / Commitment Study") is the
 *   protocol's. It joins the existing protocol document class and creates no application.
 *
 * `us_priority_review`, `us_ea` and `us_icsr_15day` each have their own document class (2026-11-13), with the pack
 * migrations/20261113_fda_priority_review_ea_icsr_class_packs.sql seeds. `us_supac` is a change category, not a
 * filing, and waits for the founder.
 */
import { describe, expect, it } from 'vitest';
import { resolveFilingCatalogEntry } from '../../shared/regulatory/filing-catalog';
import { filingDocumentClassForFiling, filingDocumentClassOf } from '../../shared/regulatory/filing-document-classes';
import { programTypeFor } from '../../shared/constants/domain/filing-application-type';
import { getRegistryDocumentTemplate } from '../../server/services/market-specs/document-template-library';
import { filingClassPackSpec, filingClassPackSections } from '../../server/services/c2c/filing-class-packs';

/** The program type the wizard and the create endpoint compute, now that the wizard's `|| 'ctd'` default is gone. */
function typeWithoutTheDefault(id: string): string {
  const entry = resolveFilingCatalogEntry(id)!;
  return programTypeFor({ id: entry.id, label: entry.id, pathway: entry.pathwayKey ?? '' }, 'biopharma');
}

describe('an FDA filing states what it is, so none is an NDA by default', () => {
  it.each(['us_accel_approval', 'us_rolling'])('%s states that it is the application dossier', (id) => {
    expect(resolveFilingCatalogEntry(id)?.pathwayKey).toBe('ctd');
    expect(filingDocumentClassForFiling(id)).toBeNull();
    expect(typeWithoutTheDefault(id)).toBe('nda');
  });

  it('a Post-Marketing Requirement is its study protocol: the protocol document class, never an application', () => {
    const protocol = filingDocumentClassOf('protocol')!;
    expect(protocol.registryIds).toEqual(['ICH_PROTOCOL', 'US_PMR']);
    expect(filingDocumentClassForFiling('US_PMR')).toBe(protocol);
    expect(filingDocumentClassForFiling('us_pmr')).toBe(protocol);
    expect(typeWithoutTheDefault('us_pmr')).toBe('protocol');
    // A caller that still sends 'ctd' (the default before 790501d69) gets the class all the same: it is decided first.
    expect(programTypeFor({ id: 'us_pmr', label: 'PMR', pathway: 'ctd' }, 'biopharma')).toBe('protocol');
    // The class's pack is still minted from its first registry id, the ICH M11 protocol.
    expect(protocol.registryIds[0]).toBe('ICH_PROTOCOL');
  });

  // ── The pass over the filings outside the US (2026-11-13) ─────────────────────
  // With the packs a deployment has, 'nda' is offered at the FDA only, so each of
  // these was already not creatable, refused for want of "a governed NDA outline".
  // Stating what each is gives three a real outline and the rest a true reason.
  it.each([
    // A conditional MA and a line extension are MAA-shaped (Reg. 507/2006; Annex I of Reg. 1234/2008).
    ['eu_cma', 'maa', 'maa'], ['eu_line_extension', 'maa', 'maa'],
    // A master file is Module 3 content with a letter of access, as the US DMF and the EU ASMF are.
    ['ca_mf', 'dmf', 'dmf'],
    // A regional trial application is its own agency's, never a US marketing dossier.
    ['uk_cta', 'cta', 'cta'], ['au_cta', 'cta', 'cta'], ['kr_ind', 'cta', 'cta'],
    // The CTD marketing dossier under its regional name.
    ['ca_nds', 'ctd', 'nda'], ['uk_ma', 'ctd', 'nda'], ['uk_irp', 'ctd', 'nda'],
    ['au_cat1', 'ctd', 'nda'], ['au_cat2', 'ctd', 'nda'], ['kr_ma_new', 'ctd', 'nda'],
    // A generic application carries its bioequivalence reports in 5.3.1, as the ANDA does.
    ['ca_ands', 'anda', 'anda'], ['kr_ma_generic', 'anda', 'anda'],
    ['au_biosimilar', 'biosimilar', 'nda'],
  ])('%s states its pathway %s and resolves to %s', (id, pathway, type) => {
    expect(resolveFilingCatalogEntry(id)?.pathwayKey).toBe(pathway);
    expect(typeWithoutTheDefault(id)).toBe(type);
  });

  it('us_supac is stated at its old value until the founder answers, so it stays creatable without the default', () => {
    expect(resolveFilingCatalogEntry('us_supac')?.pathwayKey).toBe('ctd');
    expect(filingDocumentClassForFiling('us_supac')).toBeNull();
  });

  // ── Three filings that are one document each (2026-11-13) ─────────────────────
  it.each([
    ['us_priority_review', 'priority_review', 'priority review designation request'],
    ['us_ea', 'environmental_assessment', 'environmental assessment'],
    ['us_icsr_15day', 'icsr_15day', '15-day alert report'],
  ])('%s is its own document class %s, never an application', async (id, docType, label) => {
    const klass = filingDocumentClassForFiling(id);
    expect([klass?.docType, klass?.packAgency, klass?.label]).toEqual([docType, 'fda', label]);
    expect(klass?.registryIds).toEqual([id.toUpperCase()]);
    expect(typeWithoutTheDefault(id)).toBe(docType);
    // A caller that still sends 'ctd' gets the class all the same: it is decided first.
    expect(programTypeFor({ id, label, pathway: 'ctd' }, 'biopharma')).toBe(docType);
    // The catalog no longer needs to state a pathway for it.
    expect(resolveFilingCatalogEntry(id)?.pathwayKey ?? null).toBeNull();
    // Its pack is minted from its own registry outline, part for part.
    const spec = filingClassPackSpec(docType);
    expect([spec?.agency, spec?.supersedes, spec?.minted, spec?.confidence]).toEqual(['fda', null, '2026-11-13', 'low']);
    const outline = await getRegistryDocumentTemplate(id.toUpperCase());
    const rows = await filingClassPackSections(docType);
    expect(rows.map((row) => [row.label, row.mandatory])).toEqual(outline!.sections.map((section) => [section.heading, section.required]));
  });

  it('a priority review request asks for its own criterion, not the Breakthrough and RMAT evidence', async () => {
    const outline = await getRegistryDocumentTemplate('US_PRIORITY_REVIEW');
    const parts = outline!.sections.map((section) => [section.number, section.heading, section.required]);
    expect(parts).toEqual([
      ['1', 'Cover Letter and Request Statement', true],
      ['2', 'Product Description and Proposed Indication', true],
      ['3', 'Serious or Life-Threatening Condition Justification', true],
      ['4', 'Available Therapy', true],
      ['5', 'Significant Improvement in Safety or Effectiveness', true],
      ['6', 'Location of the Supporting Data in the Application', false],
    ]);
    expect(JSON.stringify(parts)).not.toMatch(/Breakthrough|RMAT|Development Plan/);
    // The designations that do rest on preliminary clinical evidence keep it.
    const btd = await getRegistryDocumentTemplate('US_BTD');
    expect(btd!.sections.map((section) => section.heading)).toContain('Preliminary Clinical Evidence');
    // PRIME and the device breakthrough request read the shared list, which this does not touch.
    const prime = await getRegistryDocumentTemplate('EU_PRIME');
    expect(prime!.sections.map((section) => section.heading)).toContain('Preliminary Clinical Evidence (Breakthrough/RMAT)');
  });

  it('a filing that is no application and has no document class yet states no pathway', () => {
    for (const id of [
      // changes to an authorisation, and renewals
      'eu_variation_ia', 'eu_variation_ib', 'eu_variation_ii', 'uk_variation', 'ca_snds', 'ca_sands', 'cn_supplement',
      'eu_renewal', 'cn_renewal', 'ca_cta_a',
      // requests, designations and meetings
      'eu_pip', 'eu_orphan', 'eu_scientific_advice', 'eu_prime', 'eu_accel_assess', 'uk_ilap', 'ca_presub_meeting', 'au_presub_meeting',
      // pharmacovigilance documents and messages
      'eu_rmp', 'eu_psmf', 'eu_eudravigilance_icsr',
      // a module or a format, never a filing a project is created from
      'us_ctd_m1_regional', 'eu_ctd_m1_regional', 'ca_ctd_m1_regional', 'uk_ctd_m1_regional', 'au_ctd_m1_regional', 'cn_ctd_m1_regional', 'eu_nees',
    ]) {
      expect([id, resolveFilingCatalogEntry(id)?.pathwayKey ?? null]).toEqual([id, null]);
      expect(filingDocumentClassForFiling(id)).toBeNull();
    }
  });

  it('the filings already classed keep their class (controls)', () => {
    expect(typeWithoutTheDefault('us_btd')).toBe('designation');
    expect(typeWithoutTheDefault('us_bla_annual')).toBe('bla_annual_report');
    expect(typeWithoutTheDefault('us_nda')).toBe('nda');
    expect(typeWithoutTheDefault('us_bla')).toBe('bla');
  });
});
