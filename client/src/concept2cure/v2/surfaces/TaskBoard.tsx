import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useLocation, useSearch } from 'wouter';
import { capturedActorHeaders } from '@/utils/authToken';
import type { TaskAssignmentMeta } from '@shared/task-assignment';
import { TaskAssignmentControls } from './TaskAssignmentControls';
import { autoAssignSavedTask, type AutomaticAssignmentAnswer } from './taskAssignmentRequest';
import { readTaskNavigationTarget, taskActorScope, type TaskActorScope } from '../taskTarget';
import { registerSurfaceLeaveGuard, surfaceLeaveRefusal } from '../navParams';
import type { ListState } from '../dataConnect';
import { I } from '../icons';
import { setEditorTarget } from '../editorTarget';
import { openNotificationRecord } from '../notificationNavigation';
import { useDialog } from '../useDialog';
import { useLiveRows, useLiveData, hasKeys, isRowsWith, EmptyState, ErrorState } from '../dataConnect';
import { taskAnalyticsScope } from './taskBoardAnalyticsScope';
import { apiRequest, ApiRequestError, serverMessage } from '@/lib/queryClient';
import { useAuth } from '@/services/portal/authService';
import { canGovernedWrite } from '@shared/constants/permissions';
import { esignSignerOf } from '../../_shared/components/EsignModal';
import { TaskSignOffDialog } from '../editor/TaskSignOffDialog';
import { describeSignatureMethod } from '@shared/part11/signature-method';
import { AnswerLead } from '../AnswerLead';
import type { SurfaceViewProps } from '../surfaceViews';
import { usePublishSurfaceContext } from '../surfaceContext';
import { publishShellProject, useShellProject } from '../shellProject';
import { taskProjectFor, TASK_SAVED_EVENT, dateInputValue, dueDateIso } from './CollabLauncher';
import { getSurfaceMeta } from '../registryModel';
import { consumeNavParams, NAV_PARAMS_EVENT, stashNavParamsForTarget } from '../navParams';
import { notifySurfaceActionReady, useSurfaceActionHandlers } from '../surfaceActions';
import { isTaskFilingHome, isTrackedFilingId, type TaskFilingHome } from '@shared/types/task-filing-home';
import {
  // TB_PROJECTS (three invented programmes) is gone — the board, the project
  // filter, the detail label and the workflow picker all read the org's real
  // programmes from GET /api/projects now. What remains here is configuration:
  // module colours, status column definitions, type labels and source labels.
  // TB_TEAM / TB_OPTIMAL / TB_WORKFLOWS are gone: names come from the org
  // roster, and workflow templates from GET /api/task-management/templates.
  TB_MOD, MODULE_COLOR_UNKNOWN, TB_COLS, TB_TYPE, TB_SRC,
  type TaskSource,
} from '../fixtures/task-board-data';
import '../styles/project-home-v2.css';

/* ═══════════════════════════════════════════════════════════════════
   Task Board -- the org-wide unified task board served by
   /api/task-management. Org-scoped by design; filter to a project
   below. Tasks from sections, the pyramid engine, the legacy WBS and
   modules are surfaced here with their origin store labelled.

   Registers as both "task-board" and "tasks" in SURFACE_VIEWS.
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Display row for the org-wide unified task board. Mirrors the server
 * TaskBoardItem shape returned by GET /api/task-management/board
 * (server/routes/taskBoard.routes.ts). impactScore / phase / estimatedHours are
 * REAL nullable columns and render null-safe (never fabricated); the backend
 * returns numeric FK ids (stringified) for project / assignee / assignedBy and
 * does NOT return blockedReason / assignmentType (client-only, optional).
 */
/** Mirrors the wire shape from server/routes/taskBoard.routes.ts. */
interface SignatureManifestation {
  signedById: number | null;
  signedByName: string;
  meaning: string;
  reason: string;
  signedAt: string;
  method: string;
}

/** Signed-at, rendered in the reader's own locale and timezone with the offset
 *  shown. A §11.50 timestamp that silently renders in server time is a real
 *  hazard when the reader is reconstructing a sequence of events. */
function fmtSigned(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
  });
}

interface TaskItem {
  taskId: string;
  title: string;
  /** Real project FK as a string (the numeric projects.id); '' when unattached.
   *  Resolved to a programme name against GET /api/projects — see projLabel. */
  project: string;
  moduleType: string;
  taskType: string;
  status: string;
  priority: string;
  /** Real assignee user-id FK as a string; '' when unassigned. */
  assignee: string;
  /** Real assigned-by user-id FK as a string; '' when unknown. */
  /** Null on another store's card: that store records no assigner. */
  assignedBy: string | null;
  progress: number;
  /** 0-10 submission impact; null when never scored (real nullable column). */
  impactScore: number | null;
  criticalPath: boolean;
  regulatoryImpact: boolean;
  approvalRequired: boolean;
  approvalStatus: string;
  /** §11.50 manifestations from GET /api/task-management/board, oldest first.
   *  Always an array — the route normalises a null/legacy column to []. */
  approvalHistory: SignatureManifestation[];
  dependsOn: string[];
  blocks: string[];
  comments: number;
  attachments: number;
  source: string;
  /** Exact UUID of an authoring document linked by the task's persisted source. */
  sourceDocumentId?: string;
  /** A review-route member's task: where the route is acted on (taskBoard.routes.ts
   *  reviewRoute). The board does not move such a task; the route completes it. */
  reviewRoute?: { kind: 'vault'; documentId: string; programId: string | null } | { kind: 'quality'; qmsDocumentId: string } | { kind: 'unresolved' };
  /** Humanised label for display only — never parsed for overdue state. */
  due: string;
  /**
   * Machine-readable due date (ISO). This is the ONLY overdue signal: the
   * server emits it from `unified_tasks.due_date` and the taskDueSweep job
   * (server/jobs/taskDueSweep.ts) keeps the derived overdue state fresh. null
   * when the task has no due date.
   */
  dueDateIso: string | null;
  /**
   * Real `unified_tasks.lifecycle_phase` column (LIFECYCLE_PHASES domain,
   * shared/schema.ts: strategy … postmarket); null when never set.
   */
  phase: string | null;
  blocked?: boolean;
  /** Another store records this work as holding the submission (a blocker type,
   *  critical to quality, an agency hold): the cross-store view's own flag, sent
   *  by the board read. Not the same as `blocked`, the status. Absent on the
   *  board's own tasks. (D2, 2026-10-29, the device-tasks fold.) */
  blocking?: boolean;
  blockedReason?: string;
  estimatedHours?: number | null;
  assignmentType?: string;
  /** Work that lives in another store (schedule, correspondence, filing). The
   *  board shows it and does not write it; `home` is where it is changed. */
  readOnly?: boolean;
  home?: {
    surface: 'project-home' | 'submission-center'; projectId: number | null;
    programId?: string | null; programTitle?: string | null;
    source?: string; nativeId?: string;
  } | null;
  /** The owning store's own note (a blocker, a module, a catalogue key). */
  detail?: string | null;
  /** unified_tasks.description: what the task asks (Assign review stores the
   *  author's instructions to the reviewer here). Null when none was given. */
  description?: string | null;
}

/** The screen that owns another store's work, as a person reads it. A project's
 *  page is named by its project (section 9 of
 *  .design/client-journey/INFORMATION_ARCHITECTURE.md), so `project-home` has no
 *  fixed label here: OtherStoreTaskDetail names the task's project (the title it
 *  opens the project with), or says "its project" when the board cannot name it. */
const HOME_LABEL: Record<string, string> = {
  'submission-center': getSurfaceMeta('submission-center').label,
};

/** A store the board could not read (meta.unreadSources), as a person reads it. */
const STORE_LABEL: Record<string, string> = {
  unified_tasks: "the board's own tasks",
  project_tasks: `the schedule and ${getSurfaceMeta('communication-center').label}`,
  c2c_project_work_items: 'agency correspondence',
  estar_submissions: 'tracked filings',
};

/** The blocking flag's words, shared by the card, the table row and the
 *  Analytics count so the three cannot name it differently. */
const BLOCKING_FLAG = 'Blocking the submission';

/** Initials for an already-resolved display name. '?' when there is no name. */
function tbAvatar(name: string): string {
  if (!name || name === UNNAMED) return '?';
  return name.split(' ').filter(Boolean).map(s => s[0]).join('').slice(0, 2) || '?';
}

/**
 * Overdue is computed from the machine-readable `dueDateIso` (server column,
 * kept fresh by the taskDueSweep job) — never by parsing the humanised `due`
 * label. Completed/cancelled work is never overdue.
 */
function isOverdue(t: TaskItem): boolean {
  if (!t.dueDateIso || t.status === 'completed' || t.status === 'cancelled') return false;
  const due = new Date(t.dueDateIso).getTime();
  return Number.isFinite(due) && due < Date.now();
}

/**
 * Refusal copy shared by every write on this board. `apiRequest` THROWS for a
 * non-OK status except 401, which it RETURNS — so each write needs both
 * halves, and a missing `!res.ok` branch turns an expired session into a
 * silent no-op. `notDone` names what did not happen.
 */
function sessionExpired(notDone: string): string {
  return `Your session has expired — sign in again. ${notDone}`;
}
/** A caught write failure as user copy: the server's sentence (a viewer's 403,
 *  an AUDIT_WRITE_FAILED) when it sent one, else this surface's own fallback.
 *  A browser-native throw ("Failed to fetch") is never shown. */
function refusalText(e: unknown, fallback: string): string {
  return e instanceof ApiRequestError && e.message ? e.message : fallback;
}
/** A refused create. A 400 carrying the server's sentence shows it; one carrying
 *  only field codes says what did not happen, not "Couldn't complete that
 *  request. Try again." (the generic line for a status with no sentence). */
function createRefusalText(e: unknown): string {
  if (e instanceof ApiRequestError && e.status === 400 && !serverMessage(e.payload)) {
    return 'The task was not created: its details were not accepted. Check them and try again.';
  }
  return refusalText(e, 'Network error while creating the task.');
}
/** The empty choice of a project picker: what to do, or why there is nothing to choose. */
function projectChoice(read: { rows: readonly unknown[]; loading: boolean; error?: string | null }): string {
  if (read.rows.length) return 'Choose a project';
  if (read.loading) return 'Loading projects…';
  return read.error ? 'Couldn’t load your projects' : 'No projects available';
}

/**
 * Resolve a task's assignee id to a display name, from the org's real roster.
 *
 * Completes the "projects/roster follow-up flag" this file already carried. The
 * project half landed on concept2cure-v2 (TB_PROJECTS retired, filters wired to
 * GET /api/projects); the roster half did not, so names were still looked up in
 * TB_TEAM — keyed on FIXTURE short-ids ('jc', 'mw', 'sm') — while the live board
 * emits `assignee` as String(row.assigneeId), a numeric user-id FK
 * (taskBoard.routes.ts). TB_TEAM['42'] is undefined, so the cards, list rows,
 * detail panel and per-assignee workload table all rendered an empty string:
 * real tasks with nobody's name against them.
 *
 * The endpoint was already being read one component below, by TaskCreate's
 * picker, and is org-scoped exactly like getOptimalAssignee.
 *
 * An unresolvable id is said to be someone the board cannot name rather than
 * blank, because "assigned to someone this client cannot name" and "not
 * assigned to anyone" are different facts. Neither ever falls back to a fixture
 * name, and neither shows the account number (it read "Account #42" on a card,
 * 2026-10-31 client demo).
 */
const UNNAMED = 'Name not available';
function makeNameOf(rows: AssigneeOpt[]): (id: string | null | undefined) => string {
  const byId = new Map(rows.map(r => [String(r.id), r.name]));
  return (id) => {
    if (id === null || id === undefined || id === '') return '';
    return byId.get(String(id)) ?? UNNAMED;
  };
}

/* ── Automation — the organization's REAL configured rules ────────────────────
   GET /api/project-rules (server/routes/project-rules.ts) lists the
   `project_rules` rows for the signed-in organization, active ones by default.

   The panel this replaces was hard-coded prose in the JSX: "24 trigger event
   types -- 9 action types defined in project-rules", followed by four strings —
   task_overdue -> escalate, review_completed -> advance_stage,
   approval_rejected -> create_task, deadline_approaching -> send_notification —
   typeset exactly like a list of the automation this organization has running.

   Nothing read them from anywhere, and both counts were also simply wrong: the
   route's own vocabulary is 20 trigger events and 8 action types. So an
   authenticated user was shown invented figures about their own tenant, and an
   organization with no rules at all was shown four it does not have. Same four
   honest states as every other slice on this board: loading, the real rules,
   "none configured", or a failed read said plainly. */
interface RuleRow {
  rule_id: string;
  name: string;
  description: string | null;
  trigger_event: string;
  /** jsonb `actions` — each entry carries a `type` from the route's actionTypes. */
  actions: Array<{ type?: string }> | null;
  is_active: boolean;
}

/** A stored rule vocabulary token ("task_overdue") as words ("Task overdue"). */
function ruleWords(token: string): string {
  const words = token.replace(/[_-]+/g, ' ').trim().toLowerCase();
  return words ? words[0].toUpperCase() + words.slice(1) : '';
}

/** The action types a rule fires, from its stored jsonb, in words. Never inferred. */
function ruleActions(r: RuleRow): string {
  const types = (Array.isArray(r.actions) ? r.actions : [])
    .map(a => (a && typeof a.type === 'string' ? ruleWords(a.type).toLowerCase() : ''))
    .filter(Boolean);
  return types.length ? types.join(' and ') : 'no action';
}

function AutomationCard() {
  // The payload is `{ rules, total }` — no `data` key, so the envelope unwrapper
  // leaves it alone. The guard turns a 200 of some other shape into the error
  // branch rather than a silent "no rules configured", which would be a lie.
  const rules = useLiveData<{ rules: RuleRow[]; total: number }>(
    '/api/project-rules',
    ['/api/project-rules'],
    hasKeys<{ rules: RuleRow[]; total: number }>('rules'),
  );
  const rows = Array.isArray(rules.data?.rules) ? rules.data!.rules : [];

  return (
    <div className="tb-an-card">
      <div className="tb-an-h">Automation</div>
      {rules.loading ? (
        <div role="status" className="tb-an-auto">Loading this organization&rsquo;s rules…</div>
      ) : rules.error ? (
        <>
          <div className="tb-an-auto">Couldn&rsquo;t load the automation rules.</div>
          <div className="tb-an-foot" data-warn="true">{I.alertTriangle} {rules.error}</div>
        </>
      ) : rows.length === 0 ? (
        <div className="tb-an-auto">
          No active automation rules are configured for this organization.
        </div>
      ) : (
        <>
          <div className="tb-an-auto">
            <b>{rows.length}</b> active rule{rows.length === 1 ? '' : 's'}.
          </div>
          <div className="tb-an-auto-rules">
            {rows.slice(0, 8).map(r => (
              <span key={r.rule_id} title={r.description || r.name}>
                {ruleWords(r.trigger_event)} → {ruleActions(r)}
              </span>
            ))}
          </div>
          {rows.length > 8 && (
            <div className="tb-an-foot">…and {rows.length - 8} more.</div>
          )}
        </>
      )}
      {/* Verified, not assumed: `getRulesEngine()` is called only from the
          project-rules routes (create / dry-run). No event source in the server
          dispatches to it, so a stored rule does not fire on its own. */}
      <div className="tb-an-foot" data-warn="true">
        {I.alertTriangle} Rules are saved, but they do not run automatically yet.
      </div>
    </div>
  );
}

/* ── Main surface ── */

