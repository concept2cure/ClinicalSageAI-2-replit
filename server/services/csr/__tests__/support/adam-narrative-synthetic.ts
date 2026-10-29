/**
 * SYNTHETIC subject-level ADaM for the slice-7 narrative job. EVERY ROW IS
 * INVENTED: no value is Lumen's, LMN-201's, a patient's or a reported result.
 * Tests only; never a default, example or demo source anywhere in the product.
 *
 * N subjects, alternating LMN-201 / placebo, dosed from 2026-01-05 + (i mod 30)
 * days. Qualifying events are planted on fixed residues so the expected
 * selection is known independently of the engine:
 *   i mod 100 = 7  fatal SAE (AESDTH Y, AEOUT FATAL), ADSL DTHFL Y
 *   i mod 10  = 3  non-fatal SAE (hospitalization); i mod 50 = 13 is pre-treatment (TRTEMFL N)
 *   i mod 20  = 11 non-serious AE with the study drug withdrawn; ADSL DCSREAS ADVERSE EVENT
 *   i mod 25  = 4  AESIFL Y (non-serious, not withdrawn)
 * Every subject also has one mild non-serious, non-qualifying event.
 */
import type { CsrAdamBundle } from '../../../../../shared/csr-adam-bundle';
import { readAdamDataset, type AdamDataset } from '../../adam-dataset-reader';
import { bundle as baseBundle, datasetJson } from './adam-lmn201-synthetic';

type Value = string | number | null;
export const SYN_STUDY = 'SYN-NARR';
const DAY_MS = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const FIRST = Date.UTC(2026, 0, 5);
export const subjectId = (i: number) => `${SYN_STUDY}-${String(i + 1).padStart(4, '0')}`;
const arm = (i: number) => (i % 2 ? 'Placebo' : 'LMN-201');
export const firstDose = (i: number) => FIRST + (i % 30) * DAY_MS;
/** ADaM study day of a date (no day 0). */
export const studyDay = (i: number, offsetDays: number) => (offsetDays >= 0 ? offsetDays + 1 : offsetDays);

export const isDeath = (i: number) => i % 100 === 7;
export const isSae = (i: number) => i % 10 === 3;
export const isPreTreatmentSae = (i: number) => i % 50 === 13;
export const isDiscontinuation = (i: number) => i % 20 === 11;
export const isAesi = (i: number) => i % 25 === 4;
export const qualifies = (i: number) => isDeath(i) || isSae(i) || isDiscontinuation(i) || isAesi(i);

function adslRows(n: number): Value[][] {
  return Array.from({ length: n }, (_, i) => {
    const start = firstDose(i);
    const death = isDeath(i);
    return [SYN_STUDY, subjectId(i), arm(i), arm(i), 'Y', 'Y', 30 + (i % 50), i % 3 ? 'M' : 'F', 'WHITE', iso(start), iso(start + 27 * DAY_MS),
      death ? 'Y' : null, death ? iso(start + 20 * DAY_MS) : null, death ? 21 : null, death ? 'SEPTIC SHOCK' : null,
      death || isDiscontinuation(i) ? 'DISCONTINUED' : 'COMPLETED', death ? 'DEATH' : isDiscontinuation(i) ? 'ADVERSE EVENT' : null];
  });
}

type Ae = { term: string; soc: string; offset: number; sev: string; ser: 'Y' | 'N'; rel: string; out: string; dth: 'Y' | 'N'; acn: string; emergent: boolean; aesi: boolean; hosp?: boolean };
function aesOf(i: number): Ae[] {
  const list: Ae[] = [{ term: 'Headache', soc: 'Nervous system disorders', offset: 2, sev: 'MILD', ser: 'N', rel: 'NOT RELATED', out: 'RECOVERED/RESOLVED', dth: 'N', acn: 'DOSE NOT CHANGED', emergent: true, aesi: false }];
  if (isDeath(i)) list.push({ term: 'Septic shock', soc: 'Infections and infestations', offset: 18, sev: 'SEVERE', ser: 'Y', rel: 'NOT RELATED', out: 'FATAL', dth: 'Y', acn: 'DRUG WITHDRAWN', emergent: true, aesi: false });
  if (isSae(i)) {
    const pre = isPreTreatmentSae(i);
    list.push({ term: 'Pneumonia', soc: 'Infections and infestations', offset: pre ? -3 : 9, sev: 'MODERATE', ser: 'Y', rel: 'NOT RELATED', out: 'RECOVERED/RESOLVED', dth: 'N', acn: pre ? '' : 'DOSE NOT CHANGED', emergent: !pre, aesi: false, hosp: true });
  }
  if (isDiscontinuation(i)) list.push({ term: 'Rash', soc: 'Skin and subcutaneous tissue disorders', offset: 6, sev: 'MODERATE', ser: 'N', rel: 'RELATED', out: 'RECOVERING/RESOLVING', dth: 'N', acn: 'DRUG WITHDRAWN', emergent: true, aesi: false });
  if (isAesi(i)) list.push({ term: 'Alanine aminotransferase increased', soc: 'Investigations', offset: 14, sev: 'MILD', ser: 'N', rel: 'POSSIBLY RELATED', out: 'RECOVERED/RESOLVED', dth: 'N', acn: 'DOSE NOT CHANGED', emergent: true, aesi: true });
  return list;
}

