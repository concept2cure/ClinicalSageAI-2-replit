/**
 * The facts of one subject's safety narrative, each read from an ADaM row and
 * named by it (CSR slice 7, 2026-10-29). Pure and deterministic: nothing is
 * imputed, and a value the rows do not record is listed as missing for QC,
 * never filled in. Dates are ISO 8601 (an ADaM numeric date is SAS days since
 * 1960-01-01); a partial or unreadable date is not used and is reported.
 *
 * NarrativeIndex holds row positions per subject for ADEX, ADCM and ADMH,
 * built in one pass, so composing a subject reads only that subject's rows.
 */
import { createHash } from 'node:crypto';
import type { AdamDataset, AdamRow } from './adam-dataset-reader.js';
import { has, numeric, text, where, type AdamDatasets } from './adam-rows.js';
import { ADSL_REASON_VARIABLES, type NarrativeCategory, type SelectedEvent, type SelectedSubject } from './narrative-subject-selection.js';

export interface NarrativeFact { field: string; value: string | number; source: string }
export interface EventFacts {
  term: string;
  bodySystem?: string;
  onsetDate?: string; onsetDay?: number; endDate?: string; endDay?: number;
  severity?: string; grade?: number;
  serious: boolean; seriousnessCriteria: string[];
  action?: string; outcome?: string; relatedness?: string;
  treatmentEmergent?: boolean;
  categories: NarrativeCategory[];
}
export interface SubjectFacts {
  subjectId: string; studyId?: string; age?: number; sex?: string; race?: string;
  armName: string; treatment: string;
  firstDoseDate?: string; lastDoseDate?: string; exposureDays?: number;
  deathDate?: string; deathDay?: number; deathCause?: string;
  discontinuationReason?: string;
  medicalHistory: string[]; concomitantMedications: string[];
  events: EventFacts[];
  categories: NarrativeCategory[];
  /** Every stated value with the dataset row and variable it came from. */
  facts: NarrativeFact[];
  /** Values the rows do not record (or record unusably), for the QC list. */
  missing: string[];
  /** Present only for a withdrawal ADSL records per subject, with no ADAE event recording it (D17). */
  withdrawal?: WithdrawalFacts;
}
/**
 * A withdrawal for an AE that the data record per subject only (D17, 2026-10-30):
 * when it happened, what recorded it, and the treatment-emergent events with
 * onset on or before it. The data do not say which event led to it, so none is
 * singled out; events after it are not candidates and are not listed.
 */
export interface WithdrawalFacts {
  /** What records the withdrawal, for example "DSRAEFL = Y". */
  recordedBy: string;
  date?: string; day?: number;
  /** TEAEs with onset on or before the withdrawal, in ADAE order. */
  events: EventFacts[];
  /** TEAEs with no recorded onset: neither placed before nor after it. */
  undated: EventFacts[];
}

export type NarrativeDatasets = Pick<AdamDatasets, 'ADSL' | 'ADAE' | 'ADEX' | 'ADCM' | 'ADMH'>;
export interface NarrativeIndex { ADEX: Map<string, number[]>; ADCM: Map<string, number[]>; ADMH: Map<string, number[]> }

function indexBySubject(ds: AdamDataset | undefined): Map<string, number[]> {
  const index = new Map<string, number[]>();
  ds?.rows.forEach((row, i) => {
    const id = text(row, 'USUBJID');
    const list = index.get(id);
    if (list) list.push(i); else index.set(id, [i]);
  });
  return index;
}
export const buildNarrativeIndex = (d: NarrativeDatasets): NarrativeIndex =>
  ({ ADEX: indexBySubject(d.ADEX), ADCM: indexBySubject(d.ADCM), ADMH: indexBySubject(d.ADMH) });

