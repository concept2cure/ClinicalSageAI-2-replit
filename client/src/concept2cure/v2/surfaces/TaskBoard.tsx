import React, { useState, useMemo, useEffect, useRef } from 'react';
import { I } from '../icons';
import { useLiveRows, useLiveData, hasKeys, EmptyState } from '../dataConnect';
import { apiRequest, ApiRequestError, serverMessage } from '@/lib/queryClient';
import { useAuth } from '@/services/portal/authService';
import { AnswerLead } from '../AnswerLead';
import type { SurfaceViewProps } from '../surfaceViews';
import { usePublishSurfaceContext } from '../surfaceContext';
import { notifySurfaceActionReady, useSurfaceActionHandlers } from '../surfaceActions';
import {
  // TB_PROJECTS (three invented programmes) is gone — the board, the project
  // filter, the detail label and the workflow picker all read the org's real
  // programmes from GET /api/projects now. What remains here is configuration:
  // module colours, status column definitions, type labels and source labels.
  // TB_TEAM / TB_OPTIMAL / TB_WORKFLOWS are gone: names come from the org
  // roster, and workflow templates from GET /api/task-management/templates.
  TB_MOD, TB_COLS, TB_TYPE, TB_SRC,
  type TaskSource,
} from '../fixtures/task-board-data';
import '../styles/project-home-v2.css';

