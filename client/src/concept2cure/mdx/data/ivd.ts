/**
 * IVD (in-vitro diagnostic) workbench fixtures — IVDR pathway.
 *
 * Mirrors data/k510.ts: kit fixtures that render while the live IVDR
 * endpoints (/api/ivdr/*) load or when they error, so the surface is never
 * empty. The live hooks in hooks/useIvd.ts adapt the real DB rows into these
 * shapes and fall back here on non-2xx.
 */

export type IvdClass = 'A' | 'B' | 'C' | 'D';
export type IvdParamStatus = 'pass' | 'fail' | 'pending';
export type IvdReqStatus =
  | 'compliant'
  | 'partially_compliant'
  | 'non_compliant'
  | 'not_assessed'
  | 'not_applicable';

export interface IvdStage {
  id: string;
  label: string;
  meta: string;
}

export interface IvdClassification {
  id: string;
  device: string;
  intendedPurpose: string;
  classification: IvdClass;
  /** Top matched Annex VIII rule, if known. */
  rule?: string;
  selfTest?: boolean;
  nearPatient?: boolean;
  cdx?: boolean;
}

export interface IvdValidation {
  id: string;
  /** Analyte / measurand or device name the validation record belongs to. */
  analyte: string;
  lod: number | null;
  loq: number | null;
  precisionCV: number | null;
  sensitivity: number | null;
  specificity: number | null;
  status: IvdParamStatus;
}

export interface IvdClinicalEvidence {
  id: string;
  study: string;
  tp: number;
  fp: number;
  tn: number;
  fn: number;
  /** Derived metrics (computed client-side when the server omits them). */
  sensitivity: number | null;
  specificity: number | null;
  ppv: number | null;
  npv: number | null;
  accuracy: number | null;
  status: string;
}

export interface IvdGsprChapter {
  key: 'I' | 'II' | 'III';
  label: string;
  total: number;
  compliant: number;
  partiallyCompliant: number;
  nonCompliant: number;
  notAssessed: number;
}

/** 7-stage IVDR lifecycle — intake → classification → analytical → clinical → GSPR → dossier → submit. */
export const IVD_STAGES: IvdStage[] = [
  { id: 'intake',         label: 'Intake',               meta: 'Biomarker · intended purpose' },
  { id: 'classification', label: 'Classification',       meta: 'Annex VIII rule engine' },
  { id: 'analytical',     label: 'Analytical validation', meta: 'LoD · LoQ · precision' },
  { id: 'clinical',       label: 'Clinical evidence',    meta: '2×2 · sensitivity · specificity' },
  { id: 'gspr',           label: 'GSPR compliance',      meta: 'Annex I · 20 requirements' },
  { id: 'dossier',        label: 'Assemble dossier',     meta: 'Technical file · declaration' },
  { id: 'submit',         label: 'Submit',               meta: 'EUDAMED · NB review' },
];

export const IVD_CLASSIFICATIONS: IvdClassification[] = [
  { id: 'c-01', device: 'BX-Dx HbA1c Assay',         intendedPurpose: 'Quantitative HbA1c for diabetes monitoring',        classification: 'C', rule: 'Rule 3(k) — monitoring', nearPatient: true },
  { id: 'c-02', device: 'BX-Dx SARS-CoV-2 Antigen',  intendedPurpose: 'Qualitative detection of transmissible agent',      classification: 'D', rule: 'Rule 1 — transmissible agent', selfTest: true },
  { id: 'c-03', device: 'BX-Dx EGFR Companion Test',  intendedPurpose: 'Select patients for targeted EGFR therapy',         classification: 'C', rule: 'Rule 3(c) — companion diagnostic', cdx: true },
];

export const IVD_VALIDATIONS: IvdValidation[] = [
  { id: 'v-01', analyte: 'HbA1c',        lod: 2.1,  loq: 3.0,  precisionCV: 2.4, sensitivity: null, specificity: null, status: 'pass' },
  { id: 'v-02', analyte: 'SARS-CoV-2 Ag', lod: 12.5, loq: 18.0, precisionCV: 4.8, sensitivity: 0.94, specificity: 0.99, status: 'pass' },
  { id: 'v-03', analyte: 'EGFR exon 19',  lod: null, loq: null, precisionCV: 5.9, sensitivity: 0.88, specificity: 0.97, status: 'pending' },
];

export const IVD_CLINICAL: IvdClinicalEvidence[] = [
  { id: 'e-01', study: 'HbA1c method comparison (n=420)',  tp: 198, fp: 6,  tn: 210, fn: 6,  sensitivity: 0.971, specificity: 0.972, ppv: 0.971, npv: 0.972, accuracy: 0.971, status: 'complete' },
  { id: 'e-02', study: 'SARS-CoV-2 Ag field study (n=512)', tp: 240, fp: 4,  tn: 260, fn: 8,  sensitivity: 0.968, specificity: 0.985, ppv: 0.984, npv: 0.970, accuracy: 0.977, status: 'complete' },
  { id: 'e-03', study: 'EGFR CDx bridging (n=180)',         tp: 70,  fp: 5,  tn: 95,  fn: 10, sensitivity: 0.875, specificity: 0.950, ppv: 0.933, npv: 0.905, accuracy: 0.917, status: 'in_review' },
];

/* IVDR Annex I, not MDR's. This surface carried MDR's schedule — 23
   requirements across 1–9 / 10–18 / 19–23 — on an IVD workbench, so the
   checklist an IVD manufacturer worked through was generated from the wrong
   regulation. IVDR (EU) 2017/746 Annex I has 20, and the boundaries below are
   the ones stated in the MDX work order. SEE THE COMMIT MESSAGE: the total is
   certain, the internal split is the open question. */
export const IVD_GSPR: IvdGsprChapter[] = [
  { key: 'I',   label: 'General requirements (GSPR 1–8)',           total: 8, compliant: 6, partiallyCompliant: 1, nonCompliant: 0, notAssessed: 1 },
  { key: 'II',  label: 'Performance, design & manufacture (9–13)',  total: 5, compliant: 3, partiallyCompliant: 1, nonCompliant: 1, notAssessed: 0 },
  { key: 'III', label: 'Information supplied (GSPR 14–20)',         total: 7, compliant: 4, partiallyCompliant: 1, nonCompliant: 0, notAssessed: 2 },
];
