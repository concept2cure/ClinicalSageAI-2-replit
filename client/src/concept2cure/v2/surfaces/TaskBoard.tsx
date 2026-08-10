import React, { useState, useMemo, useEffect } from 'react';
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
  TB_MOD, TB_COLS, TB_TYPE, TB_SRC, TB_TEAM, TB_OPTIMAL,
  TB_WORKFLOWS,
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

function tbAvatar(id: string): string {
  const p = TB_TEAM[id] || { n: '?' };
  return (p.n || '?').split(' ').map(s => s[0]).join('').slice(0, 2);
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
          ? <>{critBlocked.blockedReason || 'It is blocked'} -- nothing downstream on the path can move until it clears. {heaviest && heaviest.open > 3 ? <>{(TB_TEAM[heaviest.k] || { n: '' }).n} is also carrying {heaviest.open} open tasks; auto-assign can rebalance.</> : null}</>
          : <>{overdue.length ? <>Clear the overdue work first, then the path flows. </> : null}{heaviest && heaviest.open >= 3 ? <>{(TB_TEAM[heaviest.k] || { n: '' }).n} is the busiest at {heaviest.open} open tasks -- workload-balanced auto-assign can spread the next batch.</> : <>Workload is balanced across the team.</>} {stats.appr ? <>{stats.appr} approval{stats.appr > 1 ? 's' : ''} pending an e-signature.</> : null}</>}
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
                        <span className="tb-av" title={(TB_TEAM[t.assignee] || { n: '' }).n}>{tbAvatar(t.assignee)}</span>
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
                  <span>{t.phase || '—'}</span><span className="tb-dot">--</span><span>{(TB_TEAM[t.assignee] || { n: '' }).n}</span><span className="tb-dot">--</span>
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
                <div key={k} className="tb-an-row"><span className="tb-an-k"><span className="tb-av sm">{tbAvatar(k)}</span>{(TB_TEAM[k] || { n: '' }).n}</span><div className="tb-an-split"><span className="tb-an-open">{stats.byAsg[k].open} open</span><span className="tb-an-done">{stats.byAsg[k].done} done</span></div></div>
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
              <div style={{ fontSize: 11 }}>{(TB_TEAM[t.assignee] || { n: '' }).n}</div>
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
      {wf && <WorkflowStart proj={proj} onClose={() => setWf(false)} onInstantiate={(tasks) => { tasks.forEach(t => (window as any).C2C && (window as any).C2C.addTask(t)); setWf(false); setView('path'); }} />}
      {sel && <TaskDetail t={sel} byId={byId} projLabel={projLabel} onClose={() => setSel(null)} onAsk={onAsk} onMove={move} />}
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
}

function TaskDetail({ t, byId, projLabel, onClose, onAsk, onMove }: TaskDetailProps) {
  const src = TB_SRC[t.source] || TB_SRC.unified;
  const owner = TB_TEAM[t.assignee] || { n: '?', t: '' };
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
          <div><label>Owner</label><span>{owner.n} -- {owner.t}</span></div>
          <div><label>Assigned by</label><span>{(TB_TEAM[t.assignedBy] || { n: '' }).n || '--'}</span></div>
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
  onInstantiate: (tasks: TaskItem[]) => void;
}

