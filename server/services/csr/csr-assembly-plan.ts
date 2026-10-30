/**
 * CSR slice 8 (2026-10-29, docs/design/CSR_END_TO_END_2026-10-29.md): how an
 * imported CSR is laid out as eCTD leaves under Module 5.3.5.x.
 *
 * - §14: the engine's tables (csr-tabulation-builders.ts buildCSRTables),
 *   numbered by slice 4's convention in csr-e3-sections-appendices.ts §14
 *   ("14.1.x demographic, 14.2.x efficacy, 14.3.1.x adverse events, 14.3.2
 *   deaths and serious events, … 14.3.5.x other safety").
 * - §16.1.x and §16.3: documents the sponsor supplies (protocol, sample CRF,
 *   investigator list, signatures, SAP, CRFs). The platform never composes
 *   one; an unsupplied document is listed as missing.
 * - §16.2.x: subject listings generated from the source the run retained.
 * - Every leaf's Study Tagging File role, from the reviewed file-tag list
 *   STF_DOCUMENT_FILE_TAGS (stf-generator.ts; recall, not yet checked against
 *   the ICH STF specification, as that list says).
 *
 * Pure: no DB, no filesystem, no model. Every heading title comes from
 * ICH_E3_GUIDANCE, the platform's one E3 tree.
 */
import { ICH_E3_GUIDANCE, getE3Section } from '../ind/ctd/csr-e3-guidance.js';
import { STF_DOCUMENT_FILE_TAGS } from '../ectd/stf-generator.js';
import { FILENAME_PATTERN, FILENAME_RULE_TEXT } from '../../../shared/regulatory/ectd-leaf-rules.js';
import { csrSectionTableKeys, CSR_TABLE_KEYS, type CsrTableKey } from './cortex-authoring-context.js';

export type CsrTable = { title: string; headers: string[]; rows: string[][] };

/** The CTD sections a CSR is filed under (ICH M4E: 5.3.5.1 controlled, 5.3.5.2 uncontrolled, 5.3.5.3 integrated analyses, 5.3.5.4 other). */
export const CSR_CTD_SECTIONS = ['5.3.5.1', '5.3.5.2', '5.3.5.3', '5.3.5.4'] as const;
export type CsrCtdSection = typeof CSR_CTD_SECTIONS[number];

/**
 * The STF file-tag of the body and of the §14 tables leaf, from the reviewed
 * recall list STF_DOCUMENT_FILE_TAGS (stf-generator.ts, "not read").
 * UNVERIFIED, with a lead against it (2026-10-30): a web search summary of
 * FDA's Study Data Technical Conformance Guide names the study-report tags
 * "pre-clinical-study-report", "legacy-clinical-study-report" and
 * "study-report-body", not "study-report". A summary is not the source, so the
 * value is unchanged. It is settled by reading the ICH STF valid values
 * (fda.gov/media/159383; ICH valid-values.xml), which this environment's
 * network policy refuses (fda.gov, admin.ich.org). If the source says
 * "study-report-body", every CSR STF written so far carries an invalid tag.
 */
export const CSR_BODY_FILE_TAG = 'study-report';

/** §14 numbering of every engine table (slice 4's convention). */
export const CSR_TFL_NUMBERS: Readonly<Record<CsrTableKey, string>> = Object.freeze({
  disposition: '14.1.1', analysisPopulations: '14.1.2', demographics: '14.1.3', concomitantMedications: '14.1.4',
  primaryEfficacy: '14.2.1', secondaryEfficacy: '14.2.2',
  aeOverallSummary: '14.3.1.1', aeBySOC: '14.3.1.2', aeTopPT: '14.3.1.3',
  deathsSAEsDiscontinuations: '14.3.2.1',
  exposure: '14.3.5.1', labShifts: '14.3.5.2', vitalSigns: '14.3.5.3',
});

