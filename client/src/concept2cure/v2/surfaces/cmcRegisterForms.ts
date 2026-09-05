/**
 * CMC register data entry — the form schemas and the value→body mappings that
 * carry a CMC scientist's input into the governed CMC tables.
 *
 * ── Why this module exists ────────────────────────────────────────────────────
 * `server/api/cmc/routes.ts` has served create endpoints for the analytical
 * method library, QC testing, stability studies, process validation, change
 * control, drug substance, drug product and comparability since the CMC schema
 * landed — and every one of those endpoints upserts a canonical Module 3 source
 * object on write (`services/cmc-write-through.ts`), which is what
 * `POST /api/cmc/module3-os/compile/:projectId` later composes §3.2.S / §3.2.P
 * from. The UI bound only the GET half. A CMC team could read those registers
 * and could not add a row to any of them, so the source layer Module 3 compiles
 * from could only ever be populated by something other than the product.
 *
 * This module is the input half. It is deliberately pure — no React, no fetch —
 * so the shape gap between "what a scientist types" and "what the table
 * requires" is unit-tested in isolation (cmcRegisterForms.test.ts), the same
 * convention as ./cmcSpec and ./cmcBatch.
 *
 * ── The discipline these mappings enforce ─────────────────────────────────────
 * Several of these tables carry NOT NULL columns the previous read-only cards
 * never showed: `analytical_methods.analyte` / `.matrix`,
 * `stability_studies.batch_number` / `.test_parameters` / `.start_date`,
 * `qc_testing.test_date`, `cmc_change_control.justification`. A form that omits
 * them produces a row the database refuses. Every required column below is a
 * required field above it, so the rejection happens in the drawer with the
 * field named, not as an opaque write failure.
 *
 * Free-form json columns (`ich_q2_parameters`, `test_results`,
 * `critical_process_parameters`, `manufacturing_process`, …) are populated with
 * a small, named, documented shape rather than left null — an empty json column
 * is a section Module 3 composition has nothing to say about.
 */

import type { C2CFormConfig } from '../C2CForm';
/* The scope vocabulary is the composer's, not the form's: shared/cmc/material-scope.ts. */
import { CMC_MATERIAL_SCOPES } from '@shared/cmc/material-scope';
/* The dissolution purposes are the composer's, not the form's: one definition,
   so the section a profile files under is decided once. */
import { DISSOLUTION_PURPOSES } from '@shared/cmc/dissolution-purpose';

/* ── Small shared helpers ─────────────────────────────────────────────────── */

/**
 * A comma/newline separated list → a trimmed string array with blanks removed.
 * Used for the array columns (batch numbers, time points, test parameters):
 * a scientist types "0, 3, 6, 12", not JSON.
 */
