import React, { useEffect, useId, useRef, useState } from 'react';
import { useTenant } from '@/contexts/TenantContext';
import { taskAssignmentId, type TaskAssignmentMeta, type TaskAssignmentResult, type TaskAssignmentRoster, type TaskAssignmentScope } from '@shared/task-assignment';
import type { TaskActorScope } from '../taskTarget';
import { ErrorState } from '../dataConnect';
import { autoAssignSavedTask, loadTaskAssignment, saveTaskAssignment, taskAssignmentHeaders,
  type AutomaticAssignmentAnswer, type AssignmentFailure } from './taskAssignmentRequest';

export interface TaskAssignmentControlsProps {
  taskId: string; projectId: number | null; status: string; actorScope: TaskActorScope | null;
  isCurrent: () => boolean; onSaved: () => void; disabled?: boolean; readOnly?: boolean;
  onBlockedChange?: (blocked: boolean) => void;
  onAutomatic?: (meta: TaskAssignmentMeta, headers: () => Record<string, string> | null) => Promise<AutomaticAssignmentAnswer>;
}
type Mode = 'manual' | 'automatic';
const integer = (value: unknown): number | null => {
  const number = typeof value === 'string' && /^[1-9]\d*$/.test(value) ? Number(value) : value;
  return taskAssignmentId(number) ? number : null;
};
const terminal = (status: string) => status === 'completed' || status === 'cancelled';
const NOTE = 'Assignment records who does the work. Project access, document review assignments and electronic signing remain separate.';

export function TaskAssignmentControls(props: TaskAssignmentControlsProps) {
  const actorUserId = integer(props.actorScope?.userId); const organizationId = integer(props.actorScope?.organizationId);
  if (props.readOnly || terminal(props.status) || !actorUserId || !organizationId) return null;
  const scope = { taskId: props.taskId, projectId: props.projectId, actorUserId, organizationId };
  return <AssignmentEntry key={[actorUserId, organizationId, props.taskId, props.projectId].join(':')} {...props} scope={scope} />;
}

function AssignmentEntry(props: TaskAssignmentControlsProps & { scope: TaskAssignmentScope }) {
  const [mode, setMode] = useState<Mode | null>(null);
  if (mode) return <WorkspaceAssignment {...props} initialMode={mode} onCancel={() => { setMode(null); props.onBlockedChange?.(false); }} />;
  const openAssignment = (next: Mode) => { if (!props.disabled && props.isCurrent()) { props.onBlockedChange?.(true); setMode(next); } };
  return <div className="tb-detail-sec">
    <div className="tb-assignment-actions">
      <button type="button" className="btn ghost" disabled={props.disabled} onClick={() => openAssignment('manual')}>Change assignee</button>
      <button type="button" className="btn ghost" disabled={props.disabled} onClick={() => openAssignment('automatic')}>Auto-assign task</button>
    </div><p className="tb-detail-note">{NOTE}</p>
  </div>;
}

function WorkspaceAssignment(props: TaskAssignmentControlsProps & { scope: TaskAssignmentScope; initialMode: Mode; onCancel: () => void }) {
  const tenant = useTenant();
  const org = tenant.currentOrganization ? integer(tenant.currentOrganization.id) : props.scope.organizationId;
  const workspace = tenant.currentClientWorkspace;
  const selectedWorkspace = workspace ? integer(workspace.id) : null;
  const owner = `${org}:${selectedWorkspace}`;
  const firstOwner = useRef(owner);
  if (org !== props.scope.organizationId || (workspace && integer(workspace.organizationId) !== org) || (workspace && !selectedWorkspace)) {
    return <ErrorState title="Assignment workspace could not be verified" message="Return to the task's current organization and workspace before assigning it." retry={props.onCancel} retryLabel="Close assignment" />;
  }
  const scope = { ...props.scope, clientWorkspaceId: selectedWorkspace };
  return <AssignmentSession key={owner} {...props} scope={scope} initialMode={firstOwner.current === owner ? props.initialMode : 'manual'} />;
}

