/**
 * Unified work view — one normalized answer to "what is outstanding on this
 * project/filing?" across the systems that independently track work:
 *
 *   1. project_tasks            — schedule-of-events milestones + the proactive
 *                                 sweep's recovery/mitigation tasks (filing-type
 *                                 driven; knows dates and dependencies)
 *   2. c2c_project_work_items   — review threads/tasks, approval blockers, and
 *                                 regulatory correspondence (knows artifacts,
 *                                 CTD sections, approvals)
 *   3. estar_submissions        — tracked filings and their FDA review clock
 *   4. unified_tasks            — the canonical org task board (assignments,
 *                                 dependencies, approvals, critical path)
 *
 * These grew separately, so a milestone slip, a review blocker, and a filing's
 * review clock on the SAME submission lived in separate tables with separate
 * shapes and no common query — and, until source 4 was added, this "unified"
 * view itself excluded the canonical board, so the product showed two boards
 * of the same person's work with no rows in common (assessment P2). This
 * module unifies the READ model only: it does not change how any system
 * writes, so it is additive and reversible. Converging the write paths is a
 * separate, deliberate migration.
 *
 * The normalizers are PURE (no DB) so status/priority/blocking mapping is
 * unit-testable; `loadUnifiedWork` is the thin org-scoped loader over them.
 *
 * @module server/services/unified-work/unified-work-view
 */

import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '../../db';
import { projectTasks, c2cProjectWorkItems, unifiedTasks } from '../../../shared/schema';
import { estarSubmissions } from '../../../shared/schema/estar-submission';
import { describeFailure, type VerificationOutcome } from '../../lib/verification-outcome';
import { createScopedLogger } from '../../utils/logger';

const logger = createScopedLogger('unified-work-view');

/**
 * True for rows NOT mirrored from project_tasks (AnA's create_task mirrors
 * into unified_tasks with sourceEntityType 'project_task'; those rows are
 * already in the view via source 1). IS DISTINCT FROM keeps NULL rows.
 */
function sqlDistinctFromProjectTask() {
  return sql`${unifiedTasks.sourceEntityType} IS DISTINCT FROM 'project_task'`;
}

/** Which system a unified item came from. */
export type UnifiedWorkSource = 'schedule' | 'review' | 'correspondence' | 'filing' | 'board';

/** Normalized status across all three systems. */
export type UnifiedWorkStatus = 'open' | 'in_progress' | 'blocked' | 'done';

export type UnifiedWorkPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface UnifiedWorkItem {
  /** Stable composite id — `${source}:${nativeId}`; unique across systems. */
  id: string;
  source: UnifiedWorkSource;
  /** Primary key in the owning system, as a string. */
  nativeId: string;
  projectId: number | null;
  title: string;
  status: UnifiedWorkStatus;
  priority: UnifiedWorkPriority | null;
  /** ISO timestamp, or null when the system tracks no due date. */
  dueAt: string | null;
  ownerName: string | null;
  /** True when this item blocks progress (blocker, critical path, or agency hold). */
  blocking: boolean;
  /** Origin-specific detail: blockerType / moduleType / catalog key. */
  detail: string | null;
}

// ── Pure normalizers ─────────────────────────────────────────────────────────

const PRIORITIES = new Set<UnifiedWorkPriority>(['low', 'medium', 'high', 'urgent']);

/** Map any system's priority string onto the shared scale; unknown → null. */
export function normalizePriority(raw: unknown): UnifiedWorkPriority | null {
  const v = String(raw ?? '').trim().toLowerCase();
  if (PRIORITIES.has(v as UnifiedWorkPriority)) return v as UnifiedWorkPriority;
  // Correspondence severities map onto the shared scale.
  if (v === 'critical') return 'urgent';
  if (v === 'major') return 'high';
  if (v === 'minor') return 'low';
  return null;
}

function iso(value: unknown): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** project_tasks: todo|in-progress|review|done|blocked → unified. */
export function normalizeTaskStatus(raw: unknown): UnifiedWorkStatus {
  const v = String(raw ?? '').trim().toLowerCase();
  if (v === 'done' || v === 'completed') return 'done';
  if (v === 'blocked') return 'blocked';
  if (v === 'in-progress' || v === 'in_progress' || v === 'review') return 'in_progress';
  return 'open';
}

/** c2c_project_work_items: open|in_progress|resolved|closed → unified. */
export function normalizeWorkItemStatus(raw: unknown): UnifiedWorkStatus {
  const v = String(raw ?? '').trim().toLowerCase();
  if (v === 'resolved' || v === 'closed') return 'done';
  if (v === 'in_progress') return 'in_progress';
  return 'open';
}

/**
 * estar_submissions lifecycle → unified. `additional_info` is the agency asking
 * for more before it will proceed, so it reads as BLOCKED, not merely in flight.
 */
