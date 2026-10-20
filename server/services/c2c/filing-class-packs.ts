/**
 * The governed rule pack each filing class is scaffolded from.
 *
 * shared/regulatory/filing-document-classes.ts says which filings are a
 * document rather than an application. filing-catalog.ts separately identifies
 * exact regional device applications. This module projects both through the
 * same pack machinery, without treating applications as documentary classes:
 *
 *   • the outline is `getRegistryDocumentTemplate` for the class's first
 *     registry id — the outline AnA and the Authoring template picker already
 *     serve — flattened into rule-pack rows; the CSR is the full ICH E3 tree
 *     (csr-e3-guidance.ts), where the template shows only its sixteen headings;
 *   • version, label and provenance are stated here, once, per class.
 *
 * The packs reach a database only through migration files
 * (CLAUDE.md Rule 1: reference data deploys through a file in
 * C2C_MIGRATION_FILES), which scripts/db/emit-filing-class-packs.ts writes from
 * this module: migrations/20261018_filing_class_rule_packs.sql seeded the first
 * versions, and migrations/20261018c_filing_class_packs_review_corrections.sql
 * the review corrections that supersede ten of them. Each entry below is a
 * class's CURRENT version; a version some file already seeds is never
 * re-emitted, and a changed outline is a new version in a new file.
 * tests/schema-contract/c2c-filing-class-packs.contract.test.ts applies that
 * file and holds every pack to `filingClassPackSections`, so a change to a
 * canonical outline fails until a new pack version is minted — a pack a
 * document was built against is never rewritten.
 *
 * Pure and deterministic: no database, no network, no model.
 *
 * @module server/services/c2c/filing-class-packs
 */

import { FILING_DOCUMENT_CLASSES } from '../../../shared/regulatory/filing-document-classes.js';
import { REGIONAL_DEVICE_APPLICATION_CLASSES, regionalDeviceApplicationClassOf } from '../../../shared/regulatory/filing-catalog.js';
import { getApplicationType } from '../../../shared/regulatory/global-document-registry.js';
import {
  getRegistryDocumentTemplate,
  type DocumentTemplateStructure,
  type TemplateSection,
} from '../market-specs/document-template-library.js';
import { ICH_E3_GUIDANCE, e3ParentNumber } from '../ind/ctd/csr-e3-guidance.js';

/** One row of c2c_rule_packs.required_sections, as scaffold-project-documents.ts reads it. */
export interface PackSectionRow {
  key: string;
  parent_key: string | null;
  label: string;
  mandatory: boolean;
  path_order: number;
}

export type PackSourceBasis = 'statutory_transcription' | 'harmonised_standard' | 'guidance_transcription' | 'reasoned_construction';

export interface FilingClassPackSpec {
  docType: string;
  agency: 'fda' | 'ema' | 'ich' | 'hc' | 'pmda' | 'jp_rcb';
  version: string;
  label: string;
  sourceBasis: PackSourceBasis;
  confidence: 'high' | 'medium' | 'low';
  /** The live version this one supersedes, when the class already had a pack. */
  supersedes: string | null;
  /** Why this basis and confidence: the first sentence of the pack's uncertainties. */
  basisNote: string;
  /** What this version changes from the one it supersedes, for the header of the migration that seeds it. */
  changeNote?: string;
  /**
   * The date this version was minted (ISO). Absent means 2026-10-18, the date
   * every version here so far was minted; a later version states its own, and
   * the emitter refuses one whose date is not its migration file's (review
   * finding, 2026-10-18: the date was hard-coded into every pack's provenance).
   */
  minted?: string;
  /**
   * The version this one supersedes made a provenance claim the review found
   * false (an outline "checked against the regulator's text", a wrong rule cited
   * as governing). A document bound to it keeps its outline, so its governing
   * rule and confidence are corrected to this version's, never left standing.
   */
  correctsSupersededProvenance?: true;
}

/** The mint date a spec states, or the one every version so far was minted on. */
export const filingClassPackMinted = (spec: FilingClassPackSpec): string => spec.minted ?? '2026-10-18';