function AssignmentSession(props: TaskAssignmentControlsProps & { scope: TaskAssignmentScope; initialMode: Mode; onCancel: () => void }) {
  const [roster, setRoster] = useState<TaskAssignmentRoster | null>(null);
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(''); const [note, setNote] = useState<{ text: string; warning: boolean } | null>(null);
  const [needsRead, setNeedsRead] = useState(false); const [uncertain, setUncertain] = useState(false);
  const [selected, setSelected] = useState(''); const [reason, setReason] = useState('');
  const [manual, setManual] = useState(props.initialMode === 'manual');
  const [saved, setSaved] = useState<TaskAssignmentResult | null>(null);
  const mounted = useRef(false); const generation = useRef(0); const sending = useRef(false);
  const prefix = useId();
  const isCurrent = () => mounted.current && props.isCurrent();
  const currentScope = (meta: TaskAssignmentMeta) => ({ ...props.scope, clientWorkspaceId: meta.clientWorkspaceId });
  const showFailure = (result: AssignmentFailure) => {
    setNote({ text: result.message, warning: true }); setNeedsRead(true); setUncertain(result.kind === 'unconfirmed');
  };
  const read = async (automatic = false) => {
    if (sending.current || !isCurrent()) return;
    const serial = ++generation.current;
    setLoading(true); setError(''); setSelected('');
    const result = await loadTaskAssignment(props.scope, isCurrent);
    if (!isCurrent() || serial !== generation.current) return;
    setLoading(false);
    if (result.kind !== 'confirmed') { setRoster(null); setError(result.message); return; }
    setRoster(result.data); setNeedsRead(false); setUncertain(false);
    if (automatic && result.data.meta.canAssign) await automaticAssign(result.data.meta);
  };
  useEffect(() => {
    mounted.current = true; void read(props.initialMode === 'automatic');
    return () => { mounted.current = false; generation.current += 1; };
    // The keyed session captures one task, actor, organization and workspace.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const automaticAssign = async (meta: TaskAssignmentMeta) => {
    if (sending.current || !isCurrent() || props.disabled) return;
    sending.current = true; setBusy(true); setNote(null);
    const headers = () => taskAssignmentHeaders(currentScope(meta), isCurrent);
    const result = props.onAutomatic ? await props.onAutomatic(meta, headers) : await autoAssignSavedTask(meta, headers, isCurrent);
    if (!isCurrent()) return;
    sending.current = false; setBusy(false);
    if (result.kind !== 'confirmed') { showFailure(result); return; }
    setNote({ text: 'Assignment recorded. Rereading the saved assignee.', warning: false });
    props.onSaved(); void read();
  };
  const save = async () => {
    if (sending.current || needsRead || !roster?.meta.canAssign || !isCurrent() || props.disabled) return;
    const assigneeId = integer(selected); const why = reason.trim();
    if (!assigneeId || assigneeId === roster.meta.assigneeId || why.length < 3 || why.length > 1000 || !roster.data.some(row => row.id === selected)) return;
    sending.current = true; setBusy(true); setNote(null);
    const result = await saveTaskAssignment(currentScope(roster.meta), roster.meta, { action: 'assign', assigneeId,
      expectedAssigneeId: roster.meta.assigneeId, expectedVersion: roster.meta.assignmentVersion, reason: why }, isCurrent);
    if (!isCurrent()) return;
    sending.current = false; setBusy(false);
    if (result.kind !== 'confirmed') { showFailure(result); return; }
    setSaved(result.data); setReason(''); setSelected(''); setNote({ text: 'Assignment saved.', warning: false });
    props.onSaved(); void read();
  };
  const disabled = busy || loading || Boolean(props.disabled);
  const state = { roster, loading, busy, error, note, needsRead, uncertain, selected, reason, manual, saved, prefix, disabled };
  const actions = { manual: () => setManual(true), automatic: () => { setManual(false); void read(true); },
    refresh: () => { void read(); }, close: props.onCancel, save: () => { void save(); }, selected: setSelected, reason: setReason };
  return <AssignmentView state={state} actions={actions} />;
}

interface AssignmentViewState {
  roster: TaskAssignmentRoster | null; loading: boolean; busy: boolean; error: string;
  note: { text: string; warning: boolean } | null; needsRead: boolean; uncertain: boolean;
  selected: string; reason: string; manual: boolean; saved: TaskAssignmentResult | null; prefix: string; disabled: boolean;
}
interface AssignmentViewActions {
  manual: () => void; automatic: () => void; refresh: () => void; close: () => void; save: () => void;
  selected: (value: string) => void; reason: (value: string) => void;
}
type AssignmentViewProps = { state: AssignmentViewState; actions: AssignmentViewActions };

function AssignmentView({ state, actions }: AssignmentViewProps) {
  return <section className="tb-detail-sec tb-assignment" aria-label="Task assignment">
    <AssignmentActions state={state} actions={actions} />
    <p className="tb-detail-note">{NOTE}</p>
    <AssignmentNotices note={state.note} saved={state.saved} />
    <AssignmentRead state={state} actions={actions} />
  </section>;
}

function AssignmentActions({ state: s, actions: a }: AssignmentViewProps) {
  return <div className="tb-assignment-actions">
    {s.roster?.meta.canAssign && <>
      <button type="button" className="btn ghost" disabled={s.disabled || s.uncertain} onClick={a.manual}>Change assignee</button>
      <button type="button" className="btn ghost" disabled={s.disabled || s.uncertain} onClick={a.automatic}>{s.busy && !s.manual ? 'Assigning…' : 'Auto-assign task'}</button>
    </>}
    <button type="button" className="btn ghost" disabled={s.disabled} onClick={a.refresh}>Refresh assignment</button>
    <button type="button" className="btn ghost" disabled={s.busy} onClick={a.close}>Close assignment</button>
  </div>;
}

function AssignmentNotices({ note, saved }: Pick<AssignmentViewState, 'note' | 'saved'>) {
  return <>
    {note && <p className="tb-detail-note" role={note.warning ? 'alert' : 'status'}>{note.text}</p>}
    {saved && <p className="tb-detail-note">Saved assignee: Account #{saved.assigneeId}. Assigned by Account #{saved.assignedBy} at <time dateTime={saved.assignedAt}>{new Date(saved.assignedAt).toLocaleString()}</time>.</p>}
  </>;
}

function AssignmentRead({ state: s, actions: a }: AssignmentViewProps) {
  if (s.loading) return <p className="tb-detail-note" role="status" aria-busy="true">Loading current task assignment…</p>;
  if (s.error || !s.roster) return <ErrorState title="Couldn't load task assignment" message={s.error} retry={a.refresh} retryLabel="Retry assignment read" />;
  const currentId = s.roster.meta.assigneeId;
  const label = currentId === null ? 'Unassigned' : s.roster.data.find(row => row.id === String(currentId))?.label || `Account #${currentId}`;
  return <>
    <p className="tb-detail-note">Current assignee: <strong>{label}</strong>{currentId !== null && ` · Account #${currentId}`}</p>
    {!s.roster.meta.canAssign ? <p className="tb-detail-note">This task cannot currently be reassigned. Its access and task state were checked by the server.</p> :
      s.manual && <AssignmentFields state={s} actions={a} roster={s.roster} />}
  </>;
}

function AssignmentFields({ state: s, actions: a, roster }: AssignmentViewProps & { roster: TaskAssignmentRoster }) {
  const candidates = roster.data.filter(row => row.id !== String(roster.meta.assigneeId));
  const why = s.reason.trim();
  return <form className="tb-assignment-form" onSubmit={event => { event.preventDefault(); a.save(); }}>
    <label htmlFor={`${s.prefix}-assignee`}>New assignee<select id={`${s.prefix}-assignee`} className="c2c-input" value={s.selected} disabled={s.disabled || s.needsRead}
      onChange={event => a.selected(event.target.value)}><option value="">Choose an eligible colleague</option>
      {candidates.map(row => <option key={row.id} value={row.id}>{row.label}</option>)}
    </select></label>
    <label htmlFor={`${s.prefix}-reason`}>Reason for assignment<textarea id={`${s.prefix}-reason`} rows={2} required maxLength={1000}
      value={s.reason} disabled={s.disabled || s.needsRead} onChange={event => a.reason(event.target.value)} /></label>
    {candidates.length === 0 && <p className="tb-detail-note">No other eligible colleagues are available for this task.</p>}
    <button type="submit" className="btn primary" disabled={s.disabled || s.needsRead || !s.selected || why.length < 3 || why.length > 1000}>{s.busy && s.manual ? 'Saving assignment…' : 'Save assignment'}</button>
  </form>;
}
