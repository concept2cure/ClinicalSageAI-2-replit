/**
 * SYNTHETIC ADaM test fixture, shaped like the LMN-201 / RePreve Part B design
 * (NCT05330182: 23 subjects randomized 1:1, LMN-201 vs placebo). EVERY ROW IS
 * INVENTED. No value here is Lumen's, a patient's, or a reported result; the
 * efficacy file's Bayesian figures are placeholders for the import path only.
 * Tests only: never a default, example or demo source anywhere in the product.
 *
 * Built as CDISC Dataset-JSON v1.1 (columns + positional rows). The public CDISC
 * pilot ADaM set (cdisc-org/sdtm-adam-pilot-project) is the next proof when the
 * founder admits external data; nothing here depends on the network.
 */
import { CSR_ADAM_BUNDLE_FORMAT, CSR_EFFICACY_RESULTS_FORMAT, type CsrAdamBundle, type CsrEfficacyResults } from '../../../../../shared/csr-adam-bundle';

export const SYNTHETIC_LABEL = 'SYNTHETIC — invented test data, not LMN-201 or any patient';
export const STUDY_ID = 'SYN-LMN201-B';
type Value = string | number | null;
type Column = [name: string, dataType: 'string' | 'integer' | 'decimal' | 'date'];

export function datasetJson(name: string, columns: Column[], rows: Value[][]) {
  return { datasetJSONVersion: '1.1.0', fileOID: `SYNTHETIC.${name}`, studyOID: STUDY_ID, itemGroupOID: `IG.${name}`,
    name, label: `${name} — ${SYNTHETIC_LABEL}`, records: rows.length,
    columns: columns.map(([n, dataType]) => ({ itemOID: `IT.${name}.${n}`, name: n, label: n, dataType })), rows };
}

const ids = Array.from({ length: 23 }, (_, i) => `${STUDY_ID}-S${String(i + 1).padStart(2, '0')}`);
const arm = (i: number) => (i < 12 ? 'LMN-201' : 'Placebo');
/** Subject index (0-based) → disposition; everyone else completed the study. */
const DISCONTINUED: Record<number, string> = { 8: 'WITHDRAWAL BY SUBJECT', 16: 'LOST TO FOLLOW-UP', 19: 'DEATH' };

export function adsl(overrides: (row: Value[], i: number) => Value[] = r => r) {
  const columns: Column[] = [['STUDYID', 'string'], ['USUBJID', 'string'], ['TRT01P', 'string'], ['TRT01A', 'string'],
    ['RANDFL', 'string'], ['SAFFL', 'string'], ['ITTFL', 'string'], ['PPROTFL', 'string'], ['EOSSTT', 'string'],
    ['DCSREAS', 'string'], ['DTHFL', 'string'], ['AGE', 'integer'], ['SEX', 'string'], ['RACE', 'string'], ['WEIGHTBL', 'decimal']];
  const rows = ids.map((id, i) => overrides([STUDY_ID, id, arm(i), arm(i), 'Y', 'Y', 'Y', DISCONTINUED[i] ? 'N' : 'Y',
    DISCONTINUED[i] ? 'DISCONTINUED' : 'COMPLETED', DISCONTINUED[i] ?? null, i === 19 ? 'Y' : null,
    40 + ((i * 7) % 35), i % 2 ? 'M' : 'F', 'WHITE', String(60 + ((i * 3) % 30)) + '.5'], i));
  return datasetJson('ADSL', columns, rows);
}

const AE_COLUMNS: Column[] = [['STUDYID', 'string'], ['USUBJID', 'string'], ['TRTA', 'string'], ['TRTEMFL', 'string'],
  ['AEDECOD', 'string'], ['AEBODSYS', 'string'], ['AESEV', 'string'], ['AESER', 'string'], ['AREL', 'string'],
  ['AEOUT', 'string'], ['AESDTH', 'string'], ['AEACN', 'string']];