/** Appendices a sponsor supplies as documents; the platform never writes them. */
export const CSR_SUPPLIED_APPENDICES = Object.freeze({
  '16.1.1': 'protocol-or-amendment', '16.1.2': 'sample-case-report-form', '16.1.3': 'iec-irb-consent-form-list',
  '16.1.4': 'list-description-investigator-site', '16.1.5': 'signatures-investigators',
  '16.1.6': 'list-patients-with-batches', '16.1.7': 'randomisation-scheme', '16.1.8': 'audit-certificates-report',
  '16.1.9': 'statistical-methods-interim-analysis-plan', '16.1.10': 'inter-laboratory-standardisation-methods-quality-assurance',
  '16.1.11': 'publications-based-on-study', '16.1.12': 'publications-referenced-in-report', '16.3': 'case-report-forms',
} as const);

/** §16.2 patient data listings and their STF file-tags. */
export const CSR_LISTING_APPENDICES = Object.freeze({
  '16.2.1': 'discontinued-patients', '16.2.2': 'protocol-deviations', '16.2.3': 'patients-excluded-from-efficacy-analysis',
  '16.2.4': 'demographic-data', '16.2.5': 'compliance-and-drug-concentration-data', '16.2.6': 'individual-efficacy-response-data',
  '16.2.7': 'adverse-event-listings', '16.2.8': 'listing-individual-laboratory-measurements-by-patient',
} as const);

export type CsrSuppliedAppendix = keyof typeof CSR_SUPPLIED_APPENDICES;
export type CsrListingAppendix = keyof typeof CSR_LISTING_APPENDICES;
export type CsrAppendixNumber = CsrSuppliedAppendix | CsrListingAppendix;

const FILE_SUFFIX: Readonly<Record<CsrAppendixNumber, string>> = Object.freeze({
  '16.1.1': 'protocol', '16.1.2': 'sample-crf', '16.1.3': 'iec-irb', '16.1.4': 'investigators', '16.1.5': 'signatures',
  '16.1.6': 'batches', '16.1.7': 'randomisation', '16.1.8': 'audit-certificates', '16.1.9': 'statistical-methods',
  '16.1.10': 'lab-standardisation', '16.1.11': 'publications', '16.1.12': 'references', '16.3': 'crfs',
  '16.2.1': 'discontinued', '16.2.2': 'deviations', '16.2.3': 'efficacy-exclusions', '16.2.4': 'demographics',
  '16.2.5': 'compliance', '16.2.6': 'efficacy-response', '16.2.7': 'adverse-events', '16.2.8': 'laboratory',
});

export const CSR_BODY_FILE = 'csr-body.pdf';
export const CSR_TABLES_FILE = 'csr-14-tables.pdf';

/**
 * §14.3.3, the patient narratives the narrative job lands (csr-narrative-job.ts),
 * filed as their own leaf (D18, 2026-10-30): they can run to hundreds of pages,
 * so they are neither drawn into the body nor appended to the §14 tables leaf.
 */
export const CSR_NARRATIVES_SECTION = '14.3.3';
export const CSR_NARRATIVES_FILE = 'csr-14-3-3-narratives.pdf';
/**
 * The reviewed STF list (STF_DOCUMENT_FILE_TAGS, recall) has no role for E3
 * narratives; 'subject-profiles' is patient profiles, a different document.
 * §14.3.3 is part of the report, so it is filed as the §14 tables leaf is,
 * 'study-report'. A narratives-specific role, if the ICH STF specification
 * has one, is unverified until that list is checked against it.
 */
export const CSR_NARRATIVES_FILE_TAG = CSR_BODY_FILE_TAG;
/** The named destination of one subject's narrative in the §14.3.3 leaf. */
export const narrativeDestination = (subjectId: string) => `N-${subjectId}`;
/** What an assembly may declare not applicable, with a reason: a §16 appendix, or §14.3.3. */
export type CsrDeclarable = CsrAppendixNumber | typeof CSR_NARRATIVES_SECTION;

/** The leaf file name of an appendix: the study's folder holds them, so no study id is repeated. */
export function appendixFileName(number: CsrAppendixNumber): string {
  const name = `csr-${number.replace(/\./g, '-')}-${FILE_SUFFIX[number]}.pdf`;
  if (!FILENAME_PATTERN.test(name)) throw new Error(`Appendix ${number} file name "${name}" breaks the eCTD file-name rule (${FILENAME_RULE_TEXT}).`);
  return name;
}