export function normalizeFilingStatus(raw: unknown): UnifiedWorkStatus {
  const v = String(raw ?? '').trim().toLowerCase();
  if (v === 'decision' || v === 'withdrawn') return 'done';
  if (v === 'additional_info') return 'blocked';
  if (v === 'filed' || v === 'under_review') return 'in_progress';
  return 'open';
}

/** Deterministic ordering: blockers first, then soonest due, then title. */
export function compareUnifiedWork(a: UnifiedWorkItem, b: UnifiedWorkItem): number {
  if (a.blocking !== b.blocking) return a.blocking ? -1 : 1;
  if (a.dueAt !== b.dueAt) {
    if (!a.dueAt) return 1; // undated sorts after dated
    if (!b.dueAt) return -1;
    return a.dueAt < b.dueAt ? -1 : 1;
  }
  return a.title.localeCompare(b.title);
}

/** The four tables this view reads, by their real names. */
export type UnifiedWorkSourceTable =
  | 'project_tasks'
  | 'c2c_project_work_items'
  | 'estar_submissions'
  | 'unified_tasks';

/**
 * Whether one source's SELECT actually ran — the third state this view used to
 * collapse. `ran: true` carries the number of rows it contributed; `ran: false`
 * means the query failed and the counts exclude it, so they are a floor and not
 * a total. Same `{ ran }` vocabulary as server/lib/verification-outcome.
 */
export type UnifiedWorkSourceRead = VerificationOutcome<{ rowCount: number }>;

export type UnifiedWorkSources = Record<UnifiedWorkSourceTable, UnifiedWorkSourceRead>;

/** Roll-up counts for a surface header. */
export interface UnifiedWorkSummary {
  total: number;
  blocking: number;
  open: number;
  inProgress: number;
  done: number;
  bySource: Record<UnifiedWorkSource, number>;
  /**
   * True when at least one source could not be read, so every count above is a
   * floor rather than a total. It travels ON the summary because the summary is
   * what reaches a header by itself — a count that has lost its caveat reads as
   * a complete answer.
   */
  partial: boolean;
}

/**
 * @param sources per-table read outcome from `loadUnifiedWork`. Omitted by the
 *   pure callers that merge rows they already hold: nothing failed there by
 *   construction, so the roll-up is complete.
 */
export function summarizeUnifiedWork(
  items: UnifiedWorkItem[],
  sources?: UnifiedWorkSources,
): UnifiedWorkSummary {
  const bySource: Record<UnifiedWorkSource, number> = {
    schedule: 0, review: 0, correspondence: 0, filing: 0, board: 0,
  };
  let blocking = 0, open = 0, inProgress = 0, done = 0;
  for (const i of items) {
    bySource[i.source] += 1;
    if (i.blocking) blocking += 1;
    if (i.status === 'open') open += 1;
    else if (i.status === 'in_progress') inProgress += 1;
    else if (i.status === 'done') done += 1;
  }
  const partial = sources ? Object.values(sources).some(s => !s.ran) : false;
  return { total: items.length, blocking, open, inProgress, done, bySource, partial };
}

// ── Row → unified adapters (pure; shapes mirror each table) ──────────────────

export interface TaskRowLike {
  id: number | string;
  projectId?: number | null;
  name?: string | null;
  status?: string | null;
  priority?: string | null;
  dueDate?: Date | string | null;
  moduleType?: string | null;
  blockedReason?: string | null;
  criticalToQuality?: boolean | null;
}

export function taskToUnified(r: TaskRowLike): UnifiedWorkItem {
  const status = normalizeTaskStatus(r.status);
  return {
    id: `schedule:${r.id}`,
    source: 'schedule',
    nativeId: String(r.id),
    projectId: r.projectId ?? null,
    title: r.name ?? 'Untitled task',
    status,
    priority: normalizePriority(r.priority),
    dueAt: iso(r.dueDate),
    ownerName: null,
    // A blocked task, or one flagged critical-to-quality that isn't finished.
    blocking: status === 'blocked' || (!!r.criticalToQuality && status !== 'done'),
    detail: r.blockedReason ?? r.moduleType ?? null,
  };
}

export interface WorkItemRowLike {
  id: number | string;
  workItemId?: string | null;
  projectId?: number | null;
  sourceType?: string | null;
  title?: string | null;
  status?: string | null;
  priority?: string | null;
  dueAt?: Date | string | null;
  ownerName?: string | null;
  blockerType?: string | null;
  ctdSection?: string | null;
}

