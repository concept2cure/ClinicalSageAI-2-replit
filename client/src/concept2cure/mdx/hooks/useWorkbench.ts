/**
 * useWorkbench — live data hooks for the cross-program Workbench panes.
 *
 *  useWorkbenchTasks()      — /api/submission-ops/workload
 *                              Adapts c2c_project_work_items rows into the
 *                              kit's Task[] shape (Kanban). Metrics derived
 *                              from the same list.
 *
 *  useWorkbenchTemplates()  — /api/templates
 *                              Adapter normalizes rows from indTemplates +
 *                              documentTemplates + ectdTemplates (the
 *                              endpoint already aggregates) into the kit
 *                              Template shape.
 *
 *  useWorkbenchValidation(programs) — composes:
 *                              /api/submission-ops/blockers (cross-program)
 *                              with the live program list to compute the
 *                              per-program rules matrix + summary KPIs.
 *
 * No new server routes — all three endpoints already exist.
 */

import { useMemo } from 'react';
import type {
  Task,
  TaskCol,
  TaskMetric,
  Template,
  Tone,
  ValidationProgram,
  ValidationRule,
  ValidationSummary,
} from '../data/workbench';
import type { Program } from '../data/programs';
import { useFetchJson } from './useFetchJson';
import { firstArray, isRecord, shapeMismatch } from '../lib/payloadShape';
import {
  STATUS_TO_TASK_COL,
  TYPE_TO_TASK_KIND,
  PATHWAY_LABEL,
} from '../../../../../shared/constants/mdx';

/* ─── Tasks ────────────────────────────────────────────────────────── */

interface ServerWorkItem {
  id?: string | number;
  workItemId?: string;
  title?: string;
  programCode?: string; programId?: string | number; projectCode?: string;
  sectionLabel?: string; sectionKey?: string;
  status?: string;
  assigneeName?: string; assignee?: string; ownerName?: string;
  dueDate?: string; due?: string;
  workItemType?: string; type?: string;
  commentCount?: number;
  esigRequired?: boolean;
}

interface WorkloadPayload {
  data?: ServerWorkItem[];
  workload?: ServerWorkItem[];
  rows?: ServerWorkItem[];
}


function formatDue(iso: string | undefined): string {
  if (!iso) return '—';
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return iso;
  const days = Math.round((target.getTime() - Date.now()) / 86_400_000);
  if (days < 0) return `${-days}d overdue`;
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days < 7) return `${days}d`;
  return target.toISOString().slice(0, 10);
}

function dueToTone(iso: string | undefined): Tone {
  if (!iso) return 'default';
  const days = Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return 'err';
  if (days <= 3) return 'warn';
  return 'default';
}

function adaptTask(w: ServerWorkItem): Task {
  const col = (STATUS_TO_TASK_COL[(w.status ?? '').toLowerCase()] ?? 'todo') as TaskCol;
  const kind = (TYPE_TO_TASK_KIND[(w.workItemType ?? w.type ?? '').toLowerCase()] ?? 'edit') as Task['kind'];
  const id = String(w.workItemId ?? w.id ?? Math.random().toString(36).slice(2, 10));
  return {
    id,
    col,
    prog:     w.programCode ?? w.projectCode ?? (w.programId ? String(w.programId) : '—'),
    sect:     w.sectionLabel ?? w.sectionKey ?? '',
    title:    w.title ?? '(Untitled)',
    assignee: w.assigneeName ?? w.assignee ?? w.ownerName ?? 'Unassigned',
    due:      formatDue(w.dueDate ?? w.due),
    tone:     dueToTone(w.dueDate ?? w.due),
    label:    kind === 'sign' ? 'Sign-off' : kind === 'review' ? 'Review' : 'Edit',
    kind,
    esig:     !!w.esigRequired,
    comments: w.commentCount ?? 0,
  };
}