export function TaskBoard(props: SurfaceViewProps) {
  const { user } = useAuth();
  const owner = `${user?.organizationId ?? ''}:${user?.id ?? ''}`;
  const liveOwner = useRef({ owner, generation: 0 });
  if (liveOwner.current.owner !== owner) liveOwner.current = { owner, generation: liveOwner.current.generation + 1 };
  const generation = liveOwner.current.generation;
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const isCurrent = () => mounted.current && liveOwner.current.generation === generation;
  const scope = taskActorScope(user);
  const canCallShell = () => scope ? currentTaskActor(scope, isCurrent) : isCurrent();
  return <TaskBoardSession key={owner} {...props} user={user} isCurrent={isCurrent}
    onAsk={text => { if (canCallShell()) props.onAsk?.(text); }}
    onNav={id => { if (canCallShell()) props.onNav?.(id); }} />;
}

type BoardSessionProps = SurfaceViewProps & {
  user: ReturnType<typeof useAuth>['user'];
  isCurrent: () => boolean;
};

/** Accept links only after a fresh, readable unified-store result. */
function targetTask(read: ListState<TaskItem>, taskId: string): TaskItem | string {
  if (read.error) return 'The task board could not be read. Retry from Your work.';
  if (read.meta?.pendingStore === true ||
      (Array.isArray(read.meta?.unreadSources) && read.meta.unreadSources.includes('unified_tasks'))) {
    return "The board's own tasks could not be read. Retry from Your work.";
  }
  const matches = read.rows.filter(row => row.taskId === taskId);
  if (matches.length !== 1) return 'This task is no longer available on the current board. Reopen Your work to refresh it.';
  const task = matches[0];
  if (task.readOnly || !['unified', 'section', 'module', 'template', 'wbs', 'pyramid'].includes(task.source)) {
    return 'This task is managed outside the board, so it is not available here. Open it from its project.';
  }
  if (task.status === 'cancelled') return 'This task was archived and is no longer open. Reopen Your work to refresh it.';
  return task;
}

function taskActorHeaders(scope: TaskActorScope | null, isCurrent: () => boolean): Record<string, string> | null {
  if (!scope || !isCurrent()) return null;
  try {
    return capturedActorHeaders({ userId: Number(scope.userId), organizationId: Number(scope.organizationId) });
  } catch { return null; }
}

function currentTaskActor(scope: TaskActorScope | null, isCurrent: () => boolean): boolean {
  return taskActorHeaders(scope, isCurrent) !== null;
}

interface TaskTargetOptions {
  scope: TaskActorScope | null;
  isCurrent: () => boolean;
  read: ListState<TaskItem>;
  reloadKey: number;
  reload: () => void;
  guard: () => string | null;
  select: (task: TaskItem) => void;
}

function useTaskTarget(options: TaskTargetOptions) {
  const search = useSearch();
  const [location, setLocation] = useLocation();
  const latest = useRef(options);
  latest.current = options;
  const seen = useRef<string | null>(null);
  const pending = useRef<{ taskId: string; readKey: number; sawLoading: boolean } | null>(null);
  const currentSearch = useRef(search);
  currentSearch.current = search;
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const consume = useCallback(() => {
    const params = new URLSearchParams(search);
    ['taskId', 'taskActor', 'taskOrg'].forEach(key => params.delete(key));
    const remaining = params.toString();
    setLocation(`${location.split('?')[0]}${remaining ? `?${remaining}` : ''}`, { replace: true });
  }, [search, location, setLocation]);
  const finish = useCallback((text?: string) => {
    pending.current = null;
    setMessage(text ? { text, error: true } : null);
    consume();
  }, [consume]);
  const begin = useCallback((targetSearch: string) => {
    const context = latest.current;
    const target = readTaskNavigationTarget(targetSearch, context.scope);
    if (!target) { pending.current = null; return; }
    if ('error' in target) { finish(target.error); return; }
    if (!currentTaskActor(context.scope, context.isCurrent)) {
      finish('Your signed-in account or organization changed. Reopen the task from Your work.'); return;
    }
    const refusal = context.guard() || surfaceLeaveRefusal();
    if (refusal) { finish(refusal); return; }
    if (pending.current?.taskId === target.taskId) return;
    pending.current = { taskId: target.taskId, readKey: context.reloadKey + 1, sawLoading: false };
    setMessage({ text: 'Refreshing the current task before opening it…', error: false });
    context.reload();
  }, [finish]);
  const beginRef = useRef(begin);
  beginRef.current = begin;
  useEffect(() => {
    const receive = () => {
      const params = consumeNavParams('tasks', Date.now(), true);
      if (!params || !['taskId', 'taskActor', 'taskOrg'].some(key => Object.hasOwn(params, key))) return;
      // A new handoff wins over a copied URL and is consumed only once, even
      // under StrictMode or an unrelated navigation-params event.
      seen.current = currentSearch.current;
      beginRef.current(new URLSearchParams(params).toString());
    };
    receive();
    window.addEventListener(NAV_PARAMS_EVENT, receive);
    return () => window.removeEventListener(NAV_PARAMS_EVENT, receive);
  }, []);
  useEffect(() => {
    if (seen.current === search) return;
    seen.current = search;
    begin(search);
  }, [search, begin]);
  useEffect(() => {
    const request = pending.current;
    if (!request || options.reloadKey < request.readKey) return;
    if (options.read.loading) { request.sawLoading = true; return; }
    if (!request.sawLoading) return;
    const context = latest.current;
    if (!currentTaskActor(context.scope, context.isCurrent)) {
      finish('Your signed-in account or organization changed. Reopen the task from Your work.'); return;
    }
    const refusal = context.guard() || surfaceLeaveRefusal();
    if (refusal) { finish(refusal); return; }
    const task = targetTask(context.read, request.taskId);
    if (typeof task === 'string') { finish(task); return; }
    finish();
    context.select(task);
  }, [search, options.reloadKey, options.read, finish]);
  return message;
}

