/**
 * CSR slice 8 (2026-10-29): the §16.2 patient data listings, generated row by
 * row from the subject-level source the run retained (csr-source.v1, derived
 * from ADaM by adam-source-derivation.ts) and, for laboratory values, the ADLB
 * dataset itself.
 *
 * Each listing is a generator: rows are produced as the PDF writer draws them,
 * so a listing of hundreds of thousands of rows is never materialized as a
 * list of cells. Subjects are listed by treatment group, then subject id.
 *
 * Nothing is inferred. A value the source does not record reads "not
 * recorded"; a column E3 asks for that the contract does not carry (the
 * verbatim term, onset and end study day) is named in the listing's footnote,
 * not filled. A listing whose source is absent is not generated: the assembly
 * lists it as missing. A row naming a subject the source does not hold is
 * refused (CSR_ASSEMBLY_SUBJECT_UNKNOWN), never listed.
 */
import type { CsrSourceEnvelope } from '../../../shared/csr-source-input.js';
import type { AdamDataset, AdamRow } from './adam-dataset-reader.js';
import { NOT_RECORDED } from '../csr-tabulation-builders.js';
import { adamDate } from './narrative-subject-facts.js';
import type { CsrListingAppendix } from './csr-assembly-plan.js';

export type ListingStudy = CsrSourceEnvelope['studyData'];
export type ListingParticipant = CsrSourceEnvelope['participants'][number];
export interface ProtocolDeviation { subjectId: string; category: string; description: string; important?: boolean }

export interface CsrListingSource {
  study: ListingStudy;
  /** Population flags (for §16.2.3); the retained run's study data does not carry them. */
  participants?: readonly ListingParticipant[];
  /** The ADLB dataset (for §16.2.8). */
  laboratory?: AdamDataset;
  /** Supplied protocol deviations (§16.2.2); an empty array records that there were none. */
  protocolDeviations?: readonly ProtocolDeviation[];
}

export interface ListingRow { subjectId: string; armId: string; cells: string[]; bookmark?: { title: string; level: number } }
export interface ListingDefinition {
  number: CsrListingAppendix;
  headers: string[];
  widths: number[];
  footnotes: string[];
  rows: () => Generator<ListingRow>;
  /** Printed when the source records no row (an empty, declared listing), never left blank. */
  emptyStatement: string;
}

export class CsrListingError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = 'CsrListingError'; }
}

export const STATUS_LABEL: Readonly<Record<ListingStudy['disposition'][number]['status'], string>> = Object.freeze({
  completed: 'Completed', discontinued: 'Discontinued', 'screen-failed': 'Screen failure',
  'lost-to-followup': 'Lost to follow-up', death: 'Death', other: 'Other',
});
export const yesNo = (value: boolean | undefined) => (value === undefined ? NOT_RECORDED : value ? 'Yes' : 'No');
export const orNotRecorded = (value: string | number | undefined | null) =>
  (value === undefined || value === null || value === '' ? NOT_RECORDED : String(value));

/** Subject → arm, from every subject-level domain; a subject with two arms is refused. */
export function subjectArms(source: CsrListingSource): Map<string, string> {
  const arms = new Map<string, string>();
  const add = (subjectId: string | undefined, armId: string) => {
    if (!subjectId) return;
    const known = arms.get(subjectId);
    if (known && known !== armId) throw new CsrListingError('CSR_ASSEMBLY_SUBJECT_ARM_CONFLICT', 'A subject is recorded in two treatment groups.');
    arms.set(subjectId, armId);
  };
  for (const r of source.participants ?? []) add(r.subjectId, r.armId);
  for (const r of source.study.disposition) add(r.subjectId, r.armId);
  for (const r of source.study.demographics) add(r.subjectId, r.armId);
  return arms;
}

/** Treatment-group order, then subject id (numeric-aware), for every listing. */
function subjectOrder(source: CsrListingSource, arms: Map<string, string>) {
  const armIndex = new Map(source.study.treatmentArms.map((a, i) => [a.armId, i]));
  return (a: string, b: string) => (armIndex.get(arms.get(a)!)! - armIndex.get(arms.get(b)!)!) || a.localeCompare(b, 'en', { numeric: true });
}