function deriveTaskMetrics(tasks: Task[]): TaskMetric[] {
  const total = tasks.length;
  const overdue = tasks.filter(t => t.tone === 'err').length;
  const inReview = tasks.filter(t => t.col === 'review').length;
  const blocked = tasks.filter(t => t.col === 'blocked').length;
  return [
    { label: 'Open work',     metric: String(total),    meta: total === 0 ? 'No tasks' : 'Across portfolio', tone: 'default' },
    { label: 'Overdue',       metric: String(overdue),  meta: overdue ? 'Past due date' : 'On schedule', tone: overdue ? 'err' : 'ok' },
    { label: 'In review',     metric: String(inReview), meta: inReview ? 'Awaiting approval' : '—', tone: inReview ? 'warn' : 'default' },
    { label: 'Blocked',       metric: String(blocked),  meta: blocked ? 'Need resolution' : 'No blockers', tone: blocked ? 'err' : 'ok' },
  ];
}

export interface UseWorkbenchTasksResult {
  tasks: Task[] | null;
  metrics: TaskMetric[] | null;
  loading: boolean;
  error: string | null;
}

const WORKLOAD_PATH = '/api/submission-ops/workload';

/**
 * Fetch the cross-program task list from /api/submission-ops/workload
 * (returns c2c_project_work_items rows) and adapt each row into the
 * kit's Task shape (Kanban). Derives 4 KPI cards from the same list.
 */
export function useWorkbenchTasks(): UseWorkbenchTasksResult {
  const { data, loading, error } = useFetchJson<WorkloadPayload>(WORKLOAD_PATH);
  /*
   * `data.data ?? data.workload ?? data.rows ?? []` — `??` only steps past
   * null/undefined, so a `data` field holding `{}` (or a 200 that is a scalar,
   * or an error body) won the chain and took the board down at `list.map`. The
   * fallback to `[]` had the quieter half of the same bug: a body we couldn't
   * read rendered as an empty Kanban, which says "you have no work".
   */
  const rows = firstArray<ServerWorkItem>(data?.data, data?.workload, data?.rows);
  const failed = error ?? (data != null && rows === null ? shapeMismatch(WORKLOAD_PATH) : null);
  const tasks = useMemo(() => (rows ? rows.map(adaptTask) : null), [rows]);
  return {
    tasks,
    metrics: tasks ? deriveTaskMetrics(tasks) : null,
    loading,
    error: failed,
  };
}

/* ─── Templates ────────────────────────────────────────────────────── */

interface ServerTemplate {
  id: string | number;
  name: string;
  description?: string | null;
  category?: string | null;
  type?: string | null;
  region?: string | null;
  source?: string;
  usageCount?: number;
  updatedAt?: string;
}

interface TemplatesPayload {
  templates?: ServerTemplate[];
  data?: ServerTemplate[];
  ind?: ServerTemplate[];
  document?: ServerTemplate[];
  ectd?: ServerTemplate[];
}

function formatRelativeShort(iso: string | undefined): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return new Date(iso).toLocaleDateString();
  const d = Math.round(ms / 86_400_000);
  if (d < 1) return 'today';
  if (d < 7) return `${d}d ago`;
  if (d < 30) return `${Math.round(d / 7)}w ago`;
  if (d < 365) return `${Math.round(d / 30)}mo ago`;
  return `${Math.round(d / 365)}y ago`;
}

function adaptTemplate(t: ServerTemplate): Template {
  const tags: string[] = [];
  if (t.category) tags.push(t.category);
  if (t.type && t.type !== t.category) tags.push(t.type);
  if (t.region) tags.push(t.region);
  return {
    id:      String(t.id),
    name:    t.name,
    uses:    t.usageCount ?? 0,
    owner:   t.source === 'ectd' ? 'Reg Affairs' : t.source === 'ind' ? 'Reg Affairs' : 'Templates',
    updated: formatRelativeShort(t.updatedAt),
    tags,
  };
}

export interface UseWorkbenchTemplatesResult {
  templates: Template[] | null;
  loading: boolean;
  error: string | null;
}

