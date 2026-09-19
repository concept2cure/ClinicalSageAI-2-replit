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

/*
 * IVD_CLASSIFICATIONS, IVD_VALIDATIONS, IVD_CLINICAL and IVD_GSPR — removed.
 *
 * They were example rows behind sample mode, and what they asserted was
 * regulatory findings: Annex VIII class C and class D determinations, a limit
 * of detection and precision CV per analyte, sensitivity and specificity to
 * three decimal places against named study sizes, and a per-chapter conformity
 * count that fed the surface's headline "% compliant".
 *
 * IvdSurface already refused fixtures for its companion-diagnostic and CLIA
 * panels, in its own words: "an invented CDx approval or waiver grant is a
 * regulatory claim". A class determination, an LoD and a clinical sensitivity
 * are the same kind of claim. All four panels have live endpoints and now read
 * live or read nothing, each stating its own reading through DataGate.
 *
 * One correction these rows carried is worth keeping, because it was about the
 * regulation and not about any tenant: this surface once carried MDR's Annex I
 * schedule — 23 requirements across 1–9 / 10–18 / 19–23 — on an IVD workbench,
 * so an IVD manufacturer worked a checklist generated from the wrong
 * regulation. IVDR (EU) 2017/746 Annex I has 20, split I (1–8), II (9–13),
 * III (14–20). The server owns that structure now
 * (/api/ivdr/gspr-checklist/:id/matrix returns the chapters and their labels),
 * which is where a regulatory schedule belongs.
 */