export function workItemToUnified(r: WorkItemRowLike): UnifiedWorkItem {
  const status = normalizeWorkItemStatus(r.status);
  // Correspondence is its own lane so agency-driven work is visible as such.
  const source: UnifiedWorkSource = r.sourceType === 'correspondence' ? 'correspondence' : 'review';
  return {
    id: `${source}:${r.workItemId ?? r.id}`,
    source,
    nativeId: String(r.workItemId ?? r.id),
    projectId: r.projectId ?? null,
    title: r.title ?? 'Untitled work item',
    status,
    priority: normalizePriority(r.priority),
    dueAt: iso(r.dueAt),
    ownerName: r.ownerName ?? null,
    blocking: !!r.blockerType && status !== 'done',
    detail: r.blockerType ?? r.ctdSection ?? null,
  };
}

export interface UnifiedTaskRowLike {
  taskId: string;
  projectId?: number | null;
  title?: string | null;
  status?: string | null;
  priority?: string | null;
  dueDate?: Date | string | null;
  assigneeName?: string | null;
  moduleType?: string | null;
  criticalPath?: boolean | null;
  blockedBy?: string[] | null;
}

/** unified_tasks: pending|in-progress|review|completed|blocked|cancelled → unified. */
export function normalizeUnifiedTaskStatus(raw: unknown): UnifiedWorkStatus {
  const v = String(raw ?? '').trim().toLowerCase();
  if (v === 'completed' || v === 'cancelled') return 'done';
  if (v === 'blocked') return 'blocked';
  if (v === 'in-progress' || v === 'in_progress' || v === 'review') return 'in_progress';
  return 'open';
}

export function unifiedTaskToUnified(r: UnifiedTaskRowLike): UnifiedWorkItem {
  const status = normalizeUnifiedTaskStatus(r.status);
  const blockedByArray = Array.isArray(r.blockedBy) && r.blockedBy.length > 0;
  return {
    id: `board:${r.taskId}`,
    source: 'board',
    nativeId: String(r.taskId),
    projectId: r.projectId ?? null,
    title: r.title ?? 'Untitled task',
    status,
    priority: normalizePriority(r.priority),
    dueAt: iso(r.dueDate),
    ownerName: r.assigneeName ?? null,
    // Blocked, or on the critical path and not finished — either holds the
    // submission timeline.
    blocking:
      status === 'blocked' || blockedByArray || (!!r.criticalPath && status !== 'done'),
    detail: r.moduleType ?? null,
  };
}

export interface FilingRowLike {
  id: string;
  projectId?: number | null;
  catalogKey?: string | null;
  title?: string | null;
  status?: string | null;
  decisionDueAt?: Date | string | null;
}

export function filingToUnified(r: FilingRowLike): UnifiedWorkItem {
  const status = normalizeFilingStatus(r.status);
  return {
    id: `filing:${r.id}`,
    source: 'filing',
    nativeId: String(r.id),
    projectId: r.projectId ?? null,
    title: r.title ?? r.catalogKey ?? 'Tracked filing',
    status,
    // A filing is not "priority"-ranked by the agency; leave it unranked.
    priority: null,
    dueAt: iso(r.decisionDueAt),
    ownerName: null,
    // The agency is waiting on the sponsor — that blocks the filing.
    blocking: status === 'blocked',
    detail: r.catalogKey ?? null,
  };
}

/** Merge + order every source into one list. Pure. */
export function mergeUnifiedWork(input: {
  tasks?: TaskRowLike[];
  workItems?: WorkItemRowLike[];
  filings?: FilingRowLike[];
  boardTasks?: UnifiedTaskRowLike[];
}): UnifiedWorkItem[] {
  return [
    ...(input.tasks ?? []).map(taskToUnified),
    ...(input.workItems ?? []).map(workItemToUnified),
    ...(input.filings ?? []).map(filingToUnified),
    ...(input.boardTasks ?? []).map(unifiedTaskToUnified),
  ].sort(compareUnifiedWork);
}

// ── Loader (thin; org-scoped) ────────────────────────────────────────────────

export interface LoadUnifiedWorkInput {
  organizationId: number;
  /** Narrow to one project. Omit for the whole org. */
  projectId?: number;
}

export interface UnifiedWorkResult {
  items: UnifiedWorkItem[];
  summary: UnifiedWorkSummary;
  /** Per-source read outcome. A source that is absent from the items because
   *  its query FAILED is named here; nothing else distinguishes it from a
   *  source that genuinely has no outstanding work. */
  sources: UnifiedWorkSources;
}

/**
 * The client-facing reason on a failed read. The driver's own text — relation
 * name, GRANT, host from ECONNREFUSED — is the internal shape of a governed
 * store and goes to the LOG only, the same containment `serverError` and
 * `respondVerificationUnavailable` apply, because both routes hand this result
 * straight to a browser.
 */
const SOURCE_UNREAD_REASON =
  'This source could not be read; the reason has been logged. The counts exclude it.';