/**
 * Fetch templates from /api/templates (server already aggregates
 * indTemplates + documentTemplates + ectdTemplates) and adapt each
 * row into the kit's Template shape.
 */
export function useWorkbenchTemplates(): UseWorkbenchTemplatesResult {
  const { data, loading, error } = useFetchJson<TemplatesPayload>('/api/templates');
  /*
   * Same chain as the task board, plus a spread: `[...(data.ind ?? [])]` throws
   * "is not iterable" the moment `ind` is an object rather than a list, which is
   * one envelope change away. Only the fields that are actually arrays are read,
   * and a body carrying none of them is reported instead of rendering as an
   * empty template library.
   */
  const rows = useMemo<ServerTemplate[] | null>(() => {
    if (data == null) return null;
    const direct = firstArray<ServerTemplate>(data.templates, data.data);
    if (direct) return direct;
    const grouped = [data.ind, data.document, data.ectd].filter(
      (part): part is ServerTemplate[] => Array.isArray(part),
    );
    return grouped.length ? grouped.flat() : null;
  }, [data]);
  const failed = error ?? (data != null && rows === null ? shapeMismatch('/api/templates') : null);
  const templates = useMemo(() => (rows ? rows.map(adaptTemplate) : null), [rows]);
  return { templates, loading, error: failed };
}

/* ─── Validation ───────────────────────────────────────────────────── */

interface ServerBlocker {
  id: number;
  blockerId?: string;
  projectId?: number;
  programCode?: string;
  packageDbId?: number;
  packageId?: string;
  sectionDbId?: number;
  sectionLabel?: string;
  blockerType?: string;
  severity?: string;
  status?: string;
  description?: string;
  createdAt?: string;
}

interface BlockersPayload {
  data?: ServerBlocker[];
  blockers?: ServerBlocker[];
  rows?: ServerBlocker[];
}

function adaptBlockerToRule(b: ServerBlocker): ValidationRule {
  const sev: ValidationRule['severity'] =
    b.severity === 'critical' || b.severity === 'high' ? 'err'
      : b.severity === 'medium' ? 'warn'
      : 'ok';
  return {
    id:       b.blockerId ?? `bl-${b.id}`,
    prog:     b.programCode ?? '—',
    sect:     b.sectionLabel ?? '—',
    severity: sev,
    category: b.blockerType ?? 'general',
    msg:      b.description ?? '(no description)',
    since:    b.createdAt ? formatRelativeShort(b.createdAt) : '—',
  };
}

export interface UseWorkbenchValidationResult {
  programs: ValidationProgram[] | null;
  rules:    ValidationRule[]    | null;
  summary:  ValidationSummary[] | null;
  loading:  boolean;
  error:    string | null;
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
  const { data, loading, error } = useFetchJson<BlockersPayload>(BLOCKERS_PATH);
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
    /* Each program gets a row, with err/warn/ok counts derived from the
       cross-program blockers list filtered to this program's code. */
    return programs.map((p) => {
      const forProg = rules.filter((r) => r.prog === p.code.split(' ')[0]);
      const errs  = forProg.filter((r) => r.severity === 'err').length;
      const warns = forProg.filter((r) => r.severity === 'warn').length;
      const ok    = forProg.filter((r) => r.severity === 'ok').length;
      const status: ValidationProgram['status'] =
        errs > 0 ? 'blocked' : p.status === 'complete' ? 'complete' : 'active';
      return {
        id:        p.id,
        code:      p.code.split(' ')[0],
        title:     p.title,
        pathway:   PATHWAY_LABEL[p.pathway] ?? p.pathway,
        errs,
        warns,
        ok,
        status,
        readiness: p.readiness,
      };
    });
  }, [rules, programs]);

  const summary = useMemo<ValidationSummary[] | null>(() => {
    if (!rules || !validationPrograms) return null;
    const totalErr  = rules.filter((r) => r.severity === 'err').length;
    const totalWarn = rules.filter((r) => r.severity === 'warn').length;
    const blockedProgs = validationPrograms.filter((vp) => vp.status === 'blocked').length;
    const avgReady = validationPrograms.length
      ? Math.round(validationPrograms.reduce((s, p) => s + p.readiness, 0) / validationPrograms.length)
      : 0;
    return [
      { label: 'Programs blocked', metric: String(blockedProgs), meta: blockedProgs ? 'Filing gated' : 'All programs filing-ready', tone: blockedProgs ? 'err' : 'ok' },
      { label: 'Open errors',      metric: String(totalErr),     meta: totalErr ? 'High/critical severity' : 'No critical issues', tone: totalErr ? 'err' : 'ok' },
      { label: 'Open warnings',    metric: String(totalWarn),    meta: totalWarn ? 'Review before transmit' : 'No warnings', tone: totalWarn ? 'warn' : 'ok' },
      { label: 'Avg readiness',    metric: String(avgReady), unit: '%', meta: 'Across portfolio', tone: avgReady >= 70 ? 'ok' : avgReady >= 40 ? 'warn' : 'err' },
    ];
  }, [rules, validationPrograms]);

  return { programs: validationPrograms, rules, summary, loading, error: failed };
}

