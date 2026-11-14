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
  // A chosen filing that states no pathway, is no document class and matches
  // no rule above has NO application type (NO_APPLICATION_TYPE). Until
  // 2026-11-13 the wizard gave every such filing the pathway 'ctd', so 107 of
  // the catalog's 251 filings were created as a US NDA: a 15-day safety
  // report, an EU variation, a device master record (S12 sweep items 3 and 4,
  // docs/evidence/SPINE/S12/2026-11-12-unmapped-filings/). The catalog
  // (shared/regulatory/filing-catalog.ts PATHWAY_BY_ID and the filing document
  // classes) is the only place a filing's type is stated; what it does not
  // state is not created, and `noProjectReason` says so in the filing's name.
  if (id) return NO_APPLICATION_TYPE;
  // No filing chosen yet: the lane's usual first filing, as before.
  return uiSeg === 'medtech' ? '510k' : uiSeg === 'diagnostics' ? 'ivd' : 'ind';
}

/** What `programTypeFor` answers for a chosen filing the catalog states no type for: no project is created from it.
 *  Empty, so it is falsy and is no program type the server accepts (VALID_PROGRAM_TYPES). */
export const NO_APPLICATION_TYPE = '';

/**
 * Where the catalog's ICH quality rows are written (D2 3b Slice 4; P-55 row 5, F-D, decided 2026-10-26: no standalone
 * Quality Overall Summary, drug substance or drug product project). Moved unchanged from
 * server/services/regulatory/market-support.ts (2026-11-13), which still states them as each filing's own refusal at
 * ICH / Global; `noProjectReason` reads them too. Keyed by registry id.
 */
export const WRITTEN_IN_THE_APPLICATION_PROJECT: Readonly<Record<string, string>> = {
  ICH_QOS: "Not offered as its own project: the Quality Overall Summary is Module 2.3 of its application, so it is written in that application's project. " +
    "For a small-molecule US IND, AnA composes it there from the project's CMC / Module 3 records.",
  ICH_M3_DS: "Not offered as its own project: drug substance quality is Module 3.2.S of its application, so it is written in that application's project; " +
    'for a small-molecule US IND it is composed there in CMC / Module 3. A drug substance filed on its own by its holder is a Drug Master File (US) ' +
    'or an Active Substance Master File (EU): choose that filing type instead.',
  ICH_M3_DP: "Not offered as its own project: drug product quality is Module 3.2.P of its application, so it is written in that application's project; " +
    'for a small-molecule US IND it is composed there in CMC / Module 3.',
};

/** Why no project is created from a filing with no application type, in the filing's own name: the picker's
 *  not-offered reason and the create endpoint's refusal are this one sentence. It names no other application. */
export function noProjectReason(filing: { id: string; displayName: string; agency?: string | null; category?: string | null }): string {
  const id = filing.id.toLowerCase();
  const written = WRITTEN_IN_THE_APPLICATION_PROJECT[id.toUpperCase()];
  if (written) return written;
  // A quality system record (a device master record, a quality manual) is kept in the quality system.
  if (filing.category === 'qms' || id.startsWith('qms_')) {
    return `Not offered: ${filing.displayName} is a quality system record, not a filing, so no project is created from it.`;
  }
  // A CTD module is part of a dossier, written in the project of the application it belongs to.
  if (/_ctd_m\d(_regional)?$/.test(id)) {
    return `Not offered as its own project: ${filing.displayName} is a module of an application's dossier, so it is written in that application's project.`;
  }
  // ICH is no jurisdiction: what the catalog lists under it is a harmonised document, and this one is no project.
  if (/^ich\b/i.test(String(filing.agency ?? ''))) {
    return `Not offered: ICH is no jurisdiction and takes no filing, and ${filing.displayName} is not authored here as a project of its own.`;
  }
  return `Not offered: no project type is stated for ${filing.displayName}, so no project is created from it.`;
}
