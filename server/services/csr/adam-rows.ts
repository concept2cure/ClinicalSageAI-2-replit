/**
 * Row access and cross-dataset subject checks shared by the ADaM derivation
 * (adam-source-derivation.ts) and its safety domains (adam-safety-domains.ts).
 * CSR slice 6, 2026-10-29. Every failure is a typed AdamDerivationError.
 */
import type { CsrSourceEnvelope } from '../../../shared/csr-source-input.js';
import type { AdamDataset, AdamRow } from './adam-dataset-reader.js';
import { CsrSourceInputError } from './source-access.js';

export class AdamDerivationError extends CsrSourceInputError {
  constructor(code: string, message: string, path?: string) {
    super(422, `CSR_ADAM_${code}`, message, path ? [{ path, message }] : undefined);
    this.name = 'AdamDerivationError';
  }
}
export const refuse = (code: string, message: string, path?: string): never => { throw new AdamDerivationError(code, message, path); };

export interface AdamDatasets {
  ADSL: AdamDataset; ADAE: AdamDataset; ADEX?: AdamDataset; ADLB?: AdamDataset;
  ADVS?: AdamDataset; ADEG?: AdamDataset; ADCM?: AdamDataset; ADMH?: AdamDataset;
}
export type StudyData = CsrSourceEnvelope['studyData'];
export type Participant = CsrSourceEnvelope['participants'][number];
export type Status = StudyData['disposition'][number]['status'];
export interface Subject {
  participant: Participant; treatment: string; disposition: StudyData['disposition'][number];
  demographic: StudyData['demographics'][number] | null; perProtocol?: boolean;
}

// ── Row access ──────────────────────────────────────────────────────────────

export const where = (ds: AdamDataset, i: number, v: string) => `${ds.name}[${i + 1}].${v}`;
export const has = (ds: AdamDataset, v: string) => ds.columns.includes(v);
export function text(row: AdamRow, v: string): string {
  const value = row[v];
  return typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '';
}
/** A number, or a Dataset-JSON v1.1 decimal (a numeric string); null when blank. */
export function numeric(row: AdamRow, v: string): number | null {
  const value = row[v];
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && /^\s*-?\d+(\.\d+)?([eE][-+]?\d+)?\s*$/.test(value)) return Number(value);
  return null;
}
export function requireColumns(ds: AdamDataset, ...vars: string[]) {
  for (const v of vars) if (!has(ds, v)) refuse('VARIABLE_MISSING', `${ds.name} has no ${v} variable; the CSR derivation requires it.`, `${ds.name}.${v}`);
}
export function flag(ds: AdamDataset, row: AdamRow, i: number, v: string): boolean {
  const value = text(row, v).toUpperCase();
  if (value === 'Y') return true;
  if (value === 'N' || value === '') return false;
  return refuse('VALUE_UNMAPPED', `${v} must be Y, N or blank.`, where(ds, i, v));
}
export function required(ds: AdamDataset, row: AdamRow, i: number, v: string): string {
  return text(row, v) || refuse('VALUE_MISSING', `${v} is blank; the CSR derivation does not infer it.`, where(ds, i, v));
}
export function checkStudy(ds: AdamDataset, studyId: string) {
  if (!has(ds, 'STUDYID')) return;
  ds.rows.forEach((row, i) => { if (text(row, 'STUDYID') !== studyId) refuse('STUDY_MISMATCH', `${ds.name} names a different STUDYID from ADSL.`, where(ds, i, 'STUDYID')); });
}
export function expectDataset(ds: AdamDataset | undefined, name: string) {
  if (ds && ds.name !== name) refuse('DATASET_MISMATCH', `The file supplied as ${name} is the ${ds.name} dataset.`, name);
}

// ── Cross-dataset subject checks ────────────────────────────────────────────

/** The ADSL subject a row names; refused when ADSL does not list it, or when an
 * on-treatment row names a subject outside the safety population. */
export function subjectFor(ds: AdamDataset, row: AdamRow, i: number, subjects: Map<string, Subject>, onTreatment: boolean): Subject {
  const subject = subjects.get(text(row, 'USUBJID'))
    ?? refuse('SUBJECT_NOT_IN_ADSL', `A ${ds.name} row names a subject that ADSL does not list.`, where(ds, i, 'USUBJID'));
  if (onTreatment && !subject.participant.safety) {
    refuse('SUBJECT_NOT_IN_SAFETY_POPULATION', `A treatment-emergent ${ds.name} row names a subject outside the ADSL safety population (SAFFL).`, where(ds, i, 'USUBJID'));
  }
  return subject;
}

// ── Baseline and last on-treatment value (ADLB, ADVS, ADEG) ─────────────────

export interface Series { subject: Subject; parameter: string; baseline: AdamRow | null; onTreatment: Array<{ row: AdamRow; i: number }> }

export function seriesOf(ds: AdamDataset, subjects: Map<string, Subject>, value: string): Map<string, Series> {
  requireColumns(ds, 'USUBJID', 'PARAMCD', 'ABLFL', 'ONTRTFL', value);
  const series = new Map<string, Series>();
  ds.rows.forEach((row, i) => {
    const baseline = flag(ds, row, i, 'ABLFL');
    const onTreatment = !baseline && flag(ds, row, i, 'ONTRTFL');
    const subject = subjectFor(ds, row, i, subjects, onTreatment);
    if (!subject.participant.safety || (!baseline && !onTreatment)) return;
    const parameter = (has(ds, 'PARAM') && text(row, 'PARAM')) || required(ds, row, i, 'PARAMCD');
    const key = JSON.stringify([subject.participant.subjectId, parameter]);
    const s = series.get(key) ?? { subject, parameter, baseline: null, onTreatment: [] };
    if (baseline && s.baseline) refuse('BASELINE_AMBIGUOUS', `${ds.name} flags more than one baseline (ABLFL) for a subject and parameter.`, where(ds, i, 'ABLFL'));
    if (baseline) s.baseline = row; else s.onTreatment.push({ row, i });
    series.set(key, s);
  });
  return series;
}

/** The last on-treatment row by ADT, else ADY, else AVISITN; never by file order. */
export function lastOnTreatment(ds: AdamDataset, s: Series, value: string): AdamRow | null {
  if (!s.onTreatment.length) return null;
  const by = ['ADT', 'ADY', 'AVISITN'].find(v => has(ds, v))
    ?? refuse('ORDER_UNRECORDED', `${ds.name} records no ADT, ADY or AVISITN, so its last on-treatment value is not established.`, ds.name);
  const keyed = s.onTreatment.map(({ row, i }) => {
    const key = by === 'ADT' ? (numeric(row, by) ?? text(row, by)) : numeric(row, by);
    if (key === null || key === '') refuse('ORDER_UNRECORDED', `${by} is blank on an on-treatment row.`, where(ds, i, by));
    return { row, key: key as number | string };
  });
  const max = keyed.reduce((m, k) => (k.key > m ? k.key : m), keyed[0].key);
  const last = keyed.filter(k => k.key === max);
  if (new Set(last.map(k => JSON.stringify(k.row[value]))).size > 1) {
    refuse('LAST_VALUE_AMBIGUOUS', `${ds.name} records different values at the same last on-treatment time for a subject and parameter.`, ds.name);
  }
  return last[0].row;
}
