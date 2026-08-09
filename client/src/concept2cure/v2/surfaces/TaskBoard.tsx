import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { I } from '../icons';
import { useLiveRows, EmptyState } from '../dataConnect';
import { apiCall, apiErrorText } from '../apiCall';
import { useAuth } from '@/services/portal/authService';
import { useDialog } from '../useDialog';
import { AnswerLead } from '../AnswerLead';
import type { SurfaceViewProps } from '../surfaceViews';
import { TB_MOD, TB_TYPE, TB_SRC, type TaskSource } from '../fixtures/task-board-data';
import '../styles/project-home-v2.css';

/* ═══════════════════════════════════════════════════════════════════
   Task Board — the org-wide task board (unified_tasks read-model).

   GA pass (collaboration/tasking assessment):
     · Projects, assignees and the current user are LIVE — the board no
       longer filters against fixture slugs that matched nothing
       (D1/D2/D3).
     · Blocked is a real column; card moves run an explicit transition
       map and surface the server's state-machine answer (D4/D5).
     · Moves are optimistic with revert-on-failure (D15).
     · Overdue is computed from the machine-readable dueDateIso, not by
       parsing an English label (D21).
     · Start workflow lists REAL templates (GET /api/tasks/templates)
       and instantiates them server-side (D9/D10).
     · Keyboard + screen-reader access: focusable cards, dialog
       semantics, labelled controls, live announcements (D30–D34).
     · Engineering internals are dev-only (D37–D39).
   ═══════════════════════════════════════════════════════════════════ */

/** Display row served by GET /api/task-management/board. */
interface TaskItem {
  taskId: string;
  title: string;
  /** Project FK as a string; '' when unattached. */
  project: string;
  moduleType: string;
  taskType: string;
  status: string;
  priority: string;
  /** Assignee user-id FK as a string; '' when unassigned. */
  assignee: string;
  assignedBy: string;
  progress: number;
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
  /** Humanised label for display only — never parsed. */
  due: string;
  /** Machine-readable due date; the only overdue signal. */
  dueDateIso: string | null;
  phase: string | null;
  blocked?: boolean;
  blockedReason?: string;
  estimatedHours?: number | null;
}

/** Real org project (GET /api/projects — bare row array). */
interface ProjectOpt { id: number; name: string }
/** Real assignable org member (GET /api/task-management/assignees). */
interface AssigneeOpt { id: string; name: string }

/* ── Board columns — blocked is a first-class column, so blocked work is
      visible on the board instead of vanishing from every column (D4). ── */
const BOARD_COLS = [
  { id: 'pending', label: 'To do', tone: 'idle' },
  { id: 'in-progress', label: 'In progress', tone: 'ai' },
  { id: 'review', label: 'In review', tone: 'warn' },
  { id: 'blocked', label: 'Blocked', tone: 'err' },
  { id: 'completed', label: 'Done', tone: 'ok' },
] as const;

/* ── Explicit transition maps — index arithmetic over a column array sent
      "advance" on a blocked task to pending (D5). Mirrors the server's
      state machine so a legal click never 409s. ── */
const ADVANCE: Record<string, string | null> = {
  pending: 'in-progress',
  'in-progress': 'review',
  review: 'completed',
  blocked: 'in-progress',
  completed: null,
  cancelled: 'pending',
};
const RETREAT: Record<string, string | null> = {
  pending: null,
  'in-progress': 'pending',
  review: 'in-progress',
  blocked: 'pending',
  completed: 'review',
  cancelled: null,
};

const PRIORITIES = ['low', 'medium', 'high', 'critical'];

const DEV = Boolean(import.meta.env?.DEV);

function isOverdue(t: TaskItem): boolean {
  if (!t.dueDateIso || t.status === 'completed' || t.status === 'cancelled') return false;
  const due = new Date(t.dueDateIso).getTime();
  return Number.isFinite(due) && due < Date.now();
}

function initials(name: string): string {
  return (name || '?').split(/\s+/).map(s => s[0]).join('').slice(0, 2).toUpperCase();
}



/* ── Main surface ── */