export function csvToArray(value: string | undefined | null): string[] {
  if (!value) return [];
  return String(value)
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * A form date (`yyyy-mm-dd`) → an ISO instant the API accepts, or undefined.
 *
 * The server side of this boundary now coerces ISO strings onto the `z.date()`
 * that drizzle-zod generates for a `timestamp` column; before that fix a date
 * could not cross the JSON boundary at all. Blank stays undefined rather than
 * becoming `new Date('')`, so an optional date left empty is "not set".
 */
export function isoDate(value: string | undefined | null): string | undefined {
  const raw = String(value ?? '').trim();
  if (!raw) return undefined;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** Trim to a value, or undefined — never an empty string in a payload. */
function opt(value: string | undefined | null): string | undefined {
  const t = String(value ?? '').trim();
  return t || undefined;
}

/** Trim, defaulting to '' — for the NOT NULL text columns. */
function req(value: string | undefined | null): string {
  return String(value ?? '').trim();
}

/** A positive integer user id, or undefined. `AuthUser.id` is a string. */
export function asUserId(id: string | number | undefined | null): number | undefined {
  const n = typeof id === 'number' ? id : parseInt(String(id ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/* ═══════════ Analytical methods — POST/PUT /api/cmc/analytical-methods ═══════
   ICH Q2(R2). The method library the Specifications tab's "a specification
   cannot be approved until its method is validated" rule points at. */

/** The techniques a validated pharmaceutical method is actually run on. */
export const METHOD_TECHNIQUES = [
  'HPLC', 'UPLC', 'SE-HPLC', 'IEX-HPLC', 'RP-HPLC', 'GC', 'GC-MS', 'LC-MS/MS',
  'CE', 'icIEF', 'UV-VIS', 'FTIR', 'NMR', 'ICP-MS', 'Karl Fischer', 'Titration',
  'ELISA', 'qPCR', 'Cell-based bioassay', 'Dissolution', 'Compendial (USP/Ph.Eur.)',
];

/** What the method is for — drives which §3.2 control section it lands in. */
export const METHOD_PURPOSES = [
  'Assay / content', 'Identity', 'Purity / related substances', 'Impurities',
  'Residual solvents', 'Elemental impurities', 'Water content', 'Dissolution',
  'Potency', 'Content uniformity', 'Microbial limits', 'Sterility', 'Endotoxin',
  'Sub-visible particulates', 'Charge variants', 'Aggregates', 'Glycan profile',
];

/** What the method is run on. */
export const METHOD_MATRICES = [
  'Drug substance', 'Drug product', 'Excipient', 'Raw material',
  'In-process sample', 'Placebo', 'Cleaning swab', 'Stability sample',
];

/** ICH Q2(R2) validation characteristics, for the validation record. */
export const ICH_Q2_CHARACTERISTICS = [
  'Specificity', 'Linearity', 'Range', 'Accuracy', 'Repeatability',
  'Intermediate precision', 'Detection limit', 'Quantitation limit', 'Robustness',
];

export interface AnalyticalMethodBody {
  methodCode: string;
  title: string;
  purpose: string;
  analyte: string;
  matrix: string;
  technique: string;
  status: string;
  ichQ2Parameters: { characteristics: string[]; summary?: string };
  validationDate?: string;
  projectId?: string;
}

export function methodForm(row?: Partial<AnalyticalMethodBody> | null): C2CFormConfig {
  return {
    eyebrow: 'Analytical development — ICH Q2(R2)',
    title: row ? 'Edit analytical method' : 'New analytical method',
    sub: 'A validated procedure a specification can be measured against',
    submitLabel: row ? 'Save method' : 'Add method',
    fields: [
      { key: 'methodCode', label: 'Method code', type: 'text', required: true, half: true, default: row?.methodCode ?? '', placeholder: 'e.g. AM-014' },
      { key: 'technique', label: 'Technique', type: 'select', options: METHOD_TECHNIQUES, required: true, half: true, default: row?.technique ?? '' },
      { key: 'title', label: 'Method title', type: 'text', required: true, default: row?.title ?? '', placeholder: 'e.g. Determination of charge variants by icIEF' },
      { key: 'analyte', label: 'Analyte', type: 'text', required: true, half: true, default: row?.analyte ?? '', placeholder: 'What is measured, e.g. Acidic variants' },
      { key: 'matrix', label: 'Matrix', type: 'select', options: METHOD_MATRICES, required: true, half: true, default: row?.matrix ?? 'Drug substance' },
      { key: 'purpose', label: 'Purpose', type: 'select', options: METHOD_PURPOSES, required: true, half: true, default: row?.purpose ?? '' },
      { key: 'status', label: 'Status', type: 'select', options: ['development', 'validation', 'validated', 'retired'], required: true, half: true, default: row?.status ?? 'development' },
      { key: 'validationDate', label: 'Validation date', type: 'date', half: true, default: row?.validationDate ? String(row.validationDate).slice(0, 10) : '', desc: 'Set when the ICH Q2 package is complete' },
      { key: 'characteristics', label: 'ICH Q2 characteristics evaluated', type: 'text', default: (row?.ichQ2Parameters?.characteristics ?? []).join(', '), placeholder: ICH_Q2_CHARACTERISTICS.slice(0, 4).join(', ') },
      { key: 'summary', label: 'Validation summary', type: 'textarea', default: row?.ichQ2Parameters?.summary ?? '', placeholder: 'Outcome against the acceptance criteria for each characteristic…' },
    ],
  };
}

export function methodBody(v: Record<string, string>, projectId?: string): AnalyticalMethodBody {
  const body: AnalyticalMethodBody = {
    methodCode: req(v.methodCode),
    title: req(v.title),
    purpose: req(v.purpose),
    analyte: req(v.analyte),
    matrix: req(v.matrix),
    technique: req(v.technique),
    status: req(v.status) || 'development',
    ichQ2Parameters: {
      characteristics: csvToArray(v.characteristics),
      ...(opt(v.summary) ? { summary: opt(v.summary) } : {}),
    },
  };
  const vd = isoDate(v.validationDate);
  if (vd) body.validationDate = vd;
  if (projectId) body.projectId = projectId;
  return body;
}

/* ═══════════ QC testing — POST/PUT /api/cmc/qc-testing ═══════════════════════
   The measurement actually performed against a specification. */

export const QC_SAMPLE_TYPES = [
  'raw-material', 'in-process', 'finished-product', 'stability', 'reference-standard', 'cleaning-verification',
];

export interface QcTestBody {
  sampleId: string;
  sampleType: string;
  testMethod: string;
  testDate: string;
  testResults: { value?: string; unit?: string; observation?: string };
  specifications: { acceptanceCriteria?: string };
  passFailStatus: string;
  certificateOfAnalysis?: string;
  analyst?: number;
  /* Carries the QC result through to the canonical Module 3 source object.
     Without it the write-through cannot fire, and a recorded release result
     never reaches §3.2.S.4.4 / §3.2.P.5.4 Batch Analyses. */
  projectId?: string;
}

export function qcTestForm(): C2CFormConfig {
  return {
    eyebrow: 'Quality control — result entry',
    title: 'Log a QC result',
    sub: 'A sample tested against its specification',
    submitLabel: 'Record result',
    fields: [
      { key: 'sampleId', label: 'Sample ID', type: 'text', required: true, half: true, placeholder: 'e.g. S-2407-118' },
      { key: 'sampleType', label: 'Sample type', type: 'select', options: QC_SAMPLE_TYPES, required: true, half: true, default: 'finished-product' },
      { key: 'testMethod', label: 'Test method', type: 'text', required: true, default: '', placeholder: 'Method code or title, e.g. AM-014 icIEF' },
      { key: 'testDate', label: 'Test date', type: 'date', required: true, half: true },
      { key: 'passFailStatus', label: 'Result', type: 'seg', options: ['pending', 'pass', 'fail'], default: 'pending', half: true },
      { key: 'value', label: 'Result value', type: 'text', half: true, placeholder: 'e.g. 1.4' },
      { key: 'unit', label: 'Unit', type: 'text', half: true, placeholder: 'e.g. %' },
      { key: 'acceptanceCriteria', label: 'Acceptance criteria', type: 'text', placeholder: 'The limit this result is judged against, e.g. <= 2.0%' },
      { key: 'observation', label: 'Observation', type: 'textarea', placeholder: 'Anything the numeric result does not carry — appearance, an OOS trigger, a repeat…' },
      { key: 'certificateOfAnalysis', label: 'CoA reference', type: 'text', half: true, placeholder: 'e.g. CoA-2407-118' },
    ],
  };
}

export function qcTestBody(
  v: Record<string, string>,
  analystUserId?: number,
  projectId?: string,
): QcTestBody {
  const body: QcTestBody = {
    sampleId: req(v.sampleId),
    sampleType: req(v.sampleType),
    testMethod: req(v.testMethod),
    // Required by the table. isoDate returns undefined for a blank, and the
    // form marks it required, so '' here only ever reaches a rejected write —
    // never a row with a fabricated test date.
    testDate: isoDate(v.testDate) ?? '',
    testResults: {
      ...(opt(v.value) ? { value: opt(v.value) } : {}),
      ...(opt(v.unit) ? { unit: opt(v.unit) } : {}),
      ...(opt(v.observation) ? { observation: opt(v.observation) } : {}),
    },
    specifications: {
      ...(opt(v.acceptanceCriteria) ? { acceptanceCriteria: opt(v.acceptanceCriteria) } : {}),
    },
    passFailStatus: req(v.passFailStatus) || 'pending',
  };
  const coa = opt(v.certificateOfAnalysis);
  if (coa) body.certificateOfAnalysis = coa;
  if (analystUserId) body.analyst = analystUserId;
  if (projectId) body.projectId = projectId;
  return body;
}

/**
 * Second-person QC review.
 *
 * A result is recorded by the analyst who ran the test and verified by someone
 * else before the material moves — the reviewer sets the disposition and, when
 * the result passes, the release date. `analyst` is never sent: who performed
 * the test is a matter of record, and the server refuses it on this path too.
 */
export function qcReviewForm(sampleId: string, currentStatus: string): C2CFormConfig {
  return {
    eyebrow: 'Quality control — second-person review',
    title: 'Review ' + sampleId,
    sub: 'Verify the recorded result and set its disposition',
    governed: 'The reviewer is recorded against this result. Review is a separate person from the analyst who ran the test.',
    submitLabel: 'Record review',
    fields: [
      { key: 'passFailStatus', label: 'Disposition', type: 'seg', options: ['pass', 'fail', 'pending'], default: currentStatus === 'pending' ? 'pass' : currentStatus, half: true },
      { key: 'releaseDate', label: 'Release date', type: 'date', half: true, desc: 'Set when the sample is released on this result' },
      { key: 'certificateOfAnalysis', label: 'CoA reference', type: 'text', placeholder: 'e.g. CoA-2407-118' },
    ],
  };
}

export interface QcReviewBody {
  passFailStatus: string;
  releaseDate?: string;
  certificateOfAnalysis?: string;
  reviewedBy?: number;
  /* The review is the state change that matters downstream — an unreviewed
     result is not releasable evidence — so the canonical source must be
     refreshed here too, which needs the project. */
  projectId?: string;
}

export function qcReviewBody(
  v: Record<string, string>,
  reviewerUserId?: number,
  projectId?: string,
): QcReviewBody {
  const body: QcReviewBody = { passFailStatus: req(v.passFailStatus) || 'pending' };
  const rd = isoDate(v.releaseDate);
  if (rd) body.releaseDate = rd;
  const coa = opt(v.certificateOfAnalysis);
  if (coa) body.certificateOfAnalysis = coa;
  if (reviewerUserId) body.reviewedBy = reviewerUserId;
  if (projectId) body.projectId = projectId;
  return body;
}

/* ═══════════ Stability studies — POST/PUT /api/cmc/stability-studies ═════════
   ICH Q1A(R2). The evidence behind every shelf-life claim in §3.2.S.7 / §3.2.P.8. */

/**
 * The ICH storage conditions a study is actually placed at, each carrying the
 * `storage_conditions` code the table already uses. The value is
 * `CODE|condition` so a study records both the classification the register
 * filters on and the condition a reviewer reads.
 */
export const STABILITY_CONDITIONS: { value: string; label: string }[] = [
  { value: 'LT|25°C ± 2°C / 60% ± 5% RH', label: 'Long-term — 25°C/60% RH (Zone I/II)' },
  { value: 'LT|30°C ± 2°C / 65% ± 5% RH', label: 'Long-term — 30°C/65% RH (Zone III/IVa)' },
  { value: 'LT|30°C ± 2°C / 75% ± 5% RH', label: 'Long-term — 30°C/75% RH (Zone IVb)' },
  { value: 'LT|5°C ± 3°C', label: 'Long-term — 5°C ± 3°C (refrigerated)' },
  { value: 'LT|-20°C ± 5°C', label: 'Long-term — -20°C ± 5°C (frozen)' },
  { value: 'INT|30°C ± 2°C / 65% ± 5% RH', label: 'Intermediate — 30°C/65% RH' },
  { value: 'ACC|40°C ± 2°C / 75% ± 5% RH', label: 'Accelerated — 40°C/75% RH' },
  { value: 'ACC|25°C ± 2°C / 60% ± 5% RH', label: 'Accelerated (refrigerated product) — 25°C/60% RH' },
  { value: 'STR|Thermal / photo / freeze-thaw stress', label: 'Stress — thermal, photostability or freeze-thaw' },
];

export const STABILITY_ZONES = ['I', 'II', 'III', 'IVa', 'IVb'];
export const STABILITY_STATUSES = ['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'];

export interface StabilityStudyBody {
  studyTitle?: string;
  productName: string;
  batchNumber: string;
  dosageForm: string;
  strength?: string;
  scope: string;
  climaticZone: string;
  studyType: string;
  storageConditions: string[];
  duration: number;
  testParameters: string[];
  timePoints: string[];
  status: string;
  startDate: string;
  plannedEndDate?: string;
  notes?: string;
  projectId?: string;
}

/** The study type implied by the chosen storage condition's code. */
export function studyTypeForCode(code: string): string {
  if (code === 'ACC') return 'accelerated';
  if (code === 'INT') return 'intermediate';
  if (code === 'STR') return 'stress';
  return 'long-term';
}

export function stabilityForm(): C2CFormConfig {
  return {
    eyebrow: 'Stability programme — ICH Q1A(R2)',
    title: 'Register a stability study',
    sub: 'A batch on stability at a defined condition, with its pull schedule',
    submitLabel: 'Register study',
    fields: [
      { key: 'studyTitle', label: 'Study title', type: 'text', placeholder: 'e.g. BX-204 DP 50 mg/mL — primary stability, Zone II' },
      { key: 'productName', label: 'Product / substance name', type: 'text', required: true, half: true, placeholder: 'e.g. BX-204 drug product' },
      { key: 'batchNumber', label: 'Batch on stability', type: 'text', required: true, half: true, placeholder: 'e.g. BX204-DP-2407' },
      { key: 'scope', label: 'Scope', type: 'seg', options: [{ value: 'DS', label: 'Drug substance (§3.2.S.7)' }, { value: 'DP', label: 'Drug product (§3.2.P.8)' }], required: true, default: 'DP', half: true },
      { key: 'dosageForm', label: 'Dosage form', type: 'text', required: true, half: true, default: 'Solution for injection' },
      { key: 'strength', label: 'Strength', type: 'text', half: true, placeholder: 'e.g. 50 mg/mL' },
      { key: 'climaticZone', label: 'Climatic zone', type: 'select', options: STABILITY_ZONES, required: true, half: true, default: 'II' },
      { key: 'condition', label: 'Storage condition', type: 'select', options: STABILITY_CONDITIONS, required: true, desc: 'Sets the study type (long-term / intermediate / accelerated / stress)' },
      { key: 'duration', label: 'Planned duration (months)', type: 'number', min: 1, max: 120, required: true, half: true, default: '24' },
      { key: 'startDate', label: 'Start date', type: 'date', required: true, half: true },
      { key: 'timePoints', label: 'Pull points (months)', type: 'text', required: true, default: '0, 3, 6, 9, 12, 18, 24', placeholder: '0, 3, 6, 12…' },
      { key: 'testParameters', label: 'Parameters tested at each pull', type: 'text', required: true, default: 'Appearance, Assay, Related substances, Water content', placeholder: 'Appearance, Assay, …' },
      { key: 'status', label: 'Status', type: 'select', options: STABILITY_STATUSES, required: true, half: true, default: 'ACTIVE' },
      { key: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Container closure on stability, orientation, bracketing/matrixing design…' },
    ],
  };
}

export function stabilityBody(v: Record<string, string>, projectId?: string): StabilityStudyBody {
  const [code, condition] = String(v.condition ?? '').split('|');
  const storageCode = req(code) || 'LT';
  const durationMonths = parseInt(String(v.duration ?? ''), 10);
  const body: StabilityStudyBody = {
    productName: req(v.productName),
    batchNumber: req(v.batchNumber),
    dosageForm: req(v.dosageForm) || 'Not specified',
    scope: req(v.scope) || 'DP',
    climaticZone: req(v.climaticZone) || 'II',
    studyType: studyTypeForCode(storageCode),
    // Both the code the register classifies on and the condition a reviewer
    // reads. STAB_STORAGE_LABEL maps the code and passes anything else through,
    // so the condition renders as itself rather than as an unknown code.
    storageConditions: condition ? [storageCode, condition] : [storageCode],
    duration: Number.isFinite(durationMonths) && durationMonths > 0 ? durationMonths : 24,
    testParameters: csvToArray(v.testParameters),
    timePoints: csvToArray(v.timePoints),
    status: req(v.status) || 'ACTIVE',
    startDate: isoDate(v.startDate) ?? '',
  };
  const title = opt(v.studyTitle);
  if (title) body.studyTitle = title;
  const strength = opt(v.strength);
  if (strength) body.strength = strength;
  const notes = opt(v.notes);
  if (notes) body.notes = notes;
  // Planned end is derivable, and deriving it is honest: it is start + the
  // duration the study was registered for, not an invented commitment.
  const start = isoDate(v.startDate);
  if (start) {
    const end = new Date(start);
    end.setMonth(end.getMonth() + body.duration);
    body.plannedEndDate = end.toISOString();
  }
  if (projectId) body.projectId = projectId;
  return body;
}

/* ── Stability pull-point results ──
   A study is a multi-year record; its value to §3.2.S.7 is the measurements at
   each pull, not the registration. Results are appended to the study's
   `stability_data` json rather than overwriting it, so the series accumulates. */

export interface StabilityResult {
  timePoint: string;
  condition?: string;
  parameter: string;
  result: string;
  specification?: string;
  withinSpecification: boolean;
  testedOn?: string;
  recordedBy?: string;
}

export function stabilityResultForm(study: { timePoints?: string[] | null; testParameters?: string[] | null }): C2CFormConfig {
  const points = (study.timePoints ?? []).filter(Boolean);
  const params = (study.testParameters ?? []).filter(Boolean);
  return {
    eyebrow: 'Stability — pull-point result',
    title: 'Record a timepoint result',
    sub: 'Appended to this study’s stability data; existing results are preserved',
    submitLabel: 'Record result',
    fields: [
      points.length
        ? { key: 'timePoint', label: 'Pull point (months)', type: 'select', options: points, required: true, half: true }
        : { key: 'timePoint', label: 'Pull point (months)', type: 'text', required: true, half: true, placeholder: 'e.g. 6' },
      params.length
        ? { key: 'parameter', label: 'Parameter', type: 'select', options: params, required: true, half: true }
        : { key: 'parameter', label: 'Parameter', type: 'text', required: true, half: true, placeholder: 'e.g. Assay' },
      { key: 'result', label: 'Result', type: 'text', required: true, half: true, placeholder: 'e.g. 98.4%' },
      { key: 'specification', label: 'Specification', type: 'text', half: true, placeholder: 'e.g. 95.0 – 105.0%' },
      { key: 'withinSpecification', label: 'Within specification', type: 'seg', options: ['yes', 'no'], default: 'yes', half: true },
      { key: 'testedOn', label: 'Tested on', type: 'date', half: true },
    ],
  };
}

export function stabilityResultBody(
  v: Record<string, string>,
  existing: unknown,
  meta: { condition?: string; recordedBy?: string } = {},
): { stabilityData: { results: StabilityResult[] } } {
  const prior = readStabilityResults(existing);
  const entry: StabilityResult = {
    timePoint: req(v.timePoint),
    parameter: req(v.parameter),
    result: req(v.result),
    withinSpecification: req(v.withinSpecification) !== 'no',
  };
  const spec = opt(v.specification);
  if (spec) entry.specification = spec;
  const tested = isoDate(v.testedOn);
  if (tested) entry.testedOn = tested;
  if (meta.condition) entry.condition = meta.condition;
  if (meta.recordedBy) entry.recordedBy = meta.recordedBy;
  return { stabilityData: { results: [...prior, entry] } };
}

/**
 * Read the recorded series out of a study's `stability_data` column, tolerant
 * of the shapes a json column can arrive in (parsed object, JSON string, a bare
 * array from an older writer, or null). Never throws; unknown shapes read as no
 * results rather than as fabricated ones.
 */
export function readStabilityResults(value: unknown): StabilityResult[] {
  let raw = value;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      raw = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (Array.isArray(raw)) return raw.filter(isStabilityResult);
  if (raw && typeof raw === 'object') {
    const results = (raw as { results?: unknown }).results;
    if (Array.isArray(results)) return results.filter(isStabilityResult);
  }
  return [];
}

function isStabilityResult(v: unknown): v is StabilityResult {
  return Boolean(v) && typeof v === 'object' && typeof (v as StabilityResult).parameter === 'string';
}

/** Close a study out with the shelf life its data support. */
export function stabilityCloseoutForm(current: { shelfLife?: string | null }): C2CFormConfig {
  return {
    eyebrow: 'Stability — study close-out',
    title: 'Set the supported shelf life',
    sub: 'Recorded on the study and read by §3.2.S.7 / §3.2.P.8',
    submitLabel: 'Save shelf life',
    fields: [
      { key: 'shelfLife', label: 'Supported shelf life', type: 'text', required: true, half: true, default: current.shelfLife ?? '', placeholder: 'e.g. 24 months at 5°C ± 3°C' },
      { key: 'status', label: 'Study status', type: 'select', options: STABILITY_STATUSES, required: true, half: true, default: 'COMPLETED' },
      { key: 'notes', label: 'Basis', type: 'textarea', placeholder: 'The data supporting this claim — ICH Q1E extrapolation, worst-case batch, statistical treatment…' },
    ],
  };
}

export function stabilityCloseoutBody(v: Record<string, string>): { shelfLife: string; status: string; notes?: string } {
  const body: { shelfLife: string; status: string; notes?: string } = {
    shelfLife: req(v.shelfLife),
    status: req(v.status) || 'COMPLETED',
  };
  const notes = opt(v.notes);
  if (notes) body.notes = notes;
  return body;
}

/* ═══════════ Process validation — POST/PUT /api/cmc/process-validation ═══════
   The FDA 2011 process-validation lifecycle: design → qualification →
   continued process verification. */

export const PV_STAGES = [
  { value: 'design', label: 'Stage 1 — Process design' },
  { value: 'qualification', label: 'Stage 2 — Process qualification (PPQ)' },
  { value: 'verification', label: 'Stage 3 — Continued process verification' },
];
export const PV_STATUSES = ['planning', 'in-progress', 'completed', 'approved', 'on-hold'];

export interface ProcessValidationBody {
  processName: string;
  stage: string;
  batchNumbers: string[];
  criticalProcessParameters: { parameters: string[] };
  criticalQualityAttributes: { attributes: string[] };
  controlStrategy: { summary?: string };
  validationProtocol?: string;
  validationReport?: string;
  status: string;
  approvalDate?: string;
  projectId?: string;
}

export function processValidationForm(row?: Partial<ProcessValidationBody> | null): C2CFormConfig {
  return {
    eyebrow: 'Manufacturing science — process validation',
    title: row ? 'Edit process validation' : 'New process validation record',
    sub: 'FDA process-validation lifecycle — design, qualification, continued verification',
    submitLabel: row ? 'Save record' : 'Add record',
    fields: [
      { key: 'processName', label: 'Process', type: 'text', required: true, default: row?.processName ?? '', placeholder: 'e.g. Drug product fill-finish, 2000 L scale' },
      { key: 'stage', label: 'Lifecycle stage', type: 'select', options: PV_STAGES, required: true, half: true, default: row?.stage ?? 'qualification' },
      { key: 'status', label: 'Status', type: 'select', options: PV_STATUSES, required: true, half: true, default: row?.status ?? 'planning' },
      { key: 'batchNumbers', label: 'Batches in scope', type: 'text', default: (row?.batchNumbers ?? []).join(', '), placeholder: 'e.g. PPQ-01, PPQ-02, PPQ-03' },
      { key: 'criticalProcessParameters', label: 'Critical process parameters (CPP)', type: 'text', default: (row?.criticalProcessParameters?.parameters ?? []).join(', '), placeholder: 'e.g. Fill speed, Bulk hold time, Lyo shelf temperature' },
      { key: 'criticalQualityAttributes', label: 'Critical quality attributes (CQA)', type: 'text', default: (row?.criticalQualityAttributes?.attributes ?? []).join(', '), placeholder: 'e.g. Assay, Aggregates, Sub-visible particulates' },
      { key: 'controlStrategy', label: 'Control strategy', type: 'textarea', default: row?.controlStrategy?.summary ?? '', placeholder: 'How each CPP is controlled and each CQA is assured — ICH Q8/Q10…' },
      { key: 'validationProtocol', label: 'Protocol reference', type: 'text', half: true, default: row?.validationProtocol ?? '', placeholder: 'e.g. PV-PROT-011' },
      { key: 'approvalDate', label: 'Approval date', type: 'date', half: true, default: row?.approvalDate ? String(row.approvalDate).slice(0, 10) : '' },
    ],
  };
}

export function processValidationBody(v: Record<string, string>, projectId?: string): ProcessValidationBody {
  const body: ProcessValidationBody = {
    processName: req(v.processName),
    stage: req(v.stage) || 'design',
    batchNumbers: csvToArray(v.batchNumbers),
    criticalProcessParameters: { parameters: csvToArray(v.criticalProcessParameters) },
    criticalQualityAttributes: { attributes: csvToArray(v.criticalQualityAttributes) },
    controlStrategy: { ...(opt(v.controlStrategy) ? { summary: opt(v.controlStrategy) } : {}) },
    status: req(v.status) || 'planning',
  };
  const protocolRef = opt(v.validationProtocol);
  if (protocolRef) body.validationProtocol = protocolRef;
  const approval = isoDate(v.approvalDate);
  if (approval) body.approvalDate = approval;
  if (projectId) body.projectId = projectId;
  return body;
}

/* ═══════════ Change control — POST/PUT /api/cmc/change-control ═══════════════
   ICH Q12. The register the change simulator models against. */

export const CHANGE_TYPES = [
  'process', 'analytical', 'specification', 'facility', 'equipment',
  'supplier', 'raw-material', 'excipient', 'packaging', 'shelf-life', 'labelling',
];
export const CHANGE_FILINGS = [
  'Prior-Approval Supplement (PAS)', 'CBE-30', 'CBE-0', 'Annual Report',
  'Type IA (IN)', 'Type IB', 'Type II variation', 'PMDA partial change application',
  'PMDA minor change notification', 'No filing required',
];
export const CHANGE_STATUSES = ['draft', 'under-review', 'approved', 'implemented', 'rejected', 'closed'];

export interface ChangeControlBody {
  changeNumber: string;
  changeType: string;
  description: string;
  justification: string;
  impactAssessment: { summary?: string; impactedSections?: string[] };
  riskAssessment: { level: string };
  regulatoryFiling?: string;
  status: string;
  implementationDate?: string;
  projectId?: string;
}

export function changeControlForm(row?: Partial<ChangeControlBody> | null): C2CFormConfig {
  return {
    eyebrow: 'Change control — ICH Q12',
    title: row ? 'Update change record' : 'Raise a change',
    sub: 'The controlled record behind a CMC change and its filing category',
    submitLabel: row ? 'Save change' : 'Raise change',
    fields: [
      { key: 'changeNumber', label: 'Change number', type: 'text', required: true, half: true, default: row?.changeNumber ?? '', placeholder: 'e.g. CC-2026-041' },
      { key: 'changeType', label: 'Change type', type: 'select', options: CHANGE_TYPES, required: true, half: true, default: row?.changeType ?? '' },
      { key: 'description', label: 'Description', type: 'textarea', required: true, default: row?.description ?? '', placeholder: 'What is changing, from what to what' },
      { key: 'justification', label: 'Justification', type: 'textarea', required: true, default: row?.justification ?? '', placeholder: 'Why the change is being made and why quality is unaffected' },
      { key: 'riskLevel', label: 'Assessed risk', type: 'seg', options: ['low', 'medium', 'high'], default: row?.riskAssessment?.level ?? 'medium', half: true },
      { key: 'status', label: 'Status', type: 'select', options: CHANGE_STATUSES, required: true, half: true, default: row?.status ?? 'draft' },
      { key: 'regulatoryFiling', label: 'Filing category', type: 'select', options: CHANGE_FILINGS, half: true, default: row?.regulatoryFiling ?? '', desc: 'Model it in the simulator above if it is not yet decided' },
      { key: 'implementationDate', label: 'Planned implementation', type: 'date', half: true, default: row?.implementationDate ? String(row.implementationDate).slice(0, 10) : '' },
      { key: 'impactedSections', label: 'Impacted CTD sections', type: 'text', default: (row?.impactAssessment?.impactedSections ?? []).join(', '), placeholder: 'e.g. 3.2.S.2, 3.2.P.3' },
      { key: 'impactSummary', label: 'Impact assessment', type: 'textarea', default: row?.impactAssessment?.summary ?? '', placeholder: 'Comparability, validation, stability and filing consequences…' },
    ],
  };
}

export function changeControlBody(v: Record<string, string>, projectId?: string): ChangeControlBody {
  const body: ChangeControlBody = {
    changeNumber: req(v.changeNumber),
    changeType: req(v.changeType),
    description: req(v.description),
    justification: req(v.justification),
    impactAssessment: {
      ...(opt(v.impactSummary) ? { summary: opt(v.impactSummary) } : {}),
      ...(csvToArray(v.impactedSections).length ? { impactedSections: csvToArray(v.impactedSections) } : {}),
    },
    riskAssessment: { level: req(v.riskLevel) || 'medium' },
    status: req(v.status) || 'draft',
  };
  const filing = opt(v.regulatoryFiling);
  if (filing) body.regulatoryFiling = filing;
  const impl = isoDate(v.implementationDate);
  if (impl) body.implementationDate = impl;
  if (projectId) body.projectId = projectId;
  return body;
}

/* ═══════════ Drug substance §3.2.S — POST/PUT /api/cmc/drug-substances ═══════ */

export const DEVELOPMENT_PHASES = ['preclinical', 'phase1', 'phase2', 'phase3', 'commercial'];
export const MATERIAL_STATUSES = ['development', 'qualified', 'approved', 'retired'];

export interface DrugSubstanceBody {
  substanceName: string;
  inn?: string;
  casNumber?: string;
  molecularFormula?: string;
  molecularWeight?: string;
  structuralFormula?: string;
  manufacturingProcess: { manufacturer?: string; route?: string; site?: string };
  status: string;
  developmentPhase?: string;
  projectId?: string;
}

export function drugSubstanceForm(row?: Partial<DrugSubstanceBody> | null): C2CFormConfig {
  return {
    eyebrow: 'Drug substance — CTD §3.2.S',
    title: row ? 'Edit drug substance' : 'New drug substance',
    sub: 'The active substance §3.2.S.1 – §3.2.S.7 is written about',
    submitLabel: row ? 'Save substance' : 'Add substance',
    fields: [
      { key: 'substanceName', label: 'Substance name', type: 'text', required: true, half: true, default: row?.substanceName ?? '', placeholder: 'e.g. BX-204' },
      { key: 'inn', label: 'INN', type: 'text', half: true, default: row?.inn ?? '', placeholder: 'International nonproprietary name' },
      { key: 'casNumber', label: 'CAS number', type: 'text', half: true, default: row?.casNumber ?? '' },
      { key: 'molecularFormula', label: 'Molecular formula', type: 'text', half: true, default: row?.molecularFormula ?? '', placeholder: 'e.g. C21H27N5O2' },
      { key: 'molecularWeight', label: 'Molecular weight', type: 'text', half: true, default: row?.molecularWeight ?? '', placeholder: 'e.g. 381.47' },
      { key: 'developmentPhase', label: 'Development phase', type: 'select', options: DEVELOPMENT_PHASES, half: true, default: row?.developmentPhase ?? '' },
      { key: 'manufacturer', label: 'Manufacturer', type: 'text', half: true, default: row?.manufacturingProcess?.manufacturer ?? '' },
      { key: 'site', label: 'Manufacturing site', type: 'text', half: true, default: row?.manufacturingProcess?.site ?? '', placeholder: 'Site name and address' },
      { key: 'route', label: 'Manufacturing route', type: 'textarea', default: row?.manufacturingProcess?.route ?? '', placeholder: 'Synthetic route or cell-culture / purification train — the §3.2.S.2.2 description' },
      { key: 'structuralFormula', label: 'Structure', type: 'textarea', default: row?.structuralFormula ?? '', placeholder: 'SMILES, sequence, or a reference to the structural drawing' },
      { key: 'status', label: 'Status', type: 'select', options: MATERIAL_STATUSES, required: true, half: true, default: row?.status ?? 'development' },
    ],
  };
}

export function drugSubstanceBody(v: Record<string, string>, projectId?: string): DrugSubstanceBody {
  const body: DrugSubstanceBody = {
    substanceName: req(v.substanceName),
    manufacturingProcess: {
      ...(opt(v.manufacturer) ? { manufacturer: opt(v.manufacturer) } : {}),
      ...(opt(v.route) ? { route: opt(v.route) } : {}),
      ...(opt(v.site) ? { site: opt(v.site) } : {}),
    },
    status: req(v.status) || 'development',
  };
  // Each optional column is set only when it has a value, so a field left blank
  // stays absent from the body rather than being written as an empty string.
  const inn = opt(v.inn); if (inn) body.inn = inn;
  const cas = opt(v.casNumber); if (cas) body.casNumber = cas;
  const formula = opt(v.molecularFormula); if (formula) body.molecularFormula = formula;
  const weight = opt(v.molecularWeight); if (weight) body.molecularWeight = weight;
  const structure = opt(v.structuralFormula); if (structure) body.structuralFormula = structure;
  const phase = opt(v.developmentPhase); if (phase) body.developmentPhase = phase;
  if (projectId) body.projectId = projectId;
  return body;
}

/* ═══════════ Drug product §3.2.P — POST/PUT /api/cmc/drug-products ═══════════ */

export const DOSAGE_FORMS = [
  'Solution for injection', 'Lyophilised powder for solution', 'Prefilled syringe',
  'Tablet', 'Film-coated tablet', 'Capsule', 'Oral solution', 'Oral suspension',
  'Cream', 'Ointment', 'Transdermal patch', 'Inhalation powder', 'Nasal spray', 'Eye drops',
];
export const ROUTES = [
  'Intravenous', 'Subcutaneous', 'Intramuscular', 'Oral', 'Topical',
  'Transdermal', 'Inhalation', 'Intranasal', 'Ophthalmic', 'Rectal', 'Intrathecal',
];

export interface DrugProductBody {
  productName: string;
  dosageForm: string;
  strength: string;
  routeOfAdministration?: string;
  composition: { description?: string };
  manufacturingProcess: { description?: string; site?: string };
  packagingMaterials: { containerClosure?: string };
  status: string;
  projectId?: string;
}

export function drugProductForm(row?: Partial<DrugProductBody> | null): C2CFormConfig {
  return {
    eyebrow: 'Drug product — CTD §3.2.P',
    title: row ? 'Edit drug product' : 'New drug product',
    sub: 'The finished product §3.2.P.1 – §3.2.P.8 is written about',
    submitLabel: row ? 'Save product' : 'Add product',
    fields: [
      { key: 'productName', label: 'Product name', type: 'text', required: true, default: row?.productName ?? '', placeholder: 'e.g. BX-204 injection' },
      { key: 'dosageForm', label: 'Dosage form', type: 'select', options: DOSAGE_FORMS, required: true, half: true, default: row?.dosageForm ?? '' },
      { key: 'strength', label: 'Strength', type: 'text', required: true, half: true, default: row?.strength ?? '', placeholder: 'e.g. 50 mg/mL' },
      { key: 'routeOfAdministration', label: 'Route of administration', type: 'select', options: ROUTES, half: true, default: row?.routeOfAdministration ?? '' },
      { key: 'status', label: 'Status', type: 'select', options: MATERIAL_STATUSES, required: true, half: true, default: row?.status ?? 'development' },
      { key: 'composition', label: 'Composition', type: 'textarea', default: row?.composition?.description ?? '', placeholder: 'Active and each excipient with its function and quantity per unit — the §3.2.P.1 table' },
      { key: 'process', label: 'Manufacturing process', type: 'textarea', default: row?.manufacturingProcess?.description ?? '', placeholder: 'The §3.2.P.3.3 process description' },
      { key: 'site', label: 'Manufacturing site', type: 'text', half: true, default: row?.manufacturingProcess?.site ?? '' },
      { key: 'containerClosure', label: 'Container closure system', type: 'text', half: true, default: row?.packagingMaterials?.containerClosure ?? '', placeholder: 'e.g. 2R Type I glass vial, bromobutyl stopper' },
    ],
  };
}

export function drugProductBody(v: Record<string, string>, projectId?: string): DrugProductBody {
  const body: DrugProductBody = {
    productName: req(v.productName),
    dosageForm: req(v.dosageForm),
    strength: req(v.strength),
    composition: { ...(opt(v.composition) ? { description: opt(v.composition) } : {}) },
    manufacturingProcess: {
      ...(opt(v.process) ? { description: opt(v.process) } : {}),
      ...(opt(v.site) ? { site: opt(v.site) } : {}),
    },
    packagingMaterials: { ...(opt(v.containerClosure) ? { containerClosure: opt(v.containerClosure) } : {}) },
    status: req(v.status) || 'development',
  };
  const route = opt(v.routeOfAdministration);
  if (route) body.routeOfAdministration = route;
  if (projectId) body.projectId = projectId;
  return body;
}

/* ═══════════ Comparability — POST/PUT /api/cmc/comparability-studies ═════════
   ICH Q5E. Persisted to cmc_comparability_assessments; the handler aliases its
   columns (assessment_name→title, changed_element→product, change_type→type,
   affected_process_parameters→methods, justification→outcome), so the body
   below uses the handler's own field names, not the table's. */

export interface ComparabilityBody {
  title: string;
  type: string;
  product: string;
  methods: string[];
  outcome?: string;
  status: string;
  projectId?: string;
}

export function comparabilityForm(row?: Partial<ComparabilityBody> | null): C2CFormConfig {
  return {
    eyebrow: 'Comparability — ICH Q5E',
    title: row ? 'Edit comparability assessment' : 'New comparability assessment',
    sub: 'The pre- and post-change comparison behind a manufacturing change',
    submitLabel: row ? 'Save assessment' : 'Raise assessment',
    fields: [
      { key: 'title', label: 'Assessment name', type: 'text', required: true, default: row?.title ?? '', placeholder: 'e.g. Comparability — 200 L to 2000 L scale-up' },
      { key: 'product', label: 'Changed element', type: 'text', required: true, half: true, default: row?.product ?? '', placeholder: 'What changed, e.g. DS manufacturing scale' },
      { key: 'type', label: 'Change type', type: 'select', options: CHANGE_TYPES, required: true, half: true, default: row?.type ?? 'process' },
      { key: 'methods', label: 'Affected process parameters', type: 'text', default: (row?.methods ?? []).join(', '), placeholder: 'e.g. Bioreactor volume, Feed strategy, Harvest criteria' },
      { key: 'status', label: 'Status', type: 'select', options: ['draft', 'in-progress', 'completed', 'approved'], required: true, half: true, default: row?.status ?? 'draft' },
      { key: 'outcome', label: 'Justification / outcome', type: 'textarea', default: row?.outcome ?? '', placeholder: 'The acceptance criteria applied and whether the material was found comparable…' },
    ],
  };
}

export function comparabilityBody(v: Record<string, string>, projectId?: string): ComparabilityBody {
  const body: ComparabilityBody = {
    title: req(v.title),
    type: req(v.type),
    product: req(v.product),
    methods: csvToArray(v.methods),
    status: req(v.status) || 'draft',
  };
  const outcome = opt(v.outcome);
  if (outcome) body.outcome = outcome;
  if (projectId) body.projectId = projectId;
  return body;
}

/* ═══════════ Container closure — POST/PUT /api/cmc/container-closures ════════
   The system that holds the material, and the evidence that it is fit to. */

export const CONTAINER_COMPONENT_TYPES = ['primary', 'secondary', 'administration-device'];

/**
 * Which statuses an ordinary save may set.
 *
 * 'qualified' is deliberately ABSENT from both registers' status controls:
 * qualification is a 21 CFR Part 11 signature (POST .../:id/qualify) that
 * records who qualified the record, when, and why. The API refuses a
 * self-declared 'qualified' on create and update, so offering it here would
 * only produce a rejected save.
 */
/**
 * The statuses an edit drawer may offer for a record.
 *
 * 'qualified' is never an option a save can CHOOSE — it is reached only through
 * the Part 11 signature endpoint. But a record that is already qualified has to
 * be able to keep that status through an ordinary edit: offering only the
 * ungoverned statuses sent 'draft' on every Update, which reverted the
 * signature while leaving qualified_by and qualification_date populated.
 */
export function statusOptionsFor(
  statuses: string[],
  current?: string | null,
  /* The signed value differs by register: a reference standard is `qualified`,
     a manufacturing process is `validated`. The server generalised its guard on
     the same axis; hard-coding the word here meant a VALIDATED process opened
     its drawer on a status the server then refused, so the record was
     permanently uneditable through the product — no step could ever be added to
     a validated process. */
  signedValue = 'qualified',
): string[] {
  const v = String(current ?? '').trim().toLowerCase();
  const base = statuses[0] ?? 'draft';
  return v === signedValue ? [signedValue, ...statuses.filter((s) => s !== base)] : statuses;
}

/** The status an edit drawer opens on: the stored one where it is offerable. */
export function statusDefaultFor(
  statuses: string[],
  current?: string | null,
  signedValue = 'qualified',
): string {
  const v = String(current ?? '').trim().toLowerCase();
  if (v === signedValue) return signedValue;
  return current && statuses.includes(current) ? current : (statuses[0] ?? 'draft');
}

export const CONTAINER_CLOSURE_STATUSES = ['draft', 'retired'];
export const REFERENCE_STANDARD_STATUSES = ['draft', 'expired', 'retired'];

/**
 * Pipe-delimited lines → typed json rows.
 *
 * The drawer has no repeatable-row control, and materials of construction, E&L
 * results and standard characterisation are all genuinely tabular. A textarea
 * with a documented column order is the honest middle: what the scientist types
 * is exactly what is stored, blank cells are omitted rather than stored as
 * empty strings, and a line with nothing in it produces no row at all.
 *
 * Cells BEYOND the declared columns are kept, joined onto the last one. Dropping
 * them (which iterating the keys does by default) deletes typed text with no
 * signal — a note like "re-qualified 2026" typed as a sixth cell simply
 * vanished from the record and from the dossier.
 */
export function parseRowLines(
  value: string | undefined | null,
  keys: string[],
  /**
   * The rows as STORED, positionally. Keys the textarea cannot represent —
   * a step's nested `inProcessControls`, its scale dependencies — are carried
   * back onto the row at the same index.
   *
   * Without this the round trip is lossy in a way no one sees: the manufacturing
   * register stores in-process controls INSIDE each step, PROCESS_STEP_COLUMNS
   * has no column for them, and the PUT sends processSteps unconditionally. So
   * pressing Update with nothing changed deleted every step-level control,
   * dropped the card's count to "none", and flipped §3.2.S.2's completeness key
   * to null — a save that reported success and destroyed recorded data. That is
   * the same failure `rowLinesOf` was written to prevent, one level deeper.
   *
   * Positional is the honest match: the textarea's line order IS the row order,
   * and a line the staffer deleted takes its own hidden fields with it.
   */
  preserveFrom?: unknown,
): Array<Record<string, unknown>> {
  if (!value) return [];
  const stored = Array.isArray(preserveFrom)
    ? preserveFrom.filter((r) => r && typeof r === 'object' && !Array.isArray(r))
    : [];
  const rows: Array<Record<string, unknown>> = [];
  for (const line of String(value).split('\n')) {
    if (!line.trim()) continue;
    const cells = line.split('|').map((c) => c.trim());
    const overflow = cells.slice(keys.length).filter(Boolean);
    const row: Record<string, unknown> = {};
    keys.forEach((k, i) => {
      const cell = i === keys.length - 1 && overflow.length > 0
        ? [cells[i], ...overflow].filter(Boolean).join(' | ')
        : cells[i];
      if (cell) row[k] = cell;
    });
    if (Object.keys(row).length === 0) continue;
    const original = stored[rows.length] as Record<string, unknown> | undefined;
    if (original) {
      for (const [k, v] of Object.entries(original)) {
        /* Only what the drawer could not edit. A declared column the staffer
           cleared must stay cleared, not be restored from the stored row. */
        if (!keys.includes(k) && v !== undefined) row[k] = v;
      }
    }
    rows.push(row);
  }
  return rows;
}

/**
 * The inverse: stored json rows → the pipe-delimited text the drawer edits.
 *
 * Without this the edit drawer opened blank over a populated jsonb column, and
 * a staffer adding one line replaced the whole column with that line — the E&L
 * per-analyte results, the other materials of construction, the rest of the
 * characterisation, silently destroyed by a save that reported success.
 */
export function rowLinesOf(rows: unknown, keys: string[]): string {
  if (!Array.isArray(rows)) return '';
  return rows
    .filter((r) => r && typeof r === 'object')
    .map((r) => {
      const cells = keys.map((k) => String((r as Record<string, unknown>)[k] ?? '').trim());
      // Trailing empties add nothing and make the line harder to read back.
      while (cells.length > 0 && !cells[cells.length - 1]) cells.pop();
      return cells.join(' | ');
    })
    .filter(Boolean)
    .join('\n');
}

export const MATERIAL_COLUMNS = ['component', 'material', 'supplier', 'specification', 'compendialReference'];
export const EL_RESULT_COLUMNS = ['analyte', 'level', 'unit', 'threshold', 'assessment'];
export const CHARACTERISATION_COLUMNS = ['attribute', 'method', 'result'];

export interface ExtractablesLeachables {
  studyType?: string;
  protocol?: string;
  conditions?: string;
  analyticalEvaluationThreshold?: string;
  conclusion?: string;
  results?: Array<Record<string, unknown>>;
}

export interface IntegrityTesting {
  method?: string;
  acceptanceCriteria?: string;
  result?: string;
  testDate?: string;
}

export interface ContainerClosureBody {
  projectId?: string;
  scope: string;
  systemName: string;
  componentType: string;
  containerDescription: string;
  closureDescription: string;
  supplier?: string | null;
  compendialStandards?: string[] | null;
  suitabilityJustification?: string | null;
  materialsOfConstruction?: Array<Record<string, unknown>> | null;
  extractablesLeachables?: ExtractablesLeachables | null;
  integrityTesting?: IntegrityTesting | null;
  status: string;
}

/** The shape the edit drawer is seeded from — the API row, as it comes back. */
export interface ContainerClosureRow extends Partial<ContainerClosureBody> {
  extractablesLeachables?: ExtractablesLeachables | null;
  integrityTesting?: IntegrityTesting | null;
}

export function containerClosureForm(row?: ContainerClosureRow | null): C2CFormConfig {
  const el = row?.extractablesLeachables ?? undefined;
  const it = row?.integrityTesting ?? undefined;
  return {
    eyebrow: 'Container closure — §3.2.S.6 / §3.2.P.7',
    title: row ? 'Edit container closure system' : 'Record a container closure system',
    sub: 'The container, the closure, and the evidence they are fit for the material',
    submitLabel: row ? 'Save system' : 'Record system',
    fields: [
      { key: 'systemName', label: 'System name', type: 'text', required: true, default: row?.systemName ?? '', placeholder: 'e.g. 10 mL Type I glass vial / 20 mm bromobutyl stopper' },
      { key: 'scope', label: 'Evidence for', type: 'select', options: CMC_MATERIAL_SCOPES, required: true, half: true, default: row?.scope ?? 'drug_product', desc: 'Decides whether this system files under §3.2.S.6 or §3.2.P.7' },
      { key: 'componentType', label: 'Component', type: 'select', options: CONTAINER_COMPONENT_TYPES, required: true, half: true, default: row?.componentType ?? 'primary' },
      { key: 'containerDescription', label: 'Container', type: 'textarea', required: true, rows: 2, default: row?.containerDescription ?? '', placeholder: 'e.g. 10 mL clear Type I borosilicate glass vial, 20 mm neck finish' },
      { key: 'closureDescription', label: 'Closure', type: 'textarea', required: true, rows: 2, default: row?.closureDescription ?? '', placeholder: 'e.g. 20 mm bromobutyl rubber stopper, fluoropolymer-laminated, aluminium flip-off seal' },
      { key: 'supplier', label: 'Supplier', type: 'text', half: true, default: row?.supplier ?? '', placeholder: 'e.g. Schott / West Pharmaceutical' },
      { key: 'status', label: 'Status', type: 'seg', options: statusOptionsFor(CONTAINER_CLOSURE_STATUSES, row?.status), required: true, half: true, default: statusDefaultFor(CONTAINER_CLOSURE_STATUSES, row?.status), desc: 'Qualification is a signed action, not a status you set here' },
      { key: 'compendialStandards', label: 'Compendial standards', type: 'text', default: (row?.compendialStandards ?? []).join(', '), placeholder: 'e.g. USP <660>, USP <381>, Ph. Eur. 3.2.1' },
      { key: 'materialsOfConstruction', label: 'Materials of construction', type: 'textarea', rows: 3, default: rowLinesOf(row?.materialsOfConstruction, MATERIAL_COLUMNS), placeholder: 'One per line: Component | Material | Supplier | Specification | Compendial reference' },
      { key: 'suitabilityJustification', label: 'Suitability justification', type: 'textarea', rows: 3, default: row?.suitabilityJustification ?? '', placeholder: 'Protection, compatibility, safety and performance for the intended use — the applicant statement §3.2.S.6 / §3.2.P.7 is built on' },
      { key: 'elStudyType', label: 'E&L study', type: 'text', half: true, default: el?.studyType ?? '', placeholder: 'e.g. Controlled extraction study' },
      { key: 'elProtocol', label: 'E&L protocol', type: 'text', half: true, default: el?.protocol ?? '', placeholder: 'e.g. PR-EL-014' },
      { key: 'elConditions', label: 'E&L conditions', type: 'text', half: true, default: el?.conditions ?? '', placeholder: 'e.g. 40C/75%RH, 6 months, inverted' },
      { key: 'elThreshold', label: 'Analytical evaluation threshold', type: 'text', half: true, default: el?.analyticalEvaluationThreshold ?? '', placeholder: 'e.g. 1.5 ug/day' },
      { key: 'elConclusion', label: 'E&L conclusion', type: 'text', default: el?.conclusion ?? '', placeholder: 'The recorded conclusion, if the study has reached one' },
      { key: 'elResults', label: 'E&L results', type: 'textarea', rows: 3, default: rowLinesOf(el?.results, EL_RESULT_COLUMNS), placeholder: 'One per line: Analyte | Level | Unit | Threshold | Assessment' },
      { key: 'integrityMethod', label: 'Integrity test method', type: 'text', half: true, default: it?.method ?? '', placeholder: 'e.g. Helium leak (USP <1207>)' },
      { key: 'integrityCriteria', label: 'Integrity acceptance criteria', type: 'text', half: true, default: it?.acceptanceCriteria ?? '', placeholder: 'e.g. <= 6e-6 mbar L/s' },
      { key: 'integrityResult', label: 'Integrity result', type: 'text', half: true, default: it?.result ?? '', placeholder: 'The measured outcome, as recorded' },
      { key: 'integrityTestDate', label: 'Integrity tested on', type: 'date', half: true, default: it?.testDate ? String(it.testDate).slice(0, 10) : '' },
    ],
  };
}

/** The E&L record the drawer describes, or undefined when nothing was entered. */
function elFrom(v: Record<string, string>): ExtractablesLeachables | undefined {
  const results = parseRowLines(v.elResults, EL_RESULT_COLUMNS);
  const el: ExtractablesLeachables = {
    ...(opt(v.elStudyType) ? { studyType: opt(v.elStudyType) } : {}),
    ...(opt(v.elProtocol) ? { protocol: opt(v.elProtocol) } : {}),
    ...(opt(v.elConditions) ? { conditions: opt(v.elConditions) } : {}),
    ...(opt(v.elThreshold) ? { analyticalEvaluationThreshold: opt(v.elThreshold) } : {}),
    ...(opt(v.elConclusion) ? { conclusion: opt(v.elConclusion) } : {}),
    ...(results.length > 0 ? { results } : {}),
  };
  return Object.keys(el).length > 0 ? el : undefined;
}

/** The integrity record the drawer describes, or undefined when it is empty. */
function integrityFrom(v: Record<string, string>): IntegrityTesting | undefined {
  const testDate = isoDate(v.integrityTestDate);
  const it: IntegrityTesting = {
    ...(opt(v.integrityMethod) ? { method: opt(v.integrityMethod) } : {}),
    ...(opt(v.integrityCriteria) ? { acceptanceCriteria: opt(v.integrityCriteria) } : {}),
    ...(opt(v.integrityResult) ? { result: opt(v.integrityResult) } : {}),
    ...(testDate ? { testDate } : {}),
  };
  return Object.keys(it).length > 0 ? it : undefined;
}

export function containerClosureBody(v: Record<string, string>, projectId?: string): ContainerClosureBody {
  const body: ContainerClosureBody = {
    scope: req(v.scope) || 'drug_product',
    systemName: req(v.systemName),
    componentType: req(v.componentType) || 'primary',
    containerDescription: req(v.containerDescription),
    closureDescription: req(v.closureDescription),
    status: req(v.status) || 'draft',
  };
  const supplier = opt(v.supplier);
  if (supplier) body.supplier = supplier;
  const compendial = csvToArray(v.compendialStandards);
  if (compendial.length > 0) body.compendialStandards = compendial;
  const justification = opt(v.suitabilityJustification);
  if (justification) body.suitabilityJustification = justification;
  const materials = parseRowLines(v.materialsOfConstruction, MATERIAL_COLUMNS);
  if (materials.length > 0) body.materialsOfConstruction = materials;
  /* The E&L study and the integrity record are sent only when something about
     them was actually entered. An empty object is truthy: storing one would be
     recorded as a study that does not exist, and the composed section would
     stop saying the package is absent — the only signal a reviewer has. */
  const el = elFrom(v);
  if (el) body.extractablesLeachables = el;
  const integrity = integrityFrom(v);
  if (integrity) body.integrityTesting = integrity;
  if (projectId) body.projectId = projectId;
  return body;
}

/**
 * The UPDATE body: every editable field, with an explicit null for the ones
 * left blank.
 *
 * A create omits what was not entered. An update must not: the drawer is seeded
 * from the stored record, so a field the staffer cleared was cleared
 * deliberately, and omitting it from a PATCH leaves the old value in place —
 * there was no way at all to remove a suitability justification entered against
 * the wrong system, or a wrong retest date.
 *
 * `projectId` is absent by design: the program a record is evidence for is
 * fixed at creation and the API refuses to move it.
 */
export function containerClosurePatch(v: Record<string, string>): ContainerClosureBody {
  const compendial = csvToArray(v.compendialStandards);
  const materials = parseRowLines(v.materialsOfConstruction, MATERIAL_COLUMNS);
  return {
    scope: req(v.scope) || 'drug_product',
    systemName: req(v.systemName),
    componentType: req(v.componentType) || 'primary',
    containerDescription: req(v.containerDescription),
    closureDescription: req(v.closureDescription),
    status: req(v.status) || 'draft',
    supplier: opt(v.supplier) ?? null,
    compendialStandards: compendial.length > 0 ? compendial : null,
    suitabilityJustification: opt(v.suitabilityJustification) ?? null,
    materialsOfConstruction: materials.length > 0 ? materials : null,
    extractablesLeachables: elFrom(v) ?? null,
    integrityTesting: integrityFrom(v) ?? null,
  };
}

/* ═══════════ Reference standards — POST/PUT /api/cmc/reference-standards ═════
   The standard every potency and purity number is reported against. */

export const REFERENCE_STANDARD_TYPES = [
  'primary', 'secondary', 'working', 'compendial', 'system-suitability',
];

export interface ReferenceStandardBody {
  projectId?: string;
  scope: string;
  standardCode: string;
  standardName: string;
  standardType: string;
  materialSource?: string | null;
  lotNumber?: string | null;
  assignedValue?: string | null;
  characterization?: Array<Record<string, unknown>> | null;
  certificateOfAnalysis?: string | null;
  qualificationProtocol?: string | null;
  storageConditions?: string | null;
  expiryDate?: string | null;
  retestDate?: string | null;
  status: string;
}

export function referenceStandardForm(row?: Partial<ReferenceStandardBody> | null): C2CFormConfig {
  return {
    eyebrow: 'Reference standards — §3.2.S.5 / §3.2.P.6',
    title: row ? 'Edit reference standard' : 'Record a reference standard',
    sub: 'The standard results are reported against, and how it was qualified',
    submitLabel: row ? 'Save standard' : 'Record standard',
    fields: [
      { key: 'standardCode', label: 'Standard code', type: 'text', required: true, half: true, default: row?.standardCode ?? '', placeholder: 'e.g. RS-DS-001' },
      { key: 'standardName', label: 'Standard name', type: 'text', required: true, half: true, default: row?.standardName ?? '', placeholder: 'e.g. BX-204 drug substance primary reference standard' },
      { key: 'scope', label: 'Evidence for', type: 'select', options: CMC_MATERIAL_SCOPES, required: true, half: true, default: row?.scope ?? 'drug_substance', desc: 'Decides whether this standard files under §3.2.S.5 or §3.2.P.6' },
      { key: 'standardType', label: 'Type', type: 'select', options: REFERENCE_STANDARD_TYPES, required: true, half: true, default: row?.standardType ?? 'primary' },
      { key: 'lotNumber', label: 'Lot', type: 'text', half: true, default: row?.lotNumber ?? '', placeholder: 'e.g. RS-LOT-2405' },
      { key: 'assignedValue', label: 'Assigned value', type: 'text', half: true, default: row?.assignedValue ?? '', placeholder: 'e.g. 98.7% (as-is)' },
      { key: 'materialSource', label: 'Prepared from', type: 'text', default: row?.materialSource ?? '', placeholder: 'The lot it was prepared from, or the compendial catalogue entry it is traceable to' },
      { key: 'characterization', label: 'Characterisation', type: 'textarea', rows: 3, default: rowLinesOf(row?.characterization, CHARACTERISATION_COLUMNS), placeholder: 'One per line: Attribute | Method | Result' },
      { key: 'certificateOfAnalysis', label: 'CoA reference', type: 'text', half: true, default: row?.certificateOfAnalysis ?? '', placeholder: 'e.g. CoA-RS-001-2405' },
      { key: 'qualificationProtocol', label: 'Qualification protocol', type: 'text', half: true, default: row?.qualificationProtocol ?? '', placeholder: 'e.g. PR-RS-002' },
      { key: 'storageConditions', label: 'Storage', type: 'text', half: true, default: row?.storageConditions ?? '', placeholder: 'e.g. -70C, desiccated' },
      { key: 'status', label: 'Status', type: 'seg', options: statusOptionsFor(REFERENCE_STANDARD_STATUSES, row?.status), required: true, half: true, default: statusDefaultFor(REFERENCE_STANDARD_STATUSES, row?.status), desc: 'Qualification is a signed action, not a status you set here' },
      { key: 'retestDate', label: 'Retest date', type: 'date', half: true, default: row?.retestDate ? String(row.retestDate).slice(0, 10) : '' },
      { key: 'expiryDate', label: 'Expiry date', type: 'date', half: true, default: row?.expiryDate ? String(row.expiryDate).slice(0, 10) : '' },
    ],
  };
}

export function referenceStandardBody(v: Record<string, string>, projectId?: string): ReferenceStandardBody {
  const body: ReferenceStandardBody = {
    scope: req(v.scope) || 'drug_substance',
    standardCode: req(v.standardCode),
    standardName: req(v.standardName),
    standardType: req(v.standardType) || 'primary',
    status: req(v.status) || 'draft',
  };
  const source = opt(v.materialSource);
  if (source) body.materialSource = source;
  const lot = opt(v.lotNumber);
  if (lot) body.lotNumber = lot;
  const assigned = opt(v.assignedValue);
  if (assigned) body.assignedValue = assigned;
  const characterization = parseRowLines(v.characterization, CHARACTERISATION_COLUMNS);
  if (characterization.length > 0) body.characterization = characterization;
  const coa = opt(v.certificateOfAnalysis);
  if (coa) body.certificateOfAnalysis = coa;
  const protocol = opt(v.qualificationProtocol);
  if (protocol) body.qualificationProtocol = protocol;
  const storage = opt(v.storageConditions);
  if (storage) body.storageConditions = storage;
  const retest = isoDate(v.retestDate);
  if (retest) body.retestDate = retest;
  const expiry = isoDate(v.expiryDate);
  if (expiry) body.expiryDate = expiry;
  if (projectId) body.projectId = projectId;
  return body;
}

/** The UPDATE body — see the note on `containerClosurePatch`. */
export function referenceStandardPatch(v: Record<string, string>): ReferenceStandardBody {
  const characterization = parseRowLines(v.characterization, CHARACTERISATION_COLUMNS);
  return {
    scope: req(v.scope) || 'drug_substance',
    standardCode: req(v.standardCode),
    standardName: req(v.standardName),
    standardType: req(v.standardType) || 'primary',
    status: req(v.status) || 'draft',
    materialSource: opt(v.materialSource) ?? null,
    lotNumber: opt(v.lotNumber) ?? null,
    assignedValue: opt(v.assignedValue) ?? null,
    characterization: characterization.length > 0 ? characterization : null,
    certificateOfAnalysis: opt(v.certificateOfAnalysis) ?? null,
    qualificationProtocol: opt(v.qualificationProtocol) ?? null,
    storageConditions: opt(v.storageConditions) ?? null,
    retestDate: isoDate(v.retestDate) ?? null,
    expiryDate: isoDate(v.expiryDate) ?? null,
  };
}

/* ═══════════ The governed qualification signature ═══════════════════════════
   POST /api/cmc/{container-closures,reference-standards}/:id/qualify */

export interface QualifyBody {
  reason: string;
  meaning: string;
  reauth: { password?: string; totp?: string };
}

/**
 * Qualifying a container closure system or a reference standard is a Part 11
 * signature: who, when, why, and what the signature means, recorded against the
 * record. It is deliberately not a status a save can set.
 */
export function qualifyForm(subject: string, name: string): C2CFormConfig {
  return {
    eyebrow: 'Qualification — 21 CFR Part 11 signature',
    title: `Qualify ${subject}`,
    sub: name,
    submitLabel: 'Sign and qualify',
    governed:
      'Your name, the time and the reason below are recorded against this record. ' +
      'Qualification cannot be undone by an ordinary edit.',
    fields: [
      { key: 'meaning', label: 'Meaning of signature', type: 'select', options: ['approval', 'review', 'responsibility', 'authorship'], default: 'approval', required: true, half: true },
      { key: 'reason', label: 'Reason', type: 'textarea', required: true, placeholder: 'What qualifies this record — the protocol executed, the report accepted, the data reviewed…' },
      { key: 'password', label: 'Password', type: 'password', placeholder: 'Re-enter your password', required: true, half: true },
      { key: 'totp', label: 'Authenticator', type: 'text', placeholder: '6-digit code', half: true },
    ],
  };
}

export function qualifyBody(v: Record<string, string>): QualifyBody {
  return {
    reason: req(v.reason),
    meaning: req(v.meaning) || 'approval',
    reauth: { password: v.password || undefined, totp: v.totp || undefined },
  };
}

/* ═══════════ Impurity profiles — POST/PUT /api/cmc/impurity-profiles ═════════
   One row per impurity: what it is, how much of it, and what ICH says at that
   level. */

export const IMPURITY_TYPES = [
  'process-related', 'degradation', 'inorganic', 'residual-solvent', 'elemental',
  'mutagenic', 'enantiomeric', 'polymorphic',
];

/** The units a level can be recorded in. There is no blank option: a number
 *  with no unit cannot be compared to a threshold, and the register refuses to
 *  guess one from the column default. */
export const IMPURITY_LEVEL_UNITS = ['%', 'ppm', 'ppb', 'mg/day', 'µg/day'];

/** ICH Q3D sets a different permitted daily exposure for each of these. */
export const ROUTES_OF_ADMINISTRATION = ['oral', 'parenteral', 'inhalation'];

export const IMPURITY_STATUSES = ['draft', 'specified', 'retired'];

export interface ImpurityProfileBody {
  projectId?: string;
  scope: string;
  materialName: string;
  impurityName: string;
  impurityType: string;
  origin?: string | null;
  casNumber?: string | null;
  molecularFormula?: string | null;
  structure?: string | null;
  relativeRetentionTime?: string | null;
  analyticalMethod?: string | null;
  observedLevel?: string | null;
  levelUnit: string;
  routeOfAdministration?: string | null;
  specificationLimit?: string | null;
  reportingThreshold?: string | null;
  identificationThreshold?: string | null;
  qualificationThreshold?: string | null;
  maximumDailyDose?: string | null;
  qualificationBasis?: string | null;
  controlStrategy?: string | null;
  batchesObserved?: string[] | null;
  status: string;
}

export function impurityProfileForm(row?: Partial<ImpurityProfileBody> | null): C2CFormConfig {
  return {
    eyebrow: 'Impurities — §3.2.S.3.2 / §3.2.P.5.5',
    title: row ? 'Edit impurity' : 'Record an impurity',
    sub: 'What it is, how much of it, and what ICH Q3A/Q3B says at that level',
    submitLabel: row ? 'Save impurity' : 'Record impurity',
    fields: [
      { key: 'impurityName', label: 'Impurity', type: 'text', required: true, half: true, default: row?.impurityName ?? '', placeholder: 'e.g. Impurity A (desmethyl analogue)' },
      { key: 'materialName', label: 'Material', type: 'text', required: true, half: true, default: row?.materialName ?? '', placeholder: 'What it is an impurity IN, e.g. BX-204 drug substance' },
      { key: 'scope', label: 'Evidence for', type: 'select', options: CMC_MATERIAL_SCOPES, required: true, half: true, default: row?.scope ?? 'drug_substance', desc: 'Decides whether ICH Q3A (substance) or Q3B (product) governs it' },
      { key: 'impurityType', label: 'Class', type: 'select', options: IMPURITY_TYPES, required: true, half: true, default: row?.impurityType ?? 'process-related', desc: 'Q3A/Q3B do not set thresholds for solvents, elemental or mutagenic impurities' },
      { key: 'origin', label: 'Origin', type: 'text', default: row?.origin ?? '', placeholder: 'Where it comes from — a step, a reagent, a degradation route' },
      { key: 'observedLevel', label: 'Observed level', type: 'text', half: true, default: row?.observedLevel ?? '', placeholder: 'e.g. 0.08' },
      { key: 'levelUnit', label: 'Unit', type: 'select', options: IMPURITY_LEVEL_UNITS, required: true, half: true, default: row?.levelUnit ?? '%', desc: 'A level with no unit cannot be compared to a threshold' },
      { key: 'routeOfAdministration', label: 'Route of administration', type: 'select', options: ROUTES_OF_ADMINISTRATION, half: true, default: row?.routeOfAdministration ?? '', desc: 'Required for an elemental impurity: ICH Q3D sets a different permitted daily exposure per route, and oral is the most permissive for most elements' },
      { key: 'maximumDailyDose', label: 'Maximum daily dose', type: 'text', half: true, default: row?.maximumDailyDose ?? '', placeholder: 'e.g. 500 mg — every ICH threshold is keyed to it' },
      { key: 'specificationLimit', label: 'Specification limit', type: 'text', half: true, default: row?.specificationLimit ?? '', placeholder: 'e.g. NMT 0.15%' },
      { key: 'analyticalMethod', label: 'Analytical method', type: 'text', half: true, default: row?.analyticalMethod ?? '', placeholder: 'e.g. AM-014 RP-HPLC' },
      { key: 'relativeRetentionTime', label: 'RRT', type: 'text', half: true, default: row?.relativeRetentionTime ?? '', placeholder: 'e.g. 0.78' },
      { key: 'casNumber', label: 'CAS number', type: 'text', half: true, default: row?.casNumber ?? '' },
      { key: 'molecularFormula', label: 'Molecular formula', type: 'text', half: true, default: row?.molecularFormula ?? '' },
      { key: 'structure', label: 'Structure', type: 'text', default: row?.structure ?? '', placeholder: 'SMILES or a structural reference — an impurity above the identification threshold needs one' },
      { key: 'qualificationBasis', label: 'Qualification basis', type: 'textarea', rows: 2, default: row?.qualificationBasis ?? '', placeholder: 'The study, comparator exposure or monograph that qualifies this level. Qualification is signed over this text.' },
      { key: 'controlStrategy', label: 'Control strategy', type: 'textarea', rows: 2, default: row?.controlStrategy ?? '', placeholder: 'How it is controlled — a process step, a purge, a specification test' },
      { key: 'batchesObserved', label: 'Batches observed in', type: 'text', default: (row?.batchesObserved ?? []).join(', '), placeholder: 'e.g. B-001, B-002, B-003' },
      { key: 'reportingThreshold', label: 'Reporting threshold (as recorded)', type: 'text', half: true, default: row?.reportingThreshold ?? '', placeholder: 'Leave blank to use the ICH threshold for the dose' },
      { key: 'identificationThreshold', label: 'Identification threshold (as recorded)', type: 'text', half: true, default: row?.identificationThreshold ?? '' },
      { key: 'qualificationThreshold', label: 'Qualification threshold (as recorded)', type: 'text', half: true, default: row?.qualificationThreshold ?? '' },
      /* A qualified record keeps its status through an ordinary edit. Offering
         only the ungoverned statuses sent 'draft' on every Update, which
         silently reverted a Part 11 signature; the API refuses that now, so
         without this the drawer could not save a qualified record at all. */
      { key: 'status', label: 'Status', type: 'seg', options: statusOptionsFor(IMPURITY_STATUSES, row?.status), required: true, half: true, default: statusDefaultFor(IMPURITY_STATUSES, row?.status), desc: 'Qualification is a signed action, not a status you set here' },
    ],
  };
}

export function impurityProfileBody(v: Record<string, string>, projectId?: string): ImpurityProfileBody {
  const body: ImpurityProfileBody = {
    scope: req(v.scope) || 'drug_substance',
    materialName: req(v.materialName),
    impurityName: req(v.impurityName),
    impurityType: req(v.impurityType) || 'process-related',
    levelUnit: req(v.levelUnit) || '%',
    routeOfAdministration: opt(v.routeOfAdministration) ?? null,
    status: req(v.status) || 'draft',
  };
  const optionalText: Array<keyof ImpurityProfileBody> = [
    'origin', 'casNumber', 'molecularFormula', 'structure', 'relativeRetentionTime',
    'analyticalMethod', 'observedLevel', 'specificationLimit', 'reportingThreshold',
    'identificationThreshold', 'qualificationThreshold', 'maximumDailyDose',
    'qualificationBasis', 'controlStrategy',
  ];
  for (const key of optionalText) {
    const value = opt(v[key as string]);
    if (value) (body as unknown as Record<string, unknown>)[key as string] = value;
  }
  const batches = csvToArray(v.batchesObserved);
  if (batches.length > 0) body.batchesObserved = batches;
  if (projectId) body.projectId = projectId;
  return body;
}

/** The UPDATE body — every editable field, with an explicit null for a cleared one. */
export function impurityProfilePatch(v: Record<string, string>): ImpurityProfileBody {
  const batches = csvToArray(v.batchesObserved);
  return {
    scope: req(v.scope) || 'drug_substance',
    materialName: req(v.materialName),
    impurityName: req(v.impurityName),
    impurityType: req(v.impurityType) || 'process-related',
    levelUnit: req(v.levelUnit) || '%',
    routeOfAdministration: opt(v.routeOfAdministration) ?? null,
    status: req(v.status) || 'draft',
    origin: opt(v.origin) ?? null,
    casNumber: opt(v.casNumber) ?? null,
    molecularFormula: opt(v.molecularFormula) ?? null,
    structure: opt(v.structure) ?? null,
    relativeRetentionTime: opt(v.relativeRetentionTime) ?? null,
    analyticalMethod: opt(v.analyticalMethod) ?? null,
    observedLevel: opt(v.observedLevel) ?? null,
    specificationLimit: opt(v.specificationLimit) ?? null,
    reportingThreshold: opt(v.reportingThreshold) ?? null,
    identificationThreshold: opt(v.identificationThreshold) ?? null,
    qualificationThreshold: opt(v.qualificationThreshold) ?? null,
    maximumDailyDose: opt(v.maximumDailyDose) ?? null,
    qualificationBasis: opt(v.qualificationBasis) ?? null,
    controlStrategy: opt(v.controlStrategy) ?? null,
    batchesObserved: batches.length > 0 ? batches : null,
  };
}

/* ═══════════ Dissolution profiles — /api/cmc/dissolution-profiles ════════════
   A method, a set of units, and a mean with its variability at each timepoint. */

export const DISSOLUTION_APPARATUS = [
  'USP I (basket)', 'USP II (paddle)', 'USP III (reciprocating cylinder)', 'USP IV (flow-through cell)',
];

export const DISSOLUTION_STATUSES = ['draft', 'reported', 'retired'];

export const DISSOLUTION_POINT_COLUMNS = ['timepoint', 'meanPercent', 'sd', 'rsd', 'min', 'max', 'n'];

export interface DissolutionProfileBody {
  projectId?: string;
  purpose: string;
  productName: string;
  batchNumber?: string | null;
  strength?: string | null;
  apparatus: string;
  rotationSpeed?: string | null;
  medium: string;
  mediumVolume?: string | null;
  temperature?: string | null;
  sinker?: string | null;
  specification?: string | null;
  unitsTested?: number | null;
  results?: Array<Record<string, unknown>> | null;
  comparisonBatch?: string | null;
  comparisonResults?: Array<Record<string, unknown>> | null;
  testDate?: string | null;
  status: string;
}

export function dissolutionProfileForm(row?: Partial<DissolutionProfileBody> | null): C2CFormConfig {
  return {
    eyebrow: 'Dissolution — §3.2.P.2 / §3.2.P.5',
    title: row ? 'Edit dissolution profile' : 'Record a dissolution profile',
    sub: 'The method, the units, and the mean with its variability at each timepoint',
    submitLabel: row ? 'Save profile' : 'Record profile',
    fields: [
      { key: 'productName', label: 'Product', type: 'text', required: true, half: true, default: row?.productName ?? '', placeholder: 'e.g. BX-204 film-coated tablet' },
      { key: 'purpose', label: 'Recorded for', type: 'select', options: DISSOLUTION_PURPOSES, required: true, half: true, default: row?.purpose ?? 'development', desc: 'Development and comparability profiles file under §3.2.P.2; a release-specification profile under §3.2.P.5' },
      { key: 'batchNumber', label: 'Batch', type: 'text', half: true, default: row?.batchNumber ?? '', placeholder: 'e.g. BX204-DP-2407' },
      { key: 'strength', label: 'Strength', type: 'text', half: true, default: row?.strength ?? '', placeholder: 'e.g. 5 mg' },
      { key: 'apparatus', label: 'Apparatus', type: 'select', options: DISSOLUTION_APPARATUS, required: true, half: true, default: row?.apparatus ?? 'USP II (paddle)' },
      { key: 'rotationSpeed', label: 'Speed', type: 'text', half: true, default: row?.rotationSpeed ?? '', placeholder: 'e.g. 50 rpm' },
      { key: 'medium', label: 'Medium', type: 'text', required: true, half: true, default: row?.medium ?? '', placeholder: 'e.g. pH 6.8 phosphate buffer' },
      { key: 'mediumVolume', label: 'Volume', type: 'text', half: true, default: row?.mediumVolume ?? '', placeholder: 'e.g. 900 mL' },
      { key: 'temperature', label: 'Temperature', type: 'text', half: true, default: row?.temperature ?? '', placeholder: 'e.g. 37.0 +/- 0.5 C' },
      { key: 'sinker', label: 'Sinker', type: 'text', half: true, default: row?.sinker ?? '' },
      { key: 'unitsTested', label: 'Units tested', type: 'number', min: 1, half: true, default: row?.unitsTested != null ? String(row.unitsTested) : '', desc: 'A mean without its unit count supports no conformance and no comparison' },
      { key: 'specification', label: 'Acceptance criterion', type: 'text', half: true, default: row?.specification ?? '', placeholder: 'e.g. Q = 80% at 30 min' },
      { key: 'results', label: 'Profile', type: 'textarea', rows: 4, default: rowLinesOf(row?.results, DISSOLUTION_POINT_COLUMNS), placeholder: 'One per line: Timepoint (min) | Mean % dissolved | SD | %RSD | Min | Max | n' },
      { key: 'comparisonBatch', label: 'Reference batch', type: 'text', half: true, default: row?.comparisonBatch ?? '', placeholder: 'The batch this profile is compared against, if any' },
      { key: 'testDate', label: 'Tested on', type: 'date', half: true, default: row?.testDate ? String(row.testDate).slice(0, 10) : '' },
      { key: 'comparisonResults', label: 'Reference profile', type: 'textarea', rows: 4, default: rowLinesOf(row?.comparisonResults, DISSOLUTION_POINT_COLUMNS), placeholder: 'Same columns as above — the reference profile an f2 comparison is computed against' },
      { key: 'status', label: 'Status', type: 'seg', options: DISSOLUTION_STATUSES, required: true, half: true, default: row?.status && DISSOLUTION_STATUSES.includes(row.status) ? row.status : 'draft' },
    ],
  };
}

/** A units count, or null — never a default. */
function unitsOf(raw: string | undefined): number | null {
  const n = Number(String(raw ?? '').trim());
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

export function dissolutionProfileBody(v: Record<string, string>, projectId?: string): DissolutionProfileBody {
  const body: DissolutionProfileBody = {
    purpose: req(v.purpose) || 'development',
    productName: req(v.productName),
    apparatus: req(v.apparatus) || 'USP II (paddle)',
    medium: req(v.medium),
    status: req(v.status) || 'draft',
  };
  const optionalText: Array<keyof DissolutionProfileBody> = [
    'batchNumber', 'strength', 'rotationSpeed', 'mediumVolume', 'temperature', 'sinker',
    'specification', 'comparisonBatch',
  ];
  for (const key of optionalText) {
    const value = opt(v[key as string]);
    if (value) (body as unknown as Record<string, unknown>)[key as string] = value;
  }
  const units = unitsOf(v.unitsTested);
  if (units !== null) body.unitsTested = units;
  const results = parseRowLines(v.results, DISSOLUTION_POINT_COLUMNS);
  if (results.length > 0) body.results = results;
  const comparison = parseRowLines(v.comparisonResults, DISSOLUTION_POINT_COLUMNS);
  if (comparison.length > 0) body.comparisonResults = comparison;
  const tested = isoDate(v.testDate);
  if (tested) body.testDate = tested;
  if (projectId) body.projectId = projectId;
  return body;
}

/** The UPDATE body — see the note on `containerClosurePatch`. */
export function dissolutionProfilePatch(v: Record<string, string>): DissolutionProfileBody {
  const results = parseRowLines(v.results, DISSOLUTION_POINT_COLUMNS);
  const comparison = parseRowLines(v.comparisonResults, DISSOLUTION_POINT_COLUMNS);
  return {
    purpose: req(v.purpose) || 'development',
    productName: req(v.productName),
    apparatus: req(v.apparatus) || 'USP II (paddle)',
    medium: req(v.medium),
    status: req(v.status) || 'draft',
    batchNumber: opt(v.batchNumber) ?? null,
    strength: opt(v.strength) ?? null,
    rotationSpeed: opt(v.rotationSpeed) ?? null,
    mediumVolume: opt(v.mediumVolume) ?? null,
    temperature: opt(v.temperature) ?? null,
    sinker: opt(v.sinker) ?? null,
    specification: opt(v.specification) ?? null,
    comparisonBatch: opt(v.comparisonBatch) ?? null,
    unitsTested: unitsOf(v.unitsTested),
    results: results.length > 0 ? results : null,
    comparisonResults: comparison.length > 0 ? comparison : null,
    testDate: isoDate(v.testDate) ?? null,
  };
}

/* ═══════════ Material specifications — /api/cmc/material-specs ═══════════════
   The excipients and the raw materials, in one register keyed on the role. */

export const MATERIAL_ROLES = [
  'excipient', 'capsule-shell', 'coating', 'processing-aid', 'raw-material', 'starting-material',
];

/** Recorded, never inferred: §3.2.A.3 reads this to answer the TSE/BSE question. */
export const MATERIAL_ORIGINS = ['plant', 'mineral', 'synthetic', 'fermentation', 'animal', 'human'];

export const MATERIAL_SPEC_STATUSES = ['draft', 'specified', 'retired'];

export const MATERIAL_TEST_COLUMNS = ['test', 'method', 'acceptanceCriteria'];

export interface MaterialSpecBody {
  projectId?: string;
  materialRole: string;
  materialName: string;
  functionInFormulation?: string | null;
  grade?: string | null;
  compendialMonograph?: string | null;
  compendialCompliance?: string | null;
  supplier?: string | null;
  manufacturerSite?: string | null;
  origin?: string | null;
  originDetail?: string | null;
  tseCertificate?: string | null;
  testParameters?: Array<Record<string, unknown>> | null;
  analyticalProcedures?: string | null;
  novelExcipient: boolean;
  novelExcipientJustification?: string | null;
  status: string;
}

export function materialSpecForm(row?: Partial<MaterialSpecBody> | null): C2CFormConfig {
  return {
    eyebrow: 'Materials — §3.2.P.4 / §3.2.S.2.3',
    title: row ? 'Edit material specification' : 'Record a material specification',
    sub: 'An excipient or a raw material, and what it is controlled to',
    submitLabel: row ? 'Save material' : 'Record material',
    fields: [
      { key: 'materialName', label: 'Material', type: 'text', required: true, half: true, default: row?.materialName ?? '', placeholder: 'e.g. Microcrystalline cellulose' },
      { key: 'materialRole', label: 'Role', type: 'select', options: MATERIAL_ROLES, required: true, half: true, default: row?.materialRole ?? 'excipient', desc: 'An excipient files under §3.2.P.4; a raw or starting material under §3.2.S.2.3' },
      { key: 'functionInFormulation', label: 'Function', type: 'text', half: true, default: row?.functionInFormulation ?? '', placeholder: 'e.g. Diluent, disintegrant, lubricant' },
      { key: 'grade', label: 'Grade', type: 'text', half: true, default: row?.grade ?? '', placeholder: 'e.g. PH-102' },
      { key: 'compendialMonograph', label: 'Compendial monograph', type: 'text', half: true, default: row?.compendialMonograph ?? '', placeholder: 'e.g. USP-NF, Ph. Eur. 2.9.40' },
      { key: 'compendialCompliance', label: 'Compliance', type: 'text', half: true, default: row?.compendialCompliance ?? '', placeholder: 'e.g. Complies; supplier CoA per lot' },
      { key: 'origin', label: 'Origin', type: 'select', options: MATERIAL_ORIGINS, half: true, default: row?.origin ?? '', desc: 'Section 3.2.A.3 answers the TSE/BSE question from this. Left blank, the origin is not established.' },
      { key: 'originDetail', label: 'Origin detail', type: 'text', half: true, default: row?.originDetail ?? '', placeholder: 'e.g. Bovine, EU-sourced, ruminant-free feed' },
      { key: 'tseCertificate', label: 'TSE/BSE certificate', type: 'text', half: true, default: row?.tseCertificate ?? '', placeholder: 'e.g. CEP R1-CEP 2019-123' },
      { key: 'supplier', label: 'Supplier', type: 'text', half: true, default: row?.supplier ?? '' },
      { key: 'manufacturerSite', label: 'Manufacturing site', type: 'text', default: row?.manufacturerSite ?? '' },
      { key: 'testParameters', label: 'Specification', type: 'textarea', rows: 3, default: rowLinesOf(row?.testParameters, MATERIAL_TEST_COLUMNS), placeholder: 'One per line: Test | Method | Acceptance criteria' },
      { key: 'analyticalProcedures', label: 'Analytical procedures', type: 'textarea', rows: 2, default: row?.analyticalProcedures ?? '', placeholder: 'How it is tested, or the monograph the procedures come from' },
      { key: 'novelExcipient', label: 'Novel excipient', type: 'seg', options: ['no', 'yes'], half: true, default: row?.novelExcipient ? 'yes' : 'no', desc: 'A novel excipient needs the safety documentation of §3.2.P.4.6' },
      { key: 'status', label: 'Status', type: 'seg', options: MATERIAL_SPEC_STATUSES, required: true, half: true, default: row?.status && MATERIAL_SPEC_STATUSES.includes(row.status) ? row.status : 'draft' },
      { key: 'novelExcipientJustification', label: 'Novel excipient justification', type: 'textarea', rows: 2, default: row?.novelExcipientJustification ?? '', placeholder: 'The safety data supporting its use at this level and route' },
    ],
  };
}

export function materialSpecBody(v: Record<string, string>, projectId?: string): MaterialSpecBody {
  const body: MaterialSpecBody = {
    materialRole: req(v.materialRole) || 'excipient',
    materialName: req(v.materialName),
    novelExcipient: req(v.novelExcipient) === 'yes',
    status: req(v.status) || 'draft',
  };
  const optionalText: Array<keyof MaterialSpecBody> = [
    'functionInFormulation', 'grade', 'compendialMonograph', 'compendialCompliance',
    'supplier', 'manufacturerSite', 'origin', 'originDetail', 'tseCertificate',
    'analyticalProcedures', 'novelExcipientJustification',
  ];
  for (const key of optionalText) {
    const value = opt(v[key as string]);
    if (value) (body as unknown as Record<string, unknown>)[key as string] = value;
  }
  const tests = parseRowLines(v.testParameters, MATERIAL_TEST_COLUMNS);
  if (tests.length > 0) body.testParameters = tests;
  if (projectId) body.projectId = projectId;
  return body;
}

/** The UPDATE body — see the note on `containerClosurePatch`. */
export function materialSpecPatch(v: Record<string, string>): MaterialSpecBody {
  const tests = parseRowLines(v.testParameters, MATERIAL_TEST_COLUMNS);
  return {
    materialRole: req(v.materialRole) || 'excipient',
    materialName: req(v.materialName),
    novelExcipient: req(v.novelExcipient) === 'yes',
    status: req(v.status) || 'draft',
    functionInFormulation: opt(v.functionInFormulation) ?? null,
    grade: opt(v.grade) ?? null,
    compendialMonograph: opt(v.compendialMonograph) ?? null,
    compendialCompliance: opt(v.compendialCompliance) ?? null,
    supplier: opt(v.supplier) ?? null,
    manufacturerSite: opt(v.manufacturerSite) ?? null,
    origin: opt(v.origin) ?? null,
    originDetail: opt(v.originDetail) ?? null,
    tseCertificate: opt(v.tseCertificate) ?? null,
    analyticalProcedures: opt(v.analyticalProcedures) ?? null,
    novelExcipientJustification: opt(v.novelExcipientJustification) ?? null,
    testParameters: tests.length > 0 ? tests : null,
  };
}

/* ═══════════ Formulation records — /api/cmc/formulation-records ══════════════
   The batch formula §3.2.P.1's quantitative composition is built from. */

export const FORMULATION_STATUSES = ['draft', 'current', 'superseded'];

export const FORMULATION_COMPONENT_COLUMNS = [
  'component', 'role', 'amountPerUnit', 'unit', 'percentWeight', 'amountPerBatch',
  'overage', 'overageJustification', 'compendialReference', 'origin',
];

export interface FormulationRecordBody {
  projectId?: string;
  formulationName: string;
  version?: string | null;
  dosageForm?: string | null;
  strength?: string | null;
  batchSize?: string | null;
  components?: Array<Record<string, unknown>> | null;
  theoreticalYield?: string | null;
  overageJustification?: string | null;
  supersedes?: string | null;
  status: string;
}

export function formulationRecordForm(row?: Partial<FormulationRecordBody> | null): C2CFormConfig {
  return {
    eyebrow: 'Formulation — §3.2.P.1 / §3.2.P.3.2',
    title: row ? 'Edit formulation record' : 'Record a formulation',
    sub: 'The batch formula: what goes in, how much, and what it scales to per unit',
    submitLabel: row ? 'Save formulation' : 'Record formulation',
    fields: [
      { key: 'formulationName', label: 'Formulation', type: 'text', required: true, half: true, default: row?.formulationName ?? '', placeholder: 'e.g. BX-701 5 mg film-coated tablet' },
      { key: 'version', label: 'Version', type: 'text', half: true, default: row?.version ?? '', placeholder: 'e.g. F-v2.0' },
      { key: 'dosageForm', label: 'Dosage form', type: 'text', half: true, default: row?.dosageForm ?? '', placeholder: 'e.g. Film-coated tablet' },
      { key: 'strength', label: 'Strength', type: 'text', half: true, default: row?.strength ?? '', placeholder: 'e.g. 5 mg' },
      { key: 'batchSize', label: 'Batch size', type: 'text', half: true, default: row?.batchSize ?? '', placeholder: 'e.g. 250,000 tablets' },
      { key: 'theoreticalYield', label: 'Theoretical yield', type: 'text', half: true, default: row?.theoreticalYield ?? '' },
      { key: 'components', label: 'Components', type: 'textarea', rows: 6, default: rowLinesOf(row?.components, FORMULATION_COMPONENT_COLUMNS), placeholder: 'One per line: Component | Role | Amount per unit | Unit | % w/w | Amount per batch | Overage | Overage justification | Compendial reference | Origin' },
      { key: 'overageJustification', label: 'Overage justification', type: 'textarea', rows: 2, default: row?.overageJustification ?? '', placeholder: 'Applies to the formulation as a whole where a component does not carry its own' },
      { key: 'supersedes', label: 'Supersedes', type: 'text', half: true, default: row?.supersedes ?? '', placeholder: 'The version this one replaces' },
      { key: 'status', label: 'Status', type: 'seg', options: FORMULATION_STATUSES, required: true, half: true, default: row?.status && FORMULATION_STATUSES.includes(row.status) ? row.status : 'draft', desc: 'Exactly one version may be current; §3.2.P.1 renders that one' },
    ],
  };
}

export function formulationRecordBody(v: Record<string, string>, projectId?: string): FormulationRecordBody {
  const body: FormulationRecordBody = {
    formulationName: req(v.formulationName),
    status: req(v.status) || 'draft',
  };
  const optionalText: Array<keyof FormulationRecordBody> = [
    'version', 'dosageForm', 'strength', 'batchSize', 'theoreticalYield',
    'overageJustification', 'supersedes',
  ];
  for (const key of optionalText) {
    const value = opt(v[key as string]);
    if (value) (body as unknown as Record<string, unknown>)[key as string] = value;
  }
  const components = parseRowLines(v.components, FORMULATION_COMPONENT_COLUMNS);
  if (components.length > 0) body.components = components;
  if (projectId) body.projectId = projectId;
  return body;
}

/** The UPDATE body — see the note on `containerClosurePatch`. */
export function formulationRecordPatch(v: Record<string, string>): FormulationRecordBody {
  const components = parseRowLines(v.components, FORMULATION_COMPONENT_COLUMNS);
  return {
    formulationName: req(v.formulationName),
    status: req(v.status) || 'draft',
    version: opt(v.version) ?? null,
    dosageForm: opt(v.dosageForm) ?? null,
    strength: opt(v.strength) ?? null,
    batchSize: opt(v.batchSize) ?? null,
    theoreticalYield: opt(v.theoreticalYield) ?? null,
    overageJustification: opt(v.overageJustification) ?? null,
    supersedes: opt(v.supersedes) ?? null,
    components: components.length > 0 ? components : null,
  };
}


/* ═══════════ Manufacturing processes — /api/cmc/manufacturing-processes ══════
   The ordered unit operations, their critical parameters and their controls —
   §3.2.S.2.2 for the drug substance, §3.2.P.3.3 for the drug product.

   The register writes `manufacturing_processes`, the table that already backed
   the ICH compliance checker and the QbD analyzer and had never had a writer. */

export const PROCESS_SIDES = ['drug_substance', 'drug_product'];

/** `validated` is reached only through the Part 11 signature endpoint. */
export const PROCESS_VALIDATION_STATUSES = ['not-started', 'in-progress', 'retired'];

export const PROCESS_STEP_COLUMNS = [
  'stepNumber', 'unitOperation', 'description', 'equipment', 'holdTime',
];
export const PROCESS_CPP_COLUMNS = [
  'parameter', 'step', 'target', 'rangeLow', 'rangeHigh', 'unit', 'criticality', 'linkedCqa',
];
export const PROCESS_CONTROL_COLUMNS = ['test', 'acceptanceCriteria', 'samplingPoint', 'frequency'];
export const PROCESS_EQUIPMENT_COLUMNS = ['equipment', 'type', 'model', 'qualificationStatus'];

export interface ManufacturingProcessBody {
  projectId?: string;
  processName: string;
  processType?: string | null;
  processDescription?: string | null;
  processSteps?: Array<Record<string, unknown>> | null;
  criticalProcessParameters?: Array<Record<string, unknown>> | null;
  processControls?: Array<Record<string, unknown>> | null;
  equipmentList?: Array<Record<string, unknown>> | null;
  batchSize?: string | null;
  processDevelopment?: string | null;
  reprocessing?: string | null;
  validationStatus: string;
}

export function manufacturingProcessForm(row?: Partial<ManufacturingProcessBody> | null): C2CFormConfig {
  const statuses = statusOptionsFor(PROCESS_VALIDATION_STATUSES, row?.validationStatus, 'validated');
  return {
    eyebrow: 'Manufacturing — §3.2.S.2.2 / §3.2.P.3.3',
    title: row ? 'Edit manufacturing process' : 'Record a manufacturing process',
    sub: 'The unit operations, what is critical in each, and what is controlled in-process',
    submitLabel: row ? 'Save process' : 'Record process',
    fields: [
      { key: 'processName', label: 'Process', type: 'text', required: true, half: true, default: row?.processName ?? '', placeholder: 'e.g. BX-204 drug substance synthesis' },
      { key: 'processType', label: 'Side', type: 'select', options: PROCESS_SIDES, required: true, half: true, default: row?.processType ?? 'drug_substance', desc: 'A drug substance process files under §3.2.S.2; a drug product process under §3.2.P.3' },
      { key: 'batchSize', label: 'Batch size', type: 'text', half: true, default: row?.batchSize ?? '', placeholder: 'e.g. 25 kg' },
      { key: 'validationStatus', label: 'Validation', type: 'seg', options: statuses, required: true, half: true, default: statusDefaultFor(PROCESS_VALIDATION_STATUSES, row?.validationStatus, 'validated'), desc: 'Validated is recorded with a signature, on the Validate action' },
      { key: 'processDescription', label: 'Process description', type: 'textarea', rows: 3, default: row?.processDescription ?? '', placeholder: 'Left blank, the section describes the process from the recorded steps' },
      { key: 'processSteps', label: 'Steps', type: 'textarea', rows: 5, default: rowLinesOf(row?.processSteps, PROCESS_STEP_COLUMNS), placeholder: 'One per line: Step no. | Unit operation | Description | Equipment | Hold time' },
      { key: 'criticalProcessParameters', label: 'Critical process parameters', type: 'textarea', rows: 4, default: rowLinesOf(row?.criticalProcessParameters, PROCESS_CPP_COLUMNS), placeholder: 'One per line: Parameter | Step | Target | Range low | Range high | Unit | Criticality | Linked CQA' },
      { key: 'processControls', label: 'In-process controls', type: 'textarea', rows: 3, default: rowLinesOf(row?.processControls, PROCESS_CONTROL_COLUMNS), placeholder: 'One per line: Test | Acceptance criteria | Sampling point | Frequency' },
      { key: 'equipmentList', label: 'Equipment', type: 'textarea', rows: 3, default: rowLinesOf(row?.equipmentList, PROCESS_EQUIPMENT_COLUMNS), placeholder: 'One per line: Equipment | Type | Model | Qualification status' },
      { key: 'processDevelopment', label: 'Process development', type: 'textarea', rows: 2, default: row?.processDevelopment ?? '', placeholder: '§3.2.S.2.6 — how the process reached its current form' },
      { key: 'reprocessing', label: 'Reprocessing', type: 'textarea', rows: 2, default: row?.reprocessing ?? '', placeholder: 'The reprocessing operations that are permitted, and on what basis' },
    ],
  };
}

export function manufacturingProcessBody(v: Record<string, string>, projectId?: string): ManufacturingProcessBody {
  const body: ManufacturingProcessBody = {
    processName: req(v.processName),
    processType: req(v.processType) || 'drug_substance',
    validationStatus: req(v.validationStatus) || 'not-started',
  };
  for (const key of ['processDescription', 'batchSize', 'processDevelopment', 'reprocessing'] as const) {
    const value = opt(v[key]);
    if (value) (body as unknown as Record<string, unknown>)[key] = value;
  }
  const steps = parseRowLines(v.processSteps, PROCESS_STEP_COLUMNS);
  if (steps.length > 0) body.processSteps = steps;
  const cpps = parseRowLines(v.criticalProcessParameters, PROCESS_CPP_COLUMNS);
  if (cpps.length > 0) body.criticalProcessParameters = cpps;
  const controls = parseRowLines(v.processControls, PROCESS_CONTROL_COLUMNS);
  if (controls.length > 0) body.processControls = controls;
  const equipment = parseRowLines(v.equipmentList, PROCESS_EQUIPMENT_COLUMNS);
  if (equipment.length > 0) body.equipmentList = equipment;
  if (projectId) body.projectId = projectId;
  return body;
}

/** The UPDATE body — every editable field, so clearing one clears it. */
export function manufacturingProcessPatch(
  v: Record<string, string>,
  /* The stored row, so a step's in-process controls — which the drawer cannot
     show and the mapper, the card and §3.2.S.2 all read — survive the edit. */
  row?: Partial<ManufacturingProcessBody> | null,
): ManufacturingProcessBody {
  const steps = parseRowLines(v.processSteps, PROCESS_STEP_COLUMNS, row?.processSteps);
  const cpps = parseRowLines(v.criticalProcessParameters, PROCESS_CPP_COLUMNS);
  const controls = parseRowLines(v.processControls, PROCESS_CONTROL_COLUMNS);
  const equipment = parseRowLines(v.equipmentList, PROCESS_EQUIPMENT_COLUMNS);
  return {
    processName: req(v.processName),
    processType: req(v.processType) || 'drug_substance',
    validationStatus: req(v.validationStatus) || 'not-started',
    processDescription: opt(v.processDescription) ?? null,
    batchSize: opt(v.batchSize) ?? null,
    processDevelopment: opt(v.processDevelopment) ?? null,
    reprocessing: opt(v.reprocessing) ?? null,
    processSteps: steps.length > 0 ? steps : null,
    criticalProcessParameters: cpps.length > 0 ? cpps : null,
    processControls: controls.length > 0 ? controls : null,
    equipmentList: equipment.length > 0 ? equipment : null,
  };
}

/* ═══════════ Characterisation — /api/cmc/characterization-studies ════════════
   §3.2.S.3.1 asks three questions and each study answers one of them. The type
   is stored so three studies of one kind cannot green all three. */

export const CHARACTERIZATION_SCOPES = ['drug_substance', 'drug_product'];
export const CHARACTERIZATION_STUDY_TYPES = ['structural', 'physicochemical', 'biological'];
export const CHARACTERIZATION_STATUSES = ['draft', 'in-review', 'retired'];
export const CHARACTERIZATION_DATA_COLUMNS = ['label', 'value', 'unit', 'note'];

export interface CharacterizationStudyBody {
  projectId?: string;
  scope: string;
  studyType: string;
  studyTitle: string;
  technique?: string | null;
  attribute?: string | null;
  result?: string | null;
  resultUnit?: string | null;
  acceptanceReference?: string | null;
  conclusion?: string | null;
  studyReference?: string | null;
  performedBy?: string | null;
  performedDate?: string | null;
  supportingData?: Array<Record<string, unknown>> | null;
  status: string;
}

export function characterizationStudyForm(row?: Partial<CharacterizationStudyBody> | null): C2CFormConfig {
  const statuses = statusOptionsFor(CHARACTERIZATION_STATUSES, row?.status);
  return {
    eyebrow: 'Characterisation — §3.2.S.3.1',
    title: row ? 'Edit characterisation study' : 'Record a characterisation study',
    sub: 'What the study established: the structure, a physicochemical property, or the biological activity',
    submitLabel: row ? 'Save study' : 'Record study',
    fields: [
      { key: 'studyTitle', label: 'Study', type: 'text', required: true, half: true, default: row?.studyTitle ?? '', placeholder: 'e.g. Structure confirmation of BX-204' },
      { key: 'studyType', label: 'Establishes', type: 'select', options: CHARACTERIZATION_STUDY_TYPES, required: true, half: true, default: row?.studyType ?? 'structural', desc: '§3.2.S.3.1 asks all three; a study answers the one it is typed as' },
      { key: 'scope', label: 'Material', type: 'select', options: CHARACTERIZATION_SCOPES, required: true, half: true, default: row?.scope ?? 'drug_substance', desc: '§3.2.S.3 is the drug substance; a drug product study is §3.2.P.2 development evidence' },
      { key: 'technique', label: 'Technique', type: 'text', half: true, default: row?.technique ?? '', placeholder: 'e.g. 1H/13C NMR, HRMS, FT-IR' },
      { key: 'attribute', label: 'Attribute', type: 'text', half: true, default: row?.attribute ?? '', placeholder: 'e.g. Solubility at pH 6.8' },
      { key: 'result', label: 'Result', type: 'text', half: true, default: row?.result ?? '', placeholder: 'e.g. 0.42' },
      { key: 'resultUnit', label: 'Unit', type: 'text', half: true, default: row?.resultUnit ?? '', placeholder: 'e.g. mg/mL — a result with no unit is reported as such' },
      { key: 'acceptanceReference', label: 'Acceptance reference', type: 'text', half: true, default: row?.acceptanceReference ?? '', placeholder: 'The specification or method the result is judged against' },
      { key: 'conclusion', label: 'Conclusion', type: 'textarea', rows: 2, default: row?.conclusion ?? '', placeholder: 'What the study establishes. Without a result or a conclusion it establishes nothing.' },
      { key: 'studyReference', label: 'Report reference', type: 'text', half: true, default: row?.studyReference ?? '', placeholder: 'e.g. RPT-CHAR-001' },
      { key: 'performedBy', label: 'Performed by', type: 'text', half: true, default: row?.performedBy ?? '' },
      { key: 'performedDate', label: 'Performed on', type: 'date', half: true, default: String(row?.performedDate ?? '').slice(0, 10) },
      { key: 'status', label: 'Status', type: 'seg', options: statuses, required: true, half: true, default: statusDefaultFor(CHARACTERIZATION_STATUSES, row?.status) },
      { key: 'supportingData', label: 'Supporting data', type: 'textarea', rows: 4, default: rowLinesOf(row?.supportingData, CHARACTERIZATION_DATA_COLUMNS), placeholder: 'One per line: Parameter or assignment | Value | Unit | Note' },
    ],
  };
}

export function characterizationStudyBody(v: Record<string, string>, projectId?: string): CharacterizationStudyBody {
  const body: CharacterizationStudyBody = {
    scope: req(v.scope) || 'drug_substance',
    studyType: req(v.studyType) || 'structural',
    studyTitle: req(v.studyTitle),
    status: req(v.status) || 'draft',
  };
  const optionalText: Array<keyof CharacterizationStudyBody> = [
    'technique', 'attribute', 'result', 'resultUnit', 'acceptanceReference',
    'conclusion', 'studyReference', 'performedBy',
  ];
  for (const key of optionalText) {
    const value = opt(v[key as string]);
    if (value) (body as unknown as Record<string, unknown>)[key as string] = value;
  }
  const performedDate = isoDate(v.performedDate);
  if (performedDate) body.performedDate = performedDate;
  const supporting = parseRowLines(v.supportingData, CHARACTERIZATION_DATA_COLUMNS);
  if (supporting.length > 0) body.supportingData = supporting;
  if (projectId) body.projectId = projectId;
  return body;
}

/** The UPDATE body — see the note on `containerClosurePatch`. */
export function characterizationStudyPatch(v: Record<string, string>): CharacterizationStudyBody {
  const supporting = parseRowLines(v.supportingData, CHARACTERIZATION_DATA_COLUMNS);
  return {
    scope: req(v.scope) || 'drug_substance',
    studyType: req(v.studyType) || 'structural',
    studyTitle: req(v.studyTitle),
    status: req(v.status) || 'draft',
    technique: opt(v.technique) ?? null,
    attribute: opt(v.attribute) ?? null,
    result: opt(v.result) ?? null,
    resultUnit: opt(v.resultUnit) ?? null,
    acceptanceReference: opt(v.acceptanceReference) ?? null,
    conclusion: opt(v.conclusion) ?? null,
    studyReference: opt(v.studyReference) ?? null,
    performedBy: opt(v.performedBy) ?? null,
    performedDate: isoDate(v.performedDate) ?? null,
    supportingData: supporting.length > 0 ? supporting : null,
  };
}