const RECORD = 'An advisory platform record that cites the rule; its headings are recalled, not transcribed.';
const BLUEPRINT = 'A platform project blueprint: a reasoned construction against the obligation, not an enumerated structure.';

export const FILING_CLASS_PACKS: readonly FilingClassPackSpec[] = [
  { docType: 'pas', agency: 'fda', version: 'fda-pas-lifecycle-v1.2', label: 'PAS × FDA · Prior Approval Supplement · 21 CFR 314.70(b) / 601.12(b), (f)(1)', sourceBasis: 'reasoned_construction', confidence: 'low', supersedes: 'fda-pas-lifecycle-v1.1', basisNote: `${RECORD} A BLA supplement (21 CFR 601.12(b) for a manufacturing change, 601.12(f)(1) for a labeling change) shares the NDA record's parts; the BLA rule text was not re-read for it.`, changeNote: "Adds the patent-information part a supplement that changes the formulation, an indication or the strength carries: 21 CFR 314.53(d)(2), on Form FDA 3542a, or the no-relevant-patent statement, and any 314.50(j) exclusivity claim. It is conditional.", minted: '2026-10-19' },
  { docType: 'cbe', agency: 'fda', version: 'fda-cbe-lifecycle-v1.1', label: 'CBE × FDA · CBE-30 / CBE-0 Supplement · 21 CFR 314.70(c)', sourceBasis: 'reasoned_construction', confidence: 'low', supersedes: 'fda-cbe-lifecycle-v1.0', basisNote: `${RECORD} One registry filing for two records: the shared parts are required, each variant's own parts are not.`, changeNote: 'The change description and its basis (314.70(c)(3)-(4)) and the environmental claim (21 CFR 25.15(a)) are now parts of both CBE-30 and CBE-0, so both are required. In v1.0 they were optional and named for CBE-30 alone.' },
  { docType: 'annual_report', agency: 'fda', version: 'fda-annual-report-lifecycle-v1.1', label: 'Annual Report × FDA · NDA 21 CFR 314.81(b)(2) (BLA: 601.12(d), 601.70)', sourceBasis: 'reasoned_construction', confidence: 'low', supersedes: 'fda-annual-report-lifecycle-v1.0', correctsSupersededProvenance: true, basisNote: `${RECORD} Its parts follow the NDA annual report (314.81(b)(2)); a BLA's periodic reports (601.12(d), 601.70, 601.28, 600.81) are cited, not modelled part by part.`, changeNote: 'The BLA citation is corrected: v1.0 cited 601.12(a), the general provisions, as the BLA annual report. The label names the NDA rule the parts follow. The nodes are unchanged.' },
  { docType: 'rems', agency: 'fda', version: 'fda-rems-v1.0', label: 'REMS × FDA · FD&C Act 505-1', sourceBasis: 'reasoned_construction', confidence: 'low', supersedes: null, basisNote: BLUEPRINT },
  { docType: 'pader', agency: 'fda', version: 'fda-pader-v1.1', label: 'PADER × FDA · 21 CFR 314.80(c)(2)', sourceBasis: 'reasoned_construction', confidence: 'low', supersedes: 'fda-pader-v1.0', basisNote: BLUEPRINT, changeNote: 'Its first part is the non-expedited ICSRs. They are sent electronically under 314.80(g) and referenced from the report, not embedded as Form 3500A reports. That was the paper rule before 2015.' },
  { docType: 'ind_amendment', agency: 'fda', version: 'fda-ind-amendment-v1.0', label: 'IND Amendment × FDA · 21 CFR 312.30 / 312.31', sourceBasis: 'reasoned_construction', confidence: 'low', supersedes: null, basisNote: `${BLUEPRINT} Built from the IND lifecycle records' parts and scoped against 21 CFR 312.30 and 312.31.` },
  { docType: 'ind_safety_report', agency: 'fda', version: 'fda-ind-safety-report-v1.2', label: 'IND Safety Report × FDA · 21 CFR 312.32', sourceBasis: 'reasoned_construction', confidence: 'low', supersedes: 'fda-ind-safety-report-v1.1', basisNote: `${BLUEPRINT} Its route and format facts were checked against FDA's IND safety reporting web page on 2026-10-07; the outline itself was not checked against 21 CFR 312.32.`, changeNote: "The 312.32(c)(1) similar-reports part moves to the end, where its code (7) sorts. A reader that orders sections by code had already put it there.", minted: '2026-10-19' },
  { docType: 'ind_annual_report', agency: 'fda', version: 'fda-ind-annual-report-lifecycle-v1.1', label: 'IND Annual Report × FDA · 21 CFR 312.33', sourceBasis: 'reasoned_construction', confidence: 'low', supersedes: 'fda-ind-annual-report-lifecycle-v1.0', basisNote: RECORD, changeNote: "The 312.33(b)(5) part is added and required: information pertinent to an understanding of the drug's actions. v1.0 mapped no part to (b)(5)." },
  { docType: 'briefing', agency: 'fda', version: 'fda-formal-meetings-2026-v1.0', label: 'Formal Meeting Package × FDA · Type A / B / C', sourceBasis: 'reasoned_construction', confidence: 'low', supersedes: 'fda-meeting-2024', basisNote: 'The type-neutral meeting-package core recalled from FDA\'s final formal-meetings guidance (Aug 2026); the guidance text was not re-read.' },
  { docType: 'orphan', agency: 'fda', version: 'fda-orphan-request-v1.2', label: 'Orphan Drug Designation Request × FDA · 21 CFR 316.20', sourceBasis: 'reasoned_construction', confidence: 'low', supersedes: 'fda-orphan-request-v1.1', basisNote: `${BLUEPRINT} 21 CFR 316.20(b) enumerates the request's contents; parts were mapped to (b)(5)-(b)(7) from recall, and the outline was not checked against the regulation's text item by item.`, changeNote: "The 316.20(b)(5) clinical-superiority part is now coded 3.1, beside the scientific rationale. The 316.20(b)(6) orphan-subset part is now 4.1, beside the prevalence. Both were 7 and 8, which sorted after the literature references.", minted: '2026-10-19' },
  { docType: 'designation', agency: 'fda', version: 'fda-btd-request-v1.2', label: 'Breakthrough Therapy Designation Request × FDA · FD&C Act 506(a)', sourceBasis: 'reasoned_construction', confidence: 'low', supersedes: 'fda-btd-request-v1.1', basisNote: `${BLUEPRINT} Its parts follow the FD&C Act 506(a)(1) criteria, recalled; the statute was not re-read.`, changeNote: "The substantial-improvement criterion is now coded 5.1, under the preliminary clinical evidence it is shown from, so code order is document order. It was 7, which sorted after the development plan.", minted: '2026-10-19' },
  { docType: 'fast_track', agency: 'fda', version: 'fda-fast-track-request-v1.0', label: 'Fast Track Designation Request × FDA · FD&C Act 506(b)', sourceBasis: 'reasoned_construction', confidence: 'low', supersedes: null, basisNote: `${BLUEPRINT} Its parts follow the FD&C Act 506(b)(1) criteria, recalled; the statute was not re-read.` },
  { docType: 'rmat', agency: 'fda', version: 'fda-rmat-request-v1.1', label: 'RMAT Designation Request × FDA · FD&C Act 506(g)', sourceBasis: 'reasoned_construction', confidence: 'low', supersedes: 'fda-rmat-request-v1.0', basisNote: `${BLUEPRINT} Its parts follow the FD&C Act 506(g)(1) criteria and the 506(g)(8) definition, recalled; the statute was not re-read.`, changeNote: "Regenerative medicine therapy eligibility is now coded 2.1, under the product it describes; it was 8, which sorted last. Unmet medical need now comes before the evidence for it.", minted: '2026-10-19' },
  { docType: 'psp', agency: 'fda', version: 'fda-psp-v1.0', label: 'Pediatric Study Plan × FDA · FD&C Act 505B(e)', sourceBasis: 'reasoned_construction', confidence: 'low', supersedes: null, basisNote: BLUEPRINT },
  { docType: 'csr', agency: 'ich', version: 'ich-e3-v1.0', label: 'Clinical Study Report × ICH E3', sourceBasis: 'harmonised_standard', confidence: 'medium', supersedes: 'ich-m4-v2.0', basisNote: 'ICH E3 headings to the depth E3 numbers them, from the platform\'s E3 tree; each heading is recalled, not re-read against the guideline text.' },
  { docType: 'protocol', agency: 'ich', version: 'ich-m11-v1.0', label: 'Clinical Trial Protocol × ICH M11 (CeSHarP)', sourceBasis: 'harmonised_standard', confidence: 'high', supersedes: 'ich-m4-v2.0', basisNote: 'ICH M11 template level 1 and 2 headings, from the platform\'s M11 record, which was checked against the regulator\'s text.' },
  { docType: 'ib', agency: 'ich', version: 'ich-e6r3-appendix-a-v1.0', label: 'Investigator\'s Brochure × ICH E6(R3) Appendix A', sourceBasis: 'harmonised_standard', confidence: 'medium', supersedes: 'ich-m4-v2.0', basisNote: 'ICH E6(R3) Appendix A content headings, recalled; the section numbers are the platform library\'s ordinals, not E6 numbering.' },
  { docType: 'sap', agency: 'ich', version: 'c2c-sap-v1.0', label: 'Statistical Analysis Plan × ICH E9', sourceBasis: 'reasoned_construction', confidence: 'low', supersedes: null, basisNote: BLUEPRINT },
  { docType: 'icf', agency: 'ich', version: 'c2c-icf-v1.2', label: 'Informed Consent Form × 21 CFR 50.25 / ICH E6(R3)', sourceBasis: 'reasoned_construction', confidence: 'low', supersedes: 'c2c-icf-v1.1', basisNote: BLUEPRINT, changeNote: "The 50.25(c) and 50.25(b) parts (11, 12) move after the signatures (10), where their codes sort. A reader that orders sections by code had already put them there.", minted: '2026-10-19' },
  { docType: 'dsur', agency: 'ich', version: 'ich-e2f-v1.0', label: 'DSUR × ICH E2F', sourceBasis: 'harmonised_standard', confidence: 'medium', supersedes: null, basisNote: 'ICH E2F section headings, recalled from the guideline; not re-read against its text.' },
  { docType: 'psur', agency: 'ema', version: 'ich-e2c-r2-v2.1', label: 'PSUR / PBRER × EMA · ICH E2C(R2)', sourceBasis: 'harmonised_standard', confidence: 'medium', supersedes: 'ich-e2c-r2-v2.0', basisNote: 'ICH E2C(R2) title page, executive summary, §1–§20 and the numbered subsections of §5–§7 and §16–§18 (EU GVP Module VII), recalled; not re-read against the guideline text.', changeNote: 'The title page, executive summary and §20 appendices are added. §8-§12 are now required (state none if none), because GVP Module VII asks for every section. The numbered subsections of §5, §6, §7, §16, §17 and §18 are listed.' },
  ...REGIONAL_DEVICE_APPLICATION_CLASSES.map((c): FilingClassPackSpec => ({
    docType: c.docType,
    agency: c.packAgency,
    version: `${c.packAgency}-${c.docType.replace(/_/g, '-')}-preparation-v1.0`,
    label: `${getApplicationType(c.registryId)!.displayName} · working outline`,
    sourceBasis: 'reasoned_construction', confidence: 'low', supersedes: null,
    minted: '2026-10-20',
    basisNote: 'Platform working authoring groups, not a verified current agency form or a complete legal requirement set. All headings remain optional; applicability, evidence and current recipient instructions require assessment.',
  })),
];

