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

  it('the filings already classed keep their class (controls)', () => {
    expect(typeWithoutTheDefault('us_btd')).toBe('designation');
    expect(typeWithoutTheDefault('us_bla_annual')).toBe('bla_annual_report');
    expect(typeWithoutTheDefault('us_nda')).toBe('nda');
    expect(typeWithoutTheDefault('us_bla')).toBe('bla');
  });
});