function WorkflowStart({ proj, onClose, onInstantiate }: WorkflowStartProps) {
  // Real org programmes for the picker; the default is whatever the board is
  // already filtered to, and otherwise nothing — it used to hard-default to the
  // fixture slug 'bx204' ("BX-204 -- NDA 212345"), a programme that exists in no
  // customer's tenant.
  const projects = useLiveRows<ProjectOpt>('/api/projects');
  const initProj = (proj && proj !== 'all') ? proj : '';
  const [tid, setTid] = useState(TB_WORKFLOWS[0].templateId);
  const [project, setProject] = useState(initProj);
  const [autoAssign, setAutoAssign] = useState(true);
  const tpl = TB_WORKFLOWS.find(t => t.templateId === tid) || TB_WORKFLOWS[0];
  const totalHours = tpl.tasks.reduce((a, t) => a + (t.estimatedHours || 8), 0);
  const span = Math.max(...tpl.tasks.map(t => (t.dayOffset || 0) + (t.duration || 0)));

  const instantiate = () => {
    const idMap: Record<string, string> = {};
    tpl.tasks.forEach(t => { idMap[t.id] = 'C2C-TASK-' + (2300 + Math.floor(Math.random() * 699)); });
    const blocksOf = (taskTemplateId: string) => tpl.dependencies.filter(([p]) => p === taskTemplateId).map(([, s]) => idMap[s]);
    const depsOf = (taskTemplateId: string) => tpl.dependencies.filter(([, s]) => s === taskTemplateId).map(([p]) => idMap[p]);
    const onCrit = new Set<string>();
    tpl.dependencies.forEach(([p, s]) => { onCrit.add(p); onCrit.add(s); });
    const tasks: TaskItem[] = tpl.tasks.map(t => ({
      taskId: idMap[t.id], title: t.title, project, moduleType: t.moduleType,
      taskType: t.taskType || 'deliverable', status: 'pending', priority: t.priority || 'medium',
      assignee: autoAssign ? (TB_OPTIMAL[t.moduleType] || 'jc') : 'jc', assignedBy: 'sm', progress: 0,
      impactScore: t.priority === 'critical' ? 9 : t.priority === 'high' ? 7 : 5,
      criticalPath: onCrit.has(t.id), regulatoryImpact: true,
      approvalRequired: t.taskType === 'milestone', approvalStatus: 'not_started',
      dependsOn: depsOf(t.id), blocks: blocksOf(t.id), comments: 0, attachments: 0,
      source: 'template', due: 'in ' + ((t.dayOffset || 0) + (t.duration || 0)) + ' days', phase: tpl.name,
      estimatedHours: t.estimatedHours, assignmentType: autoAssign ? 'auto' : 'manual',
    }));
    onInstantiate(tasks);
  };

  return (
    <div className="tb-detail-bd" onClick={onClose}>
      <div className="tb-detail tb-create" onClick={e => e.stopPropagation()}>
        <div className="tb-detail-h">
          <div><span className="mono" style={{ fontSize: 10.5, color: 'var(--text-400)' }}>taskTemplates -- from-template</span><h3>Start a workflow</h3></div>
          <button className="tb-detail-x" onClick={onClose}>{I.close}</button>
        </div>
        <div className="tb-form">
          <div className="tb-frow">
            <div className="tb-field"><label>Workflow template</label><select value={tid} onChange={e => setTid(e.target.value)}>{TB_WORKFLOWS.map(t => <option key={t.templateId} value={t.templateId}>{t.name}</option>)}</select></div>
            <div className="tb-field"><label>Project</label><select value={project} onChange={e => setProject(e.target.value)}><option value="">Select a programme…</option>{projects.rows.map(p => <option key={p.id} value={String(p.id)}>{p.name}</option>)}</select></div>
          </div>
          <div className="wf-meta">
            <span><b>{tpl.tasks.length}</b> tasks</span><span className="tb-dot">--</span><span><b>{span}</b>-day span</span><span className="tb-dot">--</span><span><b>{totalHours}</b>h effort</span><span className="tb-dot">--</span><span><b>{tpl.dependencies.length}</b> dependencies</span>
          </div>
          <div className="tb-field full"><label>Tasks this creates <span style={{ color: 'var(--text-400)', fontWeight: 400 }}>-- dependency-linked, date-offset</span></label>
            <div className="wf-tasks">
              {tpl.tasks.map((t, i) => (
                <div key={t.id} className="wf-task">
                  <span className="wf-task-n">{i + 1}</span>
                  <span className="tb-mod" style={{ '--m': TB_MOD[t.moduleType] || '#888' } as React.CSSProperties}>{t.moduleType}</span>
                  <span className="wf-task-t">{t.title}</span>
                  <span className="wf-task-d">day +{t.dayOffset} -- {t.duration}d</span>
                  <span className={`tb-pri pri-${t.priority}`}>{t.priority}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="wf-reqs">
            <div><span className="wf-reqs-l">Regulatory basis</span>{tpl.regulatoryRequirements.map(r => <span key={r} className="wf-tag">{r}</span>)}</div>
            <div><span className="wf-reqs-l">Milestones</span>{tpl.milestones.map(r => <span key={r} className="wf-tag ok">{r}</span>)}</div>
          </div>
          <button type="button" className={`tb-tog${autoAssign ? ' on' : ''}`} onClick={() => setAutoAssign(a => !a)}><span className="ico">{I.sparkles}</span>Workload-balanced auto-assign (getOptimalAssignee)</button>
        </div>
        <div className="tb-detail-f">
          <div className="tb-endpoint" title="Target endpoint — not yet wired to this button"><b>POST</b> /tasks/from-template/{tid} <em>(not yet wired)</em></div>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={instantiate}>{I.plus} Create {tpl.tasks.length} tasks</button>
        </div>
      </div>
    </div>
  );
}