export function appendixFileTag(number: CsrAppendixNumber): string {
  return (CSR_SUPPLIED_APPENDICES as Record<string, string>)[number] ?? (CSR_LISTING_APPENDICES as Record<string, string>)[number];
}

/** E3's own applicability for a heading ('always', 'when-applicable', 'authority-dependent'). */
export function appendixApplies(number: string): string {
  const applies = getE3Section(number)?.applies;
  if (typeof applies !== 'string') throw new Error(`ICH E3 heading ${number} is not in ICH_E3_GUIDANCE.`);
  return applies;
}

export function e3Title(number: string): string {
  const section = getE3Section(number);
  if (!section) throw new Error(`ICH E3 heading ${number} is not in ICH_E3_GUIDANCE.`);
  return section.title;
}

/** Compare dotted numbers numerically: 14.3.1.2 < 14.3.1.10. */
export function compareDotted(a: string, b: string): number {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? -1) - (pb[i] ?? -1);
    if (d) return d;
  }
  return 0;
}

export interface PlannedTfl { key: CsrTableKey; number: string; caption: string; destination: string; table: CsrTable }

export const tflDestination = (number: string) => `T${number}`;
export const listingDestination = (number: string) => `L${number}`;
export const headingDestination = (number: string) => `H${number}`;

/** The engine tables present, numbered and ordered for §14. A table missing from the run is not invented. */
export function planTfls(tables: Partial<Record<CsrTableKey, CsrTable>>): PlannedTfl[] {
  return CSR_TABLE_KEYS.filter(key => tables[key])
    .map(key => {
      const number = CSR_TFL_NUMBERS[key];
      const table = tables[key]!;
      return { key, number, caption: `Table ${number} ${table.title}`, destination: tflDestination(number), table };
    })
    .sort((a, b) => compareDotted(a.number, b.number));
}

/** The §14 headings (14, 14.1, 14.3.1, …) above the planned tables, in report order. */
export function tflHeadings(tfls: readonly PlannedTfl[]): Array<{ number: string; title: string }> {
  const wanted = new Set<string>(['14']);
  for (const t of tfls) {
    const parts = t.number.split('.');
    for (let n = 2; n < parts.length; n++) wanted.add(parts.slice(0, n).join('.'));
  }
  return ICH_E3_GUIDANCE.filter(s => wanted.has(s.number)).map(s => ({ number: s.number, title: s.title }));
}

/** The §16.2 listings a section cites, by E3 cross-reference (the listing headings' `see`). */
const SECTION_LISTINGS: Readonly<Record<string, readonly CsrListingAppendix[]>> = Object.freeze({
  '10.1': ['16.2.1'], '10.2': ['16.2.2'], '11.1': ['16.2.3'], '11.2': ['16.2.4'], '11.4': ['16.2.6'],
  '12.2': ['16.2.7'], '12.4': ['16.2.8'],
});

/**
 * The outputs a body section is supported by: its engine tables (the evidence
 * map in cortex-authoring-context.ts) and its §16.2 listings. Sections that
 * read every table (§2, §13) cite none, so the synopsis is not padded.
 */
export function supportingOutputs(sectionNumber: string, tfls: readonly PlannedTfl[]): string[] {
  const keys = csrSectionTableKeys(sectionNumber);
  if (!/^1[0-2](\.\d+)?$/.test(sectionNumber) || keys.length === CSR_TABLE_KEYS.length) return [];
  const tables = tfls.filter(t => keys.includes(t.key) && t.key !== 'analysisPopulations').map(t => `Table ${t.number}`);
  const listings = (SECTION_LISTINGS[sectionNumber] ?? []).map(n => `Listing ${n}`);
  return [...tables, ...listings];
}

/** Assert the plan's tags are the reviewed STF list's own (a typo here would file a wrong role). */
export function assertKnownFileTags(): void {
  const tags = [CSR_BODY_FILE_TAG, CSR_NARRATIVES_FILE_TAG, ...Object.values(CSR_SUPPLIED_APPENDICES), ...Object.values(CSR_LISTING_APPENDICES)];
  const unknown = tags.filter(tag => !STF_DOCUMENT_FILE_TAGS.tags.includes(tag));
  if (unknown.length) throw new Error(`CSR assembly file-tags outside the reviewed STF list: ${unknown.join(', ')}`);
}
