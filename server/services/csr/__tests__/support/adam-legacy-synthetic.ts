/**
 * SYNTHETIC ADaM test fixture in the ADaM 2.1-era shape the public CDISC pilot
 * (CDISCPILOT01) uses: disposition in DCDECOD with no EOSSTT, subject-level AE
 * discontinuation in an ADSL flag with AEACN never collected, AEREL coded
 * NONE/REMOTE/POSSIBLE/PROBABLE, laboratory data split into ADLBC and ADLBH,
 * ANRIND coded N/H/L, the last on-treatment value marked by AVISIT
 * "End of Treatment" with no ONTRTFL, vital signs measured in two positions
 * (ATPT) each with its own baseline, and exposure in ADSL (TRTDUR, AVGDD)
 * with no ADEX. EVERY ROW IS INVENTED: no value is CDISC's, a patient's or a
 * reported result, and no pilot row was copied. Tests only.
 */
import { CSR_ADAM_BUNDLE_FORMAT, type CsrAdamBundle } from '../../../../../shared/csr-adam-bundle';
import { readAdamDataset, type AdamDataset } from '../../adam-dataset-reader';
import { bundle as baseBundle, datasetJson } from './adam-lmn201-synthetic';

type Value = string | number | null;
type Column = [string, 'string' | 'integer' | 'decimal' | 'date'];
export const LEGACY_STUDY = 'SYN-LEGACY';
const STUDY = LEGACY_STUDY;
export const legacyId = (i: number) => `${STUDY}-${i + 1}`;
const DRUG = 'Drug X';
const PBO = 'Placebo';
const arm = (i: number) => (i < 4 ? DRUG : PBO);

/** Subject (0-based) → DCDECOD; S2 and S6 left for an AE (DSRAEFL Y), S4 died, S7 was lost. */
export const DCDECOD = ['COMPLETED', 'ADVERSE EVENT', 'COMPLETED', 'DEATH', 'COMPLETED', 'ADVERSE EVENT', 'LOST TO FOLLOW-UP', 'COMPLETED'];
/** Days on treatment and average daily dose (mg). */
export const TRTDUR = [84, 20, 84, 30, 84, 12, 40, 84];
export const AVGDD = [54, 54, 54, 54, 0, 0, 0, 0];

const read = (doc: unknown): AdamDataset => {
  const out = readAdamDataset(Buffer.from(JSON.stringify(doc)), 'x.json');
  if (!out.ok) throw new Error(out.reason);
  return out.dataset;
};

export function legacyAdsl(mutate: (row: Value[], i: number) => Value[] = r => r): AdamDataset {
  const columns: Column[] = [['STUDYID', 'string'], ['USUBJID', 'string'], ['TRT01P', 'string'], ['TRT01A', 'string'], ['SAFFL', 'string'],
    ['ITTFL', 'string'], ['DCDECOD', 'string'], ['DSRAEFL', 'string'], ['DTHFL', 'string'], ['AGE', 'integer'], ['SEX', 'string'],
    ['TRTDUR', 'integer'], ['AVGDD', 'decimal']];
  return read(datasetJson('ADSL', columns, DCDECOD.map((dc, i) => mutate([STUDY, legacyId(i), arm(i), arm(i), 'Y', 'Y', dc,
    dc === 'ADVERSE EVENT' ? 'Y' : null, dc === 'DEATH' ? 'Y' : null, 60 + i, i % 2 ? 'M' : 'F', TRTDUR[i], AVGDD[i]], i))));
}

const AE_COLUMNS: Column[] = [['STUDYID', 'string'], ['USUBJID', 'string'], ['TRTA', 'string'], ['TRTEMFL', 'string'], ['AEDECOD', 'string'],
  ['AEBODSYS', 'string'], ['AESEV', 'string'], ['AESER', 'string'], ['AEREL', 'string'], ['AEOUT', 'string'], ['AESDTH', 'string'], ['AEACN', 'string']];
const SKIN = 'Skin and subcutaneous tissue disorders';
/** AEACN is blank on every row, as when the study never collected it. */
export const LEGACY_AE_ROWS: Value[][] = [
  [STUDY, legacyId(0), DRUG, 'Y', 'Pruritus', SKIN, 'MILD', 'N', 'REMOTE', 'RECOVERED/RESOLVED', 'N', null],
  [STUDY, legacyId(1), DRUG, 'Y', 'Rash', SKIN, 'MODERATE', 'N', 'POSSIBLE', 'NOT RECOVERED/NOT RESOLVED', 'N', null],
  [STUDY, legacyId(3), DRUG, 'Y', 'Myocardial infarction', 'Cardiac disorders', 'SEVERE', 'Y', 'NONE', 'FATAL', 'Y', null],
  [STUDY, legacyId(4), PBO, 'Y', 'Dizziness', 'Nervous system disorders', 'MILD', 'N', 'PROBABLE', 'RECOVERED/RESOLVED', 'N', null],
  [STUDY, legacyId(5), PBO, 'Y', 'Nausea', 'Gastrointestinal disorders', 'MILD', 'N', 'NONE', 'RECOVERED/RESOLVED', 'N', null],
];
export const legacyAdae = (rows: Value[][] = LEGACY_AE_ROWS) => read(datasetJson('ADAE', AE_COLUMNS, rows));