const GI = 'Gastrointestinal disorders';
export const AE_ROWS: Value[][] = [
  [STUDY_ID, ids[0], 'LMN-201', 'Y', 'Nausea', GI, 'MILD', 'N', 'RELATED', 'RECOVERED/RESOLVED', 'N', 'DOSE NOT CHANGED'],
  [STUDY_ID, ids[1], 'LMN-201', 'Y', 'Diarrhoea', GI, 'MILD', 'N', 'NOT RELATED', 'RECOVERED/RESOLVED', 'N', 'DOSE NOT CHANGED'],
  // The non-fatal SAE.
  [STUDY_ID, ids[4], 'LMN-201', 'Y', 'Dehydration', 'Metabolism and nutrition disorders', 'MODERATE', 'Y', 'NOT RELATED', 'RECOVERED/RESOLVED', 'N', 'DOSE NOT CHANGED'],
  // Before first dose: not treatment-emergent, so never tabulated.
  [STUDY_ID, ids[2], null, 'N', 'Headache', 'Nervous system disorders', 'MILD', 'N', 'NOT RELATED', 'RECOVERED/RESOLVED', 'N', null],
  [STUDY_ID, ids[12], 'Placebo', 'Y', 'Abdominal pain', GI, 'MODERATE', 'N', 'NOT RELATED', 'RECOVERING/RESOLVING', 'N', 'DOSE NOT CHANGED'],
  [STUDY_ID, ids[13], 'Placebo', 'Y', 'Nausea', GI, 'MILD', 'N', 'NOT RELATED', 'RECOVERED/RESOLVED', 'N', 'DOSE NOT CHANGED'],
  // The death: a fatal SAE that led to discontinuation.
  [STUDY_ID, ids[19], 'Placebo', 'Y', 'Septic shock', 'Infections and infestations', 'SEVERE', 'Y', 'NOT RELATED', 'FATAL', 'Y', 'DRUG WITHDRAWN'],
];
export const adae = (rows: Value[][] = AE_ROWS) => datasetJson('ADAE', AE_COLUMNS, rows);

export function adex() {
  const days = (i: number) => (i === 8 ? 5 : i === 16 ? 7 : i === 19 ? 10 : 14);
  return datasetJson('ADEX', [['STUDYID', 'string'], ['USUBJID', 'string'], ['PARAMCD', 'string'], ['AVAL', 'decimal'], ['AVALU', 'string']],
    ids.map((id, i) => [STUDY_ID, id, 'TRTDURD', days(i), 'DAYS']));
}

const SERIES: Column[] = [['STUDYID', 'string'], ['USUBJID', 'string'], ['PARAMCD', 'string'], ['PARAM', 'string'],
  ['ADT', 'date'], ['ABLFL', 'string'], ['ONTRTFL', 'string']];

/** ALT: S13 starts HIGH; S01 rises to HIGH at its last visit; S14 ends LOW. */
export function adlb() {
  const last = (i: number) => (i === 0 ? 'HIGH' : i === 13 ? 'LOW' : 'NORMAL');
  const rows = ids.flatMap((id, i) => [
    [STUDY_ID, id, 'ALT', 'Alanine Aminotransferase (U/L)', '2026-01-05', 'Y', null, i === 12 ? 'HIGH' : 'NORMAL'],
    [STUDY_ID, id, 'ALT', 'Alanine Aminotransferase (U/L)', '2026-01-12', null, 'Y', i === 0 ? 'NORMAL' : last(i)],
    [STUDY_ID, id, 'ALT', 'Alanine Aminotransferase (U/L)', '2026-01-19', null, 'Y', last(i)],
  ]);
  return datasetJson('ADLB', [...SERIES, ['ANRIND', 'string']], rows);
}