const AE_COLUMNS: Array<[string, 'string' | 'integer' | 'date']> = [['STUDYID', 'string'], ['USUBJID', 'string'], ['TRTEMFL', 'string'],
  ['AEDECOD', 'string'], ['AEBODSYS', 'string'], ['ASTDT', 'date'], ['ASTDY', 'integer'], ['AESEV', 'string'], ['AESER', 'string'],
  ['AESHOSP', 'string'], ['AESDTH', 'string'], ['AREL', 'string'], ['AEOUT', 'string'], ['AEACN', 'string'], ['AESIFL', 'string']];
export function adaeRows(n: number, mutate: (row: Value[], i: number, ae: Ae) => Value[] = r => r): Value[][] {
  return Array.from({ length: n }, (_, i) => aesOf(i).map(ae => mutate([SYN_STUDY, subjectId(i), ae.emergent ? 'Y' : 'N', ae.term, ae.soc,
    iso(firstDose(i) + ae.offset * DAY_MS), studyDay(i, ae.offset), ae.sev, ae.ser, ae.hosp ? 'Y' : 'N', ae.dth, ae.rel, ae.out,
    ae.acn || null, ae.aesi ? 'Y' : 'N'], i, ae))).flat();
}

const read = (doc: unknown): AdamDataset => {
  const out = readAdamDataset(Buffer.from(JSON.stringify(doc)), 'x.json');
  if (!out.ok) throw new Error(out.reason);
  return out.dataset;
};

export function narrativeDatasets(n: number, options: { adae?: Value[][] } = {}) {
  const ADSL = read(datasetJson('ADSL', [['STUDYID', 'string'], ['USUBJID', 'string'], ['TRT01P', 'string'], ['TRT01A', 'string'], ['SAFFL', 'string'],
    ['RANDFL', 'string'], ['AGE', 'integer'], ['SEX', 'string'], ['RACE', 'string'], ['TRTSDT', 'date'], ['TRTEDT', 'date'], ['DTHFL', 'string'],
    ['DTHDT', 'date'], ['DTHADY', 'integer'], ['DTHCAUS', 'string'], ['EOSSTT', 'string'], ['DCSREAS', 'string']], adslRows(n)));
  const ADAE = read(datasetJson('ADAE', AE_COLUMNS, options.adae ?? adaeRows(n)));
  const ADEX = read(datasetJson('ADEX', [['STUDYID', 'string'], ['USUBJID', 'string'], ['PARAMCD', 'string'], ['AVAL', 'integer'], ['AVALU', 'string']],
    Array.from({ length: n }, (_, i) => [SYN_STUDY, subjectId(i), 'TRTDURD', isDeath(i) ? 19 : 28, 'DAYS'])));
  const ADCM = read(datasetJson('ADCM', [['STUDYID', 'string'], ['USUBJID', 'string'], ['CMDECOD', 'string'], ['ASTDT', 'date'], ['AENDT', 'date'], ['ONTRTFL', 'string']],
    Array.from({ length: n }, (_, i) => [[SYN_STUDY, subjectId(i), 'PARACETAMOL', iso(firstDose(i) - 10 * DAY_MS), null, 'Y'],
      [SYN_STUDY, subjectId(i), 'AMOXICILLIN', iso(firstDose(i) - 60 * DAY_MS), iso(firstDose(i) - 50 * DAY_MS), 'N']]).flat()));
  const ADMH = read(datasetJson('ADMH', [['STUDYID', 'string'], ['USUBJID', 'string'], ['MHDECOD', 'string']],
    Array.from({ length: n }, (_, i) => [SYN_STUDY, subjectId(i), i % 2 ? 'Hypertension' : 'Type 2 diabetes mellitus'])));
  return { ADSL, ADAE, ADEX, ADCM, ADMH };
}

export function narrativeBundle(aesi: CsrAdamBundle['adverseEventsOfSpecialInterest'] | null = { flagVariable: 'AESIFL' }): CsrAdamBundle {
  return { ...baseBundle(), ...(aesi ? { adverseEventsOfSpecialInterest: aesi } : {}) };
}
