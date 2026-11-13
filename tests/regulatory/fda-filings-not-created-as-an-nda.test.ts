/**
 * F1 (2026-11-12), S12 biotech sweep item 3: an FDA filing with no stated pathway was created as a full NDA.
 *
 * The defect. A catalog filing with no `pathwayKey` and no document class was given the pathway 'ctd' by the New
 * project wizard (`ctx.pathwayKey || 'ctd'`), and 'ctd' becomes the program type 'nda'. So a Post-Marketing
 * Requirement, a SUPAC change, a 15-Day Alert Report, an Environmental Assessment and a Priority Review request were
 * each scaffolded as a 505(b)(1) NDA: an NDA dossier, an NDA submission spine and "NDA number not assigned".
 *
 * This file holds the catalog's half: each filing states what it is, so the wizard's default can be removed
 * (the project-page lane's half) without any of these becoming uncreatable.
 *
 * - `us_accel_approval` and `us_rolling` ARE the NDA/BLA dossier (21 CFR 314 subpart H / 601 subpart E; a rolling
 *   review is the same dossier submitted in units). Their pathway is stated, where it was the wizard's default.
 * - `us_pmr` is its study's protocol: its outline (blueprint "Post-Marketing Requirement / Commitment Study") is the
 *   protocol's. It joins the existing protocol document class and creates no application.
 *
 * `us_priority_review`, `us_ea` and `us_icsr_15day` get their own document classes in the change that seeds their
 * packs. `us_supac` is a change category, not a filing, and waits for the founder.
 */
import { describe, expect, it } from 'vitest';
import { resolveFilingCatalogEntry } from '../../shared/regulatory/filing-catalog';
import { filingDocumentClassForFiling, filingDocumentClassOf } from '../../shared/regulatory/filing-document-classes';
import { programTypeFor } from '../../shared/constants/domain/filing-application-type';

/** The program type the wizard and the create endpoint compute, with the wizard's `|| 'ctd'` default removed. */
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
    // What the wizard sends today, while its 'ctd' default still stands: the class is decided first.
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

  it.each(['us_supac', 'us_priority_review', 'us_ea', 'us_icsr_15day'])(
    '%s is stated at today\'s value until its own answer lands, so the wizard\'s default has no exception', (id) => {
      expect(resolveFilingCatalogEntry(id)?.pathwayKey).toBe('ctd');
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
