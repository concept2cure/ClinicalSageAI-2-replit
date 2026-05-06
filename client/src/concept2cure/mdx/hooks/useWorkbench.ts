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

import { useEffect, useMemo, useState } from 'react';
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
import {
  STATUS_TO_TASK_COL,
  TYPE_TO_TASK_KIND,
  PATHWAY_LABEL,
} from '../../../../../shared/constants/mdx';

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

function useFetch<T>(url: string): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    loading: false,
    error: null,
  });
  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    fetch(url, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as T;
      })
      .then((d) => {
        if (cancelled) return;
        setState({ data: d, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          data: null,
          loading: false,
          error: err instanceof Error ? err.message : 'Fetch failed',
        });
      });
    return () => {
      cancelled = true;
    };
  }, [url]);
  return state;
}

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

export function useWorkbenchTasks(): UseWorkbenchTasksResult {
  const { data, loading, error } = useFetch<WorkloadPayload>('/api/submission-ops/workload');
  const tasks = useMemo(() => {
    if (!data) return null;
    const list = data.data ?? data.workload ?? data.rows ?? [];
    return list.map(adaptTask);
  }, [data]);
  return {
    tasks,
    metrics: tasks ? deriveTaskMetrics(tasks) : null,
    loading,
    error,
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

export function useWorkbenchTemplates(): UseWorkbenchTemplatesResult {
  const { data, loading, error } = useFetch<TemplatesPayload>('/api/templates');
  const templates = useMemo(() => {
    if (!data) return null;
    const list = data.templates ?? data.data ?? [
      ...(data.ind ?? []),
      ...(data.document ?? []),
      ...(data.ectd ?? []),
    ];
    return list.map(adaptTemplate);
  }, [data]);
  return { templates, loading, error };
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

export function useWorkbenchValidation(programs: Program[]): UseWorkbenchValidationResult {
  const { data, loading, error } = useFetch<BlockersPayload>('/api/submission-ops/blockers');
  const rules = useMemo(() => {
    if (!data) return null;
    const list = data.data ?? data.blockers ?? data.rows ?? [];
    return list.map(adaptBlockerToRule);
  }, [data]);

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

  return { programs: validationPrograms, rules, summary, loading, error };
}
