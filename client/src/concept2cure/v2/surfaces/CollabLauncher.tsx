import React, { useState, useEffect } from 'react';
import { I } from '../icons';
import { useLiveRows } from '../dataConnect';
import { apiCall, apiErrorText } from '../apiCall';
import { useDialog } from '../useDialog';
import { SURFACE_CTX, CL_MOD, CL_TYPE, CL_PRI } from '../fixtures/collab-data';

/* ================================================================
   Collaboration layer — universal "add to tasking / assign /
   collaborate", available from EVERY surface.

   GA pass (collaboration/tasking assessment): every action here now
   PERSISTS. The old in-memory task array (window.C2C.addTask into a
   module-level variable that vanished on refresh) is retired:

     · Quick task  → POST /api/tasks/tasks — the real org-scoped
       unified_tasks create, carrying the surface context it captures
       (sourceEntityType/Id, description). Auto-assign leaves the
       assignee to the server's workload balancer. The create is
       audited and the assignee is notified server-side.
     · Collaborate → POST /api/tasks/messages — a persisted message
       into the recipient's notification inbox (surfaced by the Task
       Tray), optionally with a linked task assigned to them.

   Rosters are LIVE (org members via /api/task-management/assignees,
   projects via /api/projects) — the fixture team keyed on short-ids
   is gone from this layer.

   The C2C context store remains: surfaces call setSurface/setContext
   to stamp what the user is looking at onto whatever they create.
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

/** Real org project (GET /api/projects — bare row array). */
interface ProjectOpt { id: number; name: string }
/** Real assignable org member (GET /api/task-management/assignees). */
interface AssigneeOpt { id: string; name: string }

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

interface CollabLayerProps {
  onNav?: (id: string) => void;
}

interface ToastState {
  kind: 'task' | 'msg';
  text: string;
}

/* ── Shared C2C context store ──
   Module-level context with a subscriber pattern. Deferred emit avoids
   "Cannot update a component while rendering a different component". */

type Subscriber = () => void;

const subs = new Set<Subscriber>();
const defer = (typeof queueMicrotask === 'function')
  ? queueMicrotask
  : (fn: () => void) => { setTimeout(fn, 0); };

function emit(): void {
  defer(() => {
    subs.forEach(fn => { try { fn(); } catch (_e) { /* subscriber error */ } });
  });
}

let ctx: C2CContext = {
  surfaceId: 'home',
  surfaceLabel: 'Home',
  project: '',
  entityType: 'workspace',
  entityId: null,
  entityLabel: null,
  moduleType: 'Regulatory',
};

export const C2C = {
  modColor(m: string): string {
    return CL_MOD[m] || '#888';
  },
  subscribe(fn: Subscriber): () => void {
    subs.add(fn);
    return () => { subs.delete(fn); };
  },

  /* Surface context — surfaces call this on navigation; they may refine it
     for entity-level granularity (a section, a case, a filing). */
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
   * `window.C2C_PROJECT` is the shell's single source of truth for the open
   * project and `window.location.pathname` is where the shell actually is;
   * reading them here means the launcher cannot drift from the shell.
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
  open(mode?: string, patch?: Partial<C2CContext>): void {
    if (patch) ctx = { ...ctx, ...patch };
    window.dispatchEvent(new CustomEvent('c2c:open-collab', { detail: { mode: mode || 'task' } }));
  },
};

/* Expose on window for cross-module access (surfaces stamp context; the
   shell's top-bar buttons open the modal). */
(window as any).C2C = C2C;

/* ── Shared helpers ── */

function clAvatar(name: string): string {
  return (name || '?').split(/\s+/).map(s => s[0]).join('').slice(0, 2).toUpperCase();
}


/* ── Quick task — the real unified_tasks create, context pre-filled ── */

interface QuickTaskProps {
  ctx: C2CContext;
  projects: ProjectOpt[];
  assignees: AssigneeOpt[];
  onClose: () => void;
  onCreated: (toast: ToastState) => void;
}

