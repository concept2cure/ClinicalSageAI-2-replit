/**
 * The ADaM safety domains of the CSR derivation (CSR slice 6, 2026-10-29):
 * exposure (ADEX), laboratory shifts (ADLB), vital signs and ECG (ADVS, ADEG)
 * and concomitant medications (ADCM). Deterministic counts and values from the
 * rows; a subject missing, ambiguous or outside the safety population is a
 * typed refusal, never skipped into a smaller denominator silently.
 */
import type { CsrAdamBundle } from '../../../shared/csr-adam-bundle.js';
import type { AdamDataset } from './adam-dataset-reader.js';
import {
  flag, has, lastOnTreatment, numeric, refuse, required, requireColumns, seriesOf, subjectFor, text, where,
  type StudyData, type Subject,
} from './adam-rows.js';

// ── ADEX: treatment duration in days, every safety subject exactly once ─────

export function readExposure(ds: AdamDataset, subjects: Map<string, Subject>, bundle: CsrAdamBundle): StudyData['exposure'] {
  requireColumns(ds, 'USUBJID', 'PARAMCD', 'AVAL');
  const days = new Map<string, number>();
  ds.rows.forEach((row, i) => {
    if (text(row, 'PARAMCD').toUpperCase() !== 'TRTDURD') return;
    const subject = subjectFor(ds, row, i, subjects, true);
    if (has(ds, 'AVALU') && text(row, 'AVALU') && !/^DAYS?$/i.test(text(row, 'AVALU'))) refuse('VALUE_UNMAPPED', 'TRTDURD must be recorded in days.', where(ds, i, 'AVALU'));
    const value = numeric(row, 'AVAL');
    if (value === null || value < 0) refuse('VALUE_MISSING', 'TRTDURD has no non-negative duration.', where(ds, i, 'AVAL'));
    if (days.has(subject.participant.subjectId)) refuse('EXPOSURE_AMBIGUOUS', 'ADEX records TRTDURD more than once for a subject.', where(ds, i, 'PARAMCD'));
    days.set(subject.participant.subjectId, value as number);
  });
  for (const s of subjects.values()) {
    if (s.participant.safety && !days.has(s.participant.subjectId)) {
      refuse('EXPOSURE_INCOMPLETE', 'A safety subject has no TRTDURD in ADEX; exposure is not summarised over part of the population.', 'ADEX');
    }
  }
  return bundle.arms.flatMap(a => {
    const own = [...subjects.values()].filter(s => s.participant.armId === a.armId && s.participant.safety).map(s => days.get(s.participant.subjectId)!);
    if (!own.length) return [];
    const total = own.reduce((n, d) => n + d, 0);
    return [{ armId: a.armId, meanExposureDays: total / own.length, totalPersonYears: total / 365.25 }];
  });
}

// ── ADLB: shift from the baseline range to the last on-treatment range ──────

const RANGE = new Set(['NORMAL', 'HIGH', 'LOW']);
function rangeOf(ds: AdamDataset, value: string, path: string): string {
  const v = value.toUpperCase();
  if (v && !RANGE.has(v)) refuse('VALUE_UNMAPPED', 'ANRIND must be NORMAL, HIGH or LOW.', path);
  return v;
}

export function readLabShifts(ds: AdamDataset, subjects: Map<string, Subject>): StudyData['labShifts'] {
  const counts = new Map<string, { armId: string; parameter: string; shiftFromNormal: number; shiftToHigh: number; shiftToLow: number; totalAssessed: number }>();
  for (const s of seriesOf(ds, subjects, 'ANRIND').values()) {
    const key = JSON.stringify([s.subject.participant.armId, s.parameter]);
    const c = counts.get(key) ?? { armId: s.subject.participant.armId, parameter: s.parameter, shiftFromNormal: 0, shiftToHigh: 0, shiftToLow: 0, totalAssessed: 0 };
    counts.set(key, c);
    const last = lastOnTreatment(ds, s, 'ANRIND');
    const from = s.baseline ? rangeOf(ds, text(s.baseline, 'ANRIND'), `${ds.name}.ANRIND`) : '';
    const to = last ? rangeOf(ds, text(last, 'ANRIND'), `${ds.name}.ANRIND`) : '';
    if (!from || !to) continue; // assessed only with a recorded baseline and last on-treatment range
    c.totalAssessed++;
    if (from !== 'NORMAL') continue;
    c.shiftFromNormal++;
    if (to === 'HIGH') c.shiftToHigh++;
    if (to === 'LOW') c.shiftToLow++;
  }
  return [...counts.values()];
}

// ── ADVS / ADEG: baseline and last on-treatment value ───────────────────────

export function readVitalSigns(ds: AdamDataset, subjects: Map<string, Subject>): NonNullable<StudyData['vitalSigns']> {
  const records: NonNullable<StudyData['vitalSigns']> = [];
  for (const s of seriesOf(ds, subjects, 'AVAL').values()) {
    const last = lastOnTreatment(ds, s, 'AVAL');
    const baseline = s.baseline ? numeric(s.baseline, 'AVAL') : null;
    const value = last ? numeric(last, 'AVAL') : null;
    if (baseline === null || value === null) continue; // no change from baseline is established
    records.push({ subjectId: s.subject.participant.subjectId, armId: s.subject.participant.armId,
      parameter: s.parameter, baseline, lastOnTreatment: value });
  }
  return records;
}

// ── ADCM: concomitant medications, coded ────────────────────────────────────

export function readConcomitantMedications(ds: AdamDataset, subjects: Map<string, Subject>): NonNullable<StudyData['concomitantMedications']> {
  const concomitant = has(ds, 'CONCOMFL') ? 'CONCOMFL' : 'ONTRTFL';
  requireColumns(ds, 'USUBJID', 'CMDECOD', concomitant);
  const seen = new Set<string>();
  const records: NonNullable<StudyData['concomitantMedications']> = [];
  ds.rows.forEach((row, i) => {
    const onTreatment = flag(ds, row, i, concomitant);
    const subject = subjectFor(ds, row, i, subjects, onTreatment);
    if (!onTreatment) return;
    const medication = required(ds, row, i, 'CMDECOD');
    const atcClass = has(ds, 'CMCLAS') ? text(row, 'CMCLAS') : '';
    const key = JSON.stringify([subject.participant.subjectId, medication, atcClass]);
    if (seen.has(key)) return; // one record per subject and medication: incidence counts subjects
    seen.add(key);
    records.push({ subjectId: subject.participant.subjectId, armId: subject.participant.armId, medication, ...(atcClass ? { atcClass } : {}) });
  });
  return records;
}
