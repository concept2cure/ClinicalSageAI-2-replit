import React, { useState, useEffect } from 'react';
import { I } from '../icons';
import { useLiveRows } from '../dataConnect';
import {
  SURFACE_CTX, CL_MOD, CL_OPTIMAL, CL_TYPE, CL_PRI,
  TB_TEAM, TB_PROJECTS,
  type C2CTask, type ActivityItem, type TeamMember, type ProjectEntry,
} from '../fixtures/collab-data';

/* ================================================================
   Collaboration layer -- universal "add to tasking / assign / collaborate"
   available from EVERY surface.

   Grounded in the concept2cure-v2 backend (forensic):
     - Canonical store: unifiedTasks (shared/schema.ts) via
       /api/task-management (server/routes/taskManagement.routes.ts).
     - createTaskSchema fields: title, description, moduleType,
       moduleSource, projectId, taskType, priority, assigneeId,
       dueDate, estimatedHours, dependencies[], tags[].
     - Polymorphic origin: sourceEntityType + sourceEntityId.
     - Honest gaps: task-audit.ts coded but unwired; notifications
       stubbed; the assignee roster below is sample data.

   NOT true of THIS form, despite what this header used to say:
   "Auto-assign: getOptimalAssignee() (workload-balanced)".
   getOptimalAssignee IS real — taskManagement.routes.ts:229 queries the
   organisation's users, sums their active estimated hours and returns the
   lowest. But this form never reaches it: create() never POSTs, and
   optimalFor() returns CL_OPTIMAL[m], a static map from module name to a
   fixed short-id. The server balances workload; this form does not call
   the server. The header described the server's behaviour as though it
   were this form's, and that framing was copied into other comments and
   into a string the user reads.

   This module owns ONE shared store (C2C) so a task created from
   the editor, a submission, a safety case or the board all land in
   the same place. TaskBoard subscribes to it.
   ================================================================ */

/* ── Interfaces ── */

interface C2CContext {
  surfaceId: string;
  surfaceLabel: string;
  project: string;
  entityType: string;
  entityId: string | null;
  entityLabel: string | null;
  moduleType: string;
}

interface QuickTaskForm {
  title: string;
  project: string;
  moduleType: string;
  taskType: string;
  priority: string;
  assignee: string;
  dueDays: number;
  criticalPath: boolean;
  regulatoryImpact: boolean;
  approvalRequired: boolean;
  note: string;
}

interface QuickTaskProps {
  ctx: C2CContext;
  onClose: () => void;
  onCreated?: (t: C2CTask) => void;
  onGoToBoard?: () => void;
}

interface CollabDiscussProps {
  ctx: C2CContext;
  onClose: () => void;
  onCreated?: (t?: C2CTask) => void;
}

interface CollabLayerProps {
  onNav?: (id: string) => void;
}

interface ToastState {
  type: 'task' | 'msg';
  t?: C2CTask;
}

/* ── Shared C2C store ──
   Module-level mutable state with a subscriber pattern. Deferred
   emit avoids "Cannot update a component while rendering a different
   component" -- notifications fire on a microtask, never synchronously.

   Real-data standard: the store starts EMPTY -- no fixture seed. It holds only
   tasks added at runtime (optimistic, in-session). The org-wide unifiedTasks
   board is real persisted data served by GET /api/task-management/board
   (server/routes/taskBoard.routes.ts); the launcher's "open across the org"
   count reads that live below, and TaskBoard wires the same endpoint in its own
   pass. C2C.list() therefore no longer hands fabricated rows to window.C2C
   consumers -- until a live task is added it is honestly empty.

   RETAINED, not dead code (audit determination): this in-session store still
   has WRITE consumers -- TaskBoard's New task / Move / Start-workflow actions
   and this file's own QuickTask / CollabDiscuss forms call
   window.C2C.addTask / update. Those are MOCK, unpersisted actions (flagged at
   each call site): their rows are orphaned from the live board above, which
   reads the real GET /api/task-management/board. The store stays until those
   writes are wired to POST /api/task-management/tasks in the actions pass -- it
   is not removed while a consumer remains. */