function QuickTask({ ctx: surfaceCtx, projects, assignees, onClose, onCreated }: QuickTaskProps) {
  const [f, setF] = useState<QuickTaskForm>({
    title: '', project: surfaceCtx.project || '', moduleType: surfaceCtx.moduleType || 'Regulatory',
    taskType: 'action', priority: 'high', assignee: 'auto', dueDays: 7,
    criticalPath: false, regulatoryImpact: true, approvalRequired: false, note: '',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const set = <K extends keyof QuickTaskForm>(k: K, v: QuickTaskForm[K]) =>
    setF(p => ({ ...p, [k]: v }));

  // Default the project to the shell's open project, else the first real one.
  useEffect(() => {
    if (!projects.length) return;
    const ids = projects.map(p => String(p.id));
    if (!f.project || !ids.includes(f.project)) set('project', String(projects[0].id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects]);

  const create = async (another: boolean) => {
    if (!f.title.trim() || busy) return;
    setBusy(true);
    setErr('');
    const due = new Date();
    due.setDate(due.getDate() + (Number.isFinite(f.dueDays) ? f.dueDays : 0));
    {
      const res = await apiCall<{ data?: { taskId?: string; assigneeName?: string } }>('POST', '/api/tasks/tasks', {
        title: f.title.trim(),
        description: f.note.trim() || undefined,
        moduleType: f.moduleType,
        taskType: f.taskType,
        priority: f.priority,
        status: 'pending',
        projectId: Number.isFinite(Number(f.project)) && Number(f.project) > 0 ? Number(f.project) : undefined,
        assigneeId: f.assignee !== 'auto' && Number.isFinite(Number(f.assignee)) ? Number(f.assignee) : undefined,
        dueDate: due.toISOString(),
        criticalPath: f.criticalPath,
        regulatoryImpact: f.regulatoryImpact,
        approvalRequired: f.approvalRequired,
        sourceEntityType: surfaceCtx.entityType || undefined,
        sourceEntityId: surfaceCtx.entityId || surfaceCtx.surfaceId || undefined,
      });
      if (!res.ok || !res.body?.data?.taskId) {
        setErr(apiErrorText(res, 'Could not create the task.'));
        setBusy(false);
        return;
      }
      const who = res.body.data.assigneeName
        || assignees.find(a => a.id === f.assignee)?.name
        || 'the least-loaded member';
      onCreated({ kind: 'task', text: `Task created and assigned to ${who}.` });
      if (another) {
        setF(p => ({ ...p, title: '', note: '' }));
        setBusy(false);
      } else {
        onClose();
      }
    }
  };

  return (
    <div className="cl-field-grp">
      <div className="cl-ctxbar">
        <span className="cl-ctx-k">From</span>
        <span className="cl-ctx-chip"><span className="ico">{I.target || I.crosshair || I.zap}</span>{surfaceCtx.entityLabel || surfaceCtx.surfaceLabel}</span>
        <span className="cl-ctx-meta">the task links back to what you're looking at</span>
      </div>
      <div className="cl-field"><label>Task<i>*</i></label>
        <input type="text" autoFocus value={f.title} onChange={e => set('title', e.target.value)}
          placeholder={'e.g. Review ' + C2C.surfaceNoun(surfaceCtx.surfaceId) + ' and resolve open items'} />
      </div>
      <div className="cl-frow">
        <div className="cl-field"><label>Project</label>
          <select value={f.project} onChange={e => set('project', e.target.value)}>
            {projects.length
              ? projects.map(p => <option key={p.id} value={String(p.id)}>{p.name}</option>)
              : <option value="">No projects available</option>}
          </select>
        </div>
        <div className="cl-field"><label>Module</label>
          <select value={f.moduleType} onChange={e => set('moduleType', e.target.value)}>
            {Object.keys(CL_MOD).map(m => <option key={m} value={m}>{m}</option>)}
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
          <button type="button" className={`cl-asg${f.assignee === 'auto' ? ' on' : ''}`} aria-pressed={f.assignee === 'auto'} onClick={() => set('assignee', 'auto')}>
            <span className="cl-asg-av auto">{I.sparkles}</span>Auto
          </button>
          {assignees.map(a => (
            <button type="button" key={a.id} className={`cl-asg${f.assignee === a.id ? ' on' : ''}`}
              aria-pressed={f.assignee === a.id}
              onClick={() => set('assignee', a.id)} title={a.name}>
              <span className="cl-asg-av">{clAvatar(a.name)}</span>{a.name}
            </button>
          ))}
        </div>
      </div>
      {f.assignee === 'auto' && (
        <div className="cl-note">
          <span className="ico">{I.sparkles}</span>Auto-assign picks the least-loaded member of your organization and notifies them.
        </div>
      )}
      <div className="cl-field"><label>Flags</label>
        <div className="cl-toggles">
          <button type="button" className={`cl-tog${f.criticalPath ? ' on' : ''}`} aria-pressed={f.criticalPath} onClick={() => set('criticalPath', !f.criticalPath)}>
            <span className="ico">{I.zap}</span>Critical path
          </button>
          <button type="button" className={`cl-tog${f.regulatoryImpact ? ' on' : ''}`} aria-pressed={f.regulatoryImpact} onClick={() => set('regulatoryImpact', !f.regulatoryImpact)}>
            <span className="ico">{I.shieldCheck}</span>Regulatory impact
          </button>
          <button type="button" className={`cl-tog${f.approvalRequired ? ' on' : ''}`} aria-pressed={f.approvalRequired} onClick={() => set('approvalRequired', !f.approvalRequired)}>
            <span className="ico">{I.checkSquare || I.check}</span>Approval gate
          </button>
        </div>
      </div>
      <div className="cl-field"><label>Note <span className="cl-opt">— optional</span></label>
        <textarea rows={2} value={f.note} onChange={e => set('note', e.target.value)} placeholder="Add context for the assignee..." />
      </div>
      {err && <div className="cl-warn" role="alert"><span className="ico">{I.alertTriangle}</span>{err}</div>}
      <div className="cl-foot">
        <button className="btn ghost" onClick={() => create(true)} disabled={!f.title.trim() || busy}>{I.plus} Create &amp; add another</button>
        <button className="btn primary" onClick={() => create(false)} disabled={!f.title.trim() || busy}>{I.check} {busy ? 'Creating…' : 'Create task'}</button>
      </div>
    </div>
  );
}

/* ── Collaborate — a persisted message to a colleague, optionally → task ── */

interface CollabDiscussProps {
  ctx: C2CContext;
  assignees: AssigneeOpt[];
  onClose: () => void;
  onCreated: (toast: ToastState) => void;
}

function CollabDiscuss({ ctx: surfaceCtx, assignees, onClose, onCreated }: CollabDiscussProps) {
  const [to, setTo] = useState('');
  const [body, setBody] = useState('');
  const [makeTask, setMakeTask] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (assignees.length && !assignees.some(a => a.id === to)) setTo(assignees[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignees]);

  const recipient = assignees.find(a => a.id === to) || null;

  const send = async () => {
    if (!body.trim() || !recipient || busy) return;
    setBusy(true);
    setErr('');
    {
      const res = await apiCall('POST', '/api/tasks/messages', {
        recipientUserId: Number(recipient.id),
        message: body.trim(),
        about: surfaceCtx.entityLabel || surfaceCtx.surfaceLabel || undefined,
        sourceEntityType: surfaceCtx.entityType || undefined,
        sourceEntityId: surfaceCtx.entityId || surfaceCtx.surfaceId || undefined,
      });
      if (!res.ok) {
        setErr(apiErrorText(res, 'Could not send the message.'));
        setBusy(false);
        return;
      }

      if (makeTask) {
        const due = new Date();
        due.setDate(due.getDate() + 3);
        const taskRes = await apiCall<{ data?: { taskId?: string } }>('POST', '/api/tasks/tasks', {
          title: body.trim().slice(0, 90),
          description: body.trim(),
          moduleType: surfaceCtx.moduleType || 'Regulatory',
          taskType: 'review',
          priority: 'medium',
          status: 'pending',
          assigneeId: Number(recipient.id),
          dueDate: due.toISOString(),
          sourceEntityType: surfaceCtx.entityType || undefined,
          sourceEntityId: surfaceCtx.entityId || surfaceCtx.surfaceId || undefined,
        });
        if (!taskRes.ok || !taskRes.body?.data?.taskId) {
          // The message went through; say so honestly rather than failing both.
          onCreated({ kind: 'msg', text: `Message sent to ${recipient.name} — but the linked task failed: ${apiErrorText(taskRes, 'unknown error')}` });
          onClose();
          return;
        }
        onCreated({ kind: 'task', text: `Message sent and task assigned to ${recipient.name}.` });
      } else {
        onCreated({ kind: 'msg', text: `Message sent to ${recipient.name}.` });
      }
      onClose();
    }
  };

  return (
    <div className="cl-field-grp">
      <div className="cl-ctxbar">
        <span className="cl-ctx-k">About</span>
        <span className="cl-ctx-chip"><span className="ico">{I.messageSquare}</span>{surfaceCtx.entityLabel || surfaceCtx.surfaceLabel}</span>
        <span className="cl-ctx-meta">delivered to their notification tray</span>
      </div>
      <div className="cl-field"><label>Send to</label>
        <div className="cl-assignees">
          {assignees.map(a => (
            <button type="button" key={a.id} className={`cl-asg${to === a.id ? ' on' : ''}`}
              aria-pressed={to === a.id}
              onClick={() => setTo(a.id)} title={a.name}>
              <span className="cl-asg-av">{clAvatar(a.name)}</span>{a.name}
            </button>
          ))}
          {!assignees.length && <span style={{ fontSize: 11.5, color: 'var(--text-400)' }}>No other members in this organization yet.</span>}
        </div>
      </div>
      <div className="cl-field"><label>Message</label>
        <textarea rows={4} autoFocus value={body} onChange={e => setBody(e.target.value)}
          placeholder={'@' + (recipient?.name ?? 'colleague') + ' — share context, ask a question, or route this for action...'} />
      </div>
      <button type="button" className={`cl-tasktoggle${makeTask ? ' on' : ''}`} aria-pressed={makeTask} onClick={() => setMakeTask(m => !m)}>
        <span className="cl-check">{makeTask ? I.check : ''}</span>
        <span><b>Also create a task</b> and assign it to {recipient?.name ?? 'them'}</span>
      </button>
      {err && <div className="cl-warn" role="alert"><span className="ico">{I.alertTriangle}</span>{err}</div>}
      <div className="cl-foot">
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={send} disabled={!body.trim() || !recipient || busy}>{I.arrowRight} {busy ? 'Sending…' : makeTask ? 'Send & assign' : 'Send'}</button>
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

  // Live rosters, fetched while the modal is open (fresh each open).
  const projects = useLiveRows<ProjectOpt>(open ? '/api/projects' : null, [open]);
  const assignees = useLiveRows<AssigneeOpt>(open ? '/api/task-management/assignees' : null, [open]);

  // Org-wide open-task count for the launcher menu — real persisted data from
  // the board read-model, fetched only while the menu is open.
  const board = useLiveRows<{ status: string }>(menuOpen ? '/api/task-management/board' : null, [menuOpen]);
  const openAcrossOrg = board.rows.filter(t => t.status !== 'completed' && t.status !== 'cancelled').length;

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
    const id = setTimeout(() => setToast(null), 4800);
    return () => clearTimeout(id);
  }, [toast]);

  const currentCtx = C2C.getContext();

  return (
    <>
      {/* floating launcher — present on every surface */}
      <div className="cl-fab-wrap">
        {menuOpen && (
          <div className="cl-fab-menu" onMouseLeave={() => setMenuOpen(false)}>
            <button className="cl-fab-mi" onClick={() => { setTab('task'); setOpen(true); setMenuOpen(false); }}>
              <span className="ico">{I.checkSquare || I.check}</span>
              <span><b>New task</b><em>Assign &amp; track from here</em></span>
            </button>
            <button className="cl-fab-mi" onClick={() => { setTab('collab'); setOpen(true); setMenuOpen(false); }}>
              <span className="ico">{I.messageSquare}</span>
              <span><b>Collaborate</b><em>Message a colleague — route work</em></span>
            </button>
            <button className="cl-fab-mi" onClick={() => { onNav?.('tasks'); setMenuOpen(false); }}>
              <span className="ico">{I.layoutPanels || I.grid}</span>
              <span><b>Open task board</b><em>{board.loading || board.error ? 'View the org-wide board' : `${openAcrossOrg} open across the org`}</em></span>
            </button>
          </div>
        )}
        <button className="cl-fab" data-open={menuOpen || undefined}
          onClick={() => setMenuOpen(o => !o)} title="Add a task or collaborate (⌘⇧T)"
          aria-label="Add a task or collaborate" aria-expanded={menuOpen}>
          <span className="ico">{menuOpen ? I.close : (I.checkSquare || I.plus)}</span>
        </button>
      </div>

      {/* the modal */}
      {open && (
        <CollabModal
          tab={tab}
          setTab={setTab}
          ctx={currentCtx}
          projects={projects.rows}
          assignees={assignees.rows}
          onClose={() => setOpen(false)}
          onCreated={t => setToast(t)}
        />
      )}

      {/* toast — reports the REAL outcome of a persisted action */}
      {toast && (
        <div className="cl-toast" role="status">
          <span className="cl-toast-ic">{I.check}</span>
          <span className="cl-toast-t">{toast.text}</span>
          {toast.kind === 'task' && (
            <button className="cl-toast-go" onClick={() => { onNav?.('tasks'); setToast(null); }}>Open board {I.arrowRight}</button>
          )}
        </div>
      )}
    </>
  );
}

interface CollabModalProps {
  tab: string;
  setTab: (t: string) => void;
  ctx: C2CContext;
  projects: ProjectOpt[];
  assignees: AssigneeOpt[];
  onClose: () => void;
  onCreated: (toast: ToastState) => void;
}

function CollabModal({ tab, setTab, ctx: currentCtx, projects, assignees, onClose, onCreated }: CollabModalProps) {
  const ref = useDialog(onClose);
  return (
    <div className="cl-bd" onClick={onClose}>
      <div className="cl-modal" role="dialog" aria-modal="true" aria-label={tab === 'task' ? 'New task' : 'Collaborate'} tabIndex={-1} ref={ref} onClick={e => e.stopPropagation()}>
        <div className="cl-head">
          <div className="cl-tabs" role="tablist" aria-label="Collaboration actions">
            <button className={`cl-tab${tab === 'task' ? ' on' : ''}`} role="tab" aria-selected={tab === 'task'} onClick={() => setTab('task')}>
              <span className="ico">{I.checkSquare || I.check}</span>New task
            </button>
            <button className={`cl-tab${tab === 'collab' ? ' on' : ''}`} role="tab" aria-selected={tab === 'collab'} onClick={() => setTab('collab')}>
              <span className="ico">{I.messageSquare}</span>Collaborate
            </button>
          </div>
          <button className="cl-x" onClick={onClose} aria-label="Close">{I.close}</button>
        </div>
        <div className="cl-body">
          {tab === 'task'
            ? <QuickTask ctx={currentCtx} projects={projects} assignees={assignees} onClose={onClose} onCreated={onCreated} />
            : <CollabDiscuss ctx={currentCtx} assignees={assignees} onClose={onClose} onCreated={onCreated} />}
        </div>
      </div>
    </div>
  );
}
