/**
 * The governed rule pack each filing document class is scaffolded from.
 *
 * shared/regulatory/filing-document-classes.ts says which filings are a
 * document rather than an application. This module says what each one's pack
 * holds, and from where:
 *
 *   • the outline is `getRegistryDocumentTemplate` for the class's first
 *     registry id — the outline AnA and the Authoring template picker already
 *     serve — flattened into rule-pack rows; the CSR is the full ICH E3 tree
 *     (csr-e3-guidance.ts), where the template shows only its sixteen headings;
 *   • version, label and provenance are stated here, once, per class.
 *
 * The packs reach a database only through
 * migrations/20261018_filing_class_rule_packs.sql (CLAUDE.md Rule 1: reference
 * data deploys through a file in C2C_MIGRATION_FILES), which
 * scripts/db/emit-filing-class-packs.ts writes from this module.
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
  agency: 'fda' | 'ema' | 'ich';
  version: string;
  label: string;
  sourceBasis: PackSourceBasis;
  confidence: 'high' | 'medium' | 'low';
  /** The live version this one supersedes, when the class already had a pack. */
  supersedes: string | null;
  /** Why this basis and confidence: the first sentence of the pack's uncertainties. */
  basisNote: string;
}

const RECORD = 'An advisory platform record that cites the rule; its headings are recalled, not transcribed.';
const BLUEPRINT = 'A platform project blueprint: a reasoned construction against the obligation, not an enumerated structure.';