/** Adds the group and subject bookmarks as rows begin a new group or subject. */
function marker(source: CsrListingSource) {
  const names = new Map(source.study.treatmentArms.map(a => [a.armId, a.armName]));
  let arm = '', subject = '';
  return (row: Omit<ListingRow, 'bookmark'>): ListingRow => {
    if (row.armId !== arm) { arm = row.armId; subject = row.subjectId; return { ...row, bookmark: { title: names.get(row.armId) ?? row.armId, level: 2 } }; }
    if (row.subjectId !== subject) { subject = row.subjectId; return { ...row, bookmark: { title: `Subject ${row.subjectId}`, level: 3 } }; }
    return row;
  };
}

function* bySubject<T extends { subjectId?: string }>(records: readonly T[], source: CsrListingSource, arms: Map<string, string>): Generator<[string, T[]]> {
  const groups = new Map<string, T[]>();
  for (const r of records) {
    if (!r.subjectId || !arms.has(r.subjectId)) throw new CsrListingError('CSR_ASSEMBLY_SUBJECT_UNKNOWN', 'A listed record names a subject the source does not hold.');
    const list = groups.get(r.subjectId) ?? [];
    list.push(r);
    groups.set(r.subjectId, list);
  }
  for (const id of [...groups.keys()].sort(subjectOrder(source, arms))) yield [id, groups.get(id)!];
}

function armName(source: CsrListingSource, armId: string): string {
  return source.study.treatmentArms.find(a => a.armId === armId)?.armName ?? armId;
}

function discontinued(source: CsrListingSource, arms: Map<string, string>): ListingDefinition {
  return { number: '16.2.1', headers: ['Treatment group', 'Subject', 'Disposition', 'Reason as recorded'], widths: [3, 3, 2.5, 5],
    footnotes: ['Every subject whose final disposition is other than completed, from the source disposition records. The date and study day of discontinuation are not in the supplied source and are not shown.'],
    emptyStatement: 'No subject discontinued in the supplied source.',
    rows: function* () {
      const mark = marker(source);
      const records = source.study.disposition.filter(r => r.status !== 'completed');
      for (const [subjectId, list] of bySubject(records, source, arms)) {
        for (const r of list) yield mark({ subjectId, armId: r.armId, cells: [armName(source, r.armId), subjectId, STATUS_LABEL[r.status], orNotRecorded(r.reason)] });
      }
    } };
}

function deviations(source: CsrListingSource, arms: Map<string, string>, supplied: readonly ProtocolDeviation[]): ListingDefinition {
  return { number: '16.2.2', headers: ['Treatment group', 'Subject', 'Category', 'Deviation', 'Important'], widths: [3, 3, 3, 7, 1.6],
    footnotes: ['Protocol deviations as supplied with the source; the platform does not classify deviations.'],
    emptyStatement: 'The supplied source records no protocol deviation.',
    rows: function* () {
      const mark = marker(source);
      for (const [subjectId, list] of bySubject(supplied, source, arms)) {
        const armId = arms.get(subjectId)!;
        for (const d of list) yield mark({ subjectId, armId, cells: [armName(source, armId), subjectId, d.category, d.description, yesNo(d.important)] });
      }
    } };
}

const EFFICACY_SETS = [['itt', 'Intent-to-treat'], ['mitt', 'Modified intent-to-treat'], ['perProtocol', 'Per protocol']] as const;