function TaskBoardSession({ onAsk, onNav, user, isCurrent }: BoardSessionProps) {
  /* Org-wide unifiedTasks board — REAL, org-scoped read model
     (GET /api/task-management/board -> server/routes/taskBoard.routes.ts: a real
     drizzle query over unified_tasks + task_dependencies). Real rows, an honest
     empty state, or an honest error state — never the fixture. The old window.C2C
     in-browser store was seeded from the TB_TASKS fixture (CollabLauncher.tsx),
     so reading it presented fixture data as the board; that read is retired here.
     New task POSTs the real persisted create (POST /api/tasks/tasks) with a real
     project + assignee; Move PATCHes through the server task state machine
     (including the 428 §11.50 signature ceremony); Start workflow POSTs
     /tasks/from-template/:templateId. All three refetch the board, so what you
     see after an action is what the server actually stored — no client-built
     rows, no window.C2C write-back. */
  const [reloadKey, setReloadKey] = useState(0);
  const boardRetrying = useRef(false);
  const liveTasks = useLiveRows<TaskItem>(
    '/api/task-management/board',
    ['/api/task-management/board', reloadKey],
    isRowsWith<TaskItem>('taskId', 'title', 'project', 'moduleType', 'status', 'priority'),
  );
  useEffect(() => { if (!liveTasks.loading) boardRetrying.current = false; }, [liveTasks.loading]);
  const retryBoard = () => {
    if (liveTasks.loading || boardRetrying.current) return;
    boardRetrying.current = true;
    setReloadKey(key => key + 1);
  };
  /* A task saved from the header's Task form (CollabLauncher) is re-read here,
     so it appears on the board without a reload. */
  useEffect(() => {
    const reread = () => setReloadKey(key => key + 1);
    window.addEventListener(TASK_SAVED_EVENT, reread);
    return () => window.removeEventListener(TASK_SAVED_EVENT, reread);
  }, []);
  const tasks: TaskItem[] = liveTasks.rows;
  /* Which stores the board could not read. The board reads every task store
     (its own, the schedule's, correspondence's, filings'); one it could not
     read is named, so a short board is never taken for a complete one. */
  const unreadStores: string[] = useMemo(
    () =>
      Array.isArray(liveTasks.meta?.unreadSources)
        ? (liveTasks.meta.unreadSources as unknown[]).map(String)
        : [],
    [liveTasks.meta],
  );
  const boardIncomplete = liveTasks.meta?.partial === true || unreadStores.length > 0;
  const unreadReason = unreadStores.length
    ? `${unreadStores.map((u) => STORE_LABEL[u] ?? u).join(', ')} could not be read`
    : 'some task stores could not be read';

  /* The org's REAL programmes, for the project filter below. This filter used to
     be driven by TB_PROJECTS — three invented programmes ("BX-204 -- NDA 212345",
     "OR-902 Spinal Implant", "IV-415 Companion Dx") shown to every tenant as
     their own. Worse, it could never work: the board emits `project` as the
     stringified numeric projects.id (taskBoard.routes.ts), so selecting a fixture
     slug matched zero rows and silently emptied the board. The same endpoint was
     already being read by the create modal fifty lines below. */
  const [projectReloadKey, setProjectReloadKey] = useState(0);
  const projectRetrying = useRef(false);
  const projectOpts = useLiveRows<ProjectOpt>(
    '/api/projects',
    ['/api/projects', projectReloadKey],
    (value): value is ProjectOpt[] => isRowsWith<ProjectOpt>('id', 'name')(value) &&
      value.every((project) => project != null && typeof project === 'object' &&
        typeof project.name === 'string' && typeof project.id === 'number' &&
        Number.isSafeInteger(project.id) && project.id > 0),
  );
  /* The failure stays on screen, busy, while its retry is in flight: the read
     clears its error as soon as it reloads (dataConnect), which swapped the
     panel for a bare "Loading project choices…" and dropped the Retrying state
     the person had just asked for. */
  const [projectRetryShown, setProjectRetryShown] = useState(false);
  useEffect(() => {
    if (projectOpts.loading) return;
    projectRetrying.current = false;
    setProjectRetryShown(false);
  }, [projectOpts.loading]);
  const retryProjects = () => {
    if (projectOpts.loading || projectRetrying.current) return;
    projectRetrying.current = true;
    setProjectRetryShown(true);
    setProjectReloadKey(key => key + 1);
  };

  /* The org's real assignable members, so a live row's numeric assigneeId can be
     shown as a person's name. See makeNameOf above. */
  const roster = useLiveRows<AssigneeOpt>('/api/task-management/assignees');
  const nameOf = useMemo(() => makeNameOf(roster.rows), [roster.rows]);

  /* "My tasks" needs the signed-in user's real id. It used to compare against
     the fixture short-id 'jc', which no real row can carry — so the filter
     returned an empty board for every user of the product. */
  const myId = user?.id != null ? String(user.id) : '';
  /* Every task write is refused to a viewer by requireEditorAccess. The board
     offered a viewer New task, Start workflow, move, archive and sign anyway,
     and refused only after the click (T2's UI half). The session now carries
     the permission the server derives from the same role set. */
  const canWrite = canGovernedWrite(user);

  const [view, setView] = useState('board');
  /* The project filter starts on the open project. It read
     `window.C2C_TASK_FILTER`, which nothing in the product sets, so Tasks opened
     from a project showed every project's work (2026-10-31 client demo). The
     shell names the open project by its regulatory_programs UUID; the board's
     rows carry the numeric projects.id, so it is mapped through the project list
     (taskProjectFor) once that list has been read. No project open, no match, or
     an unread list: "All projects", never a guess. A choice made before the list
     settles — the person's, AnA's, or a task link's — is never overwritten. */
  const [proj, setProjState] = useState<string>('all');
  const projChosen = useRef(false);
  const setProj = useCallback((value: string) => { projChosen.current = true; setProjState(value); }, []);
  const shellProject = useShellProject();
  const openProject = useMemo(
    () => taskProjectFor(projectOpts.rows.map(p => ({ id: p.id, programId: p.regulatoryProgramId })), shellProject?.id),
    [projectOpts.rows, shellProject],
  );
  useEffect(() => {
    if (projChosen.current || projectOpts.loading || !openProject) return;
    projChosen.current = true;
    setProjState(openProject);
  }, [openProject, projectOpts.loading]);
  /* New task and Start workflow open on the filtered project, else the open
     one, else on "Choose a project". */
  const defaultProject = proj !== 'all' ? proj : openProject;
  const [mine, setMine] = useState(false);
  const [mod, setMod] = useState('all');
  const [sel, setSel] = useState<TaskItem | null>(null);
  // A task detail must close before the registered surface-leave guard will
  // allow navigation. Keep the verified project+document target for that next
  // render, not a free-floating docId that opens against the previous project.
  const pendingEditorNav = useRef<{ docId: string; programId: string; programTitle: string } | null>(null);
  /** A review-route task's record, opened once its drawer has closed (the leave guard refuses while it is open). */
  const pendingRouteNav = useRef<Parameters<typeof openNotificationRecord>[0] | null>(null);
  const selectedTask = useRef(sel);
  selectedTask.current = sel;
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [openingFiling, setOpeningFiling] = useState<string | null>(null);
  const [filingHomeError, setFilingHomeError] = useState('');
  const filingOpenSerial = useRef(0);
  const [creating, setCreating] = useState(false);
  const [wf, setWf] = useState(false);
  /** State-machine / archive failures the server reported, surfaced in a banner. */
  const [actionErr, setActionErr] = useState('');
  /** A completed action, said in place (a workflow's created tasks). */
  const [notice, setNotice] = useState('');
  /** A completion the server answered 428 ESIGN_REQUIRED for — the pending
   *  21 CFR 11 §11.50 signature ceremony for an approval-gated task. */
  const [signReq, setSignReq] = useState<{ t: TaskItem; status: string; progress: number } | null>(null);
  const modules = useMemo(() => ['all', ...Array.from(new Set(tasks.map(t => t.moduleType)))], [tasks]);
  /* Memoized because its IDENTITY is load-bearing, not for speed.
     `list` seeds `stats`, `stats` and `list` seed `anaContext`, and
     `anaContext` is the dependency of `usePublishSurfaceContext`. As a bare
     `tasks.filter(...)` it was a new array every render, so every one of those
     memos recomputed, the publish effect re-ran, `setSurfaceContext` emitted,
     the shell's `useSyncExternalStore` re-rendered the shell, and the board
     re-rendered — which built the next new array. That is the "Maximum update
     depth exceeded" the error boundary caught: the loop had no fixed point
     because each turn manufactured the input for the next.
     Same class as the `NO_ROWS` defect in dataConnect.tsx — an unstable
     reference feeding an effect — and it is why `useLiveRows` returns one
     frozen empty array instead of a fresh literal. */
  const list = useMemo(
    () => tasks.filter(t =>
      (proj === 'all' || t.project === proj) &&
      (!mine || (myId !== '' && t.assignee === myId)) &&
      (mod === 'all' || t.moduleType === mod) &&
      t.status !== 'cancelled'
    ),
    [tasks, proj, mine, myId, mod],
  );
  const byCol = (id: string) => list.filter(t => t.status === id);
  const byId = (id: string) => tasks.find(t => t.taskId === id);

  /* ── AnA's hands on this screen — the surface-action bus ──────────────────
     Registered under this surface's OWN surfaceViews id ('tasks'); the bus
     alias-resolves the registry's 'tasking' surfaceId onto it, the same
     resolution nav() applies. Every handler drives the SAME state the human's
     own controls drive (setView / setProj / setMod / setMine / setSel);
     programme and task names resolve against the REAL rows with honest
     misses, never guesses. Governed work (move/create/archive/sign/workflow)
     stays human-operated and untouched. */
  /* One guard for all three: while a signature ceremony, the new-task form,
     or the workflow picker owns the canvas, AnA operating the board would
     race or bury the person's in-progress work. Honest refusal instead. */
  const boardBusyGuard = (): { ok: false; reason: string } | null => {
    if (signReq) return { ok: false, reason: 'A signature is in progress — finish or cancel it first.' };
    if (creating) return { ok: false, reason: 'The new-task form is open — close it first.' };
    if (wf) return { ok: false, reason: 'The workflow picker is open — close it first.' };
    return null;
  };
  const leaveGuard = useRef<() => string | null>(() => null);
  leaveGuard.current = () => boardBusyGuard()?.reason ?? (sel ? 'A task detail is open — close it first.' : null);
  useEffect(() => registerSurfaceLeaveGuard(() => leaveGuard.current()), []);
  useEffect(() => {
    const target = pendingRouteNav.current;
    if (!target || sel !== null) return;
    pendingRouteNav.current = null;
    if (!currentTaskActor(taskActorScope(user), isCurrent)) return;
    try { openNotificationRecord(target, onNav); } catch (e) {
      setActionErr(e instanceof Error ? e.message : 'The document could not be opened.');
    }
  }, [sel, user, isCurrent, onNav]);
  useEffect(() => {
    const pending = pendingEditorNav.current;
    if (!pending || sel !== null) return;
    pendingEditorNav.current = null;
    if (!currentTaskActor(taskActorScope(user), isCurrent)) return;
    // The drawer is now gone. Reuse the normal leave guard so an open
    // signature or unsaved form can still veto the transition.
    const refusal = surfaceLeaveRefusal();
    if (refusal) { setActionErr(refusal); return; }
    publishShellProject({ id: pending.programId, title: pending.programTitle });
    setEditorTarget({ docType: null, docId: pending.docId,
      programId: pending.programId, programTitle: pending.programTitle });
    onNav('document-authoring');
  }, [sel, user, isCurrent, onNav]);
  const targetMessage = useTaskTarget({
    scope: taskActorScope(user), isCurrent, read: liveTasks, reloadKey,
    reload: () => setReloadKey(key => key + 1),
    guard: () => leaveGuard.current(),
    select: task => { setProj('all'); setMod('all'); setMine(false); setSel(task); },
  });
  useSurfaceActionHandlers('tasks', {
    'tasking.set-view': (params) => {
      const guarded = boardBusyGuard();
      if (guarded) return guarded;
      const target = (params.view ?? '').trim();
      if (!['board', 'path', 'analytics', 'table'].includes(target)) {
        return { ok: false, reason: `No board view named "${params.view}".` };
      }
      if (liveTasks.error) return { ok: false, reason: 'The task board could not be read.' };
      // Not-ready, not failed: the views render only after the read settles,
      // so the bus holds the directive for the ready signal below.
      if (liveTasks.loading)
        return { ok: false, reason: 'The task board is still loading.', retry: true };
      setView(target);
      return { ok: true, detail: `Switched to the ${target} view` };
    },
    'tasking.filter': (params) => {
      const guarded = boardBusyGuard();
      if (guarded) return guarded;
      if (liveTasks.error) return { ok: false, reason: 'The task board could not be read.' };
      if (liveTasks.loading)
        return { ok: false, reason: 'The task board is still loading.', retry: true };
      const applied: string[] = [];
      let nextProject: string | undefined;
      let nextModule: string | undefined;
      let nextMine: boolean | undefined;
      if (params.project) {
        const wanted = params.project.trim();
        if (wanted.toLowerCase() === 'all') {
          nextProject = 'all';
          applied.push('all projects');
        } else {
          if (projectOpts.loading)
            return { ok: false, reason: 'The project list is still loading.', retry: true };
          if (projectOpts.error)
            return { ok: false, reason: 'The project list could not be read. Retry the project list before choosing a named project.' };
          const lower = wanted.toLowerCase();
          const exact = projectOpts.rows.find(
            (p) => String(p.id) === wanted || p.name.toLowerCase() === lower,
          );
          const contains = exact
            ? []
            : projectOpts.rows.filter((p) => p.name.toLowerCase().includes(lower));
          const match = exact ?? (contains.length === 1 ? contains[0] : null);
          if (!match) {
            return {
              ok: false,
              reason:
                contains.length > 1
                  ? `"${params.project}" matches ${contains.length} projects — name one exactly.`
                  : `No project named "${params.project}" on this board.`,
            };
          }
          nextProject = String(match.id);
          applied.push(`project ${match.name}`);
        }
      }
      if (params.module) {
        const wanted = params.module.trim().toLowerCase();
        const match = modules.find((m) => m.toLowerCase() === wanted);
        if (!match) return { ok: false, reason: `No module named "${params.module}" on this board.` };
        nextModule = match;
        applied.push(match === 'all' ? 'all modules' : `module ${match}`);
      }
      if (params.mine) {
        nextMine = params.mine === 'true';
        applied.push(params.mine === 'true' ? 'my tasks only' : "everyone's tasks");
      }
      if (applied.length === 0) return { ok: false, reason: 'No filter named.' };
      // Refusing any part of a combined directive leaves every filter as it was.
      if (nextProject !== undefined) setProj(nextProject);
      if (nextModule !== undefined) setMod(nextModule);
      if (nextMine !== undefined) setMine(nextMine);
      return { ok: true, detail: `Filtered to ${applied.join(', ')}` };
    },
    'tasking.open-task': (params) => {
      const guarded = boardBusyGuard();
      if (guarded) return guarded;
      /* The detail panel's archive form holds child-local Part 11 justification
         text — replacing `sel` under it would silently destroy a half-typed
         reason the parent cannot see. Refuse while any detail is open. */
      if (sel) return { ok: false, reason: 'A task detail is open — close it first.' };
      const wanted = (params.task ?? '').trim();
      if (!wanted) return { ok: false, reason: 'No task named.' };
      if (liveTasks.error) return { ok: false, reason: 'The task board could not be read.' };
      if (liveTasks.loading)
        return { ok: false, reason: 'The task board is still loading.', retry: true };
      if (liveTasks.empty && !boardIncomplete) return { ok: false, reason: 'There are no tasks on the board.' };
      const lower = wanted.toLowerCase();
      // Scoped to `list` — the tasks on screen under the active filters — so
      // AnA can only open what the person can see.
      const exact = list.find(
        (t) => t.taskId.toLowerCase() === lower || t.title.toLowerCase() === lower,
      );
      const contains = exact ? [] : list.filter((t) => t.title.toLowerCase().includes(lower));
      const match = exact ?? (contains.length === 1 ? contains[0] : null);
      if (!match) {
        return {
          ok: false,
          reason:
            contains.length > 1
              ? `"${params.task}" matches ${contains.length} tasks — name one exactly.`
              : boardIncomplete
                ? `The task board is incomplete: ${unreadReason}. Retry before concluding whether "${params.task}" is on this board.`
                : `No task named "${params.task}" on the board under the current filters.`,
        };
      }
      setSel(match);
      return { ok: true, detail: `Opened ${match.taskId} — ${match.title}` };
    },
  });
  /* The ready signal for the retry contract above: a held directive gets its
     re-attempt when the board and programme reads settle. */
  useEffect(() => {
    if (!liveTasks.loading && !projectOpts.loading) notifySurfaceActionReady('tasks');
  }, [liveTasks.loading, projectOpts.loading]);

  // Move a card between base's columns, then persist through the server task
  // state machine (server/services/tasking/task-state-machine.ts). The column
  // step stays base's index arithmetic over TB_COLS; the WRITE now surfaces the
  // machine's verdict instead of silently swallowing it:
  //   · a 409 illegal transition shows the server's message (with the legal
  //     next states) rather than leaving the board looking stuck;
  //   · a 409 CONFLICT_STALE (lost race) reloads to the authoritative state,
  //     as does a 500 OUTCOME_UNKNOWN (a lost COMMIT: saved or not, unknown);
  //   · a 428 ESIGN_REQUIRED (approval-gated completion, backed by
  //     task-signoff -> part11/reverify-signer) opens the §11.50 signing dialog.
  const move = async (t: TaskItem, dir: number) => {
    // Explicit map, not index arithmetic over TB_COLS. Blocked now has a column
    // (so a blocked task is visible and movable at all), but it is NOT a step on
    // the happy path — stepping by index would make Advance from "In progress"
    // land on "Blocked". Every pair below is legal under TASK_TRANSITIONS
    // (server/services/tasking/task-state-machine.ts); from `blocked`, Advance
    // resumes the work and Retreat sends it back to the queue.
    const ADVANCE: Record<string, string | undefined> = {
      pending: 'in-progress',
      'in-progress': 'review',
      review: 'completed',
      blocked: 'in-progress',
    };
    const RETREAT: Record<string, string | undefined> = {
      'in-progress': 'pending',
      review: 'in-progress',
      completed: 'review',
      blocked: 'pending',
    };
    const status = (dir > 0 ? ADVANCE : RETREAT)[t.status];
    if (!status || status === t.status) return;
    const progress = status === 'completed' ? 100 : t.progress;
    setActionErr('');
    try {
      const res = await apiRequest('PATCH', '/api/tasks/tasks/' + encodeURIComponent(t.taskId), { status, progress });
      if (res.ok) {
        setReloadKey((k) => k + 1);
      } else {
        // apiRequest throws for every non-OK status EXCEPT 401, which it returns.
        // Without this branch an expired session made the move a silent no-op:
        // the card stayed put, no banner, no explanation.
        setActionErr(
          res.status === 401
            ? sessionExpired('The task was not moved.')
            : `Could not move "${t.title}" (HTTP ${res.status}).`,
        );
      }
    } catch (e) {
      if (e instanceof ApiRequestError) {
        const payload = e.payload as { code?: string; error?: unknown } | undefined;
        if (e.status === 428 && payload?.code === 'ESIGN_REQUIRED') {
          setSignReq({ t, status, progress });
          return;
        }
        if (payload?.code === 'CONFLICT_STALE' || e.code === 'OUTCOME_UNKNOWN') setReloadKey((k) => k + 1);
        // Display used to read `payload.error` FIRST. On the envelope the state
        // machine actually sends — { error: 'ILLEGAL_TRANSITION', message: '<the
        // legal next states>' } — the enum won and the banner showed the token
        // instead of the sentence beside it. `e.message` is that sentence:
        // apiRequest already reduced the envelope through extractApiError, which
        // rejects enum tokens and infrastructure text. The code branches above
        // are unaffected — they read `payload.code`, not display copy.
        setActionErr(e.message);
        return;
      }
      setActionErr('Network error while updating the task.');
    }
  };

  // New task -> the real persisted create. POST /api/tasks/tasks inserts an
  // org-scoped unified_tasks row (creator-attributed) and returns it with its
  // real taskId; selected predecessors are then linked into the real dependency
  // DAG (best-effort). The board refetches so the created task appears live.
  const create = async (
    payload: TaskCreateBody,
    dependsOn: string[],
  ): Promise<{ ok: boolean; error?: string }> => {
    try {
      const res = await apiRequest('POST', '/api/tasks/tasks', payload);
      if (res.status === 401) return { ok: false, error: sessionExpired('The task was not created.') };
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.data?.taskId) {
        // `body.error` is a code as often as it is a sentence, so stringifying it
        // put tokens like VALIDATION_FAILED in the modal. serverMessage takes the
        // real sentence wherever the envelope put it, and null when there is none
        // worth showing — which is when this file's own copy is the better answer.
        return { ok: false, error: serverMessage(body) ?? 'Could not create the task.' };
      }
      const newTaskId = String(body.data.taskId);
      // A failed dependency link never blocks the created task — but it must not
      // be silent either. Swallowing these meant that when every link failed the
      // board reported an unqualified success while the task landed with no
      // predecessors: not blocked, not gating, never reached by the cascade.
      const failed: string[] = [];
      for (const dep of dependsOn) {
        try {
          const linkRes = await apiRequest('POST', '/api/tasks/tasks/dependencies', {
            predecessorTaskId: dep,
            successorTaskId: newTaskId,
            dependencyType: 'finish-to-start',
          });
          if (!linkRes.ok) failed.push(dep);
        } catch {
          failed.push(dep);
        }
      }
      setReloadKey((k) => k + 1);
      setCreating(false);
      if (failed.length) {
        const noun = dependsOn.length === 1 ? 'dependency' : 'dependencies';
        // States the consequence rather than a remedy that does not exist —
        // there is no add-dependency control outside this create flow.
        setActionErr(
          `Task created, but ${failed.length} of ${dependsOn.length} ${noun} could not be linked — it is not blocked by them.`,
        );
      }
      // Still ok: the task itself persisted. Returning ok:false would keep the
      // modal open and invite a duplicate create.
      return { ok: true };
    } catch (e) {
      // A viewer's 403 or an unrecorded create (500 AUDIT_WRITE_FAILED) throws
      // here; calling either a "network error" misstated why nothing was made.
      return { ok: false, error: createRefusalText(e) };
    }
  };

  const stats = useMemo(() => {
    const open = list.filter(t => t.status !== 'completed');
    const byMod: Record<string, number> = {};
    const byPri: Record<string, number> = {};
    const byAsg: Record<string, { open: number; done: number }> = {};
    list.forEach(t => {
      byMod[t.moduleType] = (byMod[t.moduleType] || 0) + 1;
      byPri[t.priority] = (byPri[t.priority] || 0) + 1;
      byAsg[t.assignee] = byAsg[t.assignee] || { open: 0, done: 0 };
      if (t.status === 'completed') byAsg[t.assignee].done++; else byAsg[t.assignee].open++;
    });
    return {
      total: list.length, open: open.length,
      blocked: list.filter(t => t.blocked).length,
      /* Work holding the submission, by the cross-store summary's own rule
         (unified-work-view.ts `blocking`): blocked, or recorded as blocking by
         another store, or a board task on the critical path that is not done.
         Replaces the device workbench's "· N blocking" (D2, 2026-10-29). */
      blocking: list.filter(t => t.blocked || t.blocking || (t.criticalPath && t.status !== 'completed')).length,
      crit: list.filter(t => t.criticalPath).length,
      reg: list.filter(t => t.regulatoryImpact).length,
      appr: list.filter(t => t.approvalRequired && t.approvalStatus === 'pending').length,
      byMod, byPri, byAsg,
    };
  }, [list]);

  /* What the Analytics tab measured, or null when it measured every card the
     board read. `tasks` is the board's whole read (the /board route is
     uncapped and spans every work store); `list` is what the filters and the
     unconditional cancelled-card exclusion leave. */
  const analyticsScope = useMemo(
    () => taskAnalyticsScope({
      shown: list.length,
      total: tasks.length,
      filters: { project: proj, moduleType: mod, mineOnly: mine },
    }),
    [list.length, tasks.length, proj, mod, mine],
  );

  /* What AnA can see of this screen. Until now she was told the user was on
     "task-board" and nothing more, so "what should I do next?" had to be
     answered from the message text — on the one surface whose entire purpose is
     answering that question. Published as the nouns and numbers a user would
     point at, never raw API bodies and never anything the screen is hiding.

     PUBLISHED AS 'tasks', NOT 'task-board'. This board is registered under both
     ids, but `DEEP_LINK_ALIASES['task-board'] === 'tasks'` and
     `surfaceIdFromLocation` applies that rewrite BEFORE the shell has an
     `activeId` — so `activeId` is always 'tasks' here, and
     `useActiveSurfaceContext` compares keys exactly. Publishing under
     'task-board' therefore matched nothing on every single render since this
     call was written: the context above was built, stored, and read past. It
     cost nothing and was indistinguishable from working, which is why
     scripts/ci/check-ana-surface-context.mjs now resolves aliases and fails a
     publish into an alias source rather than merely checking membership. */
  const anaContext = useMemo(() => {
    // A failed board read must NOT publish "0 tasks, 0 open, 0 blocked" — that
    // is a dead store reported to AnA as a clean board (the fail-open the
    // repo's own rule forbids: an error is never rendered as an empty result).
    // These two branches sit above the summary for the same reason every
    // sibling surface guards them.
    if (liveTasks.loading) {
      return { summary: 'The task board is still loading; nothing on screen is final yet.', facts: { mine } };
    }
    if (liveTasks.error) {
      return {
        summary:
          'The task board could not be read, so this screen is showing no tasks because of a ' +
          'failure, not because there are none — the counts below are unknown, not zero.',
        facts: { mine, readFailure: liveTasks.error },
        availableActions: ['Retry the task-board read'],
      };
    }
    if (boardIncomplete && liveTasks.empty) {
      return {
        summary: `The task board is incomplete: ${unreadReason}. No tasks can be confirmed from this read; the counts are unknown.`,
        facts: { mine, partial: true, unreadStores },
        availableActions: ['Retry the task-board read'],
      };
    }
    // `t.due` is server data, not a local invariant: a task row without it is a
    // plausible response and must not crash the board. Same class as the
    // ectd-compile defect — the guard has to cover the member, not the container.
    const overdue = list.filter(t => t.status !== 'completed' && String(t.due ?? '').includes('overdue'));
    const sel0 = sel;
    return {
      summary:
        `Tasks for the organisation: ${stats.total} tasks, ${stats.open} open, ` +
        `${stats.blocked} blocked, ${stats.blocking} holding the submission, ` +
        `${overdue.length} overdue, ${stats.appr} awaiting approval.` +
        (boardIncomplete
          ? ` These counts are incomplete: ${unreadReason}.`
          : '') +
        (sel0 ? ` The task "${sel0.title}" (${sel0.taskId}) is open in the detail panel.` : ''),
      facts: {
        view,
        mine,
        partial: boardIncomplete,
        unreadStores,
        totals: {
          all: stats.total, open: stats.open, blocked: stats.blocked, blocking: stats.blocking,
          overdue: overdue.length, criticalPath: stats.crit,
          regulatoryImpact: stats.reg, awaitingApproval: stats.appr,
        },
        // Enough to name a task back to the user, not the whole row set.
        blockedTasks: list.filter(t => t.blocked).slice(0, 8)
          .map(t => ({ taskId: t.taskId, title: t.title, dependsOn: t.dependsOn })),
        overdueTasks: overdue.slice(0, 8).map(t => ({ taskId: t.taskId, title: t.title, due: t.due })),
        selectedTask: sel0
          ? {
              taskId: sel0.taskId, title: sel0.title, status: sel0.status,
              priority: sel0.priority, blocked: sel0.blocked,
              approvalRequired: sel0.approvalRequired, approvalStatus: sel0.approvalStatus,
              signatureCount: sel0.approvalHistory.length,
              dependsOn: sel0.dependsOn, blocks: sel0.blocks,
            }
          : null,
      },
      availableActions: [
        'Open a task to see its detail, dependencies and signatures',
        'Advance or move a task back through pending → in-progress → review → completed',
        'Create a task, or start a workflow from a template',
        'Auto-assign an existing unfinished task from its detail, or retry a failed assignment',
        'Archive a task (requires a reason, written to the audit trail)',
        'Complete an approval-gated task (requires an electronic signature)',
        'Filter the board by module, priority, assignee or search text',
      ],
    };
  }, [list, stats, sel, view, mine, liveTasks.loading, liveTasks.error, liveTasks.empty, boardIncomplete, unreadReason, unreadStores]);
  usePublishSurfaceContext('tasks', anaContext);

  /* The tasks a person marked critical-path (unified_tasks.critical_path), in
     dependency order over dependsOn. Not a computed critical path: nothing here
     weighs durations or finds a longest chain, and the header must not say it
     does (it read "computed from the taskDependencies DAG (getCriticalPath)",
     an endpoint this surface never calls). */
  const critChain = useMemo(() => {
    const crit = list.filter(t => t.criticalPath);
    const seen: Record<string, boolean> = {};
    const out: TaskItem[] = [];
    const visit = (t: TaskItem) => {
      if (!t || seen[t.taskId]) return;
      seen[t.taskId] = true;
      (t.dependsOn || []).forEach(d => { const dt = crit.find(x => x.taskId === d); if (dt) visit(dt); });
      out.push(t);
    };
    crit.forEach(visit);
    return out;
  }, [list]);

  const SRC = (s: string): TaskSource => TB_SRC[s] || TB_SRC.unified;
  /* Resolve a task's project id to the org's real programme name. This used to
     look the id up in TB_PROJECTS, whose invented slugs (bx204/or902/iv415) can
     never match a real numeric projects.id — so it always fell through to
     rendering the bare id. */
  const projName = (id: string): string | null =>
    projectOpts.rows.find(p => String(p.id) === String(id))?.name ?? null;
  /* A project id the list does not hold is said so, never shown as the bare
     number it is (it read "12" in the detail panel). */
  const projLabel = (id: string): string =>
    !id ? 'No project' : projName(id) ?? (projectOpts.loading ? 'Loading…' : 'A project not in your list');
  /* The project a card or table row names. Cards and the table never said which
     project a task belonged to (2026-10-31 client demo), which on an
     all-projects board is the first thing a reader needs. Another store's work
     carries its own project's title. */
  const taskProject = (t: TaskItem): string =>
    (t.project ? projName(t.project) : null) ?? t.home?.programTitle
      ?? (t.project ? (projectOpts.loading ? '' : 'A project not in your list') : 'No project');

  /* Answer-first lead -- computed from live task state */
  const overdue = list.filter(isOverdue);
  /* Who carries the most open work, among people: unassigned work ('') and
     another store's cards (no assignee) are not a person. */
  const workload = Object.entries(stats.byAsg || {}).filter(([k]) => k !== '')
    .map(([k, v]) => ({ k, open: v.open })).sort((a, b) => b.open - a.open);
  const heaviest = workload[0];
  /* Busiest, balanced and rebalance are claims about a team. With one member
     on the roster they are meaningless ("JM Smith is the busiest at 11 open
     tasks — workload-balanced auto-assign can spread the next batch", over a
     roster of one, 2026-10-31 client demo), and with an unread roster they are
     unknown, so they are made only over more than one person. */
  const team = roster.rows.length > 1;
  const critOpen = critChain.filter(t => t.status !== 'completed');
  const critBlocked = critChain.find(t => t.blocked);
  /* Has anything actually been DESIGNATED critical-path?
     `unified_tasks.critical_path` is a real column that defaults FALSE, and no
     write path in the repo ever sets it true — not the three insert sites, not
     the workflow-template instantiation the "clear" branch itself offers as its
     call to action. So `critChain` is permanently empty, and the headline
     asserted "The critical path is clear — nothing open is blocking the
     milestone" in AnA's voice over every board, with a forward commitment ("I
     will flag the moment anything threatens") that no watcher implements —
     while the Blocked column on the same screen showed a non-zero count.

     An empty designation is not a cleared path. Nothing designated means the
     question has not been asked. */
  const critDesignated = list.some(t => t.criticalPath);
  const milestone = critChain[critChain.length - 1];

  return (
    <div className="page-inner tb">
      <div className="ph">
        <div>
          <div className="ph-eyebrow">Project — collaboration</div>
          <h1 className="ph-title">{getSurfaceMeta('tasks').label}</h1>
          <div className="ph-sub">Every task across your projects: the work planned here, and the work that comes from the project schedule, agency correspondence and tracked filings, each labelled with where it came from. Filter to a project below.</div>
        </div>
        {canWrite ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn ghost" onClick={() => setWf(true)}>{I.workflow} Start workflow</button>
            <button className="btn primary" onClick={() => setCreating(true)}>{I.plus} New task</button>
          </div>
        ) : (
          <div className="ph-sub" role="note" data-testid="tb-view-only">
            {I.lock} View only. Creating and changing tasks needs an editor role in this organization.
          </div>
        )}
      </div>

      {targetMessage && (
        <div className={targetMessage.error ? 'tb-alert' : 'scaf-note'} role={targetMessage.error ? 'alert' : 'status'}>
          <span>{targetMessage.text}</span>
        </div>
      )}
      {actionErr && (
        <div className="tb-alert" role="alert">
          {I.alertTriangle} <span>{actionErr}</span>
          <button onClick={() => setActionErr('')} aria-label="Dismiss error">{I.close}</button>
        </div>
      )}
      {notice && (
        <div className="tb-notice" role="status" data-testid="tb-notice">
          {I.check} <span>{notice}</span>
          <button onClick={() => setNotice('')} aria-label="Dismiss">{I.close}</button>
        </div>
      )}
      {projectOpts.error || projectRetryShown ? (
        <ErrorState
          title="Couldn't load the project list"
          message="Retry to restore the project choices. Tasks already shown remain available."
          retry={retryProjects}
          retryLabel="Retry project list"
          busy={projectOpts.loading || projectRetryShown}
          testId="tb-project-read-error"
        />
      ) : projectOpts.loading && !liveTasks.loading ? (
        <div role="status" className="scaf-note">Loading project choices…</div>
      ) : null}

      {liveTasks.loading ? (
        <div role="status" className="scaf-note" style={{ padding: '18px 10px' }}>Loading the task board…</div>
      ) : liveTasks.error || (liveTasks.empty && boardIncomplete) ? (
        <EmptyState
          tone="error"
          icon={I.alertTriangle}
          title="Couldn't load the task board"
          retry={retryBoard}
          hint={liveTasks.error
            ? "Your organization's tasks could not be loaded. Sign in again if your session has ended, then retry."
            : `The board is incomplete: ${unreadReason}. Retry to load the missing work.`}
        />
      ) : liveTasks.empty ? (
        <EmptyState
          icon={I.checkSquare}
          title="No tasks on the board yet"
          hint="Create a task or start a workflow and it appears here once it is saved, labelled with where it came from."
        />
      ) : (
      <>
      <AnswerLead
        tone={critBlocked || overdue.length ? 'urgent' : 'calm'}
        eyebrow="What is on the critical path — and what needs you first"
        headline={critBlocked
          ? <>Your path to {milestone ? <b>"{milestone.title}"</b> : 'the milestone'} is <b>blocked</b> at "{critBlocked.title}".</>
          : critOpen.length
            ? <>{critOpen.length} {critOpen.length === 1 ? 'task stands' : 'tasks stand'} between you and <b>{milestone ? '"' + milestone.title + '"' : 'the milestone'}</b>{overdue.length ? <>, and <b>{overdue.length} {overdue.length === 1 ? 'task is' : 'tasks are'} overdue</b></> : ''}.</>
            : critDesignated
              ? <>The critical path is clear — nothing open is blocking the milestone right now.</>
              : <>No task on this board is marked critical-path, so there is no path to report on yet.</>}
        body={critBlocked
          ? <>{critBlocked.blockedReason || 'It is blocked'} — nothing downstream on the path can move until it clears. {team && heaviest && heaviest.open > 3 ? <>{nameOf(heaviest.k)} is also carrying {heaviest.open} open tasks; auto-assign can give new work to whoever has the fewest.</> : null}</>
          : <>{overdue.length ? <>Clear the overdue work first, then the path flows. </> : null}{/* "Workload is balanced across the team." used to fire whenever `heaviest`
    was undefined — i.e. the filter matched zero tasks. Absence of workload
    data was presented as a measured balance. Balance is claimed only when
    there is assigned open work to be balanced, across more than one person. */}
{!team ? null : heaviest && heaviest.open >= 3 ? <>{nameOf(heaviest.k)} has the most open work, {heaviest.open} tasks; auto-assign gives new work to whoever has the fewest.</> : heaviest && heaviest.open > 0 ? <>Workload is balanced across the team.</> : <>No open work is assigned on this board, so there is no workload to balance.</>} {stats.appr ? <>{stats.appr} approval{stats.appr > 1 ? 's' : ''} pending an e-signature.</> : null}</>}
        reassure={
          critBlocked || overdue.length
            ? (team ? 'I will help you unblock the path and rebalance the team, one step at a time.' : 'I will help you unblock the path, one step at a time.')
            : critDesignated
              ? 'I will flag the moment anything threatens the milestone.'
              /* No "You are on track" over an undesignated board, and no promise
                 to watch a path that does not exist. */
              : undefined
        }
        action={canWrite ? {
          label: critBlocked ? 'Unblock the critical path' : overdue.length ? 'Triage the overdue work' : critDesignated ? 'Start a workflow from a template' : 'Mark the tasks that gate the milestone',
          onClick: () => { if (critBlocked || overdue.length) { setView('path'); } else { setWf(true); } },
          alt: list.some((t) => !t.readOnly && t.status !== 'completed') ? { label: 'Assign a saved task', onClick: () => {
            const candidate = list.find((t) => !t.readOnly && t.status !== 'completed');
            if (candidate) setSel(candidate);
          } } : undefined,
        } : { label: 'See the critical path', onClick: () => setView('path') }}
        secondary="Or work the board, critical path, and analytics below."
      />

      {boardIncomplete && (
        <div className="ph-sub" role="status" data-testid="tb-partial">
          {I.alertTriangle} Not every task store could be read{unreadStores.length ? `: ${unreadStores.map((u) => STORE_LABEL[u] ?? u).join(', ')}` : ''}. The columns and counts show only what was read.
          <button type="button" className="c2c-error-retry" onClick={retryBoard} disabled={liveTasks.loading}>Retry task board</button>
        </div>
      )}

      {/* Where the tasks on the board come from: only the places that hold one. */}
      {list.length > 0 && (
        <div className="tb-src">
          <span className="tb-src-h">Where these tasks come from</span>
          {Object.keys(TB_SRC).filter(k => list.some(t => t.source === k)).map(k => (
            <span key={k} className="tb-src-chip" data-src={k} title={TB_SRC[k].t}>
              <b>{TB_SRC[k].t}</b> {list.filter(t => t.source === k).length}
            </span>
          ))}
        </div>
      )}

      {/* Filters + views */}
      <div className="tb-bar">
        <div className="tb-filters">
          <select id="tb-filter-project" aria-label="Filter by project" className="tb-sel" value={proj} onChange={e => setProj(e.target.value)}>
            <option value="all">All projects</option>
            {projectOpts.rows.map(p => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
          </select>
          <select id="tb-filter-module" aria-label="Filter by module" className="tb-sel" value={mod} onChange={e => setMod(e.target.value)}>
            {modules.map(m => <option key={m} value={m}>{m === 'all' ? 'All modules' : m}</option>)}
          </select>
          <button className={`tb-chip${mine ? ' on' : ''}`} onClick={() => setMine(m => !m)}>{I.user} My tasks</button>
        </div>
        <div className="seg">
          {([['board', 'Board'], ['path', 'Critical path'], ['analytics', 'Analytics'], ['table', 'Table']] as const).map(([v, l]) => (
            <button key={v} className={`seg-b${view === v ? ' on' : ''}`} onClick={() => setView(v)}>{l}</button>
          ))}
        </div>
      </div>

      {/* data-cols below is required, not decorative: .tb-kanban defaults to a
          4-column grid and only [data-cols="5"] widens it (app-v2.css:452,459).
          Adding the Blocked column made this five, so without the attribute
          row-major auto-placement wrapped "Done" onto a second row. Driven off
          TB_COLS.length so it cannot drift again if a column is added. */}
      {view === 'board' && (
        <div className="tb-kanban" data-cols={String(TB_COLS.length)}>
          {TB_COLS.map(col => {
            const items = byCol(col.id);
            return (
              <div key={col.id} className="tb-col">
                <div className="tb-col-h"><span className="kdot" data-tone={col.tone} /><span>{col.label}</span><span className="kn">{items.length}</span></div>
                <div className="tb-col-b">
                  {items.map(t => (
                    // role/tabIndex/key handling, not a bare div+onClick: the
                    // card is the board's primary affordance and was reachable
                    // by mouse only, so a keyboard user could not open a task
                    // from the board view at all (SC 2.1.1). The card contains
                    // its own buttons, so it cannot be a <button> — hence the
                    // explicit role rather than a native element.
                    <div
                      key={t.taskId}
                      className="tb-card"
                      data-blocked={t.blocked || undefined}
                      role="button"
                      tabIndex={0}
                      aria-label={`Open ${t.title}`}
                      onClick={() => setSel(t)}
                      onKeyDown={(e) => {
                        if (e.target !== e.currentTarget) return; // let inner buttons act
                        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSel(t); }
                      }}
                    >
                      <div className="tb-card-top">
                        {t.moduleType && <span className="tb-mod" style={{ '--m': TB_MOD[t.moduleType] || MODULE_COLOR_UNKNOWN } as React.CSSProperties}>{t.moduleType}</span>}
                        {t.criticalPath && <span className="tb-flag crit" title="On critical path">{I.zap}</span>}
                        {/* tb-flag-reg, not `reg`: the page-level `.c2c-v2 .reg` (the
                            regulatory screen's scroll container, app-v2.css) matched
                            it too and padded every such card with a ~97px blank band. */}
                        {t.regulatoryImpact && <span className="tb-flag tb-flag-reg" title="Regulatory impact">{I.shieldCheck}</span>}
                        {t.blocking && !t.blocked && <span className="tb-flag blk" title={BLOCKING_FLAG}>{I.alertTriangle}</span>}
                      </div>
                      <div className="tb-card-title">{t.title}</div>
                      {t.blocked && <div className="tb-blocked">{I.alertTriangle} {t.blockedReason || 'Blocked'}</div>}
                      <div className="tb-card-meta">
                        {/* Only a type the board can name: a workflow's tasks carry
                            none, and drew an empty grey pill. */}
                        {TB_TYPE[t.taskType] && <span className="tb-type" data-t={t.taskType}>{TB_TYPE[t.taskType]}</span>}
                        {t.priority && <span className={`tb-pri pri-${t.priority}`}>{t.priority}</span>}
                        {t.approvalRequired && <span className="tb-appr" data-s={t.approvalStatus}>{t.approvalStatus === 'approved' ? 'approved' : t.approvalStatus === 'pending' ? 'approval — pending' : 'needs approval'}</span>}
                      </div>
                      {t.progress > 0 && t.progress < 100 && <div className="tb-prog"><span style={{ width: t.progress + '%' }} /></div>}
                      <div className="tb-card-foot">
                        {taskProject(t) && <span className="tb-card-proj" title={taskProject(t)}>{taskProject(t)}</span>}
                        <span className="tb-src-tag" data-src={t.source} title={SRC(t.source).t}>{SRC(t.source).l}</span>
                        {(t.dependsOn.length > 0 || t.blocks.length > 0) && <span className="tb-deps" title={'Waits on ' + t.dependsOn.length + ', holds up ' + t.blocks.length}>{I.gitCompare}{t.dependsOn.length + t.blocks.length}</span>}
                        {t.comments > 0 && <span className="tb-cmt">{t.comments}</span>}
                        <span className="tb-due" data-over={isOverdue(t) || undefined}>{t.due}</span>
                        {!t.readOnly && <span className="tb-av" title={nameOf(t.assignee)}>{tbAvatar(nameOf(t.assignee))}</span>}
                      </div>
                      {canWrite && !t.readOnly && !t.reviewRoute && (
                        <div className="tb-move" onClick={e => e.stopPropagation()}>
                          <button disabled={t.status === 'pending'} onClick={() => move(t, -1)} title="Move back" aria-label="Move back">{I.left}</button>
                          <button disabled={t.status === 'completed'} onClick={() => move(t, 1)} title="Advance" aria-label="Advance">{I.chevRight}</button>
                        </div>
                      )}
                    </div>
                  ))}
                  {!items.length && <div className="tb-empty">No tasks</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {view === 'path' && (
        <div className="tb-path">
          <div className="tb-path-h">Critical path — {critChain.length} {critChain.length === 1 ? 'task' : 'tasks'} marked critical-path, in dependency order</div>
          {critChain.map((t, i) => (
            <div
              key={t.taskId}
              className="tb-path-row"
              data-status={t.status}
              role="button"
              tabIndex={0}
              /* The rail dot carried completed / in-progress / pending in its
                 colour alone, and the row's name said only "Open <title>", so
                 the one thing the critical path is read for was the one thing
                 not stated. */
              aria-label={`Open ${t.title} — ${t.status}`}
              onClick={() => setSel(t)}
              onKeyDown={(e) => {
                if (e.target !== e.currentTarget) return;
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSel(t); }
              }}
            >
              <div className="tb-path-rail"><span className="tb-path-dot" data-status={t.status} aria-hidden="true" />{i < critChain.length - 1 && <span className="tb-path-line" />}</div>
              <div className="tb-path-card">
                <div className="tb-path-t">{t.title}<span className="tb-mod" style={{ '--m': TB_MOD[t.moduleType] || MODULE_COLOR_UNKNOWN } as React.CSSProperties}>{t.moduleType}</span></div>
                <div className="tb-path-m">
                  <span>{t.phase || '—'}</span><span className="tb-dot">·</span><span>{nameOf(t.assignee) || 'Unassigned'}</span><span className="tb-dot">·</span>
                  <span className={`tb-pri pri-${t.priority}`}>{t.priority}</span><span className="tb-dot">·</span><span>{t.impactScore != null ? `impact ${t.impactScore}/10` : 'impact not scored'}</span>
                  {t.blocked && <span className="tb-path-blk">{I.alertTriangle} blocked</span>}
                  <span className="tb-grow" /><span className="tb-due" data-over={isOverdue(t) || undefined}>{t.due}</span>
                </div>
                {t.dependsOn.length > 0 && <div className="tb-path-dep">depends on {t.dependsOn.map(d => byId(d)?.title || 'a task not on this board').join(' — ')}</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {view === 'analytics' && (
        <div>
          {/* Every figure below is computed from `list`, the FILTERED rows, so
              the tab says what it measured. See taskBoardAnalyticsScope. */}
          {analyticsScope && (
            <div className="ro-dash-note" role="status" data-testid="tb-analytics-scope">
              {I.info} {analyticsScope}
            </div>
          )}
          <div className="metrics">
            {([['Open tasks', stats.open, ''], ['On critical path', stats.crit, 'ai'], ['Regulatory impact', stats.reg, 'warn'], ['Blocked', stats.blocked, stats.blocked ? 'err' : ''], [BLOCKING_FLAG, stats.blocking, stats.blocking ? 'err' : ''], ['Approvals pending', stats.appr, 'warn']] as const).map((m, i) => (
              <div key={i} className="metric" data-tone={m[2]}><div className="metric-l">{m[0]}</div><div className="metric-n">{m[1]}</div></div>
            ))}
          </div>
          <div className="tb-an-grid">
            <div className="tb-an-card">
              <div className="tb-an-h">By module</div>
              {Object.keys(stats.byMod).map(k => {
                const max = Math.max(...Object.values(stats.byMod));
                return (
                  <div key={k} className="tb-an-row"><span className="tb-an-k"><span className="tb-an-dot" style={{ background: TB_MOD[k] || MODULE_COLOR_UNKNOWN }} />{k}</span><div className="tb-an-bar"><span style={{ width: (stats.byMod[k] / max * 100) + '%', background: TB_MOD[k] || MODULE_COLOR_UNKNOWN }} /></div><span className="tb-an-n">{stats.byMod[k]}</span></div>
                );
              })}
            </div>
            <div className="tb-an-card">
              <div className="tb-an-h">Team productivity</div>
              {Object.keys(stats.byAsg).map(k => (
                <div key={k} className="tb-an-row"><span className="tb-an-k"><span className="tb-av sm">{tbAvatar(nameOf(k))}</span>{nameOf(k)}</span><div className="tb-an-split"><span className="tb-an-open">{stats.byAsg[k].open} open</span><span className="tb-an-done">{stats.byAsg[k].done} done</span></div></div>
              ))}
              <div className="tb-an-foot">Auto-assign on a saved task gives it to the member with the fewest open tasks; the per-module default shown here does not.</div>
            </div>
            <AutomationCard />
          </div>
        </div>
      )}

      {view === 'table' && (
        <div className="ctable tb-table">
          {/* Project, not Task ID: the server's id ("TASK-1761…-3f2a") told a
              reader nothing, and which project a row is for told them most. */}
          <div className="ct-head" style={{ gridTemplateColumns: '160px 1.7fr 120px 96px 90px 90px 84px' }}><div>Project</div><div>Title</div><div>Module</div><div>Status</div><div>Priority</div><div>Owner</div><div>Due</div></div>
          {list.map(t => (
            <button key={t.taskId} className="ct-row" style={{ gridTemplateColumns: '160px 1.7fr 120px 96px 90px 90px 84px' }} onClick={() => setSel(t)}>
              <div className="ct-strong" style={{ fontSize: 11 }}>{taskProject(t)}</div>
              <div style={{ fontSize: 11.5 }}>{t.title}{t.criticalPath && <span className="tb-flag crit inline">{I.zap}</span>}{t.blocked && <span className="tb-flag blk inline">{I.alertTriangle}</span>}{t.blocking && !t.blocked && <span className="tb-flag blk inline" title={BLOCKING_FLAG}>{I.alertTriangle}</span>}</div>
              <div><span className="tb-mod" style={{ '--m': TB_MOD[t.moduleType] || MODULE_COLOR_UNKNOWN } as React.CSSProperties}>{t.moduleType}</span></div>
              <div style={{ fontSize: 11 }}>{(TB_COLS.find(c => c.id === t.status) || { label: t.status }).label}</div>
              <div><span className={`tb-pri pri-${t.priority}`}>{t.priority}</span></div>
              <div style={{ fontSize: 11 }}>{nameOf(t.assignee)}</div>
              <div style={{ fontSize: 11, color: isOverdue(t) ? 'var(--error)' : 'var(--text-400)' }}>{t.due}</div>
            </button>
          ))}
        </div>
      )}

      {/* Honest engineering reality.
          Every bullet here is re-verified against the server, because three of
          the four this replaces had gone false while still being shown to
          authenticated users — and the audit one was the dangerous kind of
          false. It read "task-audit.ts … is coded but NOT CALLED from task
          mutation handlers -- task creates/transitions are currently
          unaudited", telling a user of a Part 11 tool that their governed
          actions left no ledger entry. `auditTaskAction` is imported and
          awaited on every mutation this board fires: create, transition
          (unifiedTasks.routes.ts), archive, link, assign, notify and
          from-template (taskManagement.routes.ts).
          Likewise "Notifications: stub only (io.to('tasks').emit commented
          out)" — that expression appears nowhere in the server; assignment,
          transition and create all call `notifyTaskEvent`
          (services/tasking/task-side-effects.ts). And the route note pointed at
          a client file, `taskingService.ts`, that does not exist in this
          repository. The index count is dropped rather than corrected (it was
          8, the table declares 9): a number nothing reads is a number that goes
          quietly wrong. */}
      {/* A regulatory user needs to know which guarantees are real before
          relying on the board as evidence. What this must NOT be is a schema
          tour: it named five tables and a source file, always rendered, to
          every user. The governance claims are the valuable part and are kept;
          the identifiers are not. */}
      <details className="tb-gaps">
        <summary>What is enforced, and what is not yet</summary>
        {/* Rewritten 2026-10-31 for the person relying on it: it named routers,
            a state machine, a mirror and a dispatcher. The claims are the same
            claims, each still true of the server. */}
        <ul>
          <li><b>Each task is counted once.</b> Work from the project schedule keeps its own history there and appears here once. Every card says where it came from.</li>
          <li><b>Audit:</b> creating, moving, linking and archiving a task is recorded in the tamper-evident 21 CFR Part 11 audit trail, wherever it is done. Completing a task that needs approval also records a verified electronic signature (§11.50).</li>
          <li><b>Notifications:</b> assignment, blocking, completion and unblocking are notified in the app. A task due within 48 hours, and an overdue task, is notified once each.</li>
          <li><b>The same rules everywhere:</b> a task follows the same status steps, needs the same signature for approval and unblocks the same work wherever it is changed.</li>
          <li><b>Automation:</b> rules can be saved and tested, but they do not run on their own yet.</li>
        </ul>
      </details>
      </>
      )}

      {creating && <TaskCreate proj={defaultProject} tasks={tasks} onClose={() => setCreating(false)} onCreate={create} />}
      {/* The tasks are already persisted by the time this fires, so the board is
          RELOADED rather than handed client-built rows through window.C2C.addTask
          — a runtime channel that only ever updated local state.
          It also asked AnA "Created N tasks from the workflow template.", which
          left the board for an empty conversation the moment the work landed
          (2026-10-31 client demo). It stays here: the board view, re-read, with
          the count and the project said in place, and the filter on that
          project when another one was chosen. */}
      {wf && (
        <WorkflowStart
          proj={defaultProject}
          actorHeaders={() => taskActorHeaders(taskActorScope(user), isCurrent)}
          onClose={() => setWf(false)}
          onInstantiate={(createdCount, projectId, warning) => {
            setWf(false);
            setReloadKey((k) => k + 1);
            setView('board');
            if (proj !== 'all' && proj !== projectId) setProj(projectId);
            setNotice(`${createdCount} ${createdCount === 1 ? 'task was' : 'tasks were'} created for ${projName(projectId) ?? 'the chosen project'} from the workflow.`);
            // The dialog is gone, so a partial outcome must outlive it.
            if (warning) setActionErr(warning);
          }}
        />
      )}
      {sel && sel.readOnly && (
        <OtherStoreTaskDetail
          t={sel}
          projName={projName}
          opening={openingFiling === sel.taskId}
          error={filingHomeError}
          onClose={() => { filingOpenSerial.current += 1; selectedTask.current = null; setSel(null); setOpeningFiling(null); setFilingHomeError(''); }}
          onOpenHome={async (t) => {
            if (!t.home) return;
            const headers = taskActorHeaders(taskActorScope(user), isCurrent);
            if (!headers) { setFilingHomeError('Your signed-in account or organization changed. Reopen the task from Your work.'); return; }
            if (t.home.source === 'filing') {
              const filingId = t.home.nativeId;
              if (!isTrackedFilingId(filingId)) {
                setFilingHomeError('This exact tracked filing could not be verified because its identifier is invalid. The current project has not changed.');
                return;
              }
              if (openingFiling === t.taskId) return;
              const serial = ++filingOpenSerial.current;
              setOpeningFiling(t.taskId); setFilingHomeError('');
              const stillSelected = () => mounted.current && filingOpenSerial.current === serial && selectedTask.current === t
                && currentTaskActor(taskActorScope(user), isCurrent);
              try {
                const { home } = await loadTaskFilingHome(filingId, headers);
                if (!stillSelected()) return;
                if (home.programId) publishShellProject({ id: home.programId, title: home.programTitle || 'Tracked filing project' });
                stashNavParamsForTarget('submission-center', { filingId, ws: 'portfolio' });
                setSel(null); onNav('submission-center');
              } catch (error) {
                if (!stillSelected()) return;
                setFilingHomeError(filingHomeErrorText(error));
              } finally {
                if (mounted.current && filingOpenSerial.current === serial) setOpeningFiling(null);
              }
              return;
            }
            if (!t.home.programId) return;
            publishNativeTaskHome(t, projName);
            setSel(null);
            onNav(t.home.surface);
          }}
        />
      )}
      {sel && !sel.readOnly && (
        <TaskDetail
          t={tasks.find((t) => t.taskId === sel.taskId) ?? sel}
          byId={byId}
          projLabel={projLabel}
          onClose={() => setSel(null)}
          onOpenDocument={(documentId) => {
            if (!currentTaskActor(taskActorScope(user), isCurrent)) return;
            const task = tasks.find(t => t.taskId === sel.taskId);
            const project = projectOpts.rows.filter(p => String(p.id) === String(task?.project));
            const programId = project.length === 1 ? project[0].regulatoryProgramId : null;
            if (liveTasks.error || liveTasks.loading || boardIncomplete ||
                projectOpts.error || projectOpts.loading ||
                task?.sourceDocumentId !== documentId ||
                !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(documentId) ||
                typeof programId !== 'string' ||
                !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(programId)) {
              setActionErr('The task’s exact document and project could not be verified from the current Tasking and Projects records. Refresh both lists before opening the editor.');
              return;
            }
            setActionErr('');
            pendingEditorNav.current = { docId: documentId, programId, programTitle: project[0].name };
            setSel(null);
          }}
          onOpenRoute={(task) => {
            const route = task.reviewRoute;
            if (!route || route.kind === 'unresolved' || !currentTaskActor(taskActorScope(user), isCurrent)) return 'The document could not be opened. Reopen the task.';
            if (route.kind === 'vault' && !route.programId) return 'This version is in no project. Open it from the Vault.';
            pendingRouteNav.current = route.kind === 'vault'
              ? { surface: 'vault', label: 'Open the version in the Vault', params: { documentId: route.documentId }, programId: route.programId }
              : { surface: 'quality', label: 'Open the controlled document', params: { qmsDocumentId: route.qmsDocumentId }, programId: null };
            setSel(null);
            return null;
          }}
          onAsk={onAsk}
          onMove={move}
          nameOf={nameOf}
          actorScope={taskActorScope(user)}
          isCurrent={isCurrent}
          onAssignmentSaved={() => setReloadKey(key => key + 1)}
          canWrite={canWrite}
          pendingNotification={targetMessage?.error ? targetMessage.text : null}
          onAssign={(meta, headers) => autoAssignSavedTask(meta, headers, () => currentTaskActor(taskActorScope(user), isCurrent))}
          onArchived={() => { setSel(null); setReloadKey((k) => k + 1); }}
        />
      )}
      {/* An approval-gated completion (the server answered 428 ESIGN_REQUIRED) is
          signed in the product's one task sign-off, editor/TaskSignOffDialog.tsx,
          the dialog the document's Tasks rail mounts too: meaning, reason,
          password and the authenticator code when one is enrolled, re-verified by
          the server, and a confirmation that shows the signature the server
          recorded. This board held its own copy until 2026-10-08 (wave 2D). */}
      {signReq && (
        <TaskSignOffDialog
          req={{ taskId: signReq.t.taskId, title: signReq.t.title, status: signReq.status, progress: signReq.progress }}
          signer={esignSignerOf(user as Parameters<typeof esignSignerOf>[0])}
          onClose={() => setSignReq(null)}
          onSigned={() => { setSignReq(null); setReloadKey((k) => k + 1); }}
        />
      )}
    </div>
  );
}

/* ── Task detail panel ── */

interface TaskDetailProps {
  t: TaskItem;
  byId: (id: string) => TaskItem | undefined;
  projLabel: (id: string) => string;
  onClose: () => void;
  onOpenDocument?: (documentId: string) => void;
  /** Opens where a review-route task is acted on; returns a refusal to show, or null. */
  onOpenRoute?: (t: TaskItem) => string | null;
  onAsk: (text: string) => void;
  onMove: (t: TaskItem, dir: number) => void;
  onAssign: (meta: TaskAssignmentMeta, headers: () => Record<string, string> | null) => Promise<AutomaticAssignmentAnswer>;
  actorScope: TaskActorScope | null;
  isCurrent: () => boolean;
  onAssignmentSaved: () => void;
  pendingNotification?: string | null;
  /** Resolves a real assignee id to a name; see makeNameOf. */
  nameOf: (id: string | null | undefined) => string;
  /** Called after a successful soft-delete so the board closes + refetches. */
  onArchived: () => void;
  /** False for a role the server refuses every task write (see canGovernedWrite). */
  canWrite: boolean;
}

/** archiveTaskSchema's ceiling on the archive reason (server/routes/taskManagement.routes.ts). */
const ARCHIVE_REASON_MAX = 1000;

/**
 * Another store's work, opened from the board. The board does not write that
 * store, so this panel offers none of the board's controls (move, archive,
 * sign): it says what the store records and opens the screen that owns it.
 */
/** The place another store's work lives: a project's page is named by its project. */
function homeLabel(home: TaskItem['home'], project: string | null): string | null {
  if (!home) return null;
  if (home.surface === 'project-home') return home.programTitle || project || 'its project';
  return HOME_LABEL[home.surface] ?? getSurfaceMeta(home.surface).label;
}

/** Where another store's work lives, in one sentence. */
function whereItLives(home: string | null, project: string | null): React.ReactNode {
  if (!home) return 'This work is managed outside the board. The board shows it and does not change it.';
  const forProject = project && project !== home ? ` for ${project}` : '';
  return `This work lives in ${home}${forProject}. It is changed there; the board shows it and does not edit it.`;
}

function OtherStoreTaskDetail({ t, projName, onClose, onOpenHome, opening, error }: {
  t: TaskItem;
  projName: (id: string) => string | null;
  onClose: () => void;
  onOpenHome: (t: TaskItem) => void | Promise<void>;
  opening: boolean;
  error: string;
}) {
  const src = TB_SRC[t.source] || TB_SRC.unified;
  const status = (TB_COLS.find(c => c.id === t.status) || { label: t.status }).label;
  const project = (t.project ? projName(t.project) : null) ?? t.home?.programTitle ?? null;
  const home = homeLabel(t.home, project);
  const dialogRef = useDialog(onClose);
  return (
    <div className="tb-detail-bd" onClick={onClose}>
      <div className="tb-detail" role="dialog" aria-modal="true" aria-label="Task detail" tabIndex={-1} ref={dialogRef} onClick={e => e.stopPropagation()}>
        <div className="tb-detail-h">
          <div><h3>{t.title}</h3></div>
          <button className="tb-detail-x" onClick={onClose} aria-label="Close">{I.close}</button>
        </div>
        {t.blocked && <div className="tb-blocked lg">{I.alertTriangle} {t.detail || 'Blocked'}</div>}
        <OtherStoreTaskFields t={t} project={project} status={status} src={src} />
        <div className="tb-detail-sec">
          <div className="tb-detail-note">{whereItLives(home, project)}</div>
          {error && <div role="alert" className="tb-detail-note">{error}</div>}
          {home && (t.home?.source === 'filing' || t.home?.programId
              ? <button className="btn primary" disabled={opening} aria-busy={opening} onClick={() => void onOpenHome(t)}>Open in {home}</button>
              : <div role="status" className="tb-detail-note">This task has no available project link. Open its project from Projects; the current project has not been changed.</div>)}
        </div>
      </div>
    </div>
  );
}

/** A review-route task's place (J5 human test, J2's D4, 2026-11-06): the board
 *  cannot move it (the server answers 409), so the drawer opens where it is signed. */
function RouteTaskSection({ t, onOpenRoute }: { t: TaskItem; onOpenRoute?: (t: TaskItem) => string | null }) {
  const [err, setErr] = useState('');
  const route = t.reviewRoute;
  if (!route) return null;
  const label = route.kind === 'vault' ? 'Open the version in the Vault' : route.kind === 'quality' ? 'Open the controlled document' : null;
  return (
    <div className="tb-detail-sec">
      <div className="tb-detail-note">
        This task is a step on a review route. It is reviewed and signed on the document, and the route completes it; it is not moved on the board.
      </div>
      {label && onOpenRoute
        ? <button type="button" className="btn primary" onClick={() => setErr(onOpenRoute(t) ?? '')}>{I.fileText} {label}</button>
        : <div role="status" className="tb-detail-note">The document this route is on could not be read. Open it from the Vault or Quality.</div>}
      {err && <div role="alert" className="tb-detail-note">{err}</div>}
    </div>
  );
}

function TaskDetail({ t, byId, projLabel, onClose, onOpenDocument, onOpenRoute, onAsk, onMove, onAssign, nameOf, onArchived, canWrite, pendingNotification,
  actorScope, isCurrent, onAssignmentSaved }: TaskDetailProps) {
  const src = TB_SRC[t.source] || TB_SRC.unified;
  const owner = nameOf(t.assignee) || 'Unassigned';
  // A dependency the board did not read is said so, never shown as its id.
  const dep = (id: string) => byId(id)?.title ?? 'a task not on this board';

  // Two-step archive (soft delete). This is the ONLY removal verb: the server
  // stamps deleted_at/deleted_by (DELETE /api/tasks/tasks/:taskId, backed by the
  // 20260807_unified_tasks_soft_delete migration) instead of destroying the row,
  // so every read model — which filters `deleted_at IS NULL` — drops it while the
  // tombstone and its governed ledger entry are retained (Part 11). There is no
  // hard-delete path on the board.
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [archiving, setArchiving] = useState(false);
  // The reason the USER gives. This used to be the hardcoded string
  // 'Archived from the task board', sent on every archive — which meant the
  // Part 11 ledger recorded an identical sentence for every archived task in
  // the system. A reason field that is really a constant is worse than no
  // reason field: it reads to an auditor as a captured justification when
  // nothing was ever captured.
  const [archiveReason, setArchiveReason] = useState('');
  // The server enforces the same bounds (archiveTaskSchema: 3 to 1000, trimmed),
  // so this gate and the 400 it would otherwise answer agree. The textarea's
  // maxLength stops typing at the ceiling; a value set past it is still refused.
  const archiveReasonLen = archiveReason.trim().length;
  const archiveReasonTooLong = archiveReasonLen > ARCHIVE_REASON_MAX;
  const archiveReasonOk = archiveReasonLen >= 3 && !archiveReasonTooLong;
  const archiveReasonTooLongText = `The reason can be at most ${ARCHIVE_REASON_MAX} characters; this one is ${archiveReasonLen}.`;
  // A refusal, shown IN this panel: the board's banner sits behind the
  // backdrop, where the user who just clicked Confirm cannot see it.
  const [archiveErr, setArchiveErr] = useState('');
  const [assignmentBlocked, setAssignmentBlocked] = useState(false);
  // There used to be a 4s timer that silently disarmed the confirm. With a
  // reason textarea in the flow that would wipe a half-written justification
  // mid-sentence, so disarming is now an explicit Cancel button instead.
  const archive = async () => {
    if (!confirmArchive) { setConfirmArchive(true); return; }
    if (archiving || !archiveReasonOk) return;
    setArchiving(true);
    setArchiveErr('');
    try {
      const res = await apiRequest('DELETE', '/api/tasks/tasks/' + encodeURIComponent(t.taskId), {
        reason: archiveReason.trim(),
      });
      if (res.ok) { onArchived(); return; }
      // Only a 401 arrives here (apiRequest throws the rest). It used to fall
      // through and reset the form, so an expired session looked like nothing.
      setArchiveErr(res.status === 401
        ? sessionExpired('The task was not archived.')
        : `The task was not archived (HTTP ${res.status}).`);
    } catch (e) {
      // ApiRequestError.message is the server's sentence (a viewer's 403, an
      // unrecorded archive), already stripped of enum tokens and driver text.
      setArchiveErr(refusalText(e, 'Could not archive the task.'));
    }
    // The confirm and the reason stay put, so the user can retry as they were.
    setArchiving(false);
  };

  const dialogRef = useDialog(onClose);

  return (
    <div className="tb-detail-bd" onClick={onClose}>
      <div className="tb-detail" role="dialog" aria-modal="true" aria-label="Task detail" tabIndex={-1} ref={dialogRef} onClick={e => e.stopPropagation()}>
        <div className="tb-detail-h">
          <div><h3>{t.title}</h3></div>
          <button className="tb-detail-x" onClick={onClose} aria-label="Close">{I.close}</button>
        </div>
        <div className="tb-detail-chips">
          <span className="tb-mod" style={{ '--m': TB_MOD[t.moduleType] || MODULE_COLOR_UNKNOWN } as React.CSSProperties}>{t.moduleType}</span>
          {TB_TYPE[t.taskType] && <span className="tb-type" data-t={t.taskType}>{TB_TYPE[t.taskType]}</span>}
          {t.priority && <span className={`tb-pri pri-${t.priority}`}>{t.priority}</span>}
          {t.criticalPath && <span className="tb-flag crit lg">{I.zap} critical path</span>}
          {t.regulatoryImpact && <span className="tb-flag tb-flag-reg lg">{I.shieldCheck} regulatory</span>}
        </div>
        {t.blocked && <div className="tb-blocked lg">{I.alertTriangle} {t.blockedReason || 'Blocked'}</div>}
        {pendingNotification && <div role="status" className="tb-detail-note">{pendingNotification}</div>}
        {/* QA 2026-10-08 (j4): the instructions a review task was created with
            were stored and never shown, so the reviewer could not read them. */}
        {t.description && t.description.trim() && (
          <div className="tb-detail-sec">
            <div className="tb-detail-sec-h">Instructions</div>
            <div style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{t.description}</div>
          </div>
        )}
        <div className="tb-detail-grid">
          <div><label>Project</label><span>{projLabel(t.project)}</span></div>
          <div><label>Phase</label><span>{t.phase || '—'}</span></div>
          <div><label>Assignee</label><span>{owner}</span></div>
          <div><label>Assigned by</label><span>{nameOf(t.assignedBy) || '—'}</span></div>
          <div><label>Impact score</label><span>{t.impactScore != null ? `${t.impactScore}/10` : 'Not scored'}</span></div>
          <div><label>Due</label><span style={{ color: isOverdue(t) ? 'var(--error)' : 'inherit' }}>{t.due}</span></div>
          <div><label>Came from</label><span>{src.t}</span></div>
          <div><label>Progress</label><span>{t.progress}%</span></div>
        </div>
        {t.sourceDocumentId && onOpenDocument && (
          <div className="tb-detail-sec">
            <button type="button" className="btn primary" onClick={() => onOpenDocument(t.sourceDocumentId!)}>
              {I.fileText} Open linked document in editor
            </button>
          </div>
        )}
        <RouteTaskSection t={t} onOpenRoute={onOpenRoute} />
        {canWrite && <TaskAssignmentControls key={t.taskId} taskId={t.taskId} status={t.status}
          projectId={/^[1-9]\d*$/.test(t.project) ? Number(t.project) : null} actorScope={actorScope} isCurrent={isCurrent}
          disabled={confirmArchive || archiving} onAutomatic={onAssign} onSaved={onAssignmentSaved} onBlockedChange={setAssignmentBlocked} />}
        {t.approvalRequired && (
          <div className="tb-detail-sec">
            <div className="tb-detail-sec-h">Approval checkpoint <span className="tb-appr" data-s={t.approvalStatus}>{t.approvalStatus.replace('_', ' ')}</span></div>
            {/* §11.50 manifestation. This section previously showed only the
                status badge, so a signature could be captured, verified and
                written to the ledger with no way for anyone to see who signed,
                when, or what they meant by it — the signed record was invisible
                to the person relying on it. approvalHistory now rides the board
                read model for exactly this. */}
            {t.approvalHistory.length > 0 ? (
              <div className="tb-sig-list">
                {t.approvalHistory.map((s, i) => (
                  <div className="tb-sig" key={`${s.signedAt}-${i}`}>
                    <div className="tb-sig-h">
                      {I.shieldCheck}
                      <b>{s.signedByName}</b>
                      <span className="tb-sig-meaning">{s.meaning.toLowerCase()}</span>
                      <span className="tb-grow" />
                      <time dateTime={s.signedAt}>{fmtSigned(s.signedAt)}</time>
                    </div>
                    {s.reason && <div className="tb-sig-reason">{s.reason}</div>}
                    <div className="tb-sig-meta">{describeSignatureMethod(s.method, s.method === 'pin')}.</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="tb-detail-note">
                Not signed yet. Completing this task requires an electronic signature — your
                password (and your authenticator code, if you use one), the meaning of the
                signature, and a reason — recorded under
                21 CFR Part 11 §11.50.
              </div>
            )}
            {/* The copy here used to claim "Quorum/role-based gate types
                supported." Neither is implemented. What IS enforced: where a
                task names designated approvers, only they can sign (see
                task-signoff.ts); where it names none, any org member who can
                sign can. Saying so plainly beats advertising a control
                that does not exist. */}
            {t.approvalStatus === 'pending' && t.approvalHistory.length > 0 && (
              <div className="tb-detail-note" data-warn="true">
                This task was reopened after signing, so the signature above no longer
                approves the current version. Completing it again requires a new signature.
              </div>
            )}
          </div>
        )}
        {(t.dependsOn.length > 0 || t.blocks.length > 0) && (
          <div className="tb-detail-sec">
            <div className="tb-detail-sec-h">Dependencies</div>
            {t.dependsOn.map(d => <div key={d} className="tb-dep-row up">{I.arrowUp} depends on <b>{dep(d)}</b></div>)}
            {t.blocks.map(d => <div key={d} className="tb-dep-row dn">{I.arrowRight} blocks <b>{dep(d)}</b></div>)}
          </div>
        )}
        {/* Same correction as the board's engineering-reality block: this said
            the change "would not be written to the c2c_ana_actions ledger",
            beside the very buttons that write it. Advance/Move back PATCH
            /api/tasks/tasks/:taskId, and that handler writes `task.transition`
            on the transition's own transaction (auditTaskActionInTx) — with the
            §11.50 manifestation in the payload when the transition was signed —
            so a change whose ledger row fails is rolled back, not kept. Archive
            is audited as `task.delete`. Telling a regulated user their action is
            unaudited when it is audited is not a conservative error. */}
        <div className="tb-detail-sec">
          <div className="tb-detail-sec-h">Audit</div>
          <div className="tb-detail-note">{I.shieldCheck} Advancing, moving back or archiving this task is recorded in the Part 11 audit ledger with your identity, the from/to state and any reason you give.</div>
        </div>
        {confirmArchive && (
          <div className="tb-detail-note" role="group" aria-label="Archive this task">
            <div style={{ marginBottom: 6 }}>
              Archiving removes “{t.title}” from the board. There is no way to restore it from
              here, and the reason below is written to the Part 11 audit trail.
            </div>
            <div className="tb-field full">
              <label htmlFor="tb-archive-reason">Reason for archiving<i>*</i></label>
              <textarea
                id="tb-archive-reason"
                rows={2}
                autoFocus
                required
                aria-required="true"
                maxLength={ARCHIVE_REASON_MAX}
                aria-describedby={archiveReasonTooLong ? 'tb-archive-reason-len' : undefined}
                value={archiveReason}
                onChange={(e) => setArchiveReason(e.target.value)}
                placeholder="e.g. Superseded after the content-lock plan changed."
              />
            </div>
            {archiveReasonTooLong && (
              <div id="tb-archive-reason-len" className="tb-auto-note" data-warn="true"><span className="ico">{I.alertTriangle}</span><span>{archiveReasonTooLongText}</span></div>
            )}
            {archiveErr && <div className="tb-auto-note" data-warn="true" role="alert"><span className="ico">{I.alertTriangle}</span><span>{archiveErr}</span></div>}
          </div>
        )}
        <div className="tb-detail-f">
          <button className="btn ghost" onClick={() => { onAsk && onAsk('Draft a status update for the task "' + t.title + '"'); onClose(); }}>{I.sparkles} Ask AnA</button>
          {canWrite && confirmArchive && (
            <button className="btn ghost" onClick={() => { setConfirmArchive(false); setArchiveReason(''); setArchiveErr(''); }}>Cancel</button>
          )}
          {canWrite && (
            <button
              className="btn ghost"
              style={confirmArchive ? { color: 'var(--error)', borderColor: 'var(--error)' } : undefined}
              disabled={archiving || assignmentBlocked || (confirmArchive && !archiveReasonOk)}
              onClick={archive}
              title={confirmArchive && !archiveReasonOk ? (archiveReasonTooLong ? archiveReasonTooLongText : 'Give a reason to archive') : undefined}
              aria-label={confirmArchive ? `Confirm archiving "${t.title}"` : `Archive "${t.title}"`}
            >{archiving ? 'Archiving…' : confirmArchive ? 'Confirm archive' : 'Archive'}</button>
          )}
          {/* tb-grow, not `sp`: the page-level `.c2c-v2 .sp` (the specialty
              screens' scroll container, journey-v2.css) gave this spacer a
              height and padding and pushed Advance onto its own row. */}
          <span className="tb-grow" />
          {canWrite && !t.reviewRoute && (
            <>
              <button className="btn ghost" disabled={assignmentBlocked || t.status === 'pending'} onClick={() => { onMove(t, -1); onClose(); }}>Move back</button>
              <button className="btn primary" disabled={assignmentBlocked || t.status === 'completed'} onClick={() => { onMove(t, 1); onClose(); }}>{I.chevRight} Advance</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── New task intake -- unifiedTasks shape, POST /api/task-management/tasks ── */

/** POST body for the real create — mirrors server createTaskSchema. */
interface TaskCreateBody {
  title: string;
  description?: string;
  moduleType: string;
  taskType: string;
  status: string;
  priority: string;
  projectId?: number;
  assigneeId?: number;
  dueDate?: string;
  impactScore: number;
  criticalPath: boolean;
  regulatoryImpact: boolean;
  approvalRequired: boolean;
}
/** Real org project (from GET /api/projects — a bare row array). */
interface ProjectOpt {
  id: number; name: string; code?: string | null;
  /** projects.regulatory_program_id: the open project's UUID, when anchored. */
  regulatoryProgramId?: string | null;
}
/** Real assignable org member (from GET /api/task-management/assignees). */
interface AssigneeOpt { id: string; name: string; label?: string }

interface TaskCreateProps {
  onClose: () => void;
  onCreate: (payload: TaskCreateBody, dependsOn: string[]) => Promise<{ ok: boolean; error?: string }>;
  proj: string;
  /** Live board rows — the dependency picker's candidate tasks (real data from
   *  /api/task-management/board, not the retired TB_TASKS fixture). */
  tasks: TaskItem[];
}

interface CreateForm {
  title: string;
  project: string;
  moduleType: string;
  taskType: string;
  status: string;
  priority: string;
  assignee: string;
  impactScore: number;
  criticalPath: boolean;
  regulatoryImpact: boolean;
  approvalRequired: boolean;
  /** A date input's `yyyy-mm-dd`; '' for no due date. */
  due: string;
  description: string;
  phase: string;
  dependsOn: string[];
}

/* The statuses a task may be created in: the server's CREATABLE_TASK_STATUSES
   (server/services/tasking/task-state-machine.ts). The picker offered every
   board column, "Done" included, and the server refuses that with a 400: a task
   created complete would skip the signature its approval needs. */
const CREATABLE_STATUSES: readonly string[] = ['pending', 'in-progress', 'blocked', 'review'];

function TaskCreate({ onClose, onCreate, proj, tasks }: TaskCreateProps) {
  // Real org projects + assignable members for the pickers (never fixtures).
  const projects = useLiveRows<ProjectOpt>('/api/projects');
  const assignees = useLiveRows<AssigneeOpt>('/api/task-management/assignees');

  const [f, setF] = useState<CreateForm>({
    title: '', project: proj && proj !== 'all' ? proj : '', moduleType: 'Clinical', taskType: 'deliverable',
    status: 'pending', priority: 'high', assignee: 'auto', impactScore: 6,
    criticalPath: false, regulatoryImpact: true, approvalRequired: false,
    due: dateInputValue(7), description: '', phase: '', dependsOn: [],
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = <K extends keyof CreateForm>(k: K, v: CreateForm[K]) => setF(p => ({ ...p, [k]: v }));

  // Opens on the board's project, else on "Choose a project" — never the first row (it filed tasks there).
  useEffect(() => {
    if (!projects.rows.length || !f.project) return;
    if (!projects.rows.some((p) => String(p.id) === f.project)) set('project', '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects.rows]);

  const toggleDep = (id: string) => set('dependsOn', f.dependsOn.includes(id) ? f.dependsOn.filter(x => x !== id) : [...f.dependsOn, id]);

  // Build the real create body and hand it to the parent, which POSTs it and
  // links the selected predecessors. No fabricated id — the server assigns it.
  const doCreate = async () => {
    if (!f.title.trim() || busy) return;
    // With projects to choose from and none chosen, nothing is sent: it would be stored under none.
    if (projects.rows.length > 0 && !projects.rows.some((p) => String(p.id) === f.project)) { setErr('Choose the project this task belongs to.'); return; }
    setBusy(true); setErr('');
    const body: TaskCreateBody = {
      title: f.title.trim(),
      ...(f.description.trim() ? { description: f.description.trim() } : {}),
      moduleType: f.moduleType,
      taskType: f.taskType,
      status: f.status,
      priority: f.priority,
      projectId: Number.isFinite(Number(f.project)) && Number(f.project) > 0 ? Number(f.project) : undefined,
      assigneeId: f.assignee && f.assignee !== 'auto' && Number.isFinite(Number(f.assignee)) ? Number(f.assignee) : undefined,
      dueDate: dueDateIso(f.due),
      impactScore: f.impactScore,
      criticalPath: f.criticalPath,
      regulatoryImpact: f.regulatoryImpact,
      approvalRequired: f.approvalRequired,
    };
    const res = await onCreate(body, f.dependsOn);
    if (!res.ok) {
      setErr(res.error || 'Could not create the task.');
      setBusy(false);
    }
    // On success the parent closes the modal.
  };

  const dialogRef = useDialog(onClose);

  return (
    <div className="tb-detail-bd tb-create-bd" onClick={onClose}>
      <div className="tb-detail tb-create" role="dialog" aria-modal="true" aria-label="New task" tabIndex={-1} ref={dialogRef} onClick={e => e.stopPropagation()}>
        <div className="tb-detail-h">
          <div><h3>New task</h3></div>
          <button className="tb-detail-x" onClick={onClose} aria-label="Close">{I.close}</button>
        </div>
        <div className="tb-form">
          <div className="tb-field full"><label htmlFor="tb-title">Title<i>*</i></label><input id="tb-title" type="text" autoFocus value={f.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Reconcile 2.5.4 efficacy claim with CSR-201 dataset" /></div>
          <div className="tb-field full"><label htmlFor="tb-description">Description</label><textarea id="tb-description" rows={3} value={f.description} onChange={e => set('description', e.target.value)} placeholder="What needs to be done, and what done looks like." /></div>
          <div className="tb-frow">
            <div className="tb-field"><label htmlFor="tb-project">Project</label><select id="tb-project" value={f.project} onChange={e => set('project', e.target.value)}><option value="">{projectChoice(projects)}</option>{projects.rows.map(p => <option key={p.id} value={String(p.id)}>{p.name}</option>)}</select></div>
            <div className="tb-field"><label htmlFor="tb-module">Module</label><select id="tb-module" value={f.moduleType} onChange={e => set('moduleType', e.target.value)}>{Object.keys(TB_MOD).map(m => <option key={m} value={m}>{m}</option>)}</select></div>
          </div>
          <div className="tb-frow">
            <div className="tb-field"><label htmlFor="tb-task-type">Task type</label><select id="tb-task-type" value={f.taskType} onChange={e => set('taskType', e.target.value)}>{Object.keys(TB_TYPE).map(t => <option key={t} value={t}>{TB_TYPE[t]}</option>)}</select></div>
            {/* Exactly the server's accepted vocabulary. createTaskSchema
                (taskManagement.routes.ts) validates priority against
                z.enum(['low','medium','high','critical']), so the 'urgent'
                option this picker used to offer was a guaranteed HTTP 400: the
                task simply failed to create for anyone who chose it. */}
            <div className="tb-field"><label htmlFor="tb-priority">Priority</label><select id="tb-priority" value={f.priority} onChange={e => set('priority', e.target.value)}>{['low', 'medium', 'high', 'critical'].map(p => <option key={p} value={p}>{p}</option>)}</select></div>
          </div>
          <div className="tb-frow">
            <div className="tb-field"><label htmlFor="tb-status">Status</label><select id="tb-status" value={f.status} onChange={e => set('status', e.target.value)}>{TB_COLS.filter(c => CREATABLE_STATUSES.includes(c.id)).map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></div>
            <div className="tb-field"><label htmlFor="tb-assignee">Assignee</label><select id="tb-assignee" value={f.assignee} onChange={e => set('assignee', e.target.value)}><option value="auto">Auto — fewest open tasks</option>{assignees.rows.map(a => <option key={a.id} value={a.id}>{a.label ?? a.name}</option>)}</select></div>
          </div>
          <div className="tb-frow">
            <div className="tb-field"><label htmlFor="tb-impact-score-10">Impact score — {f.impactScore}/10</label><input id="tb-impact-score-10" type="range" min="0" max="10" value={f.impactScore} onChange={e => set('impactScore', +e.target.value)} /></div>
            <div className="tb-field"><label htmlFor="tb-due">Due date</label><input id="tb-due" type="date" min={dateInputValue(0)} value={f.due} onChange={e => set('due', e.target.value)} /></div>
          </div>
          <div className="tb-field full"><label>Flags</label>
            <div className="tb-toggles">
              <button type="button" className={`tb-tog${f.criticalPath ? ' on' : ''}`} onClick={() => set('criticalPath', !f.criticalPath)}><span className="ico">{I.zap}</span>Critical path</button>
              <button type="button" className={`tb-tog${f.regulatoryImpact ? ' on' : ''}`} onClick={() => set('regulatoryImpact', !f.regulatoryImpact)}><span className="ico">{I.shieldCheck}</span>Regulatory impact</button>
              <button type="button" className={`tb-tog${f.approvalRequired ? ' on' : ''}`} onClick={() => set('approvalRequired', !f.approvalRequired)}><span className="ico">{I.checkSquare}</span>Approval required</button>
            </div>
          </div>
          <div className="tb-field full"><label>Depends on <span style={{ color: 'var(--text-400)', fontWeight: 400 }}>— tasks in this project that must finish first</span></label>
            <div className="tb-dep-pick">
              {tasks.filter(t => t.project === f.project).slice(0, 6).map(t => (
                <button type="button" key={t.taskId} className={`tb-dep-opt${f.dependsOn.includes(t.taskId) ? ' on' : ''}`} onClick={() => toggleDep(t.taskId)} title={t.title}>
                  {f.dependsOn.includes(t.taskId) ? I.check : I.plus}<span>{t.title}</span>
                </button>
              ))}
            </div>
          </div>
          {f.assignee === 'auto' && <div className="tb-auto-note"><span className="ico">{I.sparkles}</span><span>Auto-assign gives this <b>{f.moduleType}</b> task to the member of your organization with the fewest open tasks.</span></div>}
          {err && <div className="tb-auto-note" data-warn="true" role="alert"><span className="ico">{I.alertTriangle}</span><span>{err}</span></div>}
        </div>
        <div className="tb-detail-f">
          <span className="tb-grow" />
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!f.title.trim() || busy} onClick={doCreate}>{I.plus} {busy ? 'Creating…' : 'Create task'}</button>
        </div>
      </div>
    </div>
  );
}

/* ── Workflow templates (taskTemplates) -- from-template instantiation ── */

interface WorkflowStartProps {
  proj: string;
  /** Captures this owner's matched bearer; a retired owner cannot start a follow-up write. */
  actorHeaders: () => Record<string, string> | null;
  onClose: () => void;
  /** Called with the COUNT the server actually created — the tasks themselves
   *  are already persisted, so the board reloads rather than being handed
   *  client-built rows. */
  /** `projectId` is the project the tasks were created in. `warning` names a
   *  follow-up step that did not happen (auto-assign), so the board can keep
   *  saying so after this dialog closes. */
  onInstantiate: (createdCount: number, projectId: string, warning?: string) => void;
}

/**
 * Workload-balanced auto-assign for the tasks a workflow just created. Resolves
 * to the sentence to show when the assignment did NOT happen, or happened for
 * only some of them, else undefined.
 */
async function autoAssignCreated(ids: string[], created: number, actorHeaders: WorkflowStartProps['actorHeaders']): Promise<string | undefined> {
  const headers = actorHeaders();
  if (!headers) return workflowActorChanged(created, false);
  const notAssigned = `${created} tasks were created but not assigned — assign them on the board.`;
  try {
    const res = await apiRequest('POST', '/api/tasks/tasks/auto-assign', { taskIds: ids }, headers);
    if (res.status === 401) return sessionExpired(notAssigned);
    if (!res.ok) return notAssigned;
    // A 200 is not "all assigned": the route leaves out a task nobody could
    // take, or one archived meanwhile, and answers with the count it made.
    const body = (await res.json().catch(() => null)) as { count?: unknown; data?: unknown } | null;
    const assigned = assignedTaskCount(body);
    if (assigned === null) {
      return `${created} tasks were created, but whether auto-assign assigned them could not be confirmed — check the board.`;
    }
    if (assigned >= ids.length) return undefined;
    const left = ids.length - assigned;
    return `${created} tasks were created; ${assigned} of ${ids.length} were assigned and ${left} ${left === 1 ? 'was' : 'were'} not assigned — assign ${left === 1 ? 'it' : 'them'} on the board.`;
  } catch (e) {
    const why = refusalText(e, 'the service could not be reached.');
    return `${created} tasks were created, but auto-assignment failed: ${why}`;
  }
}

/** A successful creation stays a fact even when its optional follow-up is refused. */
function workflowActorChanged(created: number, assignmentAttempted: boolean): string {
  const assignment = assignmentAttempted
    ? 'Check the original account’s task board to confirm whether automatic assignment completed.'
    : 'Automatic assignment was not attempted.';
  return `${created} tasks were created. ${assignment} Your signed-in account or organization changed; reopen the original account to check the recorded tasks.`;
}

function createdWorkflowTasks(data: unknown, fallback: number): { created: number; ids: string[] } {
  const tasks: unknown[] = Array.isArray(data) ? data : [];
  const ids = tasks.map(task => (task as { taskId?: string })?.taskId)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
  return { created: tasks.length || fallback, ids };
}

/** GET /api/task-management/templates render contract. */
interface WorkflowTemplate {
  templateId: string;
  name: string;
  description: string | null;
  category: string;
  isDefault: boolean;
  usageCount: number;
  taskCount: number;
  dependencyCount: number;
  spanDays: number;
  estimatedHours: number;
  tasks: Array<{ id: string; title: string; moduleType: string; priority: string; dayOffset: number; duration: number }>;
  tasksTruncated: boolean;
}

function WorkflowStart({ proj, onClose, onInstantiate, actorHeaders }: WorkflowStartProps) {
  /* Real org templates. The picker used to be populated from TB_WORKFLOWS, a
     fixture constant, and `instantiate` fabricated the entire task set in the
     browser: ids from 'C2C-TASK-' + Math.random(), assignees defaulting to the
     fixture identity 'jc', due dates as "in N days" strings, and nothing
     persisted — the tasks vanished on reload, and the footer said so
     ("not yet wired").

     The write half already existed and is thorough:
     POST /api/task-management/tasks/from-template/:templateId inserts real
     unified_tasks with server-generated ids, dates computed from each
     definition's dayOffset/duration, task_dependencies from the template,
     provenance (sourceEntityType 'taskTemplate') and createdById from the
     session. The only missing piece was a way to LIST templates, which is now
     GET /api/task-management/templates. */
  const templates = useLiveRows<WorkflowTemplate>('/api/task-management/templates');
  const projects = useLiveRows<ProjectOpt>('/api/projects');
  const initProj = (proj && proj !== 'all') ? proj : '';
  const [tid, setTid] = useState('');
  const [project, setProject] = useState(initProj);
  const [autoAssign, setAutoAssign] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Seed the selection once templates resolve; never clobber a later choice.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || !templates.rows.length) return;
    seeded.current = true;
    const preferred = templates.rows.find(t => t.isDefault) || templates.rows[0];
    setTid(preferred.templateId);
  }, [templates.rows]);

  const tpl = templates.rows.find(t => t.templateId === tid) || null;

  /**
   * Instantiate — POST /api/task-management/tasks/from-template/:templateId.
   *
   * `templateId` comes from the list route above, so it is by construction the
   * id this endpoint takes. `projectId` is the real projects.id already used by
   * the picker. Nothing is invented here: ids, dates and dependencies are all
   * the server's.
   */
  const instantiate = async () => {
    if (!tpl || busy) return;
    if (!project) { setErr('Choose a project — the tasks are created against it.'); return; }
    const headers = actorHeaders();
    if (!headers) { setErr('Your signed-in account or organization changed. Reopen the workflow; no workflow request was sent.'); return; }
    setBusy(true);
    setErr('');
    try {
      const res = await apiRequest(
        'POST',
        '/api/task-management/tasks/from-template/' + encodeURIComponent(tpl.templateId),
        {
          projectId: Number(project),
          startDate: new Date().toISOString(),
          adjustDates: true,
        },
        headers,
      );
      if (res.status === 401) { setErr(sessionExpired('No tasks were created.')); return; }
      const body = await res.json().catch(() => null);
      /* The route replies { success, data: <created tasks ARRAY>, count, template }.
         This used to read `data.tasks`, which is undefined on an array — so the
         count silently fell back to the template's advertised size and, worse,
         the auto-assign id list was always empty, meaning the toggle (ON by
         default) never actually assigned anything while the UI reported that it
         had. */
      const payload = body as { success?: boolean; data?: unknown; error?: string } | null;
      if (!res.ok || payload?.success !== true) {
        // `payload.error` was rendered verbatim, so a coded refusal reached the
        // modal as its token. serverMessage returns only a real sentence.
        setErr(serverMessage(payload) ?? 'Could not create the tasks (HTTP ' + res.status + ').');
        return;
      }
      const { created, ids } = createdWorkflowTasks(payload.data, tpl.taskCount);

      /* Auto-assign is a SEPARATE governed step; the instantiate route takes no
         assignee. It runs against the ids that were just created, and a failure
         here is reported without pretending the tasks were not created — they
         were. The report travels OUT with onInstantiate: it used to be set on
         this dialog's own error line and then the dialog closed, so it was
         never seen — and a 401 (returned, not thrown) was not caught at all. */
      // Recheck after both the creation request and its JSON read: another
      // account must never inherit the optional assignment of these task IDs.
      if (!actorHeaders()) { setErr(workflowActorChanged(created, false)); return; }
      const assignmentAttempted = autoAssign && ids.length > 0;
      const warning = assignmentAttempted ? await autoAssignCreated(ids, created, actorHeaders) : undefined;
      if (!actorHeaders()) { setErr(workflowActorChanged(created, assignmentAttempted)); return; }
      onInstantiate(created, project, warning);
    } catch (e) {
      // `e instanceof Error` also matched a browser-native fetch rejection, so a
      // dropped connection surfaced as "Failed to fetch" / "Load failed" in the
      // dialog. Only ApiRequestError carries a message that has been reduced to
      // user copy; everything else falls back to this surface's own sentence.
      setErr(refusalText(e, 'Could not reach the task service.'));
    } finally {
      setBusy(false);
    }
  };

  const dialogRef = useDialog(onClose);

  return (
    <div className="tb-detail-bd" onClick={onClose}>
      <div className="tb-detail tb-create" role="dialog" aria-modal="true" aria-label="Start workflow from template" tabIndex={-1} ref={dialogRef} onClick={e => e.stopPropagation()}>
        <div className="tb-detail-h">
          <div><h3>Start a workflow</h3></div>
          <button className="tb-detail-x" onClick={onClose} aria-label="Close">{I.close}</button>
        </div>

        {templates.loading ? (
          <div className="tb-form"><div role="status" className="scaf-note">Loading workflow templates…</div></div>
        ) : templates.error ? (
          <div className="tb-form">
            <EmptyState
              tone="error"
              icon={I.alertTriangle}
              title="Couldn't load workflow templates"
              hint={templates.error}
            />
          </div>
        ) : !templates.rows.length ? (
          <div className="tb-form">
            <EmptyState
              icon={I.layers}
              title="No workflow templates yet"
              hint="Workflow templates define a reusable set of dependency-linked, date-offset tasks. None are configured for this organization, so there is nothing to start from."
            />
          </div>
        ) : (
        <div className="tb-form">
          <div className="tb-frow">
            <div className="tb-field"><label htmlFor="tb-workflow-template">Workflow template</label><select id="tb-workflow-template" value={tid} onChange={e => setTid(e.target.value)}>{templates.rows.map(t => <option key={t.templateId} value={t.templateId}>{t.name}</option>)}</select></div>
            <div className="tb-field"><label htmlFor="tb-project-2">Project</label><select id="tb-project-2" value={project} onChange={e => setProject(e.target.value)}><option value="">{projectChoice(projects)}</option>{projects.rows.map(p => <option key={p.id} value={String(p.id)}>{p.name}</option>)}</select></div>
          </div>
          {tpl && (
            <>
              <div className="wf-meta">
                <span><b>{tpl.taskCount}</b> tasks</span><span className="tb-dot">·</span>
                <span><b>{tpl.spanDays}</b>-day span</span><span className="tb-dot">·</span>
                <span><b>{tpl.estimatedHours}</b>h effort</span><span className="tb-dot">·</span>
                <span><b>{tpl.dependencyCount}</b> dependencies</span>
              </div>
              {tpl.description && <div className="scaf-note" style={{ padding: '2px 0 6px' }}>{tpl.description}</div>}
              <div className="tb-field full"><label>Tasks this creates <span style={{ color: 'var(--text-400)', fontWeight: 400 }}>— in order, each dated from today</span></label>
                <div className="wf-tasks">
                  {tpl.tasks.map((t, i) => (
                    <div key={t.id || i} className="wf-task">
                      <span className="wf-task-n">{i + 1}</span>
                      <span className="tb-mod" style={{ '--m': TB_MOD[t.moduleType] || MODULE_COLOR_UNKNOWN } as React.CSSProperties}>{t.moduleType}</span>
                      <span className="wf-task-t">{t.title}</span>
                      <span className="wf-task-d">day {t.dayOffset + 1}, {t.duration} {t.duration === 1 ? 'day' : 'days'}</span>
                      <span className={`tb-pri pri-${t.priority}`}>{t.priority}</span>
                    </div>
                  ))}
                  {tpl.tasksTruncated && (
                    <div className="scaf-note">Showing the first {tpl.tasks.length} of {tpl.taskCount} tasks — all {tpl.taskCount} are created.</div>
                  )}
                </div>
              </div>
            </>
          )}
          <button type="button" className={`tb-tog${autoAssign ? ' on' : ''}`} aria-pressed={autoAssign} onClick={() => setAutoAssign(a => !a)}><span className="ico">{I.sparkles}</span>Auto-assign each task to the member with the fewest open tasks, once they are created</button>
          {err && <div className="scaf-note" role="alert" style={{ color: 'var(--error)' }}>{err}</div>}
        </div>
        )}

        <div className="tb-detail-f">
          <span className="tb-grow" />
          <button className="btn ghost" disabled={busy} onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!tpl || !project || busy} onClick={() => { void instantiate(); }}>
            {I.plus} {busy ? 'Creating…' : tpl ? 'Create ' + tpl.taskCount + ' tasks' : 'Create tasks'}
          </button>
        </div>
      </div>
    </div>
  );
}

async function loadTaskFilingHome(filingId: string, headers: Record<string, string>): Promise<TaskFilingHome> {
  const response = await apiRequest('GET', `/api/task-management/filings/${encodeURIComponent(filingId)}`, undefined, headers);
  if (!response.ok) throw new ApiRequestError('The tracked filing could not be opened.', response.status);
  const payload: unknown = await response.json();
  const envelope = payload && typeof payload === 'object' ? payload as Record<string, unknown> : null;
  if (envelope?.success !== true || !isTaskFilingHome(envelope.data, filingId)) {
    throw new Error('The tracked filing response did not identify this exact record.');
  }
  return envelope.data;
}
function filingHomeErrorText(error: unknown): string {
  const status = error instanceof ApiRequestError ? error.status : null;
  if (status === 401) return 'Your session expired. Sign in again before opening this tracked filing.';
  if (status === 403) return 'Your current access does not permit this tracked filing. The current project has not changed.';
  if (status === 404) return 'This tracked filing or its project is no longer available. The current project has not changed.';
  return 'This exact tracked filing could not be verified. Retry; the current project has not changed.';
}
function publishNativeTaskHome(t: TaskItem, projName: (id: string) => string | null): void {
  if (!t.home?.programId) return;
            publishShellProject({ id: t.home.programId, title: t.home.programTitle || (t.home.projectId != null ? projName(String(t.home.projectId)) : null) || 'Project' });
            stashNavParamsForTarget(t.home.surface, {
              stage: 'review', workId: t.taskId,
              workSource: t.home.source || t.source, workNativeId: t.home.nativeId || '',
            });
 }
function OtherStoreTaskFields({ t, project, status, src }: {
  t: TaskItem; project: string | null; status: string; src: typeof TB_SRC[keyof typeof TB_SRC];
}) { return (
        <div className="tb-detail-grid">
          <div><label>Project</label><span>{project ?? '—'}</span></div>
          <div><label>Status</label><span>{status}</span></div>
          <div><label>Due</label><span style={{ color: isOverdue(t) ? 'var(--error)' : 'inherit' }}>{t.due || '—'}</span></div>
          <div><label>Came from</label><span>{src.t}</span></div>
          {t.priority && <div><label>Priority</label><span>{t.priority}</span></div>}
          {t.detail && !t.blocked && <div><label>Note</label><span>{t.detail}</span></div>}
        </div>
 ); }
function assignedTaskCount(body: { count?: unknown; data?: unknown } | null): number | null {
  if (typeof body?.count === 'number') return body.count;
  return Array.isArray(body?.data) ? body.data.length : null;
}
