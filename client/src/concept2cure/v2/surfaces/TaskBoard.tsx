import React, { useState, useMemo, useEffect, useRef } from 'react';
import { I } from '../icons';
import { useLiveRows, EmptyState } from '../dataConnect';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/services/portal/authService';
import { AnswerLead } from '../AnswerLead';
import type { SurfaceViewProps } from '../surfaceViews';
import {
  // TB_PROJECTS (three invented programmes) is gone — the board, the project
  // filter, the detail label and the workflow picker all read the org's real
  // programmes from GET /api/projects now. What remains here is configuration:
  // module colours, status column definitions, type labels and source labels.
  // TB_WORKFLOWS and TB_OPTIMAL are gone: the workflow picker reads real
  // templates from GET /api/task-management/templates, and assignment is the
  // server's auto-assign step rather than a fixture lookup table.
  // TB_TEAM is gone: assignee names come from the org's real roster
  // (GET /api/task-management/assignees), keyed by the users.id the board emits.
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
interface TaskItem {
  taskId: string;
  title: string;
  /** Real project FK as a string; '' when unattached. Does NOT match the
   *  TB_PROJECTS slugs — see the projects/roster follow-up flag. */
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
  dependsOn: string[];
  blocks: string[];
  comments: number;
  attachments: number;
  source: string;
  due: string;
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

/**
 * Live assignee roster, id -> display name.
 *
 * The board returns `assignee` as the numeric users.id stringified
 * (taskBoard.routes.ts: `assignee: row.assigneeId != null ? String(row.assigneeId) : ''`),
 * but every name on this surface used to be resolved through TB_TEAM, a fixture
 * keyed by short codes ('jc', 'mw', 'am'). TB_TEAM['42'] is undefined, so on
 * real data EVERY task rendered a blank owner and a '?' avatar — the fixture
 * was not showing wrong names, it was showing none.
 *
 * The org's real roster already had an endpoint: GET
 * /api/task-management/assignees returns { id: String(users.id), name }, the
 * same id space the board emits. A context keeps the two components that need
 * it (the board and TaskDetail) reading one resolved map.
 */
const RosterCtx = React.createContext<Record<string, string>>({});

/** Display name for an assignee id; '' when the roster has no such member. */
function useName(id: string | undefined | null): string {
  const roster = React.useContext(RosterCtx);
  return (id && roster[id]) || '';
}

function tbAvatar(id: string, roster: Record<string, string>): string {
  const n = roster[id] || '';
  if (!n) return '?';
  return n.split(' ').map(s => s[0]).filter(Boolean).join('').slice(0, 2).toUpperCase();
}

/* ── Main surface ── */

export function TaskBoard({ onAsk }: SurfaceViewProps) {
  /* Org-wide unifiedTasks board — REAL, org-scoped read model
     (GET /api/task-management/board -> server/routes/taskBoard.routes.ts: a real
     drizzle query over unified_tasks + task_dependencies). Real rows, an honest
     empty state, or an honest error state — never the fixture. The old window.C2C
     in-browser store was seeded from the TB_TASKS fixture (CollabLauncher.tsx),
     so reading it presented fixture data as the board; that read is retired here.
     New task now POSTs the real persisted create (POST /api/tasks/tasks) with a
     real project + assignee and the board refetches, so created tasks appear
     live. Start workflow / Move still write to the in-browser window.C2C store
     only (flagged for the actions pass) and do not persist. */
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
  /* The org's real assignable members. An empty or failed roster degrades to
     ids resolving to '—' / '?', which is what the fixture already produced —
     never a fabricated name. */
  const assignees = useLiveRows<{ id: string; name: string }>('/api/task-management/assignees');
  const roster = useMemo(() => {
    const m: Record<string, string> = {};
    assignees.rows.forEach((a) => { if (a && a.id) m[String(a.id)] = a.name || ''; });
    return m;
  }, [assignees.rows]);

  /* "My tasks" needs the signed-in user's real id. It used to compare against
     the fixture short-id 'jc', which no real row can carry — so the filter
     returned an empty board for every user of the product. */
  const { user } = useAuth();
  const myId = user?.id != null ? String(user.id) : '';

  /**
   * "Auto-balance assignments" — a REAL rebalance.
   *
   * This typed a question into the AI rail and changed nothing, while the copy
   * beside it named a specific overloaded colleague and the analytics footer
   * read "Workload-balanced auto-assign via getOptimalAssignee()". It was the
   * only affordance labelled as performing the rebalance, and pressing it moved
   * no work.
   *
   * POST /api/tasks/tasks/auto-assign (taskManagement.routes.ts:727, mounted at
   * register-core-routes.ts:118) resolves getOptimalAssignee per task and
   * UPDATEs unifiedTasks, org-scoped on both the select and the update. It takes
   * real unified_tasks.taskId strings, which is exactly what the board carries
   * (taskBoard.routes.ts:227 emits `taskId: row.taskId` straight from the table).
   *
   * It rebalances the OPEN tasks currently in view, so the user can see what
   * changed, and refetches so the assignee avatars reflect the new owners.
   *
   * The handler iterates `taskIds` with no validation, so an absent or non-array
   * body throws into its 500 branch — the empty case is therefore refused here
   * rather than sent.
   */
  const [balErr, setBalErr] = useState('');
  const [balancing, setBalancing] = useState(false);
  const autoBalance = async (ids: string[]) => {
    if (balancing) return;
    if (ids.length === 0) {
      setBalErr('Nothing to rebalance — there are no open tasks in this view.');
      return;
    }
    setBalancing(true);
    setBalErr('');
    try {
      const res = await apiRequest('POST', '/api/tasks/tasks/auto-assign', { taskIds: ids });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setBalErr((body && (body as { error?: string }).error) || `Could not rebalance (HTTP ${res.status}). Nothing was reassigned.`);
        return;
      }
      setReloadKey((k) => k + 1);
    } catch {
      setBalErr('Network error while rebalancing. Nothing was reassigned.');
    } finally {
      setBalancing(false);
    }
  };

  const [view, setView] = useState('board');
  const [proj, setProj] = useState<string>(() => {
    try { return (window as any).C2C_TASK_FILTER || 'all'; } catch (_e) { return 'all'; }
  });
  const [mine, setMine] = useState(false);
  const [mod, setMod] = useState('all');
  const [sel, setSel] = useState<TaskItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [wf, setWf] = useState(false);

  const modules = useMemo(() => ['all', ...Array.from(new Set(tasks.map(t => t.moduleType)))], [tasks]);
  const list = tasks.filter(t =>
    (proj === 'all' || t.project === proj) &&
    (!mine || (myId !== '' && t.assignee === myId)) &&
    (mod === 'all' || t.moduleType === mod) &&
    t.status !== 'cancelled'
  );
  const byCol = (id: string) => list.filter(t => t.status === id);
  const byId = (id: string) => tasks.find(t => t.taskId === id);

  // Move a card between columns -> the real persisted status update
  // (PATCH /api/tasks/tasks/:taskId), then refetch so the board reflects it.
  const move = async (t: TaskItem, dir: number) => {
    const order = TB_COLS.map(c => c.id);
    const i = order.indexOf(t.status);
    const ni = Math.max(0, Math.min(order.length - 1, i + dir));
    if (ni === i) return;
    const status = order[ni];
    const progress = status === 'completed' ? 100 : t.progress;
    try {
      const res = await apiRequest('PATCH', '/api/tasks/tasks/' + encodeURIComponent(t.taskId), { status, progress });
      if (res.ok) setReloadKey((k) => k + 1);
    } catch {
      /* leave the board as-is on a failed move */
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
        return { ok: false, error: body && body.error ? String(body.error) : 'Could not create the task.' };
      }
      const newTaskId = String(body.data.taskId);
      for (const dep of dependsOn) {
        try {
          await apiRequest('POST', '/api/tasks/tasks/dependencies', {
            predecessorTaskId: dep,
            successorTaskId: newTaskId,
            dependencyType: 'finish-to-start',
          });
        } catch {
          /* a failed dependency link never blocks the created task */
        }
      }
      setReloadKey((k) => k + 1);
      setCreating(false);
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
  const overdue = list.filter(t => /overdue/.test(t.due) && t.status !== 'completed');
  const workload = Object.entries(stats.byAsg || {}).map(([k, v]) => ({ k, open: v.open })).sort((a, b) => b.open - a.open);
  const heaviest = workload[0];
  const critOpen = critChain.filter(t => t.status !== 'completed');
  const critBlocked = critChain.find(t => t.blocked);
  const milestone = critChain[critChain.length - 1];

  return (
    <RosterCtx.Provider value={roster}>
    <div className="page-inner tb">
      <div className="ph">
        <div>
          <div className="ph-eyebrow">Project -- collaboration</div>
          <h1 className="ph-title">Task board</h1>
          <div className="ph-sub">The org-wide <code>unifiedTasks</code> board served by <code>/api/task-management</code>. Org-scoped by design -- filter to a project below. Tasks from sections, the pyramid engine, the legacy WBS and modules are surfaced here with their origin store labelled.</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn ghost" onClick={() => setWf(true)}>{I.workflow} Start workflow</button>
          <button className="btn primary" onClick={() => setCreating(true)}>{I.plus} New task</button>
        </div>
      </div>

      {liveTasks.loading ? (
        <div className="scaf-note" style={{ padding: '18px 10px' }}>Loading the task board…</div>
      ) : liveTasks.error ? (
        <EmptyState
          tone="error"
          icon={I.alertTriangle}
          title="Couldn't load the task board"
          hint="The org-wide unifiedTasks board didn't respond. These are the organization's tasks from GET /api/task-management/board — sign in and retry, or check the service is reachable."
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
        eyebrow="What is on the critical path -- and what needs you first"
        headline={critBlocked
          ? <>Your path to {milestone ? <b>"{milestone.title}"</b> : 'the milestone'} is <b>blocked</b> at "{critBlocked.title}".</>
          : critOpen.length
            ? <>{critOpen.length} {critOpen.length === 1 ? 'task stands' : 'tasks stand'} between you and <b>{milestone ? '"' + milestone.title + '"' : 'the milestone'}</b>{overdue.length ? <>, and <b>{overdue.length} {overdue.length === 1 ? 'task is' : 'tasks are'} overdue</b></> : ''}.</>
            : <>The critical path is clear -- nothing open is blocking the milestone right now.</>}
        body={critBlocked
          ? <>{critBlocked.blockedReason || 'It is blocked'} -- nothing downstream on the path can move until it clears. {heaviest && heaviest.open > 3 ? <>{roster[heaviest.k] || 'The busiest assignee'} is also carrying {heaviest.open} open tasks; auto-assign can rebalance.</> : null}</>
          : <>{overdue.length ? <>Clear the overdue work first, then the path flows. </> : null}{heaviest && heaviest.open >= 3 ? <>{roster[heaviest.k] || 'The busiest assignee'} is the busiest at {heaviest.open} open tasks -- workload-balanced auto-assign can spread the next batch.</> : <>Workload is balanced across the team.</>} {stats.appr ? <>{stats.appr} approval{stats.appr > 1 ? 's' : ''} pending an e-signature.</> : null}</>}
        reassure={critBlocked || overdue.length ? "I will help you unblock the path and rebalance the team, one step at a time." : "You are on track. I will flag the moment anything threatens the milestone."}
        action={{
          label: critBlocked ? 'Unblock the critical path' : overdue.length ? 'Triage the overdue work' : 'Start a workflow from a template',
          onClick: () => { if (critBlocked || overdue.length) { setView('path'); } else { setWf(true); } },
          alt: {
            label: balancing ? 'Rebalancing…' : 'Auto-balance assignments',
            onClick: () => void autoBalance(list.filter(t => t.status !== 'completed').map(t => t.taskId)),
          },
        }}
        secondary="Or work the board, critical path, and analytics below."
      />

      {balErr && (
        <div className="tb-note" role="alert" style={{ color: 'var(--error)' }}>
          {I.alertTriangle} {balErr}
        </div>
      )}

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
        <div className="seg tb-views">
          {([['board', 'Board'], ['path', 'Critical path'], ['analytics', 'Analytics'], ['table', 'Table']] as const).map(([v, l]) => (
            <button key={v} className={`seg-b${view === v ? ' on' : ''}`} onClick={() => setView(v)}>{l}</button>
          ))}
        </div>
      </div>

      {view === 'board' && (
        <div className="tb-kanban">
          {TB_COLS.map(col => {
            const items = byCol(col.id);
            return (
              <div key={col.id} className="tb-col">
                <div className="tb-col-h"><span className="kdot" data-tone={col.tone} /><span>{col.label}</span><span className="kn">{items.length}</span></div>
                <div className="tb-col-b">
                  {items.map(t => (
                    <div key={t.taskId} className="tb-card" data-blocked={t.blocked || undefined} onClick={() => setSel(t)}>
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
                        {t.approvalRequired && <span className="tb-appr" data-s={t.approvalStatus}>{t.approvalStatus === 'approved' ? 'approved' : t.approvalStatus === 'pending' ? 'approval -- pending' : 'needs approval'}</span>}
                      </div>
                      {t.progress > 0 && t.progress < 100 && <div className="tb-prog"><span style={{ width: t.progress + '%' }} /></div>}
                      <div className="tb-card-foot">
                        <span className="tb-src-tag" data-src={t.source} title={SRC(t.source).t}>{SRC(t.source).l}</span>
                        {(t.dependsOn.length > 0 || t.blocks.length > 0) && <span className="tb-deps" title={t.dependsOn.length + ' upstream -- ' + t.blocks.length + ' downstream'}>{I.gitCompare}{t.dependsOn.length + t.blocks.length}</span>}
                        {t.comments > 0 && <span className="tb-cmt">{t.comments}</span>}
                        <span className="tb-due" data-over={/overdue/.test(t.due) || undefined}>{t.due}</span>
                        <span className="tb-av" title={roster[t.assignee] || 'Unassigned'}>{tbAvatar(t.assignee, roster)}</span>
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
          <div className="tb-path-h">Critical path -- {critChain.length} tasks -- computed from the <code>taskDependencies</code> DAG (getCriticalPath)</div>
          {critChain.map((t, i) => (
            <div key={t.taskId} className="tb-path-row" data-status={t.status} onClick={() => setSel(t)}>
              <div className="tb-path-rail"><span className="tb-path-dot" data-status={t.status} />{i < critChain.length - 1 && <span className="tb-path-line" />}</div>
              <div className="tb-path-card">
                <div className="tb-path-t">{t.title}<span className="tb-mod" style={{ '--m': TB_MOD[t.moduleType] || '#888' } as React.CSSProperties}>{t.moduleType}</span></div>
                <div className="tb-path-m">
                  <span>{t.phase || '—'}</span><span className="tb-dot">--</span><span>{roster[t.assignee] || '—'}</span><span className="tb-dot">--</span>
                  <span className={`tb-pri pri-${t.priority}`}>{t.priority}</span><span className="tb-dot">--</span><span>impact {t.impactScore ?? '—'}/10</span>
                  {t.blocked && <span className="tb-path-blk">{I.alertTriangle} blocked</span>}
                  <span className="sp" /><span className="tb-due" data-over={/overdue/.test(t.due) || undefined}>{t.due}</span>
                </div>
                {t.dependsOn.length > 0 && <div className="tb-path-dep">depends on {t.dependsOn.map(d => (byId(d) || { title: d }).title || d).join(' -- ')}</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {view === 'analytics' && (
        <div className="tb-an">
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
                <div key={k} className="tb-an-row"><span className="tb-an-k"><span className="tb-av sm">{tbAvatar(k, roster)}</span>{roster[k] || '—'}</span><div className="tb-an-split"><span className="tb-an-open">{stats.byAsg[k].open} open</span><span className="tb-an-done">{stats.byAsg[k].done} done</span></div></div>
              ))}
              <div className="tb-an-foot">Workload-balanced auto-assign via <code>getOptimalAssignee()</code></div>
            </div>
            <div className="tb-an-card">
              <div className="tb-an-h">Automation</div>
              <div className="tb-an-auto"><b>24</b> trigger event types -- <b>9</b> action types defined in <code>project-rules</code>.</div>
              <div className="tb-an-auto-rules">
                <span>task_overdue -&gt; escalate</span><span>review_completed -&gt; advance_stage</span><span>approval_rejected -&gt; create_task</span><span>deadline_approaching -&gt; send_notification</span>
              </div>
              <div className="tb-an-foot" data-warn="true">{I.alertTriangle} Rules are stored; the background executor is not yet wired.</div>
            </div>
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
              <div style={{ fontSize: 11 }}>{roster[t.assignee] || '—'}</div>
              <div style={{ fontSize: 11, color: /overdue/.test(t.due) ? 'var(--error)' : 'var(--text-400)' }}>{t.due}</div>
            </button>
          ))}
        </div>
      )}

      {/* Honest engineering reality (forensic report gaps) */}
      <details className="tb-gaps">
        <summary>Engineering reality -- backend status</summary>
        <ul>
          <li><b>Canonical store</b> is <code>unifiedTasks</code> (8 indexes). Section tasks live in <code>projectTasks</code> (own state machine); pyramid tasks are <b>in-memory only</b> (no persistence table); legacy WBS in <code>project_tasks</code>. No reconciliation service -- origin shown per card.</li>
          <li><b>Audit:</b> <code>task-audit.ts</code> (writes the Part-11 <code>c2c_ana_actions</code> ledger) is coded but <b>not called</b> from task mutation handlers -- task creates/transitions are currently unaudited.</li>
          <li><b>Notifications:</b> stub only (<code>io.to('tasks').emit</code> commented out). Section assignments notify; unified tasks do not.</li>
          <li><b>Route note:</b> client <code>taskingService.ts</code> targets <code>/api/regulatory/tasks/*</code> while routes mount at <code>/api/task-management/*</code> (path reconciliation pending).</li>
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
      {sel && <TaskDetail t={sel} byId={byId} projLabel={projLabel} onClose={() => setSel(null)} onAsk={onAsk} onMove={move} />}
    </div>
    </RosterCtx.Provider>
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
}

function TaskDetail({ t, byId, projLabel, onClose, onAsk, onMove }: TaskDetailProps) {
  const src = TB_SRC[t.source] || TB_SRC.unified;
  /* Name only. TB_TEAM also carried a job title ('Reg Affairs', 'Biostat'),
     which the roster endpoint does not return — inventing one would be the same
     class of fabrication this replaces, so the Owner row shows the name alone. */
  const ownerName = useName(t.assignee);
  const assignedByName = useName(t.assignedBy);
  const dep = (id: string) => { const d = byId(id); return d ? d.title : id; };
  return (
    <div className="tb-detail-bd" onClick={onClose}>
      <div className="tb-detail" onClick={e => e.stopPropagation()}>
        <div className="tb-detail-h">
          <div><span className="mono" style={{ fontSize: 10.5, color: 'var(--text-400)' }}>{t.taskId}</span><h3>{t.title}</h3></div>
          <button className="tb-detail-x" onClick={onClose}>{I.close}</button>
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
          <div><label>Owner</label><span>{ownerName || 'Unassigned'}</span></div>
          <div><label>Assigned by</label><span>{assignedByName || '--'}</span></div>
          <div><label>Impact score</label><span>{t.impactScore ?? '—'}/10</span></div>
          <div><label>Due</label><span style={{ color: /overdue/.test(t.due) ? 'var(--error)' : 'inherit' }}>{t.due}</span></div>
          <div><label>Origin store</label><span>{src.l} -- <em style={{ color: 'var(--text-400)' }}>{src.t}</em></span></div>
          <div><label>Progress</label><span>{t.progress}%</span></div>
        </div>
        {t.approvalRequired && (
          <div className="tb-detail-sec">
            <div className="tb-detail-sec-h">Approval checkpoint <span className="tb-appr" data-s={t.approvalStatus}>{t.approvalStatus.replace('_', ' ')}</span></div>
            <div className="tb-detail-note">HITL gate (<code>approvalCheckpoints</code>) -- 21 CFR 11 e-signature required to clear. Quorum/role-based gate types supported.</div>
          </div>
        )}
        {(t.dependsOn.length > 0 || t.blocks.length > 0) && (
          <div className="tb-detail-sec">
            <div className="tb-detail-sec-h">Dependencies <code>taskDependencies</code></div>
            {t.dependsOn.map(d => <div key={d} className="tb-dep-row up">{I.arrowUp} depends on <b>{dep(d)}</b></div>)}
            {t.blocks.map(d => <div key={d} className="tb-dep-row dn">{I.arrowRight} blocks <b>{dep(d)}</b></div>)}
          </div>
        )}
        <div className="tb-detail-sec">
          <div className="tb-detail-sec-h">Audit</div>
          <div className="tb-detail-note" data-warn="true">{I.alertTriangle} <code>task-audit.ts</code> is coded but not yet wired to this mutation path -- this change would not be written to the <code>c2c_ana_actions</code> ledger.</div>
        </div>
        <div className="tb-detail-f">
          <button className="btn ghost" onClick={() => { onAsk && onAsk('Draft a status update for ' + t.taskId + ': ' + t.title); onClose(); }}>{I.sparkles} Ask AnA</button>
          <span className="sp" />
          <button className="btn ghost" disabled={t.status === 'pending'} onClick={() => { onMove(t, -1); onClose(); }}>Move back</button>
          <button className="btn primary" disabled={t.status === 'completed'} onClick={() => { onMove(t, 1); onClose(); }}>{I.chevRight} Advance</button>
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
          <div><span className="mono" style={{ fontSize: 10.5, color: 'var(--text-400)' }}>unifiedTasks -- new</span><h3>New task</h3></div>
          <button className="tb-detail-x" onClick={onClose}>{I.close}</button>
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
            <div className="tb-field"><label>Assignee</label><select value={f.assignee} onChange={e => set('assignee', e.target.value)}><option value="auto">Auto -- optimal assignee</option>{assignees.rows.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
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
          <div className="tb-endpoint" title="Persists an org-scoped unified_tasks row"><b>POST</b> /api/tasks/tasks</div>
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
      const payload = body as { success?: boolean; data?: { tasks?: unknown[] }; error?: string } | null;
      if (!res.ok || payload?.success !== true) {
        setErr(payload?.error || 'Could not create the tasks (HTTP ' + res.status + ').');
        return;
      }
      const created = Array.isArray(payload.data?.tasks) ? payload.data!.tasks!.length : tpl.taskCount;

      /* Auto-assign is a SEPARATE governed step; the instantiate route takes no
         assignee. It runs against the ids that were just created, and a failure
         here is reported without pretending the tasks were not created — they
         were. */
      if (autoAssign) {
        const ids = (payload.data?.tasks ?? [])
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
      setErr(e instanceof Error ? e.message : 'Could not reach the task service.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tb-detail-bd" onClick={onClose}>
      <div className="tb-detail tb-create" onClick={e => e.stopPropagation()}>
        <div className="tb-detail-h">
          <div><span className="mono" style={{ fontSize: 10.5, color: 'var(--text-400)' }}>taskTemplates -- from-template</span><h3>Start a workflow</h3></div>
          <button className="tb-detail-x" onClick={onClose}>{I.close}</button>
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
