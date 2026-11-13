/**
 * The application type a catalog filing creates is ONE function, read by the
 * New project picker and by POST /api/c2c/projects alike (S12 biotech sweep,
 * 2026-11-09, package S1).
 *
 * `programTypeFor` lived in Projects.tsx, so only the picker could ask it. The
 * create endpoint recorded `submissionTypeId` and never compared it with the
 * type that filing creates: a Type II Variation sent as an MAA was scaffolded
 * as an MAA, while the picker asked the verdict about an NDA at EMA and marked
 * it not offered. Moved unchanged to shared/constants/domain so the server
 * computes what the picker computes.
 *
 * The picker passes the tab the person is looking at; the server knows no tab.
 * That is sound only while no catalog filing's type depends on the tab, which
 * the second test asserts over the whole catalog.
 */
import { describe, it, expect } from 'vitest';
import { NO_APPLICATION_TYPE, noProjectReason, programTypeFor } from '../filing-application-type';
import { filingDocumentClassForFiling } from '../../../regulatory/filing-document-classes';
import { FILING_CATALOG, resolveFilingCatalogEntry } from '../../../regulatory/filing-catalog';

/** Exactly what the picker sends for a catalog row (Projects.tsx, RegistryPicker applicationTypeOf). */
const asPicker = (id: string, lane = 'biotech') => {
  const e = resolveFilingCatalogEntry(id)!;
  return programTypeFor({ id: e.id, label: e.id, pathway: e.pathwayKey ?? '' }, lane);
};

/** Every lane the New project wizard opens in (Projects.tsx SEG_LABELS). */
const LANES = ['biotech', 'pharma', 'medtech', 'diagnostics', 'cro', 'health'];

describe('programTypeFor, shared by the picker and the create endpoint', () => {
  it('gives each filing the application it creates', () => {
    // A variation states no type (2026-11-13): it is not an application, and its document class does not exist yet.
    expect(asPicker('eu_variation_ii')).toBe(NO_APPLICATION_TYPE);
    expect(asPicker('eu_cma')).toBe('maa');
    expect(asPicker('ca_mf')).toBe('dmf');
    expect(asPicker('eu_maa')).toBe('maa');
    expect(asPicker('eu_cta')).toBe('cta');
    expect(asPicker('us_505b2')).toBe('nda');
    expect(asPicker('us_351k')).toBe('bla');
  });

  it('no catalog filing\'s application type depends on the tab the picker is on', () => {
    const tabDependent = FILING_CATALOG
      .map((e) => [e.id, new Set(LANES.map((lane) => asPicker(e.id, lane)))] as const)
      .filter(([, types]) => types.size > 1)
      .map(([id, types]) => `${id}: ${[...types].join(' | ')}`);
    expect(FILING_CATALOG.length).toBeGreaterThan(200);
    expect(tabDependent).toEqual([]);
  });

  /* S12 sweep items 3 and 4 (2026-11-13). The wizard gave every filing with no stated pathway the pathway 'ctd', and
     'ctd' is an NDA: 107 of the catalog's 251 filings were created as a US NDA, and refused in the NDA's name. */
  it('a filing the catalog states no pathway and no document class for has no application type', () => {
    expect(asPicker('qms_dmr')).toBe(NO_APPLICATION_TYPE);
    expect(asPicker('us_ctd_m1_regional')).toBe(NO_APPLICATION_TYPE);
    expect(asPicker('ich_qos')).toBe(NO_APPLICATION_TYPE);
    // Stated in the catalog, so still what it was: the accelerated-approval dossier is the NDA's.
    expect(asPicker('us_accel_approval')).toBe('nda');
  });

  it('no filing becomes an NDA or an IND by default: only a stated pathway, a document class or its own id says so', () => {
    const byDefault = FILING_CATALOG
      .filter((e) => !e.pathwayKey && !filingDocumentClassForFiling(e.id))
      .map((e) => [e.id, asPicker(e.id)] as const)
      .filter(([id, type]) => ['nda', 'ind'].includes(type) && !id.includes(type))
      .map(([id, type]) => `${id}: ${type}`);
    expect(byDefault).toEqual([]);
  });

  it('no filing chosen yet: the lane\'s usual first filing, as before', () => {
    expect(programTypeFor(null, 'biotech')).toBe('ind');
    expect(programTypeFor(null, 'medtech')).toBe('510k');
    expect(programTypeFor(null, 'diagnostics')).toBe('ivd');
  });

  it('says why no project is created, in the filing\'s own name and never another application\'s', () => {
    const reason = (id: string) => noProjectReason(resolveFilingCatalogEntry(id)!);
    expect(reason('qms_dmr')).toBe('Not offered: Device Master Record (DMR) is a quality system record, not a filing, so no project is created from it.');
    expect(reason('us_ctd_m1_regional')).toBe("Not offered as its own project: CTD Module 1 — US Regional is a module of an application's dossier, so it is written in that application's project.");
    expect(reason('ich_qos')).toMatch(/^Not offered as its own project: the Quality Overall Summary is Module 2\.3 of its application/);
    expect(reason('ich_signal')).toMatch(/^Not offered: ICH is no jurisdiction and takes no filing, and .+ is not authored here as a project of its own\.$/);
    const untyped = FILING_CATALOG.filter((e) => asPicker(e.id) === NO_APPLICATION_TYPE);
    expect(untyped.length).toBeGreaterThan(0);
    for (const e of untyped) {
      const said = noProjectReason(e);
      expect(said, e.id).toMatch(/^Not offered/);
      // The three ICH quality rows say where they are written and name the DMF/ASMF; no other reason names an application.
      if (!['ich_qos', 'ich_m3_ds', 'ich_m3_dp'].includes(e.id)) expect(said.replace(e.displayName, ''), e.id).not.toMatch(/\b(NDA|IND|BLA|MAA)\b/);
    }
  });
});