/** Systolic blood pressure: baseline 120 + i; last on-treatment value 118 + i + i mod 3 (LMN-201), 121 + i + i mod 3 (placebo). */
export function advs() {
  const rows = ids.flatMap((id, i) => [
    [STUDY_ID, id, 'SYSBP', 'Systolic Blood Pressure (mmHg)', '2026-01-05', 'Y', null, 120 + i],
    [STUDY_ID, id, 'SYSBP', 'Systolic Blood Pressure (mmHg)', '2026-01-12', null, 'Y', 130 + i],
    [STUDY_ID, id, 'SYSBP', 'Systolic Blood Pressure (mmHg)', '2026-01-19', null, 'Y', (i < 12 ? 118 : 121) + i + (i % 3)],
  ]);
  return datasetJson('ADVS', [...SERIES, ['AVAL', 'decimal']], rows);
}

export function adcm() {
  const ANTI = 'ANTIINFECTIVES FOR SYSTEMIC USE';
  return datasetJson('ADCM', [['STUDYID', 'string'], ['USUBJID', 'string'], ['CMDECOD', 'string'], ['CMCLAS', 'string'], ['ONTRTFL', 'string']], [
    [STUDY_ID, ids[0], 'VANCOMYCIN', ANTI, 'Y'], [STUDY_ID, ids[0], 'VANCOMYCIN', ANTI, 'Y'],
    [STUDY_ID, ids[12], 'VANCOMYCIN', ANTI, 'Y'], [STUDY_ID, ids[13], 'PARACETAMOL', null, 'Y'],
    [STUDY_ID, ids[2], 'OMEPRAZOLE', 'ALIMENTARY TRACT AND METABOLISM', 'N'],
  ]);
}

export const PRIMARY = 'Global cure at Week 8 (SYNTHETIC)';
export function efficacyResults(): CsrEfficacyResults {
  return { format: CSR_EFFICACY_RESULTS_FORMAT, protocolNumber: 'SYN-LMN201-PROTOCOL', results: [
    { endpointName: PRIMARY, endpointType: 'primary', armId: 'LMN201', value: 10 / 12, display: '10/12 (83.3%) synthetic',
      comparatorArmId: 'PBO', credibleInterval: { lower: 1.11, upper: 9.99, level: '95% (synthetic placeholder)' },
      posteriorProbability: { value: 0.987, hypothesis: 'OR > 1 (synthetic placeholder)' } },
    { endpointName: PRIMARY, endpointType: 'primary', armId: 'PBO', value: 4 / 11, display: '4/11 (36.4%) synthetic' },
  ] };
}

export function bundle(refs: Partial<Record<string, { documentId: string; expectedSha256: string }>> = {}): CsrAdamBundle {
  const ref = (n: string) => refs[n] ?? { documentId: '00000000-0000-4000-8000-000000000000', expectedSha256: '0'.repeat(64) };
  return { format: CSR_ADAM_BUNDLE_FORMAT, dataCutDate: '2026-03-31',
    studyInfo: { title: `Part B — ${SYNTHETIC_LABEL}`, protocolNumber: 'SYN-LMN201-PROTOCOL', phase: '2/3',
      indication: 'Recurrent C. difficile infection (synthetic)', sponsor: 'SYNTHETIC sponsor', investigationalProduct: 'LMN-201-like product (synthetic)',
      studyDesign: 'Randomized 1:1, double-blind, placebo-controlled, parallel (synthetic)', primaryEndpoint: PRIMARY, sampleSize: 23 },
    arms: [{ treatment: 'LMN-201', armId: 'LMN201', armName: 'LMN-201' }, { treatment: 'Placebo', armId: 'PBO', armName: 'Placebo' }],
    datasets: { ADSL: ref('ADSL'), ADAE: ref('ADAE'), ...(refs.ADEX ? { ADEX: ref('ADEX') } : {}), ...(refs.ADLB ? { ADLB: ref('ADLB') } : {}),
      ...(refs.ADVS ? { ADVS: ref('ADVS') } : {}), ...(refs.ADCM ? { ADCM: ref('ADCM') } : {}) },
    efficacyResults: ref('efficacy') };
}