export function TaskBoard({ onAsk }: SurfaceViewProps) {
  const { user } = useAuth();
  const myId = user?.id ? String(user.id) : null;

  const [reloadKey, setReloadKey] = useState(0);
  const liveTasks = useLiveRows<TaskItem>('/api/task-management/board', [
    '/api/task-management/board',
    reloadKey,
  ]);
  const projects = useLiveRows<ProjectOpt>('/api/projects');
  const assignees = useLiveRows<AssigneeOpt>('/api/task-management/assignees');

  // Optimistic overlay: a move applies instantly, the PATCH confirms it, a
  // failure reverts it and explains itself (D15). Overrides live until a fresh
  // authoritative fetch replaces the rows, so a confirmed move never flickers
  // back to its old column while the refetch is in flight.
  //
  // The clear-on-fresh-rows effect MUST bail to the same state object when
  // there is nothing to clear: useLiveRows returns a fresh [] identity on
  // every render while loading, so `setOverrides({})` unconditionally would
  // re-render forever (the hook's documented fresh-[] identity trap).
  const [overrides, setOverrides] = useState<Record<string, Partial<TaskItem>>>({});
  useEffect(() => {
    setOverrides(o => (Object.keys(o).length ? {} : o));
  }, [liveTasks.rows]);
  const tasks: TaskItem[] = useMemo(
    () => liveTasks.rows.map(t => (overrides[t.taskId] ? { ...t, ...overrides[t.taskId] } : t)),
    [liveTasks.rows, overrides]
  );

  // Board state is shareable: URL query params win on load (a forwarded link
  // opens exactly the view the sender saw), then the session's own last state.
  // Defaults stay OUT of the URL so unshared navigation keeps clean links.
  const readParam = (k: string): string | null => {
    try { return new URLSearchParams(window.location.search).get(k); } catch { return null; }
  };
  const [view, setView] = useState(() => readParam('tb_view') || sessionStorage.getItem('tb.view') || 'board');
  const [proj, setProj] = useState<string>(() => {
    try {
      return readParam('tb_proj') || (window as any).C2C_TASK_FILTER || sessionStorage.getItem('tb.proj') || 'all';
    } catch (_e) { return 'all'; }
  });
  const [mine, setMine] = useState(() => {
    const p = readParam('tb_mine');
    return p != null ? p === '1' : sessionStorage.getItem('tb.mine') === '1';
  });
  const [mod, setMod] = useState(() => readParam('tb_mod') || sessionStorage.getItem('tb.mod') || 'all');
  const [sel, setSel] = useState<TaskItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [wf, setWf] = useState(false);
  const [actionErr, setActionErr] = useState('');
  const [announce, setAnnounce] = useState('');
  /** A completion the server answered 428 ESIGN_REQUIRED for — the pending
   *  signature ceremony (approval-gated task). */
  const [signReq, setSignReq] = useState<{ t: TaskItem; status: string; progress: number } | null>(null);

  useEffect(() => { sessionStorage.setItem('tb.view', view); }, [view]);
  useEffect(() => { sessionStorage.setItem('tb.proj', proj); }, [proj]);
  useEffect(() => { sessionStorage.setItem('tb.mine', mine ? '1' : '0'); }, [mine]);
  useEffect(() => { sessionStorage.setItem('tb.mod', mod); }, [mod]);

  // Mirror non-default state into the URL (replaceState — no history spam) so
  // the current board view is copyable from the address bar.
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const setOrDrop = (k: string, v: string | null) => {
        if (v == null || v === '') url.searchParams.delete(k); else url.searchParams.set(k, v);
      };
      setOrDrop('tb_view', view === 'board' ? null : view);
      setOrDrop('tb_proj', proj === 'all' ? null : proj);
      setOrDrop('tb_mod', mod === 'all' ? null : mod);
      setOrDrop('tb_mine', mine ? '1' : null);
      window.history.replaceState(window.history.state, '', url.toString());
    } catch (_e) { /* no URL surface (tests) — session persistence still holds */ }
  }, [view, proj, mod, mine]);

  // A stale project filter (removed project, legacy slug) must not silently
  // filter the whole board to nothing.
  useEffect(() => {
    if (proj === 'all' || !projects.rows.length) return;
    if (!projects.rows.some(p => String(p.id) === proj)) setProj('all');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects.rows]);

  // Live owner roster — names and avatars come from the org's real members,
  // not a fixture keyed on short-ids that matched nothing (D3).
  const ownerName = useCallback(
    (id: string) => (id && assignees.rows.find(a => a.id === id)?.name) || '',
    [assignees.rows]
  );
  const ownerLabel = useCallback(
    (id: string) => ownerName(id) || 'Unassigned',
    [ownerName]
  );

  const modules = useMemo(
    () => ['all', ...Array.from(new Set(tasks.map(t => t.moduleType)))],
    [tasks]
  );
  const list = tasks.filter(t =>
    (proj === 'all' || t.project === proj) &&
    (!mine || (myId != null && t.assignee === myId)) &&
    (mod === 'all' || t.moduleType === mod) &&
    t.status !== 'cancelled'
  );
  const byCol = (id: string) => list.filter(t => t.status === id);
  const byId = (id: string) => tasks.find(t => t.taskId === id);

  useEffect(() => {
    if (!liveTasks.loading && !liveTasks.error) {
      setAnnounce(`Task board loaded — ${list.length} task${list.length === 1 ? '' : 's'} shown.`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveTasks.loading, liveTasks.error, reloadKey]);

  // Move a card along the explicit transition map — optimistic, persisted via
  // PATCH /api/tasks/tasks/:taskId, reverted with the server's own message on
  // failure (the server runs the same state machine).
  const move = async (t: TaskItem, dir: number) => {
    const status = dir > 0 ? ADVANCE[t.status] : RETREAT[t.status];
    if (!status) return;
    const progress = status === 'completed' ? 100 : t.progress;
    setOverrides(o => ({ ...o, [t.taskId]: { status, progress } }));
    setActionErr('');
    const res = await apiCall('PATCH', '/api/tasks/tasks/' + encodeURIComponent(t.taskId), {
      status,
      progress,
    });
    if (res.ok) {
      setAnnounce(`"${t.title}" moved to ${(BOARD_COLS.find(c => c.id === status) || { label: status }).label}.`);
      // The override stays until the refetched rows arrive (cleared by the
      // rows effect above) — no flicker back to the old column.
      setReloadKey(k => k + 1);
      return;
    }
    setOverrides(o => { const { [t.taskId]: _drop, ...rest } = o; return rest; });
    if (res.status === 428 && (res.body as { code?: string } | null)?.code === 'ESIGN_REQUIRED') {
      // Approval-gated completion: run the signature ceremony, then retry.
      setSignReq({ t, status, progress });
      return;
    }
    setActionErr(apiErrorText(res, `Couldn't move "${t.title}".`));
  };

  // New task → the real persisted create (POST /api/tasks/tasks), then the
  // selected predecessors are linked into the dependency DAG.
  const create = async (
    payload: TaskCreateBody,
    dependsOn: string[],
  ): Promise<{ ok: boolean; error?: string }> => {
    const res = await apiCall<{ data?: { taskId?: string } }>('POST', '/api/tasks/tasks', payload);
    if (!res.ok || !res.body?.data?.taskId) {
      return { ok: false, error: apiErrorText(res, 'Could not create the task.') };
    }
    const newTaskId = String(res.body.data.taskId);
    // A failed dependency link never blocks the created task — but it must not
    // be silent either. Discarding these results meant that when every link
    // failed (e.g. an environment where task_dependencies.organization_id has
    // not been applied yet, so the route 400s on 42703), the board still
    // announced an unqualified "Task created" while the task landed with no
    // predecessors: never in Blocked, never gating, never cascaded to.
    const failed: string[] = [];
    for (const dep of dependsOn) {
      const link = await apiCall('POST', '/api/tasks/tasks/dependencies', {
        predecessorTaskId: dep,
        successorTaskId: newTaskId,
        dependencyType: 'finish-to-start',
      });
      if (!link.ok) failed.push(dep);
    }
    setReloadKey(k => k + 1);
    setCreating(false);
    if (failed.length) {
      const noun = dependsOn.length === 1 ? 'dependency' : 'dependencies';
      setActionErr(
        `Task created, but ${failed.length} of ${dependsOn.length} ${noun} could not be linked. Add them from the task's detail panel.`,
      );
      setAnnounce(
        `Task created: ${payload.title} — ${failed.length} dependency link${failed.length === 1 ? '' : 's'} failed.`,
      );
    } else {
      setAnnounce(`Task created: ${payload.title}.`);
    }
    // Still ok: the task itself persisted. Returning ok:false would keep the
    // modal open and invite a duplicate create; the partial failure is surfaced
    // through the existing role="alert" banner instead.
    return { ok: true };
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
      blocked: list.filter(t => t.blocked || t.status === 'blocked').length,
      crit: list.filter(t => t.criticalPath).length,
      reg: list.filter(t => t.regulatoryImpact).length,
      // Anything gated and not yet approved. `=== 'pending'` was always zero:
      // nothing writes that value (see task-signoff.ts for the real gate).
      appr: list.filter(t => t.approvalRequired && t.approvalStatus !== 'approved').length,
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
  const projLabel = (id: string) =>
    (projects.rows.find(p => String(p.id) === id) || { name: id ? `Project ${id}` : 'No project' }).name;

  /* Answer-first lead — computed from live task state */
  const overdue = list.filter(t => isOverdue(t));
  const workload = Object.entries(stats.byAsg || {}).map(([k, v]) => ({ k, open: v.open })).sort((a, b) => b.open - a.open);
  const heaviest = workload.find(w => w.k); // skip unassigned '' bucket for the narrative
  const critOpen = critChain.filter(t => t.status !== 'completed');
  const critBlocked = critChain.find(t => t.blocked || t.status === 'blocked');
  const milestone = critChain[critChain.length - 1];

  return (
    <div className="page-inner tb">
      <div aria-live="polite" className="sr-only">{announce}</div>
      <div className="ph">
        <div>
          <div className="ph-eyebrow">Project — collaboration</div>
          <h1 className="ph-title">Task board</h1>
          <div className="ph-sub">Every task across your organization — from documents, submissions, workflows and modules — with owners, dependencies and the critical path in one place. Filter to a project below.</div>
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

      {/* First load only. `useLiveData` raises `loading` on every refetch and
          preserves the previous rows, so gating on `loading` alone blanked the
          whole board into this spinner after each move/create/archive —
          unmounting the focused Advance button and dropping focus to <body>
          (a keyboard regression), and hiding the optimistic overlay that is
          meant to hold the card in its new column until the refetch lands. */}
      {liveTasks.loading && !liveTasks.rows.length ? (
        <div className="scaf-note" style={{ padding: '18px 10px' }}>Loading the task board…</div>
      ) : liveTasks.error ? (
        <EmptyState
          tone="error"
          icon={I.alertTriangle}
          title="Couldn't load the task board"
          hint="Your organization's tasks didn't load. Check your connection and retry, or sign in again."
        />
      ) : liveTasks.empty ? (
        <EmptyState
          icon={I.checkSquare}
          title="No tasks on the board yet"
          hint="Create a task, or start a workflow from a template to lay out a whole submission's work in one step."
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
            : <>The critical path is clear — nothing open is blocking the milestone right now.</>}
        body={critBlocked
          ? <>{critBlocked.blockedReason || 'It is blocked'} — nothing downstream on the path can move until it clears. {heaviest && heaviest.open > 3 ? <>{ownerLabel(heaviest.k)} is also carrying {heaviest.open} open tasks; auto-assign can rebalance.</> : null}</>
          : <>{overdue.length ? <>Clear the overdue work first, then the path flows. </> : null}{heaviest && heaviest.open >= 3 ? <>{ownerLabel(heaviest.k)} is the busiest at {heaviest.open} open tasks — workload-balanced auto-assign can spread the next batch.</> : <>Workload is balanced across the team.</>} {stats.appr ? <>{stats.appr} approval{stats.appr > 1 ? 's' : ''} pending.</> : null}</>}
        reassure={critBlocked || overdue.length ? "I will help you unblock the path and rebalance the team, one step at a time." : "You are on track. I will flag the moment anything threatens the milestone."}
        action={{
          label: critBlocked ? 'Unblock the critical path' : overdue.length ? 'Triage the overdue work' : 'Start a workflow from a template',
          onClick: () => { if (critBlocked || overdue.length) { setView('path'); } else { setWf(true); } },
          alt: { label: 'Auto-balance assignments', onClick: () => onAsk && onAsk('Rebalance open task assignments by workload using getOptimalAssignee') },
        }}
        secondary="Or work the board, critical path, and analytics below."
      />

      {/* Provenance strip — dev-only engineering view of task origins (D39) */}
      {DEV && (
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
        </div>
      )}

      {/* Filters + views */}
      <div className="tb-bar">
        <div className="tb-filters">
          <select className="tb-sel" value={proj} onChange={e => setProj(e.target.value)} aria-label="Filter by project">
            <option value="all">All projects</option>
            {projects.rows.map(p => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
          </select>
          <select className="tb-sel" value={mod} onChange={e => setMod(e.target.value)} aria-label="Filter by module">
            {modules.map(m => <option key={m} value={m}>{m === 'all' ? 'All modules' : m}</option>)}
          </select>
          {myId != null && (
            <button className={`tb-chip${mine ? ' on' : ''}`} aria-pressed={mine} onClick={() => setMine(m => !m)}>{I.user} My tasks</button>
          )}
        </div>
        <div className="seg tb-views" role="tablist" aria-label="Board views">
          {([['board', 'Board'], ['path', 'Critical path'], ['analytics', 'Analytics'], ['table', 'Table']] as const).map(([v, l]) => (
            <button key={v} role="tab" aria-selected={view === v} className={`seg-b${view === v ? ' on' : ''}`} onClick={() => setView(v)}>{l}</button>
          ))}
        </div>
      </div>

      {view === 'board' && (
        <div className="tb-kanban" data-cols="5">
          {BOARD_COLS.map(col => {
            const items = byCol(col.id);
            return (
              <div key={col.id} className="tb-col" role="group" aria-label={`${col.label} — ${items.length} task${items.length === 1 ? '' : 's'}`}>
                <div className="tb-col-h"><span className="kdot" data-tone={col.tone} /><span>{col.label}</span><span className="kn">{items.length}</span></div>
                <div className="tb-col-b">
                  {items.map(t => (
                    <div
                      key={t.taskId}
                      className="tb-card"
                      data-blocked={t.blocked || t.status === 'blocked' || undefined}
                      role="button"
                      tabIndex={0}
                      aria-label={`${t.title} — ${col.label}, ${t.priority} priority${t.due ? ', due ' + t.due : ''}`}
                      onClick={() => setSel(t)}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSel(t); } }}
                    >
                      <div className="tb-card-top">
                        <span className="tb-mod" style={{ '--m': TB_MOD[t.moduleType] || '#888' } as React.CSSProperties}>{t.moduleType}</span>
                        {t.criticalPath && <span className="tb-flag crit" title="On critical path">{I.zap}<span className="sr-only">On critical path</span></span>}
                        {t.regulatoryImpact && <span className="tb-flag reg" title="Regulatory impact">{I.shieldCheck}<span className="sr-only">Regulatory impact</span></span>}
                      </div>
                      <div className="tb-card-title">{t.title}</div>
                      {(t.blocked || t.status === 'blocked') && <div className="tb-blocked">{I.alertTriangle} {t.blockedReason || 'Blocked'}</div>}
                      <div className="tb-card-meta">
                        <span className="tb-type" data-t={t.taskType}>{TB_TYPE[t.taskType] || t.taskType}</span>
                        <span className={`tb-pri pri-${t.priority}`}>{t.priority}</span>
                        {t.approvalRequired && <span className="tb-appr" data-s={t.approvalStatus}>{t.approvalStatus === 'approved' ? 'approved' : t.approvalStatus === 'pending' ? 'approval — pending' : 'needs approval'}</span>}
                      </div>
                      {t.progress > 0 && t.progress < 100 && <div className="tb-prog"><span style={{ width: t.progress + '%' }} /></div>}
                      <div className="tb-card-foot">
                        {(t.dependsOn.length > 0 || t.blocks.length > 0) && <span className="tb-deps" title={t.dependsOn.length + ' upstream — ' + t.blocks.length + ' downstream'}>{I.gitCompare}{t.dependsOn.length + t.blocks.length}</span>}
                        {t.comments > 0 && <span className="tb-cmt">{t.comments}</span>}
                        <span className="tb-due" data-over={isOverdue(t) || undefined}>{t.due}</span>
                        <span className="tb-av" title={ownerLabel(t.assignee)}>{initials(ownerLabel(t.assignee))}</span>
                      </div>
                      <div className="tb-move" onClick={e => e.stopPropagation()}>
                        <button disabled={!RETREAT[t.status]} onClick={() => move(t, -1)} aria-label={`Move "${t.title}" back`} title="Move back">{I.left}</button>
                        <button disabled={!ADVANCE[t.status]} onClick={() => move(t, 1)} aria-label={`Advance "${t.title}"`} title="Advance">{I.chevRight}</button>
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
          <div className="tb-path-h">Critical path — {critChain.length} tasks, ordered by dependency</div>
          {critChain.map((t, i) => (
            <div key={t.taskId} className="tb-path-row" data-status={t.status} role="button" tabIndex={0}
              onClick={() => setSel(t)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSel(t); } }}>
              <div className="tb-path-rail"><span className="tb-path-dot" data-status={t.status} />{i < critChain.length - 1 && <span className="tb-path-line" />}</div>
              <div className="tb-path-card">
                <div className="tb-path-t">{t.title}<span className="tb-mod" style={{ '--m': TB_MOD[t.moduleType] || '#888' } as React.CSSProperties}>{t.moduleType}</span></div>
                <div className="tb-path-m">
                  <span>{t.phase || '—'}</span><span className="tb-dot">·</span><span>{ownerLabel(t.assignee)}</span><span className="tb-dot">·</span>
                  <span className={`tb-pri pri-${t.priority}`}>{t.priority}</span><span className="tb-dot">·</span><span>impact {t.impactScore ?? '—'}/10</span>
                  {(t.blocked || t.status === 'blocked') && <span className="tb-path-blk">{I.alertTriangle} blocked</span>}
                  <span className="sp" /><span className="tb-due" data-over={isOverdue(t) || undefined}>{t.due}</span>
                </div>
                {t.dependsOn.length > 0 && <div className="tb-path-dep">depends on {t.dependsOn.map(d => (byId(d) || { title: d }).title || d).join(' — ')}</div>}
              </div>
            </div>
          ))}
          {!critChain.length && <EmptyState icon={I.zap} title="No critical-path tasks" hint="Flag tasks as critical path (or start a workflow) and the dependency chain appears here." />}
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
              <div className="tb-an-h">Team workload</div>
              {Object.keys(stats.byAsg).map(k => (
                <div key={k} className="tb-an-row"><span className="tb-an-k"><span className="tb-av sm">{initials(ownerLabel(k))}</span>{ownerLabel(k)}</span><div className="tb-an-split"><span className="tb-an-open">{stats.byAsg[k].open} open</span><span className="tb-an-done">{stats.byAsg[k].done} done</span></div></div>
              ))}
              <div className="tb-an-foot">Auto-assign balances new work toward the least-loaded member.</div>
            </div>
          </div>
        </div>
      )}

      {view === 'table' && (
        <div className="ctable tb-table">
          <div className="ct-head" style={{ gridTemplateColumns: '130px 1.7fr 120px 96px 90px 110px 84px' }}><div>Task ID</div><div>Title</div><div>Module</div><div>Status</div><div>Priority</div><div>Owner</div><div>Due</div></div>
          {list.map(t => (
            <button key={t.taskId} className="ct-row" style={{ gridTemplateColumns: '130px 1.7fr 120px 96px 90px 110px 84px' }} onClick={() => setSel(t)}>
              <div className="ct-strong mono" style={{ fontSize: 10.5 }}>{t.taskId}</div>
              <div style={{ fontSize: 11.5 }}>{t.title}{t.criticalPath && <span className="tb-flag crit inline">{I.zap}</span>}{(t.blocked || t.status === 'blocked') && <span className="tb-flag blk inline">{I.alertTriangle}</span>}</div>
              <div><span className="tb-mod" style={{ '--m': TB_MOD[t.moduleType] || '#888' } as React.CSSProperties}>{t.moduleType}</span></div>
              <div style={{ fontSize: 11 }}>{(BOARD_COLS.find(c => c.id === t.status) || { label: t.status }).label}</div>
              <div><span className={`tb-pri pri-${t.priority}`}>{t.priority}</span></div>
              <div style={{ fontSize: 11 }}>{ownerLabel(t.assignee)}</div>
              <div style={{ fontSize: 11, color: isOverdue(t) ? 'var(--error)' : 'var(--text-400)' }}>{t.due}</div>
            </button>
          ))}
        </div>
      )}

      {/* Engineering status — dev builds only (D37) */}
      {DEV && (
        <details className="tb-gaps">
          <summary>Engineering status (dev only)</summary>
          <ul>
            <li>Reads GET /api/task-management/board (unified_tasks). Mutations via /api/tasks/* — audited (task-audit → c2c_ana_actions) with the status state machine + unblock cascade server-side.</li>
            <li>Notifications fire on assignment / blocked / completion (notification-service → mdx_notifications), surfaced in the Task Tray.</li>
            <li>Origin stores other than unified_tasks (projectTasks, project_tasks) are merged read-only in /api/submission-ops/unified-work.</li>
          </ul>
        </details>
      )}
      </>
      )}

      {creating && (
        <TaskCreate
          proj={proj}
          tasks={tasks}
          projects={projects.rows}
          assignees={assignees.rows}
          onClose={() => setCreating(false)}
          onCreate={create}
        />
      )}
      {wf && (
        <WorkflowStart
          proj={proj}
          projects={projects.rows}
          onClose={() => setWf(false)}
          onDone={(n, name) => {
            setWf(false);
            setReloadKey(k => k + 1);
            setAnnounce(`${n} tasks created from "${name}".`);
            setView('board');
          }}
        />
      )}
      {sel && (
        <TaskDetail
          t={sel}
          byId={byId}
          projLabel={projLabel}
          ownerLabel={ownerLabel}
          onClose={() => setSel(null)}
          onAsk={onAsk}
          onMove={move}
          onErr={setActionErr}
          onNotice={setAnnounce}
          onArchived={() => { setSel(null); setReloadKey(k => k + 1); }}
        />
      )}
      {signReq && (
        <ESignTaskModal
          req={signReq}
          onClose={() => setSignReq(null)}
          onSigned={() => {
            setSignReq(null);
            setReloadKey(k => k + 1);
            setAnnounce(`Signed and completed "${signReq.t.title}".`);
          }}
        />
      )}
    </div>
  );
}

/* ── E-signature ceremony — approval-gated task completion (§11.50) ──
   Triggered by the server's 428 ESIGN_REQUIRED. This is a REAL signature: the
   PIN is verified server-side against the same credential store + lockout
   policy as document sealing, and the manifestation (name, time, meaning) is
   appended to the task's approval history and the governed audit ledger. */

const SIGN_MEANINGS = ['APPROVED', 'REVIEWED', 'RESPONSIBILITY', 'AUTHORSHIP'] as const;

function ESignTaskModal({ req, onClose, onSigned }: {
  req: { t: TaskItem; status: string; progress: number };
  onClose: () => void;
  onSigned: () => void;
}) {
  const ref = useDialog(onClose);
  const [meaning, setMeaning] = useState<string>('APPROVED');
  const [reason, setReason] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const sign = async () => {
    if (busy || !pin || reason.trim().length < 3) return;
    setBusy(true);
    setErr('');
    const res = await apiCall('PATCH', '/api/tasks/tasks/' + encodeURIComponent(req.t.taskId), {
      status: req.status,
      progress: req.progress,
      reason: reason.trim(),
      signature: { pin, meaning },
    });
    if (res.ok) {
      onSigned();
      return;
    }
    setErr(apiErrorText(res, 'The signature was not accepted.'));
    setBusy(false);
    setPin(''); // never leave a rejected PIN in the field
  };

  return (
    <div className="tb-detail-bd" onClick={onClose}>
      <div className="tb-detail tb-create" role="dialog" aria-modal="true" aria-label="Electronic signature required" tabIndex={-1} ref={ref} onClick={e => e.stopPropagation()}>
        <div className="tb-detail-h">
          <div><h3>{I.lock} Sign to complete</h3></div>
          <button className="tb-detail-x" onClick={onClose} aria-label="Cancel signing">{I.close}</button>
        </div>
        <div className="tb-form">
          <div className="tb-detail-note" style={{ marginBottom: 8 }}>
            <b>{req.t.title}</b> is approval-gated. Completing it applies your electronic
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
              <input
                type="password"
                autoComplete="off"
                value={pin}
                onChange={e => setPin(e.target.value)}
                placeholder="Your signing PIN"
                aria-label="Signing PIN"
              />
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

/* ── Task detail panel ── */

interface TaskDetailProps {
  t: TaskItem;
  byId: (id: string) => TaskItem | undefined;
  projLabel: (id: string) => string;
  ownerLabel: (id: string) => string;
  onClose: () => void;
  onAsk: (text: string) => void;
  onMove: (t: TaskItem, dir: number) => void;
  onErr: (msg: string) => void;
  onNotice: (msg: string) => void;
  onArchived: () => void;
}

function TaskDetail({ t, byId, projLabel, ownerLabel, onClose, onAsk, onMove, onErr, onNotice, onArchived }: TaskDetailProps) {
  const ref = useDialog(onClose);
  const [reminding, setReminding] = useState(false);
  // Two-step archive: first click arms, second click within the window commits.
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [archiving, setArchiving] = useState(false);
  useEffect(() => {
    if (!confirmArchive) return;
    const id = setTimeout(() => setConfirmArchive(false), 4000);
    return () => clearTimeout(id);
  }, [confirmArchive]);
  const dep = (id: string) => { const d = byId(id); return d ? d.title : id; };
  const overdue = isOverdue(t);

  const archive = async () => {
    if (!confirmArchive) { setConfirmArchive(true); return; }
    if (archiving) return;
    setArchiving(true);
    const res = await apiCall('DELETE', `/api/tasks/tasks/${encodeURIComponent(t.taskId)}`, {
      reason: 'Archived from the task board',
    });
    if (res.ok) {
      onNotice(`Archived "${t.title}". The record is retained in the audit trail.`);
      onArchived();
      return;
    }
    onErr(apiErrorText(res, 'Could not archive the task.'));
    setArchiving(false);
    setConfirmArchive(false);
  };

  const remind = async () => {
    if (reminding) return;
    setReminding(true);
    const res = await apiCall('POST', `/api/tasks/tasks/${encodeURIComponent(t.taskId)}/notify`, {
      message: `Reminder: "${t.title}" is ${overdue ? 'overdue' : 'waiting on you'}${t.due ? ` (due ${t.due})` : ''}.`,
    });
    if (res.ok) onNotice(`Reminder sent to ${ownerLabel(t.assignee)}.`);
    else onErr(apiErrorText(res, 'Could not send the reminder.'));
    setReminding(false);
  };

  return (
    <div className="tb-detail-bd" onClick={onClose}>
      <div className="tb-detail" role="dialog" aria-modal="true" aria-label={`Task: ${t.title}`} tabIndex={-1} ref={ref} onClick={e => e.stopPropagation()}>
        <div className="tb-detail-h">
          <div><span className="mono" style={{ fontSize: 10.5, color: 'var(--text-400)' }}>{t.taskId}</span><h3>{t.title}</h3></div>
          <button className="tb-detail-x" onClick={onClose} aria-label="Close task details">{I.close}</button>
        </div>
        <div className="tb-detail-chips">
          <span className="tb-mod" style={{ '--m': TB_MOD[t.moduleType] || '#888' } as React.CSSProperties}>{t.moduleType}</span>
          <span className="tb-type" data-t={t.taskType}>{TB_TYPE[t.taskType] || t.taskType}</span>
          <span className={`tb-pri pri-${t.priority}`}>{t.priority}</span>
          {t.criticalPath && <span className="tb-flag crit lg">{I.zap} critical path</span>}
          {t.regulatoryImpact && <span className="tb-flag reg lg">{I.shieldCheck} regulatory</span>}
        </div>
        {(t.blocked || t.status === 'blocked') && <div className="tb-blocked lg">{I.alertTriangle} {t.blockedReason || 'Blocked'}</div>}
        <div className="tb-detail-grid">
          <div><label>Project</label><span>{projLabel(t.project)}</span></div>
          <div><label>Phase</label><span>{t.phase || '—'}</span></div>
          <div><label>Owner</label><span>{ownerLabel(t.assignee)}</span></div>
          <div><label>Assigned by</label><span>{ownerLabel(t.assignedBy) === 'Unassigned' ? '—' : ownerLabel(t.assignedBy)}</span></div>
          <div><label>Impact score</label><span>{t.impactScore ?? '—'}/10</span></div>
          <div><label>Due</label><span style={{ color: overdue ? 'var(--error)' : 'inherit' }}>{t.due || '—'}</span></div>
          <div><label>Progress</label><span>{t.progress}%</span></div>
          <div><label>Estimated</label><span>{t.estimatedHours != null ? `${t.estimatedHours}h` : '—'}</span></div>
        </div>
        {t.approvalRequired && (
          <div className="tb-detail-sec">
            <div className="tb-detail-sec-h">Approval checkpoint <span className="tb-appr" data-s={t.approvalStatus}>{t.approvalStatus.replace('_', ' ')}</span></div>
            <div className="tb-detail-note">This task cannot complete without a recorded approval.</div>
          </div>
        )}
        {(t.dependsOn.length > 0 || t.blocks.length > 0) && (
          <div className="tb-detail-sec">
            <div className="tb-detail-sec-h">Dependencies</div>
            {t.dependsOn.map(d => <div key={d} className="tb-dep-row up">{I.arrowUp} depends on <b>{dep(d)}</b></div>)}
            {t.blocks.map(d => <div key={d} className="tb-dep-row dn">{I.arrowRight} blocks <b>{dep(d)}</b></div>)}
          </div>
        )}
        <div className="tb-detail-sec">
          <div className="tb-detail-sec-h">Audit</div>
          <div className="tb-detail-note">Changes to this task — creation, status moves, links and assignments — are recorded in the governed audit ledger.</div>
        </div>
        <div className="tb-detail-f">
          <button className="btn ghost" onClick={() => { onAsk && onAsk('Draft a status update for ' + t.taskId + ': ' + t.title); onClose(); }}>{I.sparkles} Ask AnA</button>
          {t.assignee && (
            <button className="btn ghost" disabled={reminding} onClick={remind}>{I.bell || I.messageSquare} {reminding ? 'Sending…' : 'Send reminder'}</button>
          )}
          <button
            className="btn ghost"
            style={confirmArchive ? { color: 'var(--error)', borderColor: 'var(--error)' } : undefined}
            disabled={archiving}
            onClick={archive}
            aria-label={confirmArchive ? `Confirm archiving "${t.title}"` : `Archive "${t.title}"`}
          >
            {archiving ? 'Archiving…' : confirmArchive ? 'Confirm archive' : 'Archive'}
          </button>
          <span className="sp" />
          <button className="btn ghost" disabled={!RETREAT[t.status]} onClick={() => { onMove(t, -1); onClose(); }}>Move back</button>
          <button className="btn primary" disabled={!ADVANCE[t.status]} onClick={() => { onMove(t, 1); onClose(); }}>{I.chevRight} Advance</button>
        </div>
      </div>
    </div>
  );
}

/* ── New task intake — persists via POST /api/tasks/tasks ── */

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

interface TaskCreateProps {
  onClose: () => void;
  onCreate: (payload: TaskCreateBody, dependsOn: string[]) => Promise<{ ok: boolean; error?: string }>;
  proj: string;
  /** Live board rows — the dependency picker's candidates. */
  tasks: TaskItem[];
  projects: ProjectOpt[];
  assignees: AssigneeOpt[];
}

interface CreateForm {
  title: string;
  description: string;
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
  dependsOn: string[];
  depQuery: string;
}

function TaskCreate({ onClose, onCreate, proj, tasks, projects, assignees }: TaskCreateProps) {
  const ref = useDialog(onClose);
  const [f, setF] = useState<CreateForm>({
    title: '', description: '', project: proj && proj !== 'all' ? proj : '', moduleType: 'Clinical', taskType: 'deliverable',
    status: 'pending', priority: 'high', assignee: 'auto', impactScore: 6,
    criticalPath: false, regulatoryImpact: true, approvalRequired: false,
    dueDays: 7, dependsOn: [], depQuery: '',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = <K extends keyof CreateForm>(k: K, v: CreateForm[K]) => setF(p => ({ ...p, [k]: v }));

  // Default the project picker to the first real project once the list loads,
  // and never leave it on a stale non-matching id.
  useEffect(() => {
    if (!projects.length) return;
    const ids = projects.map(p => String(p.id));
    if (!f.project || !ids.includes(f.project)) set('project', String(projects[0].id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects]);

  const toggleDep = (id: string) => set('dependsOn', f.dependsOn.includes(id) ? f.dependsOn.filter(x => x !== id) : [...f.dependsOn, id]);
  const depCandidates = tasks
    .filter(t => t.status !== 'completed' && t.status !== 'cancelled')
    .filter(t => t.project === f.project || f.dependsOn.includes(t.taskId))
    .filter(t => !f.depQuery || t.title.toLowerCase().includes(f.depQuery.toLowerCase()))
    .slice(0, 30);

  const doCreate = async () => {
    if (!f.title.trim() || busy) return;
    setBusy(true);
    setErr('');
    const due = new Date();
    due.setDate(due.getDate() + (Number.isFinite(f.dueDays) ? f.dueDays : 0));
    const body: TaskCreateBody = {
      title: f.title.trim(),
      description: f.description.trim() || undefined,
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
      <div className="tb-detail tb-create" role="dialog" aria-modal="true" aria-label="New task" tabIndex={-1} ref={ref} onClick={e => e.stopPropagation()}>
        <div className="tb-detail-h">
          <div><h3>New task</h3></div>
          <button className="tb-detail-x" onClick={onClose} aria-label="Close new task form">{I.close}</button>
        </div>
        <div className="tb-form">
          <div className="tb-field full"><label>Title<i>*</i></label><input type="text" autoFocus value={f.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Reconcile 2.5.4 efficacy claim with CSR-201 dataset" /></div>
          <div className="tb-field full"><label>Description <span style={{ color: 'var(--text-400)', fontWeight: 400 }}>— optional</span></label><textarea rows={2} value={f.description} onChange={e => set('description', e.target.value)} placeholder="Context for the assignee…" /></div>
          <div className="tb-frow">
            <div className="tb-field"><label>Project</label><select value={f.project} onChange={e => set('project', e.target.value)}>{projects.length ? projects.map(p => <option key={p.id} value={String(p.id)}>{p.name}</option>) : <option value="">No projects available</option>}</select></div>
            <div className="tb-field"><label>Module</label><select value={f.moduleType} onChange={e => set('moduleType', e.target.value)}>{Object.keys(TB_MOD).filter(m => !m.includes(' ') && m !== 'general').map(m => <option key={m} value={m}>{m}</option>)}</select></div>
          </div>
          <div className="tb-frow">
            <div className="tb-field"><label>Task type</label><select value={f.taskType} onChange={e => set('taskType', e.target.value)}>{Object.keys(TB_TYPE).map(t => <option key={t} value={t}>{TB_TYPE[t]}</option>)}</select></div>
            <div className="tb-field"><label>Priority</label><select value={f.priority} onChange={e => set('priority', e.target.value)}>{PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}</select></div>
          </div>
          <div className="tb-frow">
            <div className="tb-field"><label>Status</label><select value={f.status} onChange={e => set('status', e.target.value)}>{BOARD_COLS.filter(c => c.id !== 'completed' && c.id !== 'blocked').map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></div>
            <div className="tb-field"><label>Assignee</label><select value={f.assignee} onChange={e => set('assignee', e.target.value)}><option value="auto">Auto — least-loaded member</option>{assignees.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
          </div>
          <div className="tb-frow">
            <div className="tb-field"><label>Impact score — {f.impactScore}/10</label><input type="range" min="0" max="10" value={f.impactScore} aria-label="Impact score" onChange={e => set('impactScore', +e.target.value)} /></div>
            <div className="tb-field"><label>Due in (days)</label><input type="number" min="0" max="120" value={f.dueDays} onChange={e => set('dueDays', +e.target.value)} /></div>
          </div>
          <div className="tb-field full"><label>Flags</label>
            <div className="tb-toggles">
              <button type="button" className={`tb-tog${f.criticalPath ? ' on' : ''}`} aria-pressed={f.criticalPath} onClick={() => set('criticalPath', !f.criticalPath)}><span className="ico">{I.zap}</span>Critical path</button>
              <button type="button" className={`tb-tog${f.regulatoryImpact ? ' on' : ''}`} aria-pressed={f.regulatoryImpact} onClick={() => set('regulatoryImpact', !f.regulatoryImpact)}><span className="ico">{I.shieldCheck}</span>Regulatory impact</button>
              <button type="button" className={`tb-tog${f.approvalRequired ? ' on' : ''}`} aria-pressed={f.approvalRequired} onClick={() => set('approvalRequired', !f.approvalRequired)}><span className="ico">{I.checkSquare}</span>Approval required</button>
            </div>
          </div>
          <div className="tb-field full"><label>Depends on <span style={{ color: 'var(--text-400)', fontWeight: 400 }}>— open tasks in this project</span></label>
            {depCandidates.length > 6 || f.depQuery ? (
              <input type="text" value={f.depQuery} onChange={e => set('depQuery', e.target.value)} placeholder="Filter tasks…" aria-label="Filter dependency candidates" style={{ marginBottom: 6 }} />
            ) : null}
            <div className="tb-dep-pick">
              {depCandidates.map(t => (
                <button type="button" key={t.taskId} className={`tb-dep-opt${f.dependsOn.includes(t.taskId) ? ' on' : ''}`} aria-pressed={f.dependsOn.includes(t.taskId)} onClick={() => toggleDep(t.taskId)} title={t.title}>
                  {f.dependsOn.includes(t.taskId) ? I.check : I.plus}<span>{t.title}</span>
                </button>
              ))}
              {!depCandidates.length && <span style={{ fontSize: 11, color: 'var(--text-400)' }}>No open tasks in this project yet.</span>}
            </div>
          </div>
          {f.assignee === 'auto' && <div className="tb-auto-note"><span className="ico">{I.sparkles}</span><span>Auto-assign picks the least-loaded member of your organization and notifies them.</span></div>}
          {err && <div className="tb-auto-note" data-warn="true" role="alert"><span className="ico">{I.alertTriangle}</span><span>{err}</span></div>}
        </div>
        <div className="tb-detail-f">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!f.title.trim() || busy} onClick={doCreate}>{I.plus} {busy ? 'Creating…' : 'Create task'}</button>
        </div>
      </div>
    </div>
  );
}

/* ── Workflow templates — real list + real instantiation ── */

interface ServerTemplateTask {
  id?: string;
  title: string;
  moduleType?: string;
  taskType?: string;
  priority?: string;
  dayOffset?: number;
  duration?: number;
  estimatedHours?: number;
}
interface ServerTemplate {
  templateId: string;
  name: string;
  description?: string;
  category?: string;
  builtin?: boolean;
  tasks: ServerTemplateTask[];
  dependencies?: Array<{ predecessor: string; successor: string }>;
  milestones?: string[];
  regulatoryRequirements?: string[];
}

interface WorkflowStartProps {
  proj: string;
  projects: ProjectOpt[];
  onClose: () => void;
  onDone: (createdCount: number, templateName: string) => void;
}

function WorkflowStart({ proj, projects, onClose, onDone }: WorkflowStartProps) {
  const ref = useDialog(onClose);
  const templates = useLiveRows<ServerTemplate>('/api/tasks/templates');
  const [tid, setTid] = useState('');
  const [project, setProject] = useState(proj && proj !== 'all' ? proj : '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (templates.rows.length && !templates.rows.some(t => t.templateId === tid)) {
      setTid(templates.rows[0].templateId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates.rows]);
  useEffect(() => {
    if (!projects.length) return;
    const ids = projects.map(p => String(p.id));
    if (!project || !ids.includes(project)) setProject(String(projects[0].id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects]);

  const tpl = templates.rows.find(t => t.templateId === tid) || null;
  const totalHours = (tpl?.tasks ?? []).reduce((a, t) => a + (t.estimatedHours || 8), 0);
  const span = tpl?.tasks?.length ? Math.max(...tpl.tasks.map(t => (t.dayOffset || 0) + (t.duration || 0))) : 0;

  const instantiate = async () => {
    if (!tpl || busy) return;
    setBusy(true);
    setErr('');
    const res = await apiCall<{ success?: boolean; count?: number }>(
      'POST',
      `/api/tasks/tasks/from-template/${encodeURIComponent(tpl.templateId)}`,
      {
        projectId: Number.isFinite(Number(project)) && Number(project) > 0 ? Number(project) : undefined,
        startDate: new Date().toISOString(),
        adjustDates: true,
      },
    );
    if (!res.ok || !res.body?.success) {
      setErr(apiErrorText(res, 'Could not start the workflow.'));
      setBusy(false);
      return;
    }
    onDone(Number(res.body.count) || (tpl.tasks?.length ?? 0), tpl.name);
  };

  return (
    <div className="tb-detail-bd" onClick={onClose}>
      <div className="tb-detail tb-create" role="dialog" aria-modal="true" aria-label="Start a workflow" tabIndex={-1} ref={ref} onClick={e => e.stopPropagation()}>
        <div className="tb-detail-h">
          <div><h3>Start a workflow</h3></div>
          <button className="tb-detail-x" onClick={onClose} aria-label="Close workflow form">{I.close}</button>
        </div>
        <div className="tb-form">
          {templates.loading ? (
            <div className="scaf-note" style={{ padding: '12px 4px' }}>Loading workflow templates…</div>
          ) : templates.error ? (
            <div className="tb-auto-note" data-warn="true" role="alert"><span className="ico">{I.alertTriangle}</span><span>Couldn't load workflow templates. Retry, or create tasks individually.</span></div>
          ) : !templates.rows.length ? (
            <div className="tb-auto-note"><span className="ico">{I.info}</span><span>No workflow templates are available yet.</span></div>
          ) : (
            <>
              <div className="tb-frow">
                <div className="tb-field"><label>Workflow template</label><select value={tid} onChange={e => setTid(e.target.value)}>{templates.rows.map(t => <option key={t.templateId} value={t.templateId}>{t.name}{t.builtin ? ' (standard)' : ''}</option>)}</select></div>
                <div className="tb-field"><label>Project</label><select value={project} onChange={e => setProject(e.target.value)}>{projects.length ? projects.map(p => <option key={p.id} value={String(p.id)}>{p.name}</option>) : <option value="">No projects available</option>}</select></div>
              </div>
              {tpl && (
                <>
                  {tpl.description && <div style={{ fontSize: 11.5, color: 'var(--text-400)', margin: '2px 0 6px' }}>{tpl.description}</div>}
                  <div className="wf-meta">
                    <span><b>{tpl.tasks.length}</b> tasks</span><span className="tb-dot">·</span><span><b>{span}</b>-day span</span><span className="tb-dot">·</span><span><b>{totalHours}</b>h effort</span><span className="tb-dot">·</span><span><b>{tpl.dependencies?.length ?? 0}</b> dependencies</span>
                  </div>
                  <div className="tb-field full"><label>Tasks this creates <span style={{ color: 'var(--text-400)', fontWeight: 400 }}>— dependency-linked, date-offset from today</span></label>
                    <div className="wf-tasks">
                      {tpl.tasks.map((t, i) => (
                        <div key={t.id ?? i} className="wf-task">
                          <span className="wf-task-n">{i + 1}</span>
                          <span className="tb-mod" style={{ '--m': TB_MOD[t.moduleType ?? ''] || '#888' } as React.CSSProperties}>{t.moduleType ?? 'general'}</span>
                          <span className="wf-task-t">{t.title}</span>
                          <span className="wf-task-d">day +{t.dayOffset ?? 0} · {t.duration ?? 1}d</span>
                          <span className={`tb-pri pri-${t.priority ?? 'medium'}`}>{t.priority ?? 'medium'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  {(tpl.regulatoryRequirements?.length || tpl.milestones?.length) ? (
                    <div className="wf-reqs">
                      {tpl.regulatoryRequirements?.length ? <div><span className="wf-reqs-l">Regulatory basis</span>{tpl.regulatoryRequirements.map(r => <span key={r} className="wf-tag">{r}</span>)}</div> : null}
                      {tpl.milestones?.length ? <div><span className="wf-reqs-l">Milestones</span>{tpl.milestones.map(r => <span key={r} className="wf-tag ok">{r}</span>)}</div> : null}
                    </div>
                  ) : null}
                </>
              )}
              {err && <div className="tb-auto-note" data-warn="true" role="alert"><span className="ico">{I.alertTriangle}</span><span>{err}</span></div>}
            </>
          )}
        </div>
        <div className="tb-detail-f">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!tpl || busy || !templates.rows.length} onClick={instantiate}>{I.plus} {busy ? 'Creating…' : tpl ? `Create ${tpl.tasks.length} tasks` : 'Create tasks'}</button>
        </div>
      </div>
    </div>
  );
}