/**
 * The reason an operator can act on. Drizzle wraps a driver rejection in
 * `DrizzleQueryError`, whose message is the whole SQL text plus the bound
 * params; the Postgres code and message are on `.cause`. Unwrapped, the log
 * reads `42501: permission denied for table estar_submissions` instead of the
 * statement that failed — and the tenant id in `params` stays out of the log.
 */
function driverReason(err: unknown): string {
  const cause = (err as { cause?: unknown } | null | undefined)?.cause;
  return cause ? describeFailure(cause) : describeFailure(err);
}

/**
 * Run one source's query. The query is BUILT by the caller (outside this try),
 * so a missing pool still throws out of `loadUnifiedWork` and answers 500 —
 * "the database is down" is not a partial view. Only a query that reached the
 * database and came back rejected degrades to an unread source.
 */
async function readSource<T>(
  table: UnifiedWorkSourceTable,
  rows: PromiseLike<unknown[]>,
): Promise<{ rows: T[]; read: UnifiedWorkSourceRead }> {
  try {
    const r = await rows;
    return { rows: r as T[], read: { ran: true, rowCount: r.length } };
  } catch (err) {
    logger.error('unified work source could not be read', {
      table,
      reason: driverReason(err),
    });
    return { rows: [], read: { ran: false, reason: SOURCE_UNREAD_REASON } };
  }
}

/**
 * Load the unified work view for an org (optionally one project). Every query is
 * tenant-scoped from ctx, never request input. A failing source degrades to an
 * empty contribution rather than failing the whole view — an incomplete view is
 * more useful than none — but the shortfall is NAMED rather than left to be read
 * as zero: `sources` records per table whether its SELECT ran, `summary.partial`
 * is true when any did not, and the driver's reason is logged.
 */
export async function loadUnifiedWork(input: LoadUnifiedWorkInput): Promise<UnifiedWorkResult> {
  const { organizationId, projectId } = input;

  const tasks = await readSource<TaskRowLike>(
    'project_tasks',
    db
      .select()
      .from(projectTasks)
      .where(
        projectId !== undefined
          ? and(eq(projectTasks.organizationId, organizationId), eq(projectTasks.projectId, projectId))
          : eq(projectTasks.organizationId, organizationId),
      ),
  );

  const workItems = await readSource<WorkItemRowLike>(
    'c2c_project_work_items',
    db
      .select()
      .from(c2cProjectWorkItems)
      .where(
        projectId !== undefined
          ? and(eq(c2cProjectWorkItems.orgId, organizationId), eq(c2cProjectWorkItems.projectId, projectId))
          : eq(c2cProjectWorkItems.orgId, organizationId),
      ),
  );

  const filings = await readSource<FilingRowLike>(
    'estar_submissions',
    db
      .select()
      .from(estarSubmissions)
      .where(
        projectId !== undefined
          ? and(eq(estarSubmissions.organizationId, organizationId), eq(estarSubmissions.projectId, projectId))
          : eq(estarSubmissions.organizationId, organizationId),
      ),
  );

  // The canonical org board. Terminal rows are excluded here (not in the
  // adapter) so an org's full history doesn't drown the outstanding view, and
  // rows mirrored FROM project_tasks are excluded because source 1 already
  // carries them — the same task must not appear twice.
  const openStatuses = ['pending', 'in-progress', 'review', 'blocked'];
  const notAMirror = sqlDistinctFromProjectTask();
  const boardTasks = await readSource<UnifiedTaskRowLike>(
    'unified_tasks',
    db
      .select()
      .from(unifiedTasks)
      .where(
        projectId !== undefined
          ? and(
              eq(unifiedTasks.organizationId, organizationId),
              eq(unifiedTasks.projectId, projectId),
              inArray(unifiedTasks.status, openStatuses),
              isNull(unifiedTasks.deletedAt),
              notAMirror,
            )
          : and(
              eq(unifiedTasks.organizationId, organizationId),
              inArray(unifiedTasks.status, openStatuses),
              isNull(unifiedTasks.deletedAt),
              notAMirror,
            ),
      ),
  );

  const sources: UnifiedWorkSources = {
    project_tasks: tasks.read,
    c2c_project_work_items: workItems.read,
    estar_submissions: filings.read,
    unified_tasks: boardTasks.read,
  };
  const items = mergeUnifiedWork({
    tasks: tasks.rows,
    workItems: workItems.rows,
    filings: filings.rows,
    boardTasks: boardTasks.rows,
  });
  return { items, summary: summarizeUnifiedWork(items, sources), sources };
}

export default {
  loadUnifiedWork,
  mergeUnifiedWork,
  summarizeUnifiedWork,
  compareUnifiedWork,
  taskToUnified,
  workItemToUnified,
  filingToUnified,
  unifiedTaskToUnified,
};