const SPEC_BY_DOC_TYPE: ReadonlyMap<string, FilingClassPackSpec> = new Map(FILING_CLASS_PACKS.map((p) => [p.docType, p]));

export function filingClassPackSpec(docType: string): FilingClassPackSpec | undefined {
  return SPEC_BY_DOC_TYPE.get(docType);
}

/** The template whose outline a class's pack holds; the CSR is read from the E3 tree instead. */
async function sourceTemplate(docType: string): Promise<DocumentTemplateStructure> {
  const documentClass = FILING_DOCUMENT_CLASSES.find((c) => c.docType === docType);
  const applicationClass = regionalDeviceApplicationClassOf(docType);
  const registryId = documentClass?.registryIds[0] ?? applicationClass?.registryId;
  if (!registryId) throw new Error(`No filing class '${docType}'.`);
  const template = await getRegistryDocumentTemplate(registryId);
  if (!template) throw new Error(`${registryId} has no outline, so the '${docType}' pack cannot be minted.`);
  return template;
}

function flatten(sections: TemplateSection[], parent: string | null, rows: PackSectionRow[]): void {
  for (const s of sections) {
    rows.push({ key: s.number, parent_key: parent, label: s.heading, mandatory: s.required, path_order: rows.length + 1 });
    if (s.subsections?.length) flatten(s.subsections, s.number, rows);
  }
}

