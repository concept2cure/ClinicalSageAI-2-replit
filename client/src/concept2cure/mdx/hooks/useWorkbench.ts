/**
 * useWorkbench — live data hooks for the cross-program Workbench panes.
 *
 *  useWorkbenchValidation(programs) — composes:
 *                              /api/submission-ops/blockers (cross-program)
 *                              with the live program list to compute the
 *                              per-program rules matrix + summary KPIs.
 *
 * No new server routes.
 *
 * The task hooks (useWorkbenchTasks over /api/submission-ops/workload,
 * useUnifiedWork and workNotOnTheBoard over /unified-work) went with the task
 * panel when it folded into Tasks (D2, 2026-10-29;
 * docs/evidence/D2-ONE-ANA/2026-10-29/fold-device-tasks/). Tasks
 * (v2/surfaces/TaskBoard.tsx) reads every store through GET
 * /api/task-management/board.
 */

import { useMemo } from 'react';
import { formatRelativeShort } from '../lib/formatRelativeShort';
import type {
  ValidationProgram,
  ValidationRule,
  ValidationSummary,
} from '../data/workbench';
import type { Program } from '../data/programs';
import { useFetchJson } from './useFetchJson';
import { firstArray, shapeMismatch } from '../lib/payloadShape';
import { PATHWAY_LABEL } from '../../../../../shared/constants/mdx';

/* ─── Validation ───────────────────────────────────────────────────── */

/* A c2c_blockers row as GET /api/submission-ops/blockers returns it.
   Slice 0 (map row `device-validation`): `programCode` and `sectionLabel`
   were read here, and the table has neither column, so every rule rendered
   "— · —". It names the project the blocker is recorded against, and its
   title. */
interface ServerBlocker {
  id: number;
  blockerId?: string;
  projectId?: number;
  packageDbId?: number;
  packageId?: string;
  sectionDbId?: number;
  blockerType?: string;
  severity?: string;
  status?: string;
  title?: string;
  description?: string | null;
  createdAt?: string;
}

interface BlockersPayload {
  data?: ServerBlocker[];
  blockers?: ServerBlocker[];
  rows?: ServerBlocker[];
}

function adaptBlockerToRule(b: ServerBlocker): ValidationRule {
  /* Slice 0 (map row `device-validation`): every row here is an OPEN blocker.
     'low' (a valid c2c_blockers severity, written straight through from a
     correspondence issue) and any unrecognised value fell to 'ok' and rendered
     a "Pass" pill. Nothing open is a pass, so they are warnings. */
  const sev: ValidationRule['severity'] =
    b.severity === 'critical' || b.severity === 'high' ? 'err' : 'warn';
  return {
    id:       b.blockerId ?? `bl-${b.id}`,
    project:  typeof b.projectId === 'number' ? `Project #${b.projectId}` : '—',
    severity: sev,
    category: b.blockerType ?? 'general',
    /* A blocker opened by the automation runner carries a title and no
       description; it read "(no description)" beside a title it had. */
    msg:      b.description || b.title || '(no description)',
    since:    b.createdAt ? formatRelativeShort(b.createdAt) : '—',
  };
}

export interface UseWorkbenchValidationResult {
  programs: ValidationProgram[] | null;
  rules:    ValidationRule[]    | null;
  summary:  ValidationSummary[] | null;
  loading:  boolean;
  error:    string | null;
  refresh:  () => void;
}

const BLOCKERS_PATH = '/api/submission-ops/blockers';

/**
 * Fetch cross-program blockers from /api/submission-ops/blockers and
 * join with the live program list (passed in by the caller — usually
 * sourced from useMdxPrograms) to produce the per-program validation
 * matrix and 4 summary KPI cards. Pure-derivation hook on top of one
 * fetch + the supplied program array.
 */
export function useWorkbenchValidation(programs: Program[]): UseWorkbenchValidationResult {
  const { data, loading, error, refresh } = useFetchJson<BlockersPayload>(BLOCKERS_PATH);
  /* `data.data ?? data.blockers ?? data.rows ?? []` again — `{ data: {} }` is a
     truthy non-list that walked the chain and threw at `list.map`, taking the
     validation center down before it drew a single rule. */
  const blockers = firstArray<ServerBlocker>(data?.data, data?.blockers, data?.rows);
  const failed = error ?? (data != null && blockers === null ? shapeMismatch(BLOCKERS_PATH) : null);
  const rules = useMemo(
    () => (blockers ? blockers.map(adaptBlockerToRule) : null),
    [blockers],
  );

  const validationPrograms = useMemo<ValidationProgram[] | null>(() => {
    if (!rules) return null;
    /* Per-program counts are NOT derivable, so none are stated.
       This filtered blockers with `r.prog === p.code.split(' ')[0]`. A
       program's code is "Class II · 510(k)", so the left side was "Class";
       the right side read `programCode`, which c2c_blockers does not have (it
       references projects, not regulatory_programs). Nothing ever matched,
       so every program showed 0 errors, 0 warnings, and the summary said
       "All programs filing-ready" — including while critical blockers were
       open. With no key joining a blocker to a program, the honest per-program
       count is unknown; the portfolio totals below are real. */
    return programs.map((p) => {
      const errs = null;
      const warns = null;
      const ok = null;
      const status: ValidationProgram['status'] = p.status === 'complete' ? 'complete' : 'active';
      return {
        id:        p.id,
        code:      p.code.split(' ')[0],
        title:     p.title,
        pathway:   PATHWAY_LABEL[p.pathway] ?? p.pathway,
        errs,
        warns,
        ok,
        status,
        readiness: p.recordedProgress ?? null,
      };
    });
  }, [rules, programs]);

  const summary = useMemo<ValidationSummary[] | null>(() => {
    if (!rules || !validationPrograms) return null;
    const totalErr  = rules.filter((r) => r.severity === 'err').length;
    const totalWarn = rules.filter((r) => r.severity === 'warn').length;
    // Recorded progress is independent of an assessed readiness figure.
    const measured = validationPrograms.map(p => p.readiness).filter((value): value is number =>
      typeof value === 'number' && Number.isFinite(value));
    const avgReady = measured.length
      ? String(Math.round(measured.reduce((sum, value) => sum + value, 0) / measured.length)) : null;
    return [
      /* Was "Programs blocked · All programs filing-ready", computed from the
         per-program counts above that could never be non-zero. */
      { label: 'Projects blocked', metric: '—', meta: 'Blockers are recorded on tracking records, not linked to projects' },
      /* Slice 0: "No critical issues" and "No warnings" in the ok tone read as
         a clean result; nothing on this screen assesses one. Zero is what was
         recorded, so it says that, without a tone. */
      { label: 'Open errors',      metric: String(totalErr),     meta: totalErr ? 'High/critical severity' : 'None recorded', ...(totalErr ? { tone: 'err' as const } : {}) },
      { label: 'Open warnings',    metric: String(totalWarn),    meta: totalWarn ? 'Medium or low severity' : 'None recorded', ...(totalWarn ? { tone: 'warn' as const } : {}) },
      {
        label: 'Avg recorded progress',
        metric: avgReady ?? 'Not recorded',
        ...(avgReady === null ? {} : { unit: '%' }),
        meta: 'Recorded project progress, not an eSTAR assessment',
      },
    ];
  }, [rules, validationPrograms]);

  return { programs: validationPrograms, rules, summary, loading, error: failed, refresh };
}