type Subscriber = () => void;

let tasks: C2CTask[] = [];
const subs = new Set<Subscriber>();
const defer = (typeof queueMicrotask === 'function')
  ? queueMicrotask
  : (fn: () => void) => { setTimeout(fn, 0); };

function emit(): void {
  defer(() => {
    subs.forEach(fn => { try { fn(); } catch (_e) { /* subscriber error */ } });
    try { window.dispatchEvent(new CustomEvent('c2c:tasks')); } catch (_e) { /* noop */ }
  });
}

let ctx: C2CContext = {
  surfaceId: 'home',
  surfaceLabel: 'Home',
  project: TB_PROJECTS[0].id,
  entityType: 'workspace',
  entityId: null,
  entityLabel: null,
  moduleType: 'Regulatory',
};

export const C2C = {
  // Fixture-backed option-sources for the QuickTask / CollabDiscuss forms, which
  // are MOCK actions (create()/send() never POST).
  //
  // The comment here used to say the backends these SHOULD read "are REAL --
  // team: GET /api/collaboration/team (users), projects: GET /api/projects".
  // Half of that was false: /api/projects is mounted
  // (register-project-routes.ts:33), but /api/collaboration/team does not
  // exist -- no route defines it and no /api/collaboration prefix is mounted
  // anywhere in server/bootstrap or server/startup. It was never a backend
  // waiting to be wired; it was a path someone wrote down.
  //
  // The rest still holds: any real roster is keyed by numeric user id while
  // these pickers, avatars and CL_OPTIMAL are keyed on fixture short-ids
  // (jc/mw/...), so this cannot be switched over without changing that key.
  //
  // It also used to end "not presented as live". That is a claim about the
  // SCREEN, and a code comment cannot satisfy it -- a user opening the form saw
  // seven named colleagues and nothing telling them otherwise. The pickers now
  // carry a visible note; see SAMPLE_ROSTER_NOTE below.
  team: TB_TEAM as Record<string, TeamMember>,
  projects: TB_PROJECTS as ProjectEntry[],
  mod: CL_MOD,
  optimal: CL_OPTIMAL,

  modColor(m: string): string {
    return CL_MOD[m] || '#888';
  },
  list(): C2CTask[] {
    return tasks;
  },
  subscribe(fn: Subscriber): () => void {
    subs.add(fn);
    return () => { subs.delete(fn); };
  },
  optimalFor(m: string): string {
    return CL_OPTIMAL[m] || 'jc';
  },

  /* Surface context -- App calls this on every navigation; surfaces may
     refine it for entity-level granularity (a section, a case, a filing). */
  setSurface(id: string, label?: string): void {
    const d = SURFACE_CTX[id] || SURFACE_CTX.home;
    ctx = {
      surfaceId: id,
      surfaceLabel: label || id,
      project: ctx.project,
      entityType: d.et,
      entityId: null,
      entityLabel: null,
      moduleType: d.mod,
    };
    emit();
  },
  setContext(patch: Partial<C2CContext>): void {
    ctx = { ...ctx, ...patch };
    emit();
  },
  /**
   * The launcher's context, reconciled against the shell's own state on read.
   *
   * `ctx` above is module-level and was written in exactly one place —
   * `Projects.tsx:390`, when you open a project from the Projects list.
   * `setSurface`'s comment claims "App calls this on every navigation"; App
   * does not, and never did. So `ctx.surfaceId` stayed `'home'` no matter where
   * you were, and `ctx.project` stayed at its initialiser, `TB_PROJECTS[0].id`
   * — the FIXTURE `bx204` / "BX-204 — NDA 212345".
   *
   * The result was a modal that opened on the CMC module with BX-301 selected
   * and said "From: Home", stamping the task against BX-204. Two of the four
   * fields the form displays were wrong on every surface except one.
   *
   * `window.C2C_PROJECT` is the shell's single source of truth for the open
   * project (V2App writes it; Projects, MdxSurfaceHost and ProjectHome all read
   * it) and `window.location.pathname` is where the shell actually is. Reading
   * them here means the launcher cannot drift from the shell, because it no
   * longer keeps its own copy to drift with — `setSurface` / `setContext` still
   * work and still win, they are just no longer the only writer.
   */
  getContext(): C2CContext {
    const live: C2CContext = { ...ctx };

    try {
      const proj = (window as any).C2C_PROJECT as { id?: string } | undefined;
      if (proj?.id) live.project = String(proj.id);
    } catch (_e) { /* no window / no selection — keep whatever ctx holds */ }

    // Only adopt the URL's surface when nothing has refined the context for a
    // specific entity; a surface that called setContext({ entityLabel }) is
    // being more precise than the path is, and should not be overwritten.
    if (!ctx.entityId && !ctx.entityLabel) {
      try {
        const id = (window.location.pathname.split('/').filter(Boolean).pop() || '').toLowerCase();
        if (id && SURFACE_CTX[id]) {
          const d = SURFACE_CTX[id];
          live.surfaceId = id;
          live.surfaceLabel = id;
          live.entityType = d.et;
          live.moduleType = d.mod;
        }
      } catch (_e) { /* no location — keep ctx */ }
    }

    return live;
  },
  surfaceNoun(id: string): string {
    return (SURFACE_CTX[id] || SURFACE_CTX.home).noun;
  },

  addTask(task: Partial<C2CTask> & Record<string, unknown>): C2CTask {
    const id = (task.taskId as string) || ('C2C-TASK-' + (2300 + Math.floor(Math.random() * 699)));
    const t: C2CTask = {
      status: 'pending', progress: 0, comments: 0, attachments: 0,
      dependsOn: [], blocks: [], priority: 'high', taskType: 'action', impactScore: 6,
      criticalPath: false, regulatoryImpact: true, approvalRequired: false,
      approvalStatus: 'not_started', assignedBy: 'jc', source: 'unified',
      activity: [], title: '', project: '', moduleType: '', assignee: '', due: '', phase: '',
      ...task,
      taskId: id,
    };
    tasks = [t, ...tasks];
    emit();
    return t;
  },
  update(taskId: string, patch: Partial<C2CTask>): void {
    tasks = tasks.map(t => t.taskId === taskId ? { ...t, ...patch } : t);
    emit();
  },
  addComment(taskId: string, msg: ActivityItem): void {
    tasks = tasks.map(t => {
      if (t.taskId !== taskId) return t;
      const act = [...(t.activity || []), msg];
      return { ...t, comments: (t.comments || 0) + 1, activity: act };
    });
    emit();
  },
  open(mode?: string, patch?: Partial<C2CContext>): void {
    if (patch) ctx = { ...ctx, ...patch };
    window.dispatchEvent(new CustomEvent('c2c:open-collab', { detail: { mode: mode || 'task' } }));
  },
};