const BDS: Column[] = [['STUDYID', 'string'], ['USUBJID', 'string'], ['PARAMCD', 'string'], ['PARAM', 'string'], ['AVISIT', 'string'],
  ['AVISITN', 'integer'], ['ABLFL', 'string']];
const EOT = 'End of Treatment';

/** One lab parameter: baseline, a Week 2 value and the End of Treatment copy of the last on-treatment value. */
function labRows(code: string, param: string, baseline: (i: number) => string, last: (i: number) => string): Value[][] {
  return DCDECOD.flatMap((_, i) => [
    [STUDY, legacyId(i), code, param, 'Baseline', 0, 'Y', baseline(i)],
    [STUDY, legacyId(i), code, param, 'Week 2', 2, null, 'N'],
    [STUDY, legacyId(i), code, param, EOT, 99, null, last(i)],
  ]);
}
/** ALT (chemistry): S1 goes N → H; S6 starts H. */
export const legacyAdlbc = () => read(datasetJson('ADLBC', [...BDS, ['ANRIND', 'string']],
  labRows('ALT', 'Alanine Aminotransferase (U/L)', i => (i === 5 ? 'H' : 'N'), i => (i === 0 ? 'H' : 'N'))));
/** Haemoglobin (haematology): S5 goes N → L. */
export const legacyAdlbh = () => read(datasetJson('ADLBH', [...BDS, ['ANRIND', 'string']],
  labRows('HGB', 'Hemoglobin (g/dL)', () => 'N', i => (i === 4 ? 'L' : 'N'))));

export const POSITIONS = ['AFTER LYING DOWN FOR 5 MINUTES', 'AFTER STANDING FOR 1 MINUTE'];
/** SYSBP in two positions, each with its own baseline; weight once, with no position. */
export function legacyAdvs(): AdamDataset {
  const rows: Value[][] = DCDECOD.flatMap((_, i) => [
    ...POSITIONS.flatMap((atpt, p) => [
      [STUDY, legacyId(i), 'SYSBP', 'Systolic Blood Pressure (mmHg)', atpt, 'Baseline', 0, 'Y', 130 + p * 10 + i],
      [STUDY, legacyId(i), 'SYSBP', 'Systolic Blood Pressure (mmHg)', atpt, 'Week 2', 2, null, 125 + p * 10 + i],
      [STUDY, legacyId(i), 'SYSBP', 'Systolic Blood Pressure (mmHg)', atpt, EOT, 99, null, 120 + p * 10 + i],
    ]),
    [STUDY, legacyId(i), 'WEIGHT', 'Weight (kg)', null, 'Baseline', 0, 'Y', 70 + i],
    [STUDY, legacyId(i), 'WEIGHT', 'Weight (kg)', null, EOT, 99, null, 69 + i],
  ]);
  const cols = [...BDS];
  cols.splice(4, 0, ['ATPT', 'string']);
  return read(datasetJson('ADVS', [...cols, ['AVAL', 'decimal']], rows));
}

/** What the study's define.xml and SAP declare, recorded in the manifest. */
export const LEGACY_CONVENTIONS = {
  disposition: 'DCDECOD',
  aeDiscontinuationFlag: 'DSRAEFL',
  causality: { REMOTE: 'not related' },
  rangeIndicator: { N: 'NORMAL', H: 'HIGH', L: 'LOW' },
  lastOnTreatment: { variable: 'AVISIT', value: EOT },
  exposure: { durationDays: 'TRTDUR', averageDailyDose: { variable: 'AVGDD', unit: 'mg' } },
} as const;

export function legacyBundle(conventions: Record<string, unknown> | null = LEGACY_CONVENTIONS): CsrAdamBundle {
  const base = baseBundle();
  return { ...base, format: CSR_ADAM_BUNDLE_FORMAT, randomizedFlag: 'ITTFL',
    studyInfo: { ...base.studyInfo, sampleSize: 8 },
    arms: [{ treatment: DRUG, armId: 'DRUG', armName: DRUG }, { treatment: PBO, armId: 'PBO', armName: PBO }],
    ...(conventions ? { conventions } : {}) } as CsrAdamBundle;
}
