/**
 * The application type a catalog filing creates: the ONE rule the New project
 * picker and POST /api/c2c/projects both read.
 *
 * Moved unchanged from client/src/concept2cure/v2/surfaces/Projects.tsx
 * (2026-11-09, S12 biotech sweep, package S1). While it lived there only the
 * picker could ask it: the picker asks the market verdict about the type each
 * filing creates and marks the filing not offered when that type is not, but
 * the create endpoint recorded `submissionTypeId` without comparing it with
 * that type. A Type II Variation sent as an MAA was scaffolded as an MAA, though
 * the picker had asked about an NDA at EMA and refused it. The endpoint now
 * computes the type here and refuses a filing sent as another type.
 *
 * Pure: it reads the shared filing catalog and document classes, nothing else,
 * so the client and the server import the same function.
 *
 * @module shared/constants/domain/filing-application-type
 */

import { regionalDeviceApplicationClassForFiling } from '../../regulatory/filing-catalog.js';
import { filingDocumentClassForFiling } from '../../regulatory/filing-document-classes.js';

/** A chosen registry template, as the New project wizard holds it. */
export interface SelTpl {
  id: string;
  label: string;
  pathway: string;
  agency?: string;
  region?: string;
  dossierStandard?: string;
  ctdModule?: string;
  submissionFormat?: string;
}

/** Map a chosen registry template + segment → a canonical program_type the
 *  backend accepts (server VALID_PROGRAM_TYPES) and WS_CASE buckets. */
export function programTypeFor(sel: SelTpl | null, uiSeg: string): string {
  const id = (sel?.id ?? '').toLowerCase();
  const pw = (sel?.pathway ?? '').toLowerCase();
  const regional = regionalDeviceApplicationClassForFiling(id); if (regional) return regional.docType;
  // A filing that is a document, not an application — a supplement, an annual
  // report, an IND amendment, a meeting package, a designation request, a CSR —
  // is its own class, decided before any pathway rule below. Every one of them
  // used to fall to the 'ctd' default and was scaffolded as a 73-node NDA, the
  // CSR to the closing 'ind' (shared/regulatory/filing-document-classes.ts).
  const documentClass = filingDocumentClassForFiling(id);
  if (documentClass) return documentClass.docType;
  if (id.includes('510k')) return '510k';
  if (id.includes('de_novo') || pw === 'denovo') return 'de_novo';
  if (id.includes('pma')) return 'pma';
  if (id === 'cer' || pw === 'cer') return 'cer';
  if (pw === 'ide' || id === 'ide') return 'ide';
  // 'jnda' is the JP MARKETING application only. The old `id.includes('jp_')`
  // shortcut held while the registry's JP rows were named pmda_*/ctn_jp; the
  // unified catalog's ids are lowercase canonical (jp_shonin, jp_ctn, …), so a
  // prefix match would file a Japanese device approval as a J-NDA. The
  // pathwayKey carries the intent now.
  if (id.includes('jnda') || pw === 'jnda') return 'jnda';
  // A 505(b)(2) IS an NDA (21 CFR 314.50 dossier) and a 351(k) IS a BLA. Their
  // pathway keys ('505b2', 'biosimilar') matched nothing below and fell through
  // to the final `'ind'` default — so a marketing-application customer was
  // scaffolded a 108-section IND and an IND submission spine. 'biosimilar' is
  // shared across regions, so the region prefix picks the application.
  if (pw === '505b2') return 'nda';
  if (pw === 'biosimilar') {
    if (id.startsWith('us_')) return 'bla';
    if (id.startsWith('eu_')) return 'maa';
    if (id.startsWith('jp_')) return 'jnda';
    return 'nda';
  }
  // A DMF is Module 3 content (3.2.S / 3.2.A / 3.2.R) with a letter of
  // authorization — not an IND. It files against the harmonised Module 3 pack
  // (mod3:ich) via PROGRAM_TO_DOC_TYPE, never a 108-section IND outline.
  if (pw === 'dmf' || id === 'us_dmf' || id === 'eu_asmf') return 'dmf';
  if (id.includes('bla') || pw === 'bla') return 'bla';
  if (id.includes('maa') || pw === 'maa') return 'maa';
  if (id.includes('anda') || pw === 'anda') return 'anda';
  // MUST precede the 'nda' line below. A missing pathwayKey defaults to 'ctd'
  // (line 130), and `pw === 'ctd'` returns 'nda' — which is how every
  // clinical-trial application in the registry became a US marketing
  // application. 'eu_cta' now carries pathwayKey 'cta' and lands here, so it
  // scaffolds the CTR 536/2014 Annex I outline seeded by migrations/20260806
  // instead of the 71-section NDA dossier.
  //
  // Other regional trial filings resolve to their own agency. A missing pack
  // is refused; a US marketing outline is never substituted.
  if (id === 'eu_cta' || pw === 'cta') return 'cta';
  // Bare device/ivd names no pathway and stays unmapped. The existing market
  // verdict refuses it; a regional technical file reaches its exact pack below.
  // MDR/IVDR before the generic device/ivd fallbacks: an EU technical file has a
  // real pack and must reach it, while a bare 'device' still fails closed.
  if (pw === 'mdr') return 'mdr';
  if (pw === 'ivdr') return 'ivdr';
  if (pw === 'device') return 'device';
  if (pw === 'ivd') return 'ivd';
  if (id.includes('nda') || pw === 'ctd') return 'nda';
  if (id.includes('ind') || pw === 'ind') return 'ind';
  return uiSeg === 'medtech' ? '510k' : uiSeg === 'diagnostics' ? 'ivd' : 'ind';
}