/* Expose on window for cross-module access (TaskBoard, App, etc.) */
(window as any).C2C = C2C;

/* ================================================================
   UI -- the universal launcher + Quick task / Collaborate modal.
   Mounted ONCE by App. Reads C2C live so it works identically on
   every surface.
   ================================================================ */

function clAvatar(id: string): string {
  const p = (C2C.team[id]) || { n: '?' };
  return (p.n || '?').split(' ').map(s => s[0]).join('').slice(0, 2);
}

/**
 * Says out loud that the people in the assignee pickers are not real.
 *
 * C2C.team is TB_TEAM: seven invented colleagues — "J. Chen — Reg Affairs",
 * "S. Marchetti — Reg lead" and five more — defined in
 * fixtures/task-board-data.ts. They are published into the shared C2C context,
 * which this module's own header describes as available from every surface, so
 * the same fabricated roster is what a user picks from anywhere in the product.
 *
 * The code already knew. C2C's comment ended "not presented as live", and the
 * Discuss form already warned that the message is not persisted. Neither
 * reaches the point: a user who reads "this message will not be sent" concludes
 * the send is broken, not that the colleague they addressed it to was invented.
 * The gap between "the action is stubbed" and "these people do not exist" is
 * where someone assigns a regulatory task to a name and waits for an answer.
 *
 * A code comment is not a disclosure. This is the version the user can read.
 * It goes away when the roster comes from a real backend — which today does not
 * exist: /api/collaboration/team is defined nowhere and mounted nowhere.
 */
