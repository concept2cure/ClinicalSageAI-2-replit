/**
 * 510(k) pathway fixtures — ported verbatim from data.jsx.
 */

export type EstarStatus = 'complete' | 'review' | 'draft' | 'na' | 'empty';
export type PredicateStatus = 'selected' | 'candidate' | 'reviewed' | 'rejected';

export interface K510Stage {
  id: string;
  label: string;
  meta: string;
}

export interface Predicate {
  k: string;
  name: string;
  holder: string;
  cleared: string;
  class: string;
  code: string;
  match: number;
  status: PredicateStatus;
  diffs: number;
}

export interface SeRow {
  attr: string;
  subject: string;
  predicate: string;
  verdict: 'same' | 'equivalent' | 'different';
  note?: string;
}

export interface EstarRow {
  id: number;
  label: string;
  status: EstarStatus;
  blocker?: boolean;
}

export const K510_STAGES: K510Stage[] = [
  { id: 'intake',     label: 'Intake',                  meta: 'Device spec · intended use' },
  { id: 'classify',   label: 'Classify',                meta: 'Product code · pathway' },
  { id: 'predicate',  label: 'Predicate search',        meta: 'Precedent intelligence' },
  { id: 'testing',    label: 'Performance testing',     meta: 'Bench · analytical · clinical' },
  { id: 'se',         label: 'Substantial equivalence', meta: 'SE matrix · differences' },
  { id: 'assemble',   label: 'Assemble eSTAR',          meta: '20 sections · validation' },
  { id: 'submit',     label: 'Submit',                  meta: 'eSTAR + cover letter' },
];

export const K510_PREDICATES: Predicate[] = [
  { k: 'K221847', name: 'Dexcom G7 CGM System',              holder: 'Dexcom, Inc.',            cleared: '2022-12-08', class: 'II', code: 'MDS', match: 94, status: 'selected',  diffs: 3 },
  { k: 'K213163', name: 'FreeStyle Libre 3 Glucose Monitor', holder: 'Abbott Diabetes Care',    cleared: '2022-05-17', class: 'II', code: 'MDS', match: 88, status: 'candidate', diffs: 5 },
  { k: 'K201715', name: 'Medtronic Guardian Connect',        holder: 'Medtronic MiniMed, Inc.', cleared: '2020-09-22', class: 'II', code: 'MDS', match: 71, status: 'reviewed',  diffs: 9 },
  { k: 'K193536', name: 'Senseonics Eversense E3',           holder: 'Senseonics, Inc.',        cleared: '2022-02-11', class: 'II', code: 'MDS', match: 66, status: 'reviewed',  diffs: 11 },
  { k: 'K182764', name: 'Dexcom G6 CGM System',              holder: 'Dexcom, Inc.',            cleared: '2018-11-06', class: 'II', code: 'MDS', match: 62, status: 'rejected',  diffs: 14 },
  { k: 'K162625', name: 'Medtronic Enlite Sensor',           holder: 'Medtronic MiniMed, Inc.', cleared: '2016-08-30', class: 'II', code: 'MDS', match: 54, status: 'rejected',  diffs: 18 },
];

export const K510_SE_ROWS: SeRow[] = [
  { attr: 'Intended use',         subject: 'Continuous glucose monitoring for diabetes management', predicate: 'Continuous glucose monitoring for diabetes management', verdict: 'same' },
  { attr: 'Indications for use',  subject: 'Adults and children ≥ 7 years with diabetes',           predicate: 'Adults and children ≥ 2 years with diabetes',            verdict: 'different', note: 'Narrower age range' },
  { attr: 'Technology',           subject: 'Electrochemical enzyme sensor',                         predicate: 'Electrochemical enzyme sensor',                          verdict: 'same' },
  { attr: 'Wear duration',        subject: '14 days',                                               predicate: '10 days',                                                verdict: 'different', note: 'Extended wear — additional biocompatibility' },
  { attr: 'MARD accuracy',        subject: '8.2%',                                                  predicate: '8.7%',                                                   verdict: 'equivalent' },
  { attr: 'Calibration',          subject: 'Factory calibrated',                                    predicate: 'Factory calibrated',                                     verdict: 'same' },
  { attr: 'Warm-up period',       subject: '30 minutes',                                            predicate: '30 minutes',                                             verdict: 'same' },
  { attr: 'Data transmission',    subject: 'BLE to phone · 5 min intervals',                        predicate: 'BLE to phone · 5 min intervals',                         verdict: 'same' },
  { attr: 'Alerts',               subject: 'Urgent low, high, predictive low',                      predicate: 'Urgent low, high',                                       verdict: 'different', note: 'Added predictive algorithm' },
  { attr: 'Biocompatibility',     subject: 'ISO 10993-1 · -5 · -10 · -11',                          predicate: 'ISO 10993-1 · -5 · -10',                                 verdict: 'equivalent', note: 'Added -11 for 14-day wear' },
];

export const K510_ESTAR: EstarRow[] = [
  { id: 1,  label: 'Medical Device User Fee Cover Sheet',          status: 'complete' },
  { id: 2,  label: 'CDRH Premarket Review Submission Cover Sheet', status: 'complete' },
  { id: 3,  label: '510(k) Cover Letter',                          status: 'draft' },
  { id: 4,  label: 'Indications for Use Statement',                status: 'complete' },
  { id: 5,  label: '510(k) Summary',                               status: 'draft' },
  { id: 6,  label: 'Truthful and Accuracy Statement',              status: 'complete' },
  { id: 7,  label: 'Class III Summary and Certification',          status: 'na' },
  { id: 8,  label: 'Financial Certification or Disclosure',        status: 'complete' },
  { id: 9,  label: 'Declarations of Conformity',                   status: 'complete' },
  { id: 10, label: 'Device Description',                           status: 'draft' },
  { id: 11, label: 'Substantial Equivalence Discussion',           status: 'draft' },
  { id: 12, label: 'Proposed Labeling',                            status: 'review' },
  { id: 13, label: 'Sterilization and Shelf Life',                 status: 'complete' },
  { id: 14, label: 'Biocompatibility',                             status: 'review' },
  { id: 15, label: 'Software',                                     status: 'draft' },
  { id: 16, label: 'Electromagnetic Compatibility',                status: 'complete' },
  { id: 17, label: 'Performance Testing — Bench',                  status: 'review' },
  { id: 18, label: 'Performance Testing — Animal',                 status: 'na' },
  { id: 19, label: 'Performance Testing — Clinical',               status: 'draft', blocker: true },
  { id: 20, label: 'References',                                   status: 'complete' },
];