const SAS_EPOCH_MS = Date.UTC(1960, 0, 1);
/** An ISO date from an ADaM date value, or null when blank, partial or unreadable. */
export function adamDate(value: unknown): string | null {
  if (typeof value === 'number' && Number.isInteger(value)) return new Date(SAS_EPOCH_MS + value * 86_400_000).toISOString().slice(0, 10);
  if (typeof value !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(value.trim());
  if (!m) return null;
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return date.toISOString().slice(0, 10) === `${m[1]}-${m[2]}-${m[3]}` ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** Reads one subject's rows into facts, recording the source of each. */
class FactReader {
  readonly facts: NarrativeFact[] = [];
  readonly missing: string[] = [];
  constructor(private readonly ds: AdamDataset, private readonly row: AdamRow, private readonly index: number, private readonly label = '') {}
  private note(field: string, value: string | number, v: string) { this.facts.push({ field, value, source: where(this.ds, this.index, v) }); }
  private miss(field: string) { this.missing.push(this.label ? `${this.label}.${field}` : field); }
  text(field: string, ...vars: string[]): string | undefined {
    const v = vars.find(name => has(this.ds, name) && text(this.row, name));
    if (!v) { this.miss(field); return undefined; }
    this.note(field, text(this.row, v), v);
    return text(this.row, v);
  }
  int(field: string, v: string): number | undefined {
    const value = has(this.ds, v) ? numeric(this.row, v) : null;
    if (value === null || !Number.isInteger(value)) { this.miss(field); return undefined; }
    this.note(field, value, v);
    return value;
  }
  date(field: string, v: string): string | undefined {
    const raw = has(this.ds, v) ? this.row[v] : null;
    const value = adamDate(raw);
    if (!value) { this.miss(raw === null || raw === '' || raw === undefined ? field : `${field} (${v} is not a complete date)`); return undefined; }
    this.note(field, value, v);
    return value;
  }
}

const SERIOUSNESS: Array<[string, string]> = [
  ['AESDTH', 'death'], ['AESLIFE', 'life-threatening'], ['AESHOSP', 'hospitalization or prolonged hospitalization'],
  ['AESDISAB', 'persistent or significant disability or incapacity'], ['AESCONG', 'congenital anomaly or birth defect'],
  ['AESMIE', 'other medically important event'],
];

function eventFacts(adae: AdamDataset, event: SelectedEvent, n: number, out: Pick<SubjectFacts, 'facts' | 'missing'>, label: string): EventFacts {
  const r = new FactReader(adae, event.row, event.index, `${label}${n}`);
  const serious = text(event.row, 'AESER').toUpperCase() === 'Y';
  const seriousnessCriteria = SERIOUSNESS.filter(([v]) => has(adae, v) && text(event.row, v).toUpperCase() === 'Y').map(([, label]) => label);
  const facts: EventFacts = {
    term: r.text('term', 'AEDECOD')!, bodySystem: r.text('bodySystem', 'AEBODSYS'),
    onsetDate: r.date('onsetDate', 'ASTDT'), onsetDay: r.int('onsetDay', 'ASTDY'),
    endDate: has(adae, 'AENDT') ? r.date('endDate', 'AENDT') : undefined, endDay: has(adae, 'AENDY') ? r.int('endDay', 'AENDY') : undefined,
    severity: r.text('severity', 'ASEV', 'AESEV')?.toLowerCase(),
    grade: has(adae, 'ATOXGR') || has(adae, 'AETOXGR') ? Number(r.text('grade', 'ATOXGR', 'AETOXGR')?.replace(/^GRADE\s*/i, '')) || undefined : undefined,
    serious, seriousnessCriteria,
    action: r.text('action', 'AEACN')?.toLowerCase(), outcome: r.text('outcome', 'AEOUT')?.toLowerCase(),
    relatedness: r.text('relatedness', 'AREL', 'AEREL')?.toLowerCase(),
    treatmentEmergent: has(adae, 'TRTEMFL') ? text(event.row, 'TRTEMFL').toUpperCase() === 'Y' : undefined,
    categories: event.categories,
  };
  if (serious && !seriousnessCriteria.length) r.missing.push(`event${n}.seriousnessCriteria`);
  out.facts.push(...r.facts); out.missing.push(...r.missing.filter(m => !/\.(endDate|endDay)$/.test(m)));
  return facts;
}

const DAY_MS = 86_400_000;
/** ADaM study day: the date minus the first dose date, plus one on or after it (no day 0), as ADAE ASTDY counts. */
function studyDay(date: string, first: string): number {
  const diff = Math.round((Date.parse(date) - Date.parse(first)) / DAY_MS);
  return diff >= 0 ? diff + 1 : diff;
}

/** On or before the withdrawal by date when both are recorded, else by study day; null when the onset is not recorded. */
function precedes(e: EventFacts, w: Pick<WithdrawalFacts, 'date' | 'day'>): boolean | null {
  if (e.onsetDate && w.date) return e.onsetDate <= w.date;
  if (e.onsetDay !== undefined && w.day !== undefined) return e.onsetDay <= w.day;
  return null;
}

/** The subject-level withdrawal, its date and day, and the TEAEs on or before it (D17); facts are kept for the listed events only. */
function withdrawal(d: NarrativeDatasets, s: SelectedSubject, out: SubjectFacts): WithdrawalFacts | undefined {
  const level = s.subjectLevelWithdrawal;
  if (!level || s.events.some(e => e.categories.includes('discontinuation'))) return undefined;
  const r = new FactReader(d.ADSL, s.adsl, s.adslIndex);
  const w: WithdrawalFacts = { recordedBy: `${level.flag} = Y`, events: [], undated: [] };
  r.text('withdrawalFlag', level.flag);
  if (level.dateVariable) w.date = r.date('withdrawalDate', level.dateVariable);
  else out.missing.push('withdrawalDate (conventions.aeDiscontinuationDate not declared)');
  if (w.date && out.firstDoseDate) {
    w.day = studyDay(w.date, out.firstDoseDate);
    out.facts.push({ field: 'withdrawalDay', value: w.day, source: `${where(d.ADSL, s.adslIndex, level.dateVariable!)} − ${where(d.ADSL, s.adslIndex, 'TRTSDT')} + 1` });
  }
  out.facts.push(...r.facts); out.missing.push(...r.missing);
  level.teae.forEach((row, n) => {
    const scratch = { facts: [] as NarrativeFact[], missing: [] as string[] };
    const e = eventFacts(d.ADAE, { ...row, categories: [] }, n + 1, scratch, 'withdrawalEvent');
    const before = precedes(e, w);
    if (before === false) return;
    if (before === null) {
      w.undated.push(e);
      out.missing.push(`withdrawalEvents.${e.term}.onset (ASTDT and ASTDY blank)`);
    } else w.events.push(e);
    out.facts.push(...scratch.facts); out.missing.push(...scratch.missing.filter(m => !/\.(endDate|endDay)$/.test(m)));
  });
  if (!w.events.length) out.missing.push('withdrawalEvents (no treatment-emergent ADAE event has onset on or before the withdrawal)');
  return w;
}

function rowsOf(ds: AdamDataset | undefined, index: Map<string, number[]>, subjectId: string) {
  return ds ? (index.get(subjectId) ?? []).map(i => ({ row: ds.rows[i], i })) : [];
}

function exposure(d: NarrativeDatasets, idx: NarrativeIndex, out: SubjectFacts) {
  if (!d.ADEX) { out.missing.push('exposureDays (no ADEX)'); return; }
  const rows = rowsOf(d.ADEX, idx.ADEX, out.subjectId).filter(({ row }) => text(row, 'PARAMCD').toUpperCase() === 'TRTDURD');
  if (rows.length !== 1) { out.missing.push('exposureDays'); return; }
  const value = numeric(rows[0].row, 'AVAL');
  if (value === null) { out.missing.push('exposureDays'); return; }
  out.exposureDays = value;
  out.facts.push({ field: 'exposureDays', value, source: where(d.ADEX, rows[0].i, 'AVAL') });
}

/** Concomitant at the first selected event's onset when ADCM dates allow; else every concomitant (CONCOMFL/ONTRTFL) record. */
function concomitant(d: NarrativeDatasets, idx: NarrativeIndex, out: SubjectFacts) {
  if (!d.ADCM) { out.missing.push('concomitantMedications (no ADCM)'); return; }
  const onset = out.events.map(e => e.onsetDate).filter((x): x is string => !!x).sort()[0];
  const flagVar = has(d.ADCM, 'CONCOMFL') ? 'CONCOMFL' : 'ONTRTFL';
  const names = new Set<string>();
  for (const { row, i } of rowsOf(d.ADCM, idx.ADCM, out.subjectId)) {
    const start = adamDate(row.ASTDT); const end = adamDate(row.AENDT);
    const relevant = onset && start ? start <= onset && (!end || end >= onset) : text(row, flagVar).toUpperCase() === 'Y';
    const name = text(row, 'CMDECOD');
    if (!relevant || !name || names.has(name)) continue;
    names.add(name);
    out.facts.push({ field: 'concomitantMedication', value: name, source: where(d.ADCM, i, 'CMDECOD') });
  }
  out.concomitantMedications = [...names];
}

function history(d: NarrativeDatasets, idx: NarrativeIndex, out: SubjectFacts) {
  if (!d.ADMH) { out.missing.push('medicalHistory (no ADMH)'); return; }
  const terms = new Set<string>();
  for (const { row, i } of rowsOf(d.ADMH, idx.ADMH, out.subjectId)) {
    const v = has(d.ADMH, 'MHDECOD') && text(row, 'MHDECOD') ? 'MHDECOD' : 'MHTERM';
    const term = text(row, v);
    if (!term || terms.has(term)) continue;
    terms.add(term);
    out.facts.push({ field: 'medicalHistory', value: term, source: where(d.ADMH, i, v) });
  }
  out.medicalHistory = [...terms];
  if (!terms.size) out.missing.push('medicalHistory');
}

function subjectLevel(d: NarrativeDatasets, s: SelectedSubject, out: SubjectFacts) {
  const r = new FactReader(d.ADSL, s.adsl, s.adslIndex);
  out.studyId = r.text('studyId', 'STUDYID');
  out.age = r.int('age', 'AGE'); out.sex = r.text('sex', 'SEX'); out.race = has(d.ADSL, 'RACE') ? r.text('race', 'RACE') : undefined;
  out.firstDoseDate = r.date('firstDoseDate', 'TRTSDT');
  out.lastDoseDate = has(d.ADSL, 'TRTEDT') ? r.date('lastDoseDate', 'TRTEDT') : undefined;
  if (s.categories.includes('death')) {
    out.deathDate = has(d.ADSL, 'DTHDT') ? r.date('deathDate', 'DTHDT') : undefined;
    out.deathDay = has(d.ADSL, 'DTHADY') ? r.int('deathDay', 'DTHADY') : undefined;
    out.deathCause = has(d.ADSL, 'DTHCAUS') ? r.text('deathCause', 'DTHCAUS') : undefined;
    // A death narrative without a recorded death date, day or cause is listed for QC, not silently left out (review 2026-10-29).
    if (!has(d.ADSL, 'DTHDT') && !has(d.ADSL, 'DTHADY')) out.missing.push('deathDate (ADSL has no DTHDT or DTHADY)');
    if (!has(d.ADSL, 'DTHCAUS')) out.missing.push('deathCause (ADSL has no DTHCAUS)');
  }
  // DCDECOD, the CDISC standardized disposition term, is read when DCSREAS and DCTREAS are blank (CDISC pilot defect D8, 2026-10-30).
  if (s.discontinuedForAePerAdsl) out.discontinuationReason = r.text('discontinuationReason', ...ADSL_REASON_VARIABLES);
  out.facts.push({ field: 'treatment', value: out.treatment, source: where(d.ADSL, s.adslIndex, has(d.ADSL, 'TRT01A') && text(s.adsl, 'TRT01A') ? 'TRT01A' : 'TRT01P') });
  out.facts.push(...r.facts); out.missing.push(...r.missing.filter(m => !['race', 'lastDoseDate'].includes(m)));
}

/** One selected subject's narrative facts, from that subject's rows only. */
export function subjectNarrativeFacts(d: NarrativeDatasets, idx: NarrativeIndex, s: SelectedSubject): SubjectFacts {
  const treatment = (has(d.ADSL, 'TRT01A') && text(s.adsl, 'TRT01A')) || text(s.adsl, 'TRT01P');
  const out: SubjectFacts = { subjectId: s.subjectId, armName: s.armName, treatment, medicalHistory: [], concomitantMedications: [],
    events: [], categories: [...s.categories], facts: [], missing: [] };
  subjectLevel(d, s, out);
  out.events = s.events.map((e, n) => eventFacts(d.ADAE, e, n + 1, out, 'event'));
  const w = withdrawal(d, s, out);
  if (w) out.withdrawal = w;
  exposure(d, idx, out);
  concomitant(d, idx, out);
  history(d, idx, out);
  return out;
}

/** SHA-256 over the facts a narrative is composed from: a resume skips a subject only while it still matches. */
export function factsDigest(facts: SubjectFacts): string {
  return createHash('sha256').update(JSON.stringify(facts), 'utf8').digest('hex');
}