function efficacyExclusions(source: CsrListingSource, arms: Map<string, string>, participants: readonly ListingParticipant[]): ListingDefinition {
  return { number: '16.2.3', headers: ['Treatment group', 'Subject', 'Analysis set excluded from', 'Reason'], widths: [3, 3, 4, 5],
    footnotes: ['Randomized subjects whose population flag for an efficacy analysis set is No. The reason for exclusion is not in the supplied source.'],
    emptyStatement: 'No randomized subject was excluded from an efficacy analysis set in the supplied source.',
    rows: function* () {
      const mark = marker(source);
      const excluded = participants.filter(p => p.randomized && EFFICACY_SETS.some(([key]) => p[key] === false));
      for (const [subjectId, [p]] of bySubject(excluded, source, arms)) {
        for (const [key, label] of EFFICACY_SETS) {
          if (p[key] === false) yield mark({ subjectId, armId: p.armId, cells: [armName(source, p.armId), subjectId, label, `${NOT_RECORDED} in the source`] });
        }
      }
    } };
}

function demographics(source: CsrListingSource, arms: Map<string, string>): ListingDefinition {
  return { number: '16.2.4', headers: ['Treatment group', 'Subject', 'Age', 'Sex', 'Race', 'Ethnicity', 'Weight', 'BMI'], widths: [2.6, 2.8, 1, 1, 2.6, 2.6, 1.6, 1.6],
    footnotes: ['Each subject’s demographic and baseline data as recorded in the source (the variables summarised in Table 14.1.3).'],
    emptyStatement: 'The supplied source records no demographic data.',
    rows: function* () {
      const mark = marker(source);
      for (const [subjectId, list] of bySubject(source.study.demographics, source, arms)) {
        for (const d of list) {
          yield mark({ subjectId, armId: d.armId, cells: [armName(source, d.armId), subjectId, String(d.age), d.sex,
            orNotRecorded(d.race), orNotRecorded(d.ethnicity), orNotRecorded(d.weight), orNotRecorded(d.bmi)] });
        }
      }
    } };
}

function adverseEvents(source: CsrListingSource, arms: Map<string, string>): ListingDefinition {
  return { number: '16.2.7', headers: ['Treatment group', 'Subject', 'System organ class', 'Preferred term', 'Severity', 'Serious', 'Relationship', 'Outcome', 'Led to discontinuation'],
    widths: [2.4, 2.4, 3.6, 3.2, 1.5, 1.3, 1.7, 1.8, 1.9],
    footnotes: ['Treatment-emergent adverse events from the source, by subject. The investigator’s verbatim term and the onset and end study days are not in the supplied source (csr-source.v1) and are not shown.'],
    emptyStatement: 'The supplied source records no treatment-emergent adverse event.',
    rows: function* () {
      const mark = marker(source);
      for (const [subjectId, list] of bySubject(source.study.adverseEvents, source, arms)) {
        for (const e of list) {
          yield mark({ subjectId, armId: e.armId, cells: [armName(source, e.armId), subjectId, e.soc, e.pt, e.severity, yesNo(e.serious), e.related,
            orNotRecorded(e.outcome), yesNo(e.ledToDiscontinuation)] });
        }
      }
    } };
}

const LAB_REQUIRED = ['USUBJID', 'ANRIND'];
const cell = (row: AdamRow, name: string) => {
  const value = row[name];
  return value === null || value === undefined || (typeof value === 'string' && !value.trim()) ? '' : String(value).trim();
};
export function labParameter(row: AdamRow): string { return cell(row, 'PARAM') || cell(row, 'PARAMCD'); }
export function labValue(row: AdamRow): string { return orNotRecorded(cell(row, 'AVAL') || cell(row, 'AVALC')); }
/** ADT as an ISO date (an XPT date is a SAS day count, never shown as a bare number); text that is not a full date is shown as recorded. */
export function labDate(row: AdamRow): string {
  const iso = adamDate(row.ADT);
  if (iso) return iso;
  return typeof row.ADT === 'string' ? orNotRecorded(cell(row, 'ADT')) : NOT_RECORDED;
}
/** ABLFL: 'Y' is the baseline record and blank is not; a dataset without ABLFL records neither, so nothing is shown as No. */
export function labBaseline(ds: AdamDataset, row: AdamRow): string {
  if (!ds.columns.includes('ABLFL')) return NOT_RECORDED;
  return cell(row, 'ABLFL').toUpperCase() === 'Y' ? 'Yes' : 'No';
}