/** The rule-pack rows a class's pack holds, in outline order. Throws on a duplicate or empty key. */
export async function filingClassPackSections(docType: string): Promise<PackSectionRow[]> {
  const rows: PackSectionRow[] = [];
  if (docType === 'csr') {
    for (const s of ICH_E3_GUIDANCE) {
      rows.push({ key: s.number, parent_key: e3ParentNumber(s.number), label: s.title, mandatory: s.applies === 'always', path_order: rows.length + 1 });
    }
  } else {
    const template = await sourceTemplate(docType);
    flatten([...(template.frontMatter ?? []), ...template.sections], null, rows);
    // A template that lists a numbered outline flat (the M11 protocol's "1",
    // "1.1", "1.2") nests each section under the dotted prefix that is itself a
    // key, so the Vault shows the document's own hierarchy, not one long list.
    const present = new Set(rows.map((r) => r.key));
    for (const r of rows) {
      if (r.parent_key !== null) continue;
      const i = r.key.lastIndexOf('.');
      if (i > 0 && present.has(r.key.slice(0, i))) r.parent_key = r.key.slice(0, i);
    }
  }
  const keys = new Set<string>();
  if (rows.length === 0) throw new Error(`The '${docType}' outline has no sections.`);
  for (const r of rows) {
    if (!r.key || !r.label) throw new Error(`The '${docType}' outline has a section with no key or label.`);
    if (keys.has(r.key)) throw new Error(`The '${docType}' outline repeats the key '${r.key}'.`);
    keys.add(r.key);
  }
  return rows;
}

