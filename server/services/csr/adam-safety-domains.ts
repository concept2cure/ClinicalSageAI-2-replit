/**
 * The ADaM safety domains of the CSR derivation (CSR slice 6, 2026-10-29):
 * exposure (ADEX), laboratory shifts (ADLB), vital signs and ECG (ADVS, ADEG)
 * and concomitant medications (ADCM). Deterministic counts and values from the
 * rows; a subject missing, ambiguous or outside the safety population is a
 * typed refusal, never skipped into a smaller denominator silently.
 *
 * 2026-10-30 (CDISC pilot defects D4–D7, D9): laboratory shifts over ADLB or
 * ADLBC + ADLBH, a declared ANRIND decode and last on-treatment record, vital
 * signs per timepoint where baselines differ by ATPT, and exposure from ADSL
 * when the manifest declares it and there is no ADEX.
 */
import type { CsrAdamBundle, CsrAdamConventions } from '../../../shared/csr-adam-bundle.js';
import { roundHalfUp } from '../csr-figure-format.js';
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

// ── ADSL: exposure when the manifest declares it (no ADEX) ──────────────────

/** Mean treatment duration and, when declared, mean average daily dose, over every safety subject; a blank value is refused, never averaged around. */
export function readAdslExposure(adsl: AdamDataset, subjects: Map<string, Subject>, bundle: CsrAdamBundle,
  rule: NonNullable<CsrAdamConventions['exposure']>): StudyData['exposure'] {
  const dose = rule.averageDailyDose;
  requireColumns(adsl, rule.durationDays, ...(dose ? [dose.variable] : []));
  const values = new Map<string, { days: number; dose: number | null }>();
  adsl.rows.forEach((row, i) => {
    const subject = subjects.get(text(row, 'USUBJID'));
    if (!subject?.participant.safety) return;
    const days = numeric(row, rule.durationDays);
    if (days === null || days < 0) refuse('EXPOSURE_INCOMPLETE', `A safety subject has no non-negative ${rule.durationDays}; exposure is not summarised over part of the population.`, where(adsl, i, rule.durationDays));
    const daily = dose ? numeric(row, dose.variable) : null;
    if (dose && (daily === null || daily < 0)) refuse('EXPOSURE_INCOMPLETE', `A safety subject has no non-negative ${dose.variable}.`, where(adsl, i, dose.variable));
    values.set(subject.participant.subjectId, { days: days as number, dose: daily });
  });
  return bundle.arms.flatMap(a => {
    const own = [...subjects.values()].filter(s => s.participant.armId === a.armId && s.participant.safety).map(s => values.get(s.participant.subjectId)!);
    if (!own.length) return [];
    const total = own.reduce((n, v) => n + v.days, 0);
    return [{ armId: a.armId, meanExposureDays: total / own.length, totalPersonYears: total / 365.25,
      ...(dose ? { meanDailyDose: `${roundHalfUp(own.reduce((n, v) => n + (v.dose as number), 0) / own.length, 1)} ${dose.unit}` } : {}) }];
  });
}

// ── ADLB (or ADLBC + ADLBH): shift from the baseline range to the last on-treatment range

const RANGE = new Set(['NORMAL', 'HIGH', 'LOW']);
function rangeOf(value: string, decode: Map<string, string>, path: string): string {
  const raw = value.toUpperCase();
  const v = decode.get(raw) ?? raw;
  if (v && !RANGE.has(v)) refuse('VALUE_UNMAPPED', 'ANRIND must be NORMAL, HIGH or LOW, or a code the manifest’s rangeIndicator decodes.', path);
  return v;
}

type ShiftCount = { armId: string; parameter: string; shiftFromNormal: number; shiftToHigh: number; shiftToLow: number; totalAssessed: number };

/** Shifts over every supplied laboratory dataset; a parameter in two of them is refused, never counted twice. */
export function readLabShifts(datasets: AdamDataset[], subjects: Map<string, Subject>, conventions?: CsrAdamConventions): StudyData['labShifts'] {
  const decode = new Map(Object.entries(conventions?.rangeIndicator ?? {}).map(([k, v]) => [k.trim().toUpperCase(), v]));
  const owner = new Map<string, string>();
  const out: ShiftCount[] = [];
  for (const ds of datasets) {
    const counts = shiftCounts(ds, subjects, decode, conventions?.lastOnTreatment);
    for (const c of counts) {
      const first = owner.get(c.parameter);
      if (first && first !== ds.name) refuse('LAB_PARAMETER_DUPLICATED', `${ds.name} and ${first} both record the laboratory parameter "${c.parameter}"; it is not counted twice.`, ds.name);
      owner.set(c.parameter, ds.name);
    }
    out.push(...counts);
  }
  return out;
}

function shiftCounts(ds: AdamDataset, subjects: Map<string, Subject>, decode: Map<string, string>, rule: CsrAdamConventions['lastOnTreatment']): ShiftCount[] {
  const counts = new Map<string, ShiftCount>();
  for (const s of seriesOf(ds, subjects, 'ANRIND', rule).values()) {
    const key = JSON.stringify([s.subject.participant.armId, s.parameter]);
    const c = counts.get(key) ?? { armId: s.subject.participant.armId, parameter: s.parameter, shiftFromNormal: 0, shiftToHigh: 0, shiftToLow: 0, totalAssessed: 0 };
    counts.set(key, c);
    const last = lastOnTreatment(ds, s, 'ANRIND', rule);
    const from = s.baseline ? rangeOf(text(s.baseline, 'ANRIND'), decode, `${ds.name}.ANRIND`) : '';
    const to = last ? rangeOf(text(last, 'ANRIND'), decode, `${ds.name}.ANRIND`) : '';
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

export function readVitalSigns(ds: AdamDataset, subjects: Map<string, Subject>, conventions?: CsrAdamConventions): NonNullable<StudyData['vitalSigns']> {
  const records: NonNullable<StudyData['vitalSigns']> = [];
  const rule = conventions?.lastOnTreatment;
  for (const s of seriesOf(ds, subjects, 'AVAL', rule).values()) {
    const last = lastOnTreatment(ds, s, 'AVAL', rule);
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