function SampleRosterNote() {
  return (
    <div className="cl-warn">
      <span className="ico">{I.alertTriangle}</span>
      The people listed here are sample data, not your organisation. No directory
      is connected yet, so these names do not correspond to anyone who can receive
      an assignment.
    </div>
  );
}

/* ── Quick task -- unifiedTasks intake, context pre-filled ── */

function QuickTask({ ctx: surfaceCtx, onClose, onCreated, onGoToBoard }: QuickTaskProps) {
  const projInit = surfaceCtx.project && surfaceCtx.project !== 'all'
    ? surfaceCtx.project
    : C2C.projects[0].id;

  const [f, setF] = useState<QuickTaskForm>({
    title: '', project: projInit, moduleType: surfaceCtx.moduleType || 'Regulatory',
    taskType: 'action', priority: 'high', assignee: 'auto', dueDays: 7,
    criticalPath: false, regulatoryImpact: true, approvalRequired: false, note: '',
  });

  const set = <K extends keyof QuickTaskForm>(k: K, v: QuickTaskForm[K]) =>
    setF(p => ({ ...p, [k]: v }));

  const who = f.assignee === 'auto' ? C2C.optimalFor(f.moduleType) : f.assignee;
  const whoName = (C2C.team[who] || { n: who }).n;

  const create = (another: boolean) => {
    if (!f.title.trim()) return;
    // MOCK ACTION (flagged): optimistic in-session add only. Does NOT call the
    // real POST /api/task-management/tasks (taskManagement.routes.ts -> inserts
    // unifiedTasks with server-side getOptimalAssignee). Wire in the actions pass.
    const t = C2C.addTask({
      title: f.title.trim(), project: f.project, moduleType: f.moduleType,
      taskType: f.taskType, priority: f.priority, assignee: who,
      assignmentType: f.assignee === 'auto' ? 'auto' : 'manual',
      criticalPath: f.criticalPath, regulatoryImpact: f.regulatoryImpact,
      approvalRequired: f.approvalRequired,
      approvalStatus: f.approvalRequired ? 'pending' : 'not_started',
      due: f.dueDays <= 0 ? 'today' : ('in ' + f.dueDays + ' day' + (f.dueDays > 1 ? 's' : '')),
      phase: surfaceCtx.entityLabel || surfaceCtx.surfaceLabel,
      sourceEntityType: surfaceCtx.entityType,
      sourceEntityId: surfaceCtx.entityId || surfaceCtx.surfaceId,
      sourceLabel: surfaceCtx.entityLabel || surfaceCtx.surfaceLabel,
      activity: f.note.trim()
        ? [{ type: 'note', text: f.note.trim(), who: 'You', when: 'just now' }]
        : [],
    });
    onCreated?.(t);
    if (another) { setF(p => ({ ...p, title: '', note: '' })); } else { onClose(); }
  };

  return (
    <div className="cl-field-grp">
      <div className="cl-ctxbar">
        <span className="cl-ctx-k">From</span>
        <span className="cl-ctx-chip"><span className="ico">{I.target || I.crosshair || I.zap}</span>{surfaceCtx.entityLabel || surfaceCtx.surfaceLabel}</span>
        <span className="cl-ctx-meta">stamped as <code>sourceEntityType: {surfaceCtx.entityType}</code></span>
      </div>
      <div className="cl-field"><label>Task<i>*</i></label>
        <input type="text" autoFocus value={f.title} onChange={e => set('title', e.target.value)}
          placeholder={'e.g. Review ' + C2C.surfaceNoun(surfaceCtx.surfaceId) + ' and resolve open items'} />
      </div>
      <div className="cl-frow">
        <div className="cl-field"><label>Project</label>
          <select value={f.project} onChange={e => set('project', e.target.value)}>
            {C2C.projects.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>
        <div className="cl-field"><label>Module</label>
          <select value={f.moduleType} onChange={e => set('moduleType', e.target.value)}>
            {Object.keys(C2C.mod).map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>
      <div className="cl-frow">
        <div className="cl-field"><label>Type</label>
          <select value={f.taskType} onChange={e => set('taskType', e.target.value)}>
            {Object.keys(CL_TYPE).map(t => <option key={t} value={t}>{CL_TYPE[t]}</option>)}
          </select>
        </div>
        <div className="cl-field"><label>Priority</label>
          <select value={f.priority} onChange={e => set('priority', e.target.value)}>
            {CL_PRI.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="cl-field"><label>Due in (days)</label>
          <input type="number" min="0" max="120" value={f.dueDays} onChange={e => set('dueDays', +e.target.value)} />
        </div>
      </div>
      <div className="cl-field"><label>Assign to</label>
        <div className="cl-assignees">
          <button type="button" className={`cl-asg${f.assignee === 'auto' ? ' on' : ''}`} onClick={() => set('assignee', 'auto')}>
            <span className="cl-asg-av auto">{I.sparkles}</span>Auto
          </button>
          {Object.keys(C2C.team).map(k => (
            <button type="button" key={k} className={`cl-asg${f.assignee === k ? ' on' : ''}`}
              onClick={() => set('assignee', k)} title={C2C.team[k].n + ' -- ' + C2C.team[k].t}>
              <span className="cl-asg-av">{clAvatar(k)}</span>{C2C.team[k].n}
            </button>
          ))}
        </div>
      </div>
      {f.assignee === 'auto' && (
        <div className="cl-note">
          {/*
            This said "workload-balanced via getOptimalAssignee()". There is no
            such function in this repo, and nothing is balanced: CL_OPTIMAL is a
            static map from module name to a fixed short-id. Telling a user their
            assignment came from a workload calculation that does not exist is
            worse than telling them nothing.
          */}
          <span className="ico">{I.sparkles}</span>Auto-assign uses a fixed default of <b>{whoName}</b> for <b>{f.moduleType}</b>. It does not consider workload.
        </div>
      )}
      <SampleRosterNote />
      <div className="cl-field"><label>Flags</label>
        <div className="cl-toggles">
          <button type="button" className={`cl-tog${f.criticalPath ? ' on' : ''}`} onClick={() => set('criticalPath', !f.criticalPath)}>
            <span className="ico">{I.zap}</span>Critical path
          </button>
          <button type="button" className={`cl-tog${f.regulatoryImpact ? ' on' : ''}`} onClick={() => set('regulatoryImpact', !f.regulatoryImpact)}>
            <span className="ico">{I.shieldCheck}</span>Regulatory impact
          </button>
          <button type="button" className={`cl-tog${f.approvalRequired ? ' on' : ''}`} onClick={() => set('approvalRequired', !f.approvalRequired)}>
            <span className="ico">{I.checkSquare || I.check}</span>Approval gate
          </button>
        </div>
      </div>
      <div className="cl-field"><label>Note <span className="cl-opt">-- optional</span></label>
        <textarea rows={2} value={f.note} onChange={e => set('note', e.target.value)} placeholder="Add context for the assignee..." />
      </div>
      <div className="cl-warn">
        <span className="ico">{I.alertTriangle}</span>Adds this to the in-session task board only. Persisting to <code>unifiedTasks</code> via <code>POST /api/task-management/tasks</code> is not yet wired here; audit (<code>task-audit.ts</code>) and notifications are stubbed in the backend.
      </div>
      <div className="cl-foot">
        <div className="cl-endpoint"><b>POST</b> /api/task-management/tasks</div>
        <button className="btn ghost" onClick={() => create(true)} disabled={!f.title.trim()}>{I.plus} Create &amp; add another</button>
        <button className="btn primary" onClick={() => create(false)} disabled={!f.title.trim()}>{I.check} Create task</button>
      </div>
    </div>
  );
}

/* ── Collaborate -- post a message / @mention / route, optionally -> task ── */

function CollabDiscuss({ ctx: surfaceCtx, onClose, onCreated }: CollabDiscussProps) {
  const [to, setTo] = useState('sm');
  const [body, setBody] = useState('');
  const [makeTask, setMakeTask] = useState(false);

  const send = () => {
    if (!body.trim()) return;
    // MOCK ACTION (flagged): does NOT call POST /api/collaboration/messages; at
    // most it captures an optimistic in-session task below. Wire in actions pass.
    if (makeTask) {
      C2C.addTask({
        title: body.trim().slice(0, 90), project: surfaceCtx.project,
        moduleType: surfaceCtx.moduleType || 'Regulatory',
        taskType: 'review', priority: 'medium', assignee: to, assignmentType: 'manual',
        sourceEntityType: surfaceCtx.entityType,
        sourceEntityId: surfaceCtx.entityId || surfaceCtx.surfaceId,
        sourceLabel: surfaceCtx.entityLabel || surfaceCtx.surfaceLabel,
        due: 'in 3 days', phase: surfaceCtx.entityLabel || surfaceCtx.surfaceLabel,
        activity: [{ type: 'note', text: body.trim(), who: 'You', when: 'just now' }],
      });
      onCreated?.();
    }
    onClose();
  };

  return (
    <div className="cl-field-grp">
      <div className="cl-ctxbar">
        <span className="cl-ctx-k">About</span>
        <span className="cl-ctx-chip"><span className="ico">{I.messageSquare}</span>{surfaceCtx.entityLabel || surfaceCtx.surfaceLabel}</span>
        <span className="cl-ctx-meta">thread on <code>/api/collaboration</code></span>
      </div>
      <div className="cl-field"><label>Send to</label>
        <div className="cl-assignees">
          {Object.keys(C2C.team).map(k => (
            <button type="button" key={k} className={`cl-asg${to === k ? ' on' : ''}`}
              onClick={() => setTo(k)} title={C2C.team[k].t}>
              <span className="cl-asg-av">{clAvatar(k)}</span>{C2C.team[k].n}
            </button>
          ))}
        </div>
      </div>
      <SampleRosterNote />
      <div className="cl-field"><label>Message</label>
        <textarea rows={4} autoFocus value={body} onChange={e => setBody(e.target.value)}
          placeholder={'@' + (C2C.team[to] || { n: '' }).n + ' -- share context, ask a question, or route this for action...'} />
      </div>
      <button type="button" className={`cl-tasktoggle${makeTask ? ' on' : ''}`} onClick={() => setMakeTask(m => !m)}>
        <span className="cl-check">{makeTask ? I.check : ''}</span>
        <span><b>Also create a task</b> and assign it to {(C2C.team[to] || { n: 'them' }).n}</span>
      </button>
      <div className="cl-warn">
        <span className="ico">{I.alertTriangle}</span>Posting to the collaboration thread (<code>POST /api/collaboration/messages</code>) + <code>/tasks/:id/notify</code> is not yet wired here -- the message is not persisted, and WebSocket delivery is stubbed (<code>io.to('tasks').emit</code> commented out).
      </div>
      <div className="cl-foot">
        <span className="cl-endpoint"><b>POST</b> /api/collaboration/messages</span>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={send} disabled={!body.trim()}>{I.arrowRight} {makeTask ? 'Send & assign' : 'Send'}</button>
      </div>
    </div>
  );
}

/* ── The layer: launcher (FAB) + modal. Mounted once, lives on every screen. ── */

export function CollabLayer({ onNav }: CollabLayerProps) {
  const [, setTick] = useState(0);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('task');
  const [toast, setToast] = useState<ToastState | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // Org-wide open-task count for the launcher menu -- REAL persisted data from
  // the unifiedTasks board (GET /api/task-management/board), never the retired
  // fixture store. Fetched only while the menu is open (fresh each open). Honest
  // states: a real count on success (0 included), and a neutral label (no
  // fabricated number) while loading or on a failed load. Read in render only,
  // so there is no re-seed loop from the hook's fresh-[] identity.
  const board = useLiveRows<{ status: string }>(menuOpen ? '/api/task-management/board' : null);
  const openAcrossOrg = board.rows.filter(t => t.status !== 'completed').length;

  useEffect(() => C2C.subscribe(() => setTick(x => x + 1)), []);

  useEffect(() => {
    const openH = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setTab((detail && detail.mode) || 'task');
      setOpen(true);
    };
    const keyH = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.shiftKey && e.key.toLowerCase() === 't') {
        e.preventDefault(); setTab('task'); setOpen(true);
      }
    };
    window.addEventListener('c2c:open-collab', openH);
    window.addEventListener('keydown', keyH);
    return () => {
      window.removeEventListener('c2c:open-collab', openH);
      window.removeEventListener('keydown', keyH);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(id);
  }, [toast]);

  const currentCtx = C2C.getContext();
  const created = (t?: C2CTask) => setToast(t ? { type: 'task', t } : { type: 'msg' });

  return (
    <>
      {/* floating launcher -- present on every surface */}
      <div className="cl-fab-wrap">
        {menuOpen && (
          <div className="cl-fab-menu" onMouseLeave={() => setMenuOpen(false)}>
            <button className="cl-fab-mi" onClick={() => { setTab('task'); setOpen(true); setMenuOpen(false); }}>
              <span className="ico">{I.checkSquare || I.check}</span>
              <span><b>New task</b><em>Assign &amp; track from here</em></span>
            </button>
            <button className="cl-fab-mi" onClick={() => { setTab('collab'); setOpen(true); setMenuOpen(false); }}>
              <span className="ico">{I.messageSquare}</span>
              <span><b>Collaborate</b><em>Message -- @mention -- route</em></span>
            </button>
            <button className="cl-fab-mi" onClick={() => { onNav?.('tasks'); setMenuOpen(false); }}>
              <span className="ico">{I.layoutPanels || I.grid}</span>
              <span><b>Open task board</b><em>{board.loading || board.error ? 'View the org-wide board' : `${openAcrossOrg} open across the org`}</em></span>
            </button>
          </div>
        )}
        <button className="cl-fab" data-open={menuOpen || undefined}
          onClick={() => setMenuOpen(o => !o)} title="Add a task or collaborate"
          aria-label="Add a task or collaborate">
          <span className="ico">{menuOpen ? I.close : (I.checkSquare || I.plus)}</span>
        </button>
      </div>

      {/* the modal */}
      {open && (
        <div className="cl-bd" onClick={() => setOpen(false)}>
          <div className="cl-modal" onClick={e => e.stopPropagation()}>
            <div className="cl-head">
              <div className="cl-tabs">
                <button className={`cl-tab${tab === 'task' ? ' on' : ''}`} onClick={() => setTab('task')}>
                  <span className="ico">{I.checkSquare || I.check}</span>New task
                </button>
                <button className={`cl-tab${tab === 'collab' ? ' on' : ''}`} onClick={() => setTab('collab')}>
                  <span className="ico">{I.messageSquare}</span>Collaborate
                </button>
              </div>
              <button className="cl-x" onClick={() => setOpen(false)}>{I.close}</button>
            </div>
            <div className="cl-body">
              {tab === 'task'
                ? <QuickTask ctx={currentCtx} onClose={() => setOpen(false)} onCreated={created}
                    onGoToBoard={() => { onNav?.('tasks'); setOpen(false); }} />
                : <CollabDiscuss ctx={currentCtx} onClose={() => setOpen(false)} onCreated={created} />}
            </div>
          </div>
        </div>
      )}

      {/* toast -- confirms the draft task was captured in the in-session store,
          NOT persisted to the org board (which reads the real endpoint). Copy
          avoids claiming a board-persistence event that did not occur. */}
      {toast && (
        <div className="cl-toast" role="status">
          <span className="cl-toast-ic">{I.check}</span>
          {toast.type === 'task' && toast.t
            ? <span className="cl-toast-t">Captured in this session -- <b>{toast.t.taskId}</b> for {(C2C.team[toast.t.assignee] || { n: toast.t.assignee }).n}. Not saved to the org board yet.</span>
            : <span className="cl-toast-t">Captured in this session -- not saved to the org board yet.</span>}
          <button className="cl-toast-go" onClick={() => { onNav?.('tasks'); setToast(null); }}>Open board {I.arrowRight}</button>
        </div>
      )}
    </>
  );
}