/** governing_rule: the regulatory basis the outline's own template states. */
export async function filingClassPackGoverningRule(docType: string): Promise<string> {
  if (docType === 'csr') return 'ICH E3 — Structure and Content of Clinical Study Reports (Step 4); ICH E3 Q&A (R1)';
  return (await sourceTemplate(docType)).regulatoryBasis;
}

/** Where the outline was read from, for the uncertainties sentence. */
export async function filingClassPackSource(docType: string): Promise<string> {
  if (docType === 'csr') return 'server/services/ind/ctd/csr-e3-guidance.ts ICH_E3_GUIDANCE';
  const t = await sourceTemplate(docType);
  const src = t.outlineSource;
  if (!src) return `server/services/market-specs/document-template-library.ts ${t.id}`;
  return 'blueprintId' in src ? `${src.kind} ${src.blueprintId}` : `${src.kind} ${src.record}`;
}

/** The pack's uncertainties: its basis, where it was minted from, and what was not done. */
export async function filingClassPackUncertainties(spec: FilingClassPackSpec): Promise<string> {
  return `${spec.basisNote} Minted ${filingClassPackMinted(spec)} from ${await filingClassPackSource(spec.docType)}. ` +
    (regionalDeviceApplicationClassOf(spec.docType)
      ? 'The outline was not independently checked against current regulator or certification-body requirements. This pack creates no submission package or transport. '
      : 'The regulator\'s text was not re-read for this pack (regulator hosts are unreachable from the build environment). ') +
    'Not reviewed by a regulatory professional.';
}