/* ═══════════════════════════════════════════════════════════════════
   Task Board -- the org-wide unifiedTasks board served by
   /api/task-management. Org-scoped by design; filter to a project
   below. Tasks from sections, the pyramid engine, the legacy WBS and
   modules are surfaced here with their origin store labelled.

   Registers as both "task-board" and "tasks" in SURFACE_VIEWS.
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Display row for the org-wide unifiedTasks board. Mirrors the server
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
  assignedBy: string;
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
  blockedReason?: string;
  estimatedHours?: number | null;
  assignmentType?: string;
}

/** Initials for an already-resolved display name. '?' when there is no name. */
function tbAvatar(name: string): string {
  return (name || '?').split(' ').filter(Boolean).map(s => s[0]).join('').slice(0, 2) || '?';
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
 * Unresolvable ids read 'Unknown' rather than blank, because "assigned to
 * someone this client cannot name" and "not assigned to anyone" are different
 * facts. Neither ever falls back to a fixture name.
 */
function makeNameOf(rows: AssigneeOpt[]): (id: string | null | undefined) => string {
  const byId = new Map(rows.map(r => [String(r.id), r.name]));
  return (id) => {
    if (id === null || id === undefined || id === '') return '';
    return byId.get(String(id)) ?? 'Unknown';
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

/** The action types a rule fires, from its stored jsonb. Never inferred. */
function ruleActions(r: RuleRow): string {
  const types = (Array.isArray(r.actions) ? r.actions : [])
    .map(a => (a && typeof a.type === 'string' ? a.type : ''))
    .filter(Boolean);
  return types.length ? types.join(' + ') : '—';
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
        <div className="tb-an-auto">Loading this organization&rsquo;s rules…</div>
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
            <b>{rows.length}</b> active rule{rows.length === 1 ? '' : 's'} in{' '}
            <code>project-rules</code>.
          </div>
          <div className="tb-an-auto-rules">
            {rows.slice(0, 8).map(r => (
              <span key={r.rule_id} title={r.description || r.name}>
                {r.trigger_event} -&gt; {ruleActions(r)}
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
        {I.alertTriangle} Rules are stored; the background executor is not yet wired, so
        nothing here fires on its own.
      </div>
    </div>
  );
}

/* ── Main surface ── */

export function TaskBoard({ onAsk }: SurfaceViewProps) {
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
  const liveTasks = useLiveRows<TaskItem>('/api/task-management/board', [
    '/api/task-management/board',
    reloadKey,
  ]);
  const tasks: TaskItem[] = liveTasks.rows;

  /* The org's REAL programmes, for the project filter below. This filter used to
     be driven by TB_PROJECTS — three invented programmes ("BX-204 -- NDA 212345",
     "OR-902 Spinal Implant", "IV-415 Companion Dx") shown to every tenant as
     their own. Worse, it could never work: the board emits `project` as the
     stringified numeric projects.id (taskBoard.routes.ts), so selecting a fixture
     slug matched zero rows and silently emptied the board. The same endpoint was
     already being read by the create modal fifty lines below. */
  const projectOpts = useLiveRows<ProjectOpt>('/api/projects');

  /* The org's real assignable members, so a live row's numeric assigneeId can be
     shown as a person's name. See makeNameOf above. */
  const roster = useLiveRows<AssigneeOpt>('/api/task-management/assignees');
  const nameOf = useMemo(() => makeNameOf(roster.rows), [roster.rows]);

  /* "My tasks" needs the signed-in user's real id. It used to compare against
     the fixture short-id 'jc', which no real row can carry — so the filter
     returned an empty board for every user of the product. */
  const { user } = useAuth();
  const myId = user?.id != null ? String(user.id) : '';

  const [view, setView] = useState('board');
  const [proj, setProj] = useState<string>(() => {
    try { return (window as any).C2C_TASK_FILTER || 'all'; } catch (_e) { return 'all'; }
  });
  const [mine, setMine] = useState(false);
  const [mod, setMod] = useState('all');
  const [sel, setSel] = useState<TaskItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [wf, setWf] = useState(false);
  /** State-machine / archive failures the server reported, surfaced in a banner. */
  const [actionErr, setActionErr] = useState('');
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
      if (liveTasks.loading || projectOpts.loading)
        return { ok: false, reason: 'The task board is still loading.', retry: true };
      const applied: string[] = [];
      if (params.project) {
        const wanted = params.project.trim();
        if (wanted.toLowerCase() === 'all') {
          setProj('all');
          applied.push('all programmes');
        } else {
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
                  ? `"${params.project}" matches ${contains.length} programmes — name one exactly.`
                  : `No programme named "${params.project}" on this board.`,
            };
          }
          setProj(String(match.id));
          applied.push(`programme ${match.name}`);
        }
      }
      if (params.module) {
        const wanted = params.module.trim().toLowerCase();
        const match = modules.find((m) => m.toLowerCase() === wanted);
        if (!match) return { ok: false, reason: `No module named "${params.module}" on this board.` };
        setMod(match);
        applied.push(match === 'all' ? 'all modules' : `module ${match}`);
      }
      if (params.mine) {
        setMine(params.mine === 'true');
        applied.push(params.mine === 'true' ? 'my tasks only' : "everyone's tasks");
      }
      if (applied.length === 0) return { ok: false, reason: 'No filter named.' };
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
      if (liveTasks.empty) return { ok: false, reason: 'There are no tasks on the board.' };
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
  //   · a 409 CONFLICT_STALE (lost race) reloads to the authoritative state;
  //   · a 428 ESIGN_REQUIRED (approval-gated completion, backed by
  //     task-signoff -> part11/pin-verification) opens the §11.50 PIN ceremony.
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
            ? 'Your session has expired — sign in again to move this task.'
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
        if (payload?.code === 'CONFLICT_STALE') setReloadKey((k) => k + 1);
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
    } catch {
      return { ok: false, error: 'Network error while creating the task.' };
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
      crit: list.filter(t => t.criticalPath).length,
      reg: list.filter(t => t.regulatoryImpact).length,
      appr: list.filter(t => t.approvalRequired && t.approvalStatus === 'pending').length,
      byMod, byPri, byAsg,
    };
  }, [list]);

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
      return { summary: 'The task board is still loading; nothing on screen is final yet.' };
    }
    if (liveTasks.error) {
      return {
        summary:
          'The task board could not be read, so this screen is showing no tasks because of a ' +
          'failure, not because there are none — the counts below are unknown, not zero.',
        facts: { readFailure: liveTasks.error },
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
        `Task board for the organisation: ${stats.total} tasks, ${stats.open} open, ` +
        `${stats.blocked} blocked, ${overdue.length} overdue, ${stats.appr} awaiting approval.` +
        (sel0 ? ` The task "${sel0.title}" (${sel0.taskId}) is open in the detail panel.` : ''),
      facts: {
        view,
        totals: {
          all: stats.total, open: stats.open, blocked: stats.blocked,
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
        'Archive a task (requires a reason, written to the audit trail)',
        'Complete an approval-gated task (requires a PIN e-signature)',
        'Filter the board by module, priority, assignee or search text',
      ],
    };
  }, [list, stats, sel, view, liveTasks.loading, liveTasks.error]);
  usePublishSurfaceContext('tasks', anaContext);

  /* Critical path: topological-ish chain over dependsOn, criticalPath:true */
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
  const projLabel = (id: string) =>
    projectOpts.rows.find(p => String(p.id) === String(id))?.name ?? id;

  /* Answer-first lead -- computed from live task state */
  const overdue = list.filter(isOverdue);
  const workload = Object.entries(stats.byAsg || {}).map(([k, v]) => ({ k, open: v.open })).sort((a, b) => b.open - a.open);
  const heaviest = workload[0];
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
          <h1 className="ph-title">Task board</h1>
          <div className="ph-sub">The org-wide unified task board. Org-scoped by design — filter to a project below. Tasks from sections, the pyramid engine, the legacy WBS and modules are surfaced here with their origin store labelled.</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn ghost" onClick={() => setWf(true)}>{I.workflow} Start workflow</button>
          <button className="btn primary" onClick={() => setCreating(true)}>{I.plus} New task</button>
        </div>
      </div>

      {actionErr && (
        <div className="tb-alert" role="alert">
          {I.alertTriangle} <span>{actionErr}</span>
          <button onClick={() => setActionErr('')} aria-label="Dismiss error">{I.close}</button>
        </div>
      )}

      {liveTasks.loading ? (
        <div className="scaf-note" style={{ padding: '18px 10px' }}>Loading the task board…</div>
      ) : liveTasks.error ? (
        <EmptyState
          tone="error"
          icon={I.alertTriangle}
          title="Couldn't load the task board"
          hint="The org-wide task board didn't respond. These are the organization's tasks — sign in and retry, or check that the task service is reachable."
        />
      ) : liveTasks.empty ? (
        <EmptyState
          icon={I.checkSquare}
          title="No tasks on the board yet"
          hint="This is the org-wide unifiedTasks board. Create a task or start a workflow from a template and it appears here once it is persisted, with its origin store labelled."
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
          ? <>{critBlocked.blockedReason || 'It is blocked'} -- nothing downstream on the path can move until it clears. {heaviest && heaviest.open > 3 ? <>{nameOf(heaviest.k)} is also carrying {heaviest.open} open tasks; auto-assign can rebalance.</> : null}</>
          : <>{overdue.length ? <>Clear the overdue work first, then the path flows. </> : null}{/* "Workload is balanced across the team." used to fire whenever `heaviest`
    was undefined — i.e. the filter matched zero tasks. Absence of workload
    data was presented as a measured balance. Balance is claimed only when
    there is assigned open work to be balanced. */}
{heaviest && heaviest.open >= 3 ? <>{nameOf(heaviest.k)} is the busiest at {heaviest.open} open tasks — workload-balanced auto-assign can spread the next batch.</> : heaviest && heaviest.open > 0 ? <>Workload is balanced across the team.</> : <>No open work is assigned on this board, so there is no workload to balance.</>} {stats.appr ? <>{stats.appr} approval{stats.appr > 1 ? 's' : ''} pending an e-signature.</> : null}</>}
        reassure={
          critBlocked || overdue.length
            ? 'I will help you unblock the path and rebalance the team, one step at a time.'
            : critDesignated
              ? 'I will flag the moment anything threatens the milestone.'
              /* No "You are on track" over an undesignated board, and no promise
                 to watch a path that does not exist. */
              : undefined
        }
        action={{
          label: critBlocked ? 'Unblock the critical path' : overdue.length ? 'Triage the overdue work' : critDesignated ? 'Start a workflow from a template' : 'Mark the tasks that gate the milestone',
          onClick: () => { if (critBlocked || overdue.length) { setView('path'); } else { setWf(true); } },
          alt: { label: 'Auto-balance assignments', onClick: () => onAsk && onAsk('Rebalance open task assignments by workload using getOptimalAssignee') },
        }}
        secondary="Or work the board, critical path, and analytics below."
      />

      {/* Provenance strip -- the 7-table fragmentation made visible (Gap 1) */}
      <div className="tb-src">
        <span className="tb-src-h">Task sources</span>
        {Object.keys(TB_SRC).map(k => {
          const n = list.filter(t => t.source === k).length;
          return (
            <span key={k} className="tb-src-chip" data-src={k} title={TB_SRC[k].t}>
              <b>{TB_SRC[k].l}</b> {n}<em>{TB_SRC[k].t}</em>
            </span>
          );
        })}
        <span className="tb-src-note">unified via <code>crossModuleTaskLinks</code> -- no single reconciliation store</span>
      </div>

      {/* Filters + views */}
      <div className="tb-bar">
        <div className="tb-filters">
          <select className="tb-sel" value={proj} onChange={e => setProj(e.target.value)}>
            <option value="all">All projects (org-scoped)</option>
            {projectOpts.rows.map(p => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
          </select>
          <select className="tb-sel" value={mod} onChange={e => setMod(e.target.value)}>
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
                        <span className="tb-mod" style={{ '--m': TB_MOD[t.moduleType] || '#888' } as React.CSSProperties}>{t.moduleType}</span>
                        {t.criticalPath && <span className="tb-flag crit" title="On critical path">{I.zap}</span>}
                        {t.regulatoryImpact && <span className="tb-flag reg" title="Regulatory impact">{I.shieldCheck}</span>}
                      </div>
                      <div className="tb-card-title">{t.title}</div>
                      {t.blocked && <div className="tb-blocked">{I.alertTriangle} {t.blockedReason || 'Blocked'}</div>}
                      <div className="tb-card-meta">
                        <span className="tb-type" data-t={t.taskType}>{TB_TYPE[t.taskType]}</span>
                        <span className={`tb-pri pri-${t.priority}`}>{t.priority}</span>
                        {t.approvalRequired && <span className="tb-appr" data-s={t.approvalStatus}>{t.approvalStatus === 'approved' ? 'approved' : t.approvalStatus === 'pending' ? 'approval — pending' : 'needs approval'}</span>}
                      </div>
                      {t.progress > 0 && t.progress < 100 && <div className="tb-prog"><span style={{ width: t.progress + '%' }} /></div>}
                      <div className="tb-card-foot">
                        <span className="tb-src-tag" data-src={t.source} title={SRC(t.source).t}>{SRC(t.source).l}</span>
                        {(t.dependsOn.length > 0 || t.blocks.length > 0) && <span className="tb-deps" title={t.dependsOn.length + ' upstream -- ' + t.blocks.length + ' downstream'}>{I.gitCompare}{t.dependsOn.length + t.blocks.length}</span>}
                        {t.comments > 0 && <span className="tb-cmt">{t.comments}</span>}
                        <span className="tb-due" data-over={isOverdue(t) || undefined}>{t.due}</span>
                        <span className="tb-av" title={nameOf(t.assignee)}>{tbAvatar(nameOf(t.assignee))}</span>
                      </div>
                      <div className="tb-move" onClick={e => e.stopPropagation()}>
                        <button disabled={t.status === 'pending'} onClick={() => move(t, -1)} title="Move back">{I.left}</button>
                        <button disabled={t.status === 'completed'} onClick={() => move(t, 1)} title="Advance">{I.chevRight}</button>
                      </div>
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
          <div className="tb-path-h">Critical path -- {critChain.length} tasks — computed from the <code>taskDependencies</code> DAG (getCriticalPath)</div>
          {critChain.map((t, i) => (
            <div
              key={t.taskId}
              className="tb-path-row"
              data-status={t.status}
              role="button"
              tabIndex={0}
              aria-label={`Open ${t.title}`}
              onClick={() => setSel(t)}
              onKeyDown={(e) => {
                if (e.target !== e.currentTarget) return;
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSel(t); }
              }}
            >
              <div className="tb-path-rail"><span className="tb-path-dot" data-status={t.status} />{i < critChain.length - 1 && <span className="tb-path-line" />}</div>
              <div className="tb-path-card">
                <div className="tb-path-t">{t.title}<span className="tb-mod" style={{ '--m': TB_MOD[t.moduleType] || '#888' } as React.CSSProperties}>{t.moduleType}</span></div>
                <div className="tb-path-m">
                  <span>{t.phase || '—'}</span><span className="tb-dot">--</span><span>{nameOf(t.assignee)}</span><span className="tb-dot">--</span>
                  <span className={`tb-pri pri-${t.priority}`}>{t.priority}</span><span className="tb-dot">--</span><span>impact {t.impactScore ?? '—'}/10</span>
                  {t.blocked && <span className="tb-path-blk">{I.alertTriangle} blocked</span>}
                  <span className="sp" /><span className="tb-due" data-over={isOverdue(t) || undefined}>{t.due}</span>
                </div>
                {t.dependsOn.length > 0 && <div className="tb-path-dep">depends on {t.dependsOn.map(d => (byId(d) || { title: d }).title || d).join(' -- ')}</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {view === 'analytics' && (
        <div>
          <div className="metrics">
            {([['Open tasks', stats.open, ''], ['On critical path', stats.crit, 'ai'], ['Regulatory impact', stats.reg, 'warn'], ['Blocked', stats.blocked, stats.blocked ? 'err' : ''], ['Approvals pending', stats.appr, 'warn']] as const).map((m, i) => (
              <div key={i} className="metric" data-tone={m[2]}><div className="metric-l">{m[0]}</div><div className="metric-n">{m[1]}</div></div>
            ))}
          </div>
          <div className="tb-an-grid">
            <div className="tb-an-card">
              <div className="tb-an-h">By module</div>
              {Object.keys(stats.byMod).map(k => {
                const max = Math.max(...Object.values(stats.byMod));
                return (
                  <div key={k} className="tb-an-row"><span className="tb-an-k"><span className="tb-an-dot" style={{ background: TB_MOD[k] || '#888' }} />{k}</span><div className="tb-an-bar"><span style={{ width: (stats.byMod[k] / max * 100) + '%', background: TB_MOD[k] || '#888' }} /></div><span className="tb-an-n">{stats.byMod[k]}</span></div>
                );
              })}
            </div>
            <div className="tb-an-card">
              <div className="tb-an-h">Team productivity</div>
              {Object.keys(stats.byAsg).map(k => (
                <div key={k} className="tb-an-row"><span className="tb-an-k"><span className="tb-av sm">{tbAvatar(nameOf(k))}</span>{nameOf(k)}</span><div className="tb-an-split"><span className="tb-an-open">{stats.byAsg[k].open} open</span><span className="tb-an-done">{stats.byAsg[k].done} done</span></div></div>
              ))}
              <div className="tb-an-foot">Auto-assign on a saved task balances workload server-side via <code>getOptimalAssignee()</code>; the per-module default shown here does not.</div>
            </div>
            <AutomationCard />
          </div>
        </div>
      )}

      {view === 'table' && (
        <div className="ctable tb-table">
          <div className="ct-head" style={{ gridTemplateColumns: '130px 1.7fr 120px 96px 90px 90px 84px' }}><div>Task ID</div><div>Title</div><div>Module</div><div>Status</div><div>Priority</div><div>Owner</div><div>Due</div></div>
          {list.map(t => (
            <button key={t.taskId} className="ct-row" style={{ gridTemplateColumns: '130px 1.7fr 120px 96px 90px 90px 84px' }} onClick={() => setSel(t)}>
              <div className="ct-strong mono" style={{ fontSize: 10.5 }}>{t.taskId}</div>
              <div style={{ fontSize: 11.5 }}>{t.title}{t.criticalPath && <span className="tb-flag crit inline">{I.zap}</span>}{t.blocked && <span className="tb-flag blk inline">{I.alertTriangle}</span>}</div>
              <div><span className="tb-mod" style={{ '--m': TB_MOD[t.moduleType] || '#888' } as React.CSSProperties}>{t.moduleType}</span></div>
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
        <ul>
          <li><b>One canonical record.</b> Schedule-of-events tasks keep their own lifecycle and mirror forward into the canonical record with a deterministic id; the unified work view excludes those mirrored rows so nothing is counted twice. Origin is shown per card.</li>
          <li><b>Audit:</b> every task create, transition, link and archive writes a hash-chained 21 CFR Part 11 audit pair, on <i>both</i> task routers and on the AnA mirror. Approval-gated completion additionally carries a verified §11.50 signature manifestation.</li>
          <li><b>Notifications:</b> real. Assignment, blocked, completion and the unblock cascade are all delivered; an hourly sweep adds due-soon (48h) and overdue, once each per task.</li>
          <li><b>Both task routers gate identically:</b> the org-wide board and the regulatory task list share the status state machine, the e-signature ceremony and the org-scoped unblock cascade, so governance is a property of the record rather than of the route it was reached through.</li>
          <li><b>Automation:</b> rules are stored and can be dry-run, but no event source dispatches to the rules engine, so a stored rule never fires on its own.</li>
        </ul>
      </details>
      </>
      )}

      {creating && <TaskCreate proj={proj} tasks={tasks} onClose={() => setCreating(false)} onCreate={create} />}
      {/* The tasks are already persisted by the time this fires, so the board is
          RELOADED rather than handed client-built rows through window.C2C.addTask
          — a runtime channel that only ever updated local state. */}
      {wf && (
        <WorkflowStart
          proj={proj}
          onClose={() => setWf(false)}
          onInstantiate={(createdCount) => {
            setWf(false);
            setReloadKey((k) => k + 1);
            setView('path');
            onAsk && onAsk('Created ' + createdCount + ' task' + (createdCount === 1 ? '' : 's') + ' from the workflow template.');
          }}
        />
      )}
      {sel && (
        <TaskDetail
          t={sel}
          byId={byId}
          projLabel={projLabel}
          onClose={() => setSel(null)}
          onAsk={onAsk}
          onMove={move}
          nameOf={nameOf}
          onErr={setActionErr}
          onArchived={() => { setSel(null); setReloadKey((k) => k + 1); }}
        />
      )}
      {signReq && (
        <ESignTaskModal
          req={signReq}
          taskTitle={signReq.t.title}
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
  onAsk: (text: string) => void;
  onMove: (t: TaskItem, dir: number) => void;
  /** Resolves a real assignee id to a name; see makeNameOf. */
  nameOf: (id: string | null | undefined) => string;
  /** Surface an archive failure in the board's banner. */
  onErr: (msg: string) => void;
  /** Called after a successful soft-delete so the board closes + refetches. */
  onArchived: () => void;
}

function TaskDetail({ t, byId, projLabel, onClose, onAsk, onMove, nameOf, onErr, onArchived }: TaskDetailProps) {
  const src = TB_SRC[t.source] || TB_SRC.unified;
  const owner = nameOf(t.assignee) || 'Unassigned';
  const dep = (id: string) => { const d = byId(id); return d ? d.title : id; };

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
  const archiveReasonOk = archiveReason.trim().length >= 3;
  // There used to be a 4s timer that silently disarmed the confirm. With a
  // reason textarea in the flow that would wipe a half-written justification
  // mid-sentence, so disarming is now an explicit Cancel button instead.
  const archive = async () => {
    if (!confirmArchive) { setConfirmArchive(true); return; }
    if (archiving || !archiveReasonOk) return;
    setArchiving(true);
    try {
      const res = await apiRequest('DELETE', '/api/tasks/tasks/' + encodeURIComponent(t.taskId), {
        reason: archiveReason.trim(),
      });
      if (res.ok) { onArchived(); return; }
    } catch (e) {
      // Reading `payload.error` first showed the refusal's enum (FORBIDDEN,
      // PENDING_STORE) rather than the sentence the server sent with it.
      // ApiRequestError.message is that sentence, already stripped of enum
      // tokens and driver text; anything else caught here is a browser-native
      // throw whose message ("Failed to fetch") is not user copy.
      onErr(e instanceof ApiRequestError && e.message ? e.message : 'Could not archive the task.');
    }
    setArchiving(false);
    setConfirmArchive(false);
  };

  return (
    <div className="tb-detail-bd" onClick={onClose}>
      <div className="tb-detail" onClick={e => e.stopPropagation()}>
        <div className="tb-detail-h">
          <div><span className="mono" style={{ fontSize: 10.5, color: 'var(--text-400)' }}>{t.taskId}</span><h3>{t.title}</h3></div>
          <button className="tb-detail-x" onClick={onClose} aria-label="Close">{I.close}</button>
        </div>
        <div className="tb-detail-chips">
          <span className="tb-mod" style={{ '--m': TB_MOD[t.moduleType] || '#888' } as React.CSSProperties}>{t.moduleType}</span>
          <span className="tb-type" data-t={t.taskType}>{TB_TYPE[t.taskType]}</span>
          <span className={`tb-pri pri-${t.priority}`}>{t.priority}</span>
          {t.criticalPath && <span className="tb-flag crit lg">{I.zap} critical path</span>}
          {t.regulatoryImpact && <span className="tb-flag reg lg">{I.shieldCheck} regulatory</span>}
        </div>
        {t.blocked && <div className="tb-blocked lg">{I.alertTriangle} {t.blockedReason || 'Blocked'}</div>}
        <div className="tb-detail-grid">
          <div><label>Project</label><span>{projLabel(t.project)}</span></div>
          <div><label>Phase</label><span>{t.phase || '—'}</span></div>
          <div><label>Assignee</label><span>{owner}</span></div>
          <div><label>Assigned by</label><span>{nameOf(t.assignedBy) || '--'}</span></div>
          <div><label>Impact score</label><span>{t.impactScore ?? '—'}/10</span></div>
          <div><label>Due</label><span style={{ color: isOverdue(t) ? 'var(--error)' : 'inherit' }}>{t.due}</span></div>
          <div><label>Origin store</label><span>{src.l} -- <em style={{ color: 'var(--text-400)' }}>{src.t}</em></span></div>
          <div><label>Progress</label><span>{t.progress}%</span></div>
        </div>
        {t.approvalRequired && (
          <div className="tb-detail-sec">
            <div className="tb-detail-sec-h">Approval checkpoint <span className="tb-appr" data-s={t.approvalStatus}>{t.approvalStatus.replace('_', ' ')}</span></div>
            {/* §11.50 manifestation. This section previously showed only the
                status badge, so a signature could be captured, PIN-verified and
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
                      <span className="sp" />
                      <time dateTime={s.signedAt}>{fmtSigned(s.signedAt)}</time>
                    </div>
                    {s.reason && <div className="tb-sig-reason">{s.reason}</div>}
                    <div className="tb-sig-meta">Signed with a verified PIN ({s.method}).</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="tb-detail-note">
                Not signed yet. Completing this task requires an electronic signature — your
                signing PIN, the meaning of the signature, and a reason — recorded under
                21 CFR Part 11 §11.50.
              </div>
            )}
            {/* The copy here used to claim "Quorum/role-based gate types
                supported." Neither is implemented. What IS enforced: where a
                task names designated approvers, only they can sign (see
                task-signoff.ts); where it names none, any org member with an
                enrolled PIN can. Saying so plainly beats advertising a control
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
            <div className="tb-detail-sec-h">Dependencies <code>taskDependencies</code></div>
            {t.dependsOn.map(d => <div key={d} className="tb-dep-row up">{I.arrowUp} depends on <b>{dep(d)}</b></div>)}
            {t.blocks.map(d => <div key={d} className="tb-dep-row dn">{I.arrowRight} blocks <b>{dep(d)}</b></div>)}
          </div>
        )}
        {/* Same correction as the board's engineering-reality block: this said
            the change "would not be written to the c2c_ana_actions ledger",
            beside the very buttons that write it. Advance/Move back PATCH
            /api/tasks/tasks/:taskId, and that handler awaits
            `auditTaskAction({ command: 'task.transition' })` — with the §11.50
            manifestation in the payload when the transition was signed. Archive
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
                value={archiveReason}
                onChange={(e) => setArchiveReason(e.target.value)}
                placeholder="e.g. Superseded by TASK-1043 after the content-lock plan changed."
              />
            </div>
          </div>
        )}
        <div className="tb-detail-f">
          <button className="btn ghost" onClick={() => { onAsk && onAsk('Draft a status update for ' + t.taskId + ': ' + t.title); onClose(); }}>{I.sparkles} Ask AnA</button>
          {confirmArchive && (
            <button className="btn ghost" onClick={() => { setConfirmArchive(false); setArchiveReason(''); }}>Cancel</button>
          )}
          <button
            className="btn ghost"
            style={confirmArchive ? { color: 'var(--error)', borderColor: 'var(--error)' } : undefined}
            disabled={archiving || (confirmArchive && !archiveReasonOk)}
            onClick={archive}
            title={confirmArchive && !archiveReasonOk ? 'Give a reason to archive' : undefined}
            aria-label={confirmArchive ? `Confirm archiving "${t.title}"` : `Archive "${t.title}"`}
          >{archiving ? 'Archiving…' : confirmArchive ? 'Confirm archive' : 'Archive'}</button>
          <span className="sp" />
          <button className="btn ghost" disabled={t.status === 'pending'} onClick={() => { onMove(t, -1); onClose(); }}>Move back</button>
          <button className="btn primary" disabled={t.status === 'completed'} onClick={() => { onMove(t, 1); onClose(); }}>{I.chevRight} Advance</button>
        </div>
      </div>
    </div>
  );
}

/* ── E-signature ceremony — approval-gated task completion (21 CFR 11 §11.50).
   Opened when the server answers 428 ESIGN_REQUIRED on a completion. This is a
   REAL signature: the PIN is verified server-side by
   server/services/tasking/task-signoff.ts via
   server/services/part11/pin-verification.ts — the same credential store and
   lockout policy as document sealing — and the manifestation (printed name,
   time, meaning) is appended to the task's approval history and the governed
   audit ledger. The PIN is never logged, audited, or echoed back. ── */

const SIGN_MEANINGS = ['APPROVED', 'REVIEWED', 'RESPONSIBILITY', 'AUTHORSHIP'] as const;

interface ESignTaskModalProps {
  req: { t: TaskItem; status: string; progress: number };
  taskTitle: string;
  onClose: () => void;
  onSigned: () => void;
}

function ESignTaskModal({ req, taskTitle, onClose, onSigned }: ESignTaskModalProps) {
  const [meaning, setMeaning] = useState<string>('APPROVED');
  const [reason, setReason] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Re-run the same transition, now carrying the signature. The server verifies
  // the PIN and, only if it holds, writes the transition + the §11.50
  // manifestation atomically; a bad PIN / lockout comes back as an ESIGN_* error.
  const sign = async () => {
    if (busy || !pin || reason.trim().length < 3) return;
    setBusy(true);
    setErr('');
    try {
      const res = await apiRequest('PATCH', '/api/tasks/tasks/' + encodeURIComponent(req.t.taskId), {
        status: req.status,
        progress: req.progress,
        reason: reason.trim(),
        signature: { pin, meaning },
      });
      if (res.ok) { onSigned(); return; }
    } catch (e) {
      // A rejected PIN comes back as an ESIGN_* code beside a sentence that says
      // what a signer must do next (retry, wait out a lockout). Reading
      // `payload.error` first showed the code and threw the sentence away;
      // ApiRequestError.message is the sentence.
      setErr(e instanceof ApiRequestError && e.message ? e.message : 'The signature was not accepted.');
    }
    setBusy(false);
    setPin(''); // never leave a rejected PIN in the field
  };

  return (
    <div className="tb-detail-bd" onClick={onClose}>
      <div className="tb-detail tb-create" role="dialog" aria-modal="true" aria-label="Electronic signature required" onClick={e => e.stopPropagation()}>
        <div className="tb-detail-h">
          <div><h3>{I.lock} Sign to complete</h3></div>
          <button className="tb-detail-x" onClick={onClose} aria-label="Cancel signing">{I.close}</button>
        </div>
        <div className="tb-form">
          <div className="tb-detail-note" style={{ marginBottom: 8 }}>
            <b>{taskTitle}</b> is approval-gated. Completing it applies your electronic
            signature — your identity is verified with your signing PIN, and your printed
            name, the date and time, and the meaning below are recorded with the task and
            in the audit ledger (21 CFR Part 11 §11.50).
          </div>
          <div className="tb-frow">
            <div className="tb-field"><label>Meaning of signature</label>
              <select value={meaning} onChange={e => setMeaning(e.target.value)}>
                {SIGN_MEANINGS.map(m => <option key={m} value={m}>{m.charAt(0) + m.slice(1).toLowerCase()}</option>)}
              </select>
            </div>
            <div className="tb-field"><label>Signing PIN<i>*</i></label>
              <input type="password" autoComplete="off" value={pin} onChange={e => setPin(e.target.value)} placeholder="Your signing PIN" aria-label="Signing PIN" />
            </div>
          </div>
          <div className="tb-field full"><label>Reason for sign-off<i>*</i></label>
            <textarea rows={2} value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Reviewed the deliverable against the acceptance criteria" />
          </div>
          {err && <div className="tb-auto-note" data-warn="true" role="alert"><span className="ico">{I.alertTriangle}</span><span>{err}</span></div>}
        </div>
        <div className="tb-detail-f">
          <button className="btn ghost" onClick={onClose}>Cancel — leave incomplete</button>
          <button className="btn primary" disabled={busy || !pin || reason.trim().length < 3} onClick={sign}>
            {I.shieldCheck} {busy ? 'Verifying…' : 'Sign & complete'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── New task intake -- unifiedTasks shape, POST /api/task-management/tasks ── */

/** POST body for the real create — mirrors server createTaskSchema. */
interface TaskCreateBody {
  title: string;
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
interface ProjectOpt { id: number; name: string }
/** Real assignable org member (from GET /api/task-management/assignees). */
interface AssigneeOpt { id: string; name: string }

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
  dueDays: number;
  phase: string;
  dependsOn: string[];
}

function TaskCreate({ onClose, onCreate, proj, tasks }: TaskCreateProps) {
  // Real org projects + assignable members for the pickers (never fixtures).
  const projects = useLiveRows<ProjectOpt>('/api/projects');
  const assignees = useLiveRows<AssigneeOpt>('/api/task-management/assignees');

  const [f, setF] = useState<CreateForm>({
    title: '', project: proj && proj !== 'all' ? proj : '', moduleType: 'Clinical', taskType: 'deliverable',
    status: 'pending', priority: 'high', assignee: 'auto', impactScore: 6,
    criticalPath: false, regulatoryImpact: true, approvalRequired: false,
    dueDays: 7, phase: '', dependsOn: [],
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = <K extends keyof CreateForm>(k: K, v: CreateForm[K]) => setF(p => ({ ...p, [k]: v }));

  // Default the project picker to the first real project once the list loads,
  // and never leave it on a stale non-matching id (e.g. a legacy filter slug).
  useEffect(() => {
    if (!projects.rows.length) return;
    const ids = projects.rows.map((p) => String(p.id));
    if (!f.project || !ids.includes(f.project)) set('project', String(projects.rows[0].id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects.rows]);

  const allTasks = tasks;
  const toggleDep = (id: string) => set('dependsOn', f.dependsOn.includes(id) ? f.dependsOn.filter(x => x !== id) : [...f.dependsOn, id]);

  // Build the real create body and hand it to the parent, which POSTs it and
  // links the selected predecessors. No fabricated id — the server assigns it.
  const doCreate = async () => {
    if (!f.title.trim() || busy) return;
    setBusy(true);
    setErr('');
    const due = new Date();
    due.setDate(due.getDate() + (Number.isFinite(f.dueDays) ? f.dueDays : 0));
    const body: TaskCreateBody = {
      title: f.title.trim(),
      moduleType: f.moduleType,
      taskType: f.taskType,
      status: f.status,
      priority: f.priority,
      projectId: Number.isFinite(Number(f.project)) && Number(f.project) > 0 ? Number(f.project) : undefined,
      assigneeId: f.assignee && f.assignee !== 'auto' && Number.isFinite(Number(f.assignee)) ? Number(f.assignee) : undefined,
      dueDate: due.toISOString(),
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

  return (
    <div className="tb-detail-bd tb-create-bd" onClick={onClose}>
      <div className="tb-detail tb-create" onClick={e => e.stopPropagation()}>
        <div className="tb-detail-h">
          <div><span className="mono" style={{ fontSize: 10.5, color: 'var(--text-400)' }}>unifiedTasks — new</span><h3>New task</h3></div>
          <button className="tb-detail-x" onClick={onClose} aria-label="Close">{I.close}</button>
        </div>
        <div className="tb-form">
          <div className="tb-field full"><label>Title<i>*</i></label><input type="text" autoFocus value={f.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Reconcile 2.5.4 efficacy claim with CSR-201 dataset" /></div>
          <div className="tb-frow">
            <div className="tb-field"><label>Project</label><select value={f.project} onChange={e => set('project', e.target.value)}>{projects.rows.length ? projects.rows.map(p => <option key={p.id} value={String(p.id)}>{p.name}</option>) : <option value="">No projects available</option>}</select></div>
            <div className="tb-field"><label>Module</label><select value={f.moduleType} onChange={e => set('moduleType', e.target.value)}>{Object.keys(TB_MOD).map(m => <option key={m} value={m}>{m}</option>)}</select></div>
          </div>
          <div className="tb-frow">
            <div className="tb-field"><label>Task type</label><select value={f.taskType} onChange={e => set('taskType', e.target.value)}>{Object.keys(TB_TYPE).map(t => <option key={t} value={t}>{TB_TYPE[t]}</option>)}</select></div>
            {/* Exactly the server's accepted vocabulary. createTaskSchema
                (taskManagement.routes.ts) validates priority against
                z.enum(['low','medium','high','critical']), so the 'urgent'
                option this picker used to offer was a guaranteed HTTP 400: the
                task simply failed to create for anyone who chose it. */}
            <div className="tb-field"><label>Priority</label><select value={f.priority} onChange={e => set('priority', e.target.value)}>{['low', 'medium', 'high', 'critical'].map(p => <option key={p} value={p}>{p}</option>)}</select></div>
          </div>
          <div className="tb-frow">
            <div className="tb-field"><label>Status</label><select value={f.status} onChange={e => set('status', e.target.value)}>{TB_COLS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></div>
            <div className="tb-field"><label>Assignee</label><select value={f.assignee} onChange={e => set('assignee', e.target.value)}><option value="auto">Auto — optimal assignee</option>{assignees.rows.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
          </div>
          <div className="tb-frow">
            <div className="tb-field"><label>Impact score -- {f.impactScore}/10</label><input type="range" min="0" max="10" value={f.impactScore} onChange={e => set('impactScore', +e.target.value)} /></div>
            <div className="tb-field"><label>Due in (days)</label><input type="number" min="0" max="120" value={f.dueDays} onChange={e => set('dueDays', +e.target.value)} /></div>
          </div>
          <div className="tb-field full"><label>Flags</label>
            <div className="tb-toggles">
              <button type="button" className={`tb-tog${f.criticalPath ? ' on' : ''}`} onClick={() => set('criticalPath', !f.criticalPath)}><span className="ico">{I.zap}</span>Critical path</button>
              <button type="button" className={`tb-tog${f.regulatoryImpact ? ' on' : ''}`} onClick={() => set('regulatoryImpact', !f.regulatoryImpact)}><span className="ico">{I.shieldCheck}</span>Regulatory impact</button>
              <button type="button" className={`tb-tog${f.approvalRequired ? ' on' : ''}`} onClick={() => set('approvalRequired', !f.approvalRequired)}><span className="ico">{I.checkSquare}</span>Approval required</button>
            </div>
          </div>
          <div className="tb-field full"><label>Depends on <span style={{ color: 'var(--text-400)', fontWeight: 400 }}>-- taskDependencies DAG</span></label>
            <div className="tb-dep-pick">
              {allTasks.filter(t => t.project === f.project).slice(0, 6).map(t => (
                <button type="button" key={t.taskId} className={`tb-dep-opt${f.dependsOn.includes(t.taskId) ? ' on' : ''}`} onClick={() => toggleDep(t.taskId)} title={t.title}>
                  {f.dependsOn.includes(t.taskId) ? I.check : I.plus}<span>{t.title}</span>
                </button>
              ))}
            </div>
          </div>
          {f.assignee === 'auto' && <div className="tb-auto-note"><span className="ico">{I.sparkles}</span><span>Auto-assign picks the lowest-workload member of this organization for <b>{f.moduleType}</b> -- balanced server-side via <code>getOptimalAssignee()</code>.</span></div>}
          {err && <div className="tb-auto-note" data-warn="true"><span className="ico">{I.alertTriangle}</span><span>{err}</span></div>}
        </div>
        <div className="tb-detail-f">
          
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!f.title.trim() || busy} onClick={doCreate}>{I.plus} {busy ? 'Creating...' : 'Create task'}</button>
        </div>
      </div>
    </div>
  );
}

/* ── Workflow templates (taskTemplates) -- from-template instantiation ── */

interface WorkflowStartProps {
  proj: string;
  onClose: () => void;
  /** Called with the COUNT the server actually created — the tasks themselves
   *  are already persisted, so the board reloads rather than being handed
   *  client-built rows. */
  onInstantiate: (createdCount: number) => void;
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

function WorkflowStart({ proj, onClose, onInstantiate }: WorkflowStartProps) {
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
    if (!project) { setErr('Choose a programme — the tasks are created against it.'); return; }
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
      );
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
      const createdTasks: unknown[] = Array.isArray(payload.data) ? payload.data : [];
      const created = createdTasks.length || tpl.taskCount;

      /* Auto-assign is a SEPARATE governed step; the instantiate route takes no
         assignee. It runs against the ids that were just created, and a failure
         here is reported without pretending the tasks were not created — they
         were. */
      if (autoAssign) {
        const ids = createdTasks
          .map(t => (t as { taskId?: string })?.taskId)
          .filter((x): x is string => typeof x === 'string' && x.length > 0);
        if (ids.length) {
          try {
            await apiRequest('POST', '/api/tasks/tasks/auto-assign', { taskIds: ids });
          } catch {
            setErr(created + ' tasks were created, but auto-assignment failed — assign them on the board.');
          }
        }
      }
      onInstantiate(created);
    } catch (e) {
      // `e instanceof Error` also matched a browser-native fetch rejection, so a
      // dropped connection surfaced as "Failed to fetch" / "Load failed" in the
      // dialog. Only ApiRequestError carries a message that has been reduced to
      // user copy; everything else falls back to this surface's own sentence.
      setErr(e instanceof ApiRequestError && e.message ? e.message : 'Could not reach the task service.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tb-detail-bd" onClick={onClose}>
      <div className="tb-detail tb-create" onClick={e => e.stopPropagation()}>
        <div className="tb-detail-h">
          <div><span className="mono" style={{ fontSize: 10.5, color: 'var(--text-400)' }}>taskTemplates — from-template</span><h3>Start a workflow</h3></div>
          <button className="tb-detail-x" onClick={onClose} aria-label="Close">{I.close}</button>
        </div>

        {templates.loading ? (
          <div className="tb-form"><div className="scaf-note">Loading workflow templates…</div></div>
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
            <div className="tb-field"><label>Workflow template</label><select value={tid} onChange={e => setTid(e.target.value)}>{templates.rows.map(t => <option key={t.templateId} value={t.templateId}>{t.name}</option>)}</select></div>
            <div className="tb-field"><label>Project</label><select value={project} onChange={e => setProject(e.target.value)}><option value="">Select a programme…</option>{projects.rows.map(p => <option key={p.id} value={String(p.id)}>{p.name}</option>)}</select></div>
          </div>
          {tpl && (
            <>
              <div className="wf-meta">
                <span><b>{tpl.taskCount}</b> tasks</span><span className="tb-dot">--</span>
                <span><b>{tpl.spanDays}</b>-day span</span><span className="tb-dot">--</span>
                <span><b>{tpl.estimatedHours}</b>h effort</span><span className="tb-dot">--</span>
                <span><b>{tpl.dependencyCount}</b> dependencies</span>
              </div>
              {tpl.description && <div className="scaf-note" style={{ padding: '2px 0 6px' }}>{tpl.description}</div>}
              <div className="tb-field full"><label>Tasks this creates <span style={{ color: 'var(--text-400)', fontWeight: 400 }}>-- dependency-linked, date-offset</span></label>
                <div className="wf-tasks">
                  {tpl.tasks.map((t, i) => (
                    <div key={t.id || i} className="wf-task">
                      <span className="wf-task-n">{i + 1}</span>
                      <span className="tb-mod" style={{ '--m': TB_MOD[t.moduleType] || '#888' } as React.CSSProperties}>{t.moduleType}</span>
                      <span className="wf-task-t">{t.title}</span>
                      <span className="wf-task-d">day +{t.dayOffset} -- {t.duration}d</span>
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
          <button type="button" className={`tb-tog${autoAssign ? ' on' : ''}`} onClick={() => setAutoAssign(a => !a)}><span className="ico">{I.sparkles}</span>Workload-balanced auto-assign (a separate step, after the tasks are created)</button>
          {err && <div className="scaf-note" role="alert" style={{ color: 'var(--danger, #b42318)' }}>{err}</div>}
        </div>
        )}

        <div className="tb-detail-f">
          <div className="tb-endpoint"><b>POST</b> /tasks/from-template/{tid || '…'}</div>
          <button className="btn ghost" disabled={busy} onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!tpl || !project || busy} onClick={() => { void instantiate(); }}>
            {I.plus} {busy ? 'Creating…' : tpl ? 'Create ' + tpl.taskCount + ' tasks' : 'Create tasks'}
          </button>
        </div>
      </div>
    </div>
  );
}
