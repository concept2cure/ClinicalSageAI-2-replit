/**
 * useIvd — live data hooks for IvdSurface, adapting the IVDR backend
 * (/api/ivdr/*) into the kit's IVD shapes. Mirrors useK510.ts: each hook
 * returns `rows: T[] | null` (null while loading / on non-2xx) so the surface
 * falls back to the data/ivd.ts fixtures and never renders empty.
 *
 *  useIvdClassifications()       — GET /api/ivdr/classifications (org-scoped)
 *  useIvdValidations()           — GET /api/ivdr/validations (org-scoped)
 *  useIvdClinicalEvidence()      — GET /api/ivdr/clinical-evidence (org-scoped)
 *  useIvdGsprMatrix(projectId)   — GET /api/ivdr/gspr-checklist/:projectId/matrix
 *
 * The IVDR list endpoints are org-scoped (no program id) — the surface's
 * program only scopes the GSPR matrix. Adapters read snake_case columns with
 * camelCase fallbacks so a schema rename degrades to fixture, not a crash.
 */

import type {
  IvdClass,
  IvdClassification,
  IvdClinicalEvidence,
  IvdGsprChapter,
  IvdParamStatus,
  IvdValidation,
} from '../data/ivd';
import { useFetchJson } from './useFetchJson';

/* ─── helpers ───────────────────────────────────────────────────────── */

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function ratio(a: number, b: number): number | null {
  return b > 0 ? a / b : null;
}

/* ─── classifications ───────────────────────────────────────────────── */

interface ServerClassification {
  id?: number | string;
  device_name?: string; deviceName?: string;
  intended_purpose?: string; intendedPurpose?: string;
  classification?: string;
  is_cdx?: boolean; isCdx?: boolean;
  is_self_test?: boolean; isSelfTest?: boolean;
  is_near_patient?: boolean; isNearPatient?: boolean;
  rule_trace?: unknown; ruleTrace?: unknown;
}

function topRule(trace: unknown): string | undefined {
  if (!Array.isArray(trace) || trace.length === 0) return undefined;
  const first = trace[0] as Record<string, unknown>;
  const label = first?.rule ?? first?.name ?? first?.label ?? first?.id;
  return typeof label === 'string' ? label : undefined;
}

function adaptClassification(c: ServerClassification): IvdClassification | null {
  const device = c.device_name ?? c.deviceName;
  if (!device) return null;
  const cls = String(c.classification ?? '').toUpperCase();
  const classification = (['A', 'B', 'C', 'D'].includes(cls) ? cls : 'B') as IvdClass;
  return {
    id: String(c.id ?? device),
    device,
    intendedPurpose: c.intended_purpose ?? c.intendedPurpose ?? '',
    classification,
    rule: topRule(c.rule_trace ?? c.ruleTrace),
    selfTest: c.is_self_test ?? c.isSelfTest,
    nearPatient: c.is_near_patient ?? c.isNearPatient,
    cdx: c.is_cdx ?? c.isCdx,
  };
}