/** ADLB rows grouped by subject, ordered by parameter, date and then dataset order. */
function labIndex(ds: AdamDataset, arms: Map<string, string>): Map<string, number[]> {
  const missing = LAB_REQUIRED.filter(v => !ds.columns.includes(v));
  if (missing.length || !(ds.columns.includes('PARAM') || ds.columns.includes('PARAMCD'))) throw new CsrListingError('CSR_ASSEMBLY_ADLB_INVALID', `ADLB lacks ${[...missing, 'PARAM'].join(', ')}; the laboratory listing requires it.`);
  const index = new Map<string, number[]>();
  ds.rows.forEach((row, i) => {
    const subjectId = cell(row, 'USUBJID');
    if (!arms.has(subjectId)) throw new CsrListingError('CSR_ASSEMBLY_SUBJECT_UNKNOWN', `ADLB[${i + 1}].USUBJID names a subject the source does not hold.`);
    const list = index.get(subjectId) ?? [];
    list.push(i);
    index.set(subjectId, list);
  });
  for (const list of index.values()) {
    list.sort((a, b) => labParameter(ds.rows[a]).localeCompare(labParameter(ds.rows[b])) || labDate(ds.rows[a]).localeCompare(labDate(ds.rows[b])) || a - b);
  }
  return index;
}

function laboratory(source: CsrListingSource, arms: Map<string, string>, ds: AdamDataset): ListingDefinition {
  return { number: '16.2.8', headers: ['Treatment group', 'Subject', 'Parameter', 'Date', 'Visit', 'Baseline', 'Value', 'Reference range indicator'],
    widths: [2.4, 2.4, 4.2, 1.8, 1.8, 1.3, 1.5, 2],
    footnotes: ['Every laboratory record in the ADLB dataset, by subject, parameter and date. Baseline is ABLFL (not recorded when the dataset has no ABLFL); the reference range indicator is ANRIND as recorded.'],
    emptyStatement: 'The supplied ADLB dataset holds no record.',
    rows: function* () {
      const mark = marker(source);
      const index = labIndex(ds, arms);
      for (const subjectId of [...index.keys()].sort(subjectOrder(source, arms))) {
        const armId = arms.get(subjectId)!;
        for (const i of index.get(subjectId)!) {
          const row = ds.rows[i];
          yield mark({ subjectId, armId, cells: [armName(source, armId), subjectId, labParameter(row), labDate(row), orNotRecorded(cell(row, 'AVISIT')),
            labBaseline(ds, row), labValue(row), orNotRecorded(cell(row, 'ANRIND'))] });
        }
      }
    } };
}

export interface ListingPlan { generated: ListingDefinition[]; unavailable: Array<{ number: CsrListingAppendix; reason: string }> }

/** The listings this source can produce, and why each other one cannot be. */
export function planListings(source: CsrListingSource): ListingPlan {
  const arms = subjectArms(source);
  const generated: ListingDefinition[] = [discontinued(source, arms), demographics(source, arms), adverseEvents(source, arms)];
  const unavailable: ListingPlan['unavailable'] = [];
  if (source.protocolDeviations) generated.push(deviations(source, arms, source.protocolDeviations));
  else unavailable.push({ number: '16.2.2', reason: 'No protocol deviations were supplied with the source.' });
  if (source.participants) generated.push(efficacyExclusions(source, arms, source.participants));
  else unavailable.push({ number: '16.2.3', reason: 'The source supplied carries no subject population flags.' });
  unavailable.push({ number: '16.2.5', reason: 'The source carries no subject-level compliance or drug concentration data.' });
  unavailable.push({ number: '16.2.6', reason: 'The source carries no subject-level efficacy response data (efficacy is imported as the SAP’s summary results).' });
  if (source.laboratory) generated.push(laboratory(source, arms, source.laboratory));
  else unavailable.push({ number: '16.2.8', reason: 'No ADLB dataset was supplied.' });
  generated.sort((a, b) => a.number.localeCompare(b.number, 'en', { numeric: true }));
  return { generated, unavailable };
}