/* ─── Unified work (all three tracking systems) ───────────────────────── */

/**
 * useUnifiedWork — GET /api/submission-ops/unified-work
 *
 * The Workbench's task board reads /workload, which is `c2c_project_work_items`
 * ALONE. That is why a schedule-of-events milestone slip or an agency hold on a
 * filing never appears beside a review blocker, despite the page promising
 * "everything assigned across the portfolio".
 *
 * This exposes the unified view across all three systems so a surface can show
 * what the board is missing. Read-only; the board's own data path is untouched.
 */
export interface UnifiedWorkItemView {
  id: string;
  source: 'schedule' | 'review' | 'correspondence' | 'filing';
  title: string;
  status: 'open' | 'in_progress' | 'blocked' | 'done';
  priority: string | null;
  dueAt: string | null;
  blocking: boolean;
  detail: string | null;
}

export interface UnifiedWorkSummaryView {
  total: number;
  blocking: number;
  open: number;
  inProgress: number;
  done: number;
  bySource: Record<'schedule' | 'review' | 'correspondence' | 'filing', number>;
}

export interface UseUnifiedWorkResult {
  items: UnifiedWorkItemView[] | null;
  summary: UnifiedWorkSummaryView | null;
  loading: boolean;
  error: string | null;
}

/**
 * Pure: how many outstanding items the task board cannot show, because they come
 * from a system it does not read. Exported for unit testing.
 */
export function workNotOnTheBoard(summary: UnifiedWorkSummaryView | null): number {
  /* `summary.bySource.schedule` — the null check covered `summary` and not
     `bySource`, so a summary that arrived without its per-source breakdown threw
     here rather than reporting nothing off-board. */
  const bySource = summary?.bySource;
  if (!bySource || typeof bySource !== 'object') return 0;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  return n(bySource.schedule) + n(bySource.filing);
}

export function useUnifiedWork(projectId?: number): UseUnifiedWorkResult {
  const url =
    typeof projectId === 'number' && Number.isInteger(projectId) && projectId > 0
      ? `/api/submission-ops/unified-work?projectId=${projectId}`
      : '/api/submission-ops/unified-work';
  const { data, loading, error } = useFetchJson<{
    items: UnifiedWorkItemView[];
    summary: UnifiedWorkSummaryView;
  }>(url);
  /* Only a list is handed on as items — a `{ items: {} }` body used to reach the
     caller as something truthy that is not iterable. */
  return {
    items: firstArray<UnifiedWorkItemView>(data?.items),
    summary: isRecord(data?.summary) ? (data.summary as UnifiedWorkSummaryView) : null,
    loading,
    error,
  };
}