export const FILING_CLASS_PACKS: readonly FilingClassPackSpec[] = [
  { docType: 'pas', agency: 'fda', version: 'fda-pas-lifecycle-v1.0', label: 'PAS × FDA · Prior Approval Supplement · 21 CFR 314.70(b) / 601.12(b)', sourceBasis: 'reasoned_construction', confidence: 'low', supersedes: null, basisNote: `${RECORD} A BLA supplement (21 CFR 601.12(b)) shares the NDA record's parts; the BLA rule text was not re-read for it.` },
  { docType: 'cbe', agency: 'fda', version: 'fda-cbe-lifecycle-v1.0', label: 'CBE × FDA · CBE-30 / CBE-0 Supplement · 21 CFR 314.70(c)', sourceBasis: 'reasoned_construction', confidence: 'low', supersedes: null, basisNote: `${RECORD} One registry filing for two records: the shared parts are required, each variant's own parts are not.` },
  { docType: 'annual_report', agency: 'fda', version: 'fda-annual-report-lifecycle-v1.0', label: 'Annual Report × FDA · NDA/BLA · 21 CFR 314.81(b)(2)', sourceBasis: 'reasoned_construction', confidence: 'low', supersedes: null, basisNote: RECORD },
  { docType: 'rems', agency: 'fda', version: 'fda-rems-v1.0', label: 'REMS × FDA · FD&C Act 505-1', sourceBasis: 'reasoned_construction', confidence: 'low', supersedes: null, basisNote: BLUEPRINT },
  { docType: 'pader', agency: 'fda', version: 'fda-pader-v1.0', label: 'PADER × FDA · 21 CFR 314.80(c)(2)', sourceBasis: 'reasoned_construction', confidence: 'low', supersedes: null, basisNote: BLUEPRINT },
  { docType: 'ind_amendment', agency: 'fda', version: 'fda-ind-amendment-v1.0', label: 'IND Amendment × FDA · 21 CFR 312.30 / 312.31', sourceBasis: 'reasoned_construction', confidence: 'low', supersedes: null, basisNote: `${BLUEPRINT} Built from the IND lifecycle records' parts and scoped against 21 CFR 312.30 and 312.31.` },
  { docType: 'ind_safety_report', agency: 'fda', version: 'fda-ind-safety-report-v1.0', label: 'IND Safety Report × FDA · 21 CFR 312.32', sourceBasis: 'reasoned_construction', confidence: 'medium', supersedes: null, basisNote: `${BLUEPRINT} Its subtype-specific formats were checked against 21 CFR 312.32 on 2026-10-07.` },
  { docType: 'ind_annual_report', agency: 'fda', version: 'fda-ind-annual-report-lifecycle-v1.0', label: 'IND Annual Report × FDA · 21 CFR 312.33', sourceBasis: 'reasoned_construction', confidence: 'low', supersedes: null, basisNote: RECORD },
  { docType: 'briefing', agency: 'fda', version: 'fda-formal-meetings-2026-v1.0', label: 'Formal Meeting Package × FDA · Type A / B / C', sourceBasis: 'reasoned_construction', confidence: 'low', supersedes: 'fda-meeting-2024', basisNote: 'The type-neutral meeting-package core recalled from FDA\'s final formal-meetings guidance (Aug 2026); the guidance text was not re-read.' },
  { docType: 'orphan', agency: 'fda', version: 'fda-orphan-request-v1.0', label: 'Orphan Drug Designation Request × FDA · 21 CFR 316.20', sourceBasis: 'reasoned_construction', confidence: 'low', supersedes: null, basisNote: `${BLUEPRINT} 21 CFR 316.20(b) enumerates the request's contents; this outline was not checked against it item by item.` },
  { docType: 'designation', agency: 'fda', version: 'fda-expedited-designation-v1.0', label: 'Expedited Program Designation Request × FDA · BTD / Fast Track / RMAT', sourceBasis: 'reasoned_construction', confidence: 'low', supersedes: null, basisNote: BLUEPRINT },
  { docType: 'psp', agency: 'fda', version: 'fda-psp-v1.0', label: 'Pediatric Study Plan × FDA · FD&C Act 505B(e)', sourceBasis: 'reasoned_construction', confidence: 'low', supersedes: null, basisNote: BLUEPRINT },
  { docType: 'csr', agency: 'ich', version: 'ich-e3-v1.0', label: 'Clinical Study Report × ICH E3', sourceBasis: 'harmonised_standard', confidence: 'medium', supersedes: 'ich-m4-v2.0', basisNote: 'ICH E3 headings to the depth E3 numbers them, from the platform\'s E3 tree; each heading is recalled, not re-read against the guideline text.' },
  { docType: 'protocol', agency: 'ich', version: 'ich-m11-v1.0', label: 'Clinical Trial Protocol × ICH M11 (CeSHarP)', sourceBasis: 'harmonised_standard', confidence: 'high', supersedes: 'ich-m4-v2.0', basisNote: 'ICH M11 template level 1 and 2 headings, from the platform\'s M11 record, which was checked against the regulator\'s text.' },
  { docType: 'ib', agency: 'ich', version: 'ich-e6r3-appendix-a-v1.0', label: 'Investigator\'s Brochure × ICH E6(R3) Appendix A', sourceBasis: 'harmonised_standard', confidence: 'medium', supersedes: 'ich-m4-v2.0', basisNote: 'ICH E6(R3) Appendix A content headings, recalled; the section numbers are the platform library\'s ordinals, not E6 numbering.' },
  { docType: 'sap', agency: 'ich', version: 'c2c-sap-v1.0', label: 'Statistical Analysis Plan × ICH E9', sourceBasis: 'reasoned_construction', confidence: 'low', supersedes: null, basisNote: BLUEPRINT },
  { docType: 'icf', agency: 'ich', version: 'c2c-icf-v1.0', label: 'Informed Consent Form × 21 CFR 50.25 / ICH E6(R3)', sourceBasis: 'reasoned_construction', confidence: 'low', supersedes: null, basisNote: BLUEPRINT },
  { docType: 'dsur', agency: 'ich', version: 'ich-e2f-v1.0', label: 'DSUR × ICH E2F', sourceBasis: 'harmonised_standard', confidence: 'medium', supersedes: null, basisNote: 'ICH E2F section headings, recalled from the guideline; not re-read against its text.' },
  { docType: 'psur', agency: 'ema', version: 'ich-e2c-r2-v2.0', label: 'PSUR / PBRER × EMA · ICH E2C(R2)', sourceBasis: 'harmonised_standard', confidence: 'medium', supersedes: 'ich-e2c-r2', basisNote: 'ICH E2C(R2) §1–§19 headings (EU GVP Module VII), recalled; not re-read against the guideline text.' },
];

const SPEC_BY_DOC_TYPE: ReadonlyMap<string, FilingClassPackSpec> = new Map(FILING_CLASS_PACKS.map((p) => [p.docType, p]));

export function filingClassPackSpec(docType: string): FilingClassPackSpec | undefined {
  return SPEC_BY_DOC_TYPE.get(docType);
}

/** The template whose outline a class's pack holds; the CSR is read from the E3 tree instead. */
async function sourceTemplate(docType: string): Promise<DocumentTemplateStructure> {
  const documentClass = FILING_DOCUMENT_CLASSES.find((c) => c.docType === docType);
  if (!documentClass) throw new Error(`No filing document class '${docType}'.`);
  const registryId = documentClass.registryIds[0];
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
  return `${spec.basisNote} Minted 2026-10-18 from ${await filingClassPackSource(spec.docType)}. ` +
    'The regulator\'s text was not re-read for this pack (regulator hosts are unreachable from the build environment). ' +
    'Not reviewed by a regulatory professional.';
}