export interface UseIvdRows<T> {
  rows: T[] | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * @param programId Narrows to one diagnostic programme. Pass null for the
 *                  organisation-wide portfolio view.
 */
export function useIvdClassifications(programId?: string | null): UseIvdRows<IvdClassification> {
  const { data, loading, error, refresh } = useFetchJson<{ classifications?: ServerClassification[] }>(
    programId
      ? `/api/ivdr/classifications?program_id=${encodeURIComponent(programId)}`
      : '/api/ivdr/classifications',
  );
  if (!data) return { rows: null, loading, error, refresh };
  const rows = (data.classifications ?? [])
    .map(adaptClassification)
    .filter((r): r is IvdClassification => r !== null);
  /* A resolved-but-empty result returns [] rather than null: null means
     "never asked", and collapsing the two hides the difference between a
     programme with no classifications and a request that never ran. */
  return { rows, loading, error, refresh };
}

/* ─── analytical validations ────────────────────────────────────────── */

interface ServerValidation {
  id?: number | string;
  device_name?: string; deviceName?: string;
  analyte?: string;
  lod?: unknown; loq?: unknown;
  precision_cv?: unknown; precisionCV?: unknown;
  sensitivity?: unknown; specificity?: unknown;
  status?: string;
}

function adaptValidation(v: ServerValidation): IvdValidation {
  const raw = String(v.status ?? 'pending').toLowerCase();
  const status: IvdParamStatus = raw === 'pass' || raw === 'fail' ? raw : 'pending';
  return {
    id: String(v.id ?? Math.random().toString(36).slice(2)),
    analyte: v.analyte ?? v.device_name ?? v.deviceName ?? 'Validation',
    lod: num(v.lod),
    loq: num(v.loq),
    precisionCV: num(v.precision_cv ?? v.precisionCV),
    sensitivity: num(v.sensitivity),
    specificity: num(v.specificity),
    status,
  };
}

export function useIvdValidations(programId?: string | null): UseIvdRows<IvdValidation> {
  const { data, loading, error, refresh } = useFetchJson<{ validations?: ServerValidation[] }>(
    programId
      ? `/api/ivdr/validations?program_id=${encodeURIComponent(programId)}`
      : '/api/ivdr/validations',
  );
  if (!data) return { rows: null, loading, error, refresh };
  const rows = (data.validations ?? []).map(adaptValidation);
  return { rows, loading, error, refresh };
}

/* ─── clinical evidence (2×2) ───────────────────────────────────────── */

interface ServerEvidence {
  id?: number | string;
  study_name?: string; studyName?: string; study?: string;
  true_positive?: unknown; truePositive?: unknown;
  false_positive?: unknown; falsePositive?: unknown;
  true_negative?: unknown; trueNegative?: unknown;
  false_negative?: unknown; falseNegative?: unknown;
  sensitivity?: unknown; specificity?: unknown; ppv?: unknown; npv?: unknown; accuracy?: unknown;
  status?: string;
}

function adaptEvidence(e: ServerEvidence): IvdClinicalEvidence {
  const tp = num(e.true_positive ?? e.truePositive) ?? 0;
  const fp = num(e.false_positive ?? e.falsePositive) ?? 0;
  const tn = num(e.true_negative ?? e.trueNegative) ?? 0;
  const fn = num(e.false_negative ?? e.falseNegative) ?? 0;
  const total = tp + fp + tn + fn;
  return {
    id: String(e.id ?? Math.random().toString(36).slice(2)),
    study: e.study_name ?? e.studyName ?? e.study ?? 'Clinical study',
    tp, fp, tn, fn,
    // Prefer server-computed metrics; derive from the 2×2 when absent.
    sensitivity: num(e.sensitivity) ?? ratio(tp, tp + fn),
    specificity: num(e.specificity) ?? ratio(tn, tn + fp),
    ppv: num(e.ppv) ?? ratio(tp, tp + fp),
    npv: num(e.npv) ?? ratio(tn, tn + fn),
    accuracy: num(e.accuracy) ?? ratio(tp + tn, total),
    status: e.status ?? 'draft',
  };
}

export function useIvdClinicalEvidence(programId?: string | null): UseIvdRows<IvdClinicalEvidence> {
  const { data, loading, error, refresh } = useFetchJson<{ evidence?: ServerEvidence[] }>(
    programId
      ? `/api/ivdr/clinical-evidence?program_id=${encodeURIComponent(programId)}`
      : '/api/ivdr/clinical-evidence',
  );
  if (!data) return { rows: null, loading, error, refresh };
  const rows = (data.evidence ?? []).map(adaptEvidence);
  return { rows, loading, error, refresh };
}

/* ─── GSPR matrix (Annex I) ─────────────────────────────────────────── */

interface ServerGsprSummary {
  total?: number;
  compliant?: number;
  partiallyCompliant?: number; partially_compliant?: number;
  nonCompliant?: number; non_compliant?: number;
  notAssessed?: number; not_assessed?: number;
}
interface ServerGsprChapter {
  label?: string;
  summary?: ServerGsprSummary;
  requirements?: unknown[];
}
interface GsprMatrixPayload {
  chapters?: Record<string, ServerGsprChapter>;
  overallCompliancePercent?: number;
}

const CHAPTER_LABEL: Record<string, string> = {
  I: 'General requirements (GSPR 1–9)',
  II: 'Performance, design & manufacture (10–18)',
  III: 'Information supplied (GSPR 19–23)',
};

function adaptGspr(key: string, ch: ServerGsprChapter): IvdGsprChapter | null {
  if (!['I', 'II', 'III'].includes(key)) return null;
  const s = ch.summary ?? {};
  const reqCount = Array.isArray(ch.requirements) ? ch.requirements.length : 0;
  return {
    key: key as IvdGsprChapter['key'],
    label: ch.label ?? CHAPTER_LABEL[key] ?? `Chapter ${key}`,
    total: s.total ?? reqCount,
    compliant: s.compliant ?? 0,
    partiallyCompliant: s.partiallyCompliant ?? s.partially_compliant ?? 0,
    nonCompliant: s.nonCompliant ?? s.non_compliant ?? 0,
    notAssessed: s.notAssessed ?? s.not_assessed ?? 0,
  };
}

export interface UseIvdGsprResult {
  rows: IvdGsprChapter[] | null;
  overallPercent: number | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useIvdGsprMatrix(projectId: string | null): UseIvdGsprResult {
  const url = projectId
    ? `/api/ivdr/gspr-checklist/${encodeURIComponent(projectId)}/matrix`
    : null;
  const { data, loading, error, refresh } = useFetchJson<GsprMatrixPayload>(url);
  if (!data || !data.chapters) {
    return { rows: null, overallPercent: null, loading, error, refresh };
  }
  const rows = Object.entries(data.chapters)
    .map(([k, ch]) => adaptGspr(k, ch))
    .filter((r): r is IvdGsprChapter => r !== null)
    .sort((a, b) => ['I', 'II', 'III'].indexOf(a.key) - ['I', 'II', 'III'].indexOf(b.key));
  return {
    rows: rows.length ? rows : null,
    overallPercent: typeof data.overallCompliancePercent === 'number' ? data.overallCompliancePercent : null,
    loading,
    error,
    refresh,
  };
}
