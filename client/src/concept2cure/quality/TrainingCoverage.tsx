import * as React from 'react';
import { redactInternals } from '@/lib/queryClient';
import { ErrorState } from '../v2/dataConnect';
import type { QmsDoc, TrainingRow } from './data';
import { I } from '../v2/icons';
import { DialogPanel } from './ControlledDocumentDialogs';
import { useJobRoles, useTrainingAssignments, type JobRole, type JobRoleListing, type TrainingAssignment, type TrainingAssignmentListing } from './hooks';
import { qmsWrite } from './qmsWrites';

interface TrainingCoverageProps {
  rows: TrainingRow[];
  unread: boolean;
  failed: boolean;
  error: string | null;
  refresh: () => void;
  canOpen: (documentId: number) => boolean;
  onOpen: (documentId: number) => void;
}

/** Existing roster coverage, qualified by the exact verified release. */
export function TrainingCoverage(props: TrainingCoverageProps) {
  const [rolesOpen, setRolesOpen] = React.useState(false);
  return <section className="qms-sec">
    <div className="qms-sec-head">
      <h2>Read-and-understood training</h2>
      <span className="meta">Version in force · people assigned</span>
      <span className="spacer" />
      <button type="button" className="qms-chip" title="The job functions people hold, which documents require them to train"
        onClick={() => setRolesOpen(true)}>{I.users} Job roles</button>
    </div>
    {rolesOpen && <JobRolesPanel onClose={() => setRolesOpen(false)} />}
    <p className="qms-training-summary">Coverage counts the people assigned to each document, by job role or by name, who have acknowledged the version in force. It does not assess competency. Open a document to read it and acknowledge for yourself.</p>
    <div className="qms-train">
      {props.failed && <ErrorState title="Training records could not be read" message={props.error} retry={props.refresh} testId="sop-training-failed" />}
      {props.unread && !props.failed && <div className="qms-empty" role="status">Loading training records…</div>}
      {!props.unread && props.rows.length === 0 && <div className="qms-empty">No training-controlled documents yet.</div>}
      {props.rows.map((row) => <CoverageRow key={row.documentId ?? row.doc} row={row} canOpen={props.canOpen} onOpen={props.onOpen} />)}
    </div>
  </section>;
}

/** The figure a row may show: only an assigned, readable document with people assigned has one (P-49). */
function coverageState(row: TrainingRow): { label: string; note: string } | { current: number; of: number } {
  if (row.eligible === false) return { label: 'Unavailable', note: row.unavailableReason ?? 'Verified released text is unavailable.' };
  if (row.assignment === 'not_assigned') return { label: 'Not assigned', note: 'Nobody is assigned to train on this document.' };
  if (row.assignment === 'no_active_assignees') return { label: 'No active assignees', note: 'No one assigned to this document is an active member.' };
  if (row.current === null || row.of === null) return { label: 'No figure', note: 'The server returned no coverage for this document.' };
  return { current: row.current, of: row.of };
}

function myLine(me: TrainingRow['me']): string | null {
  if (!me?.assigned) return null;
  return me.countsNow ? 'You are current on the version in force.' : 'You are assigned and have not acknowledged the version in force.';
}

function CoverageRow({ row, canOpen, onOpen }: Pick<TrainingCoverageProps, 'canOpen' | 'onOpen'> & { row: TrainingRow }) {
  const state = coverageState(row);
  const disabled = !row.documentId || !canOpen(row.documentId);
  const mine = myLine(row.me);
  return <div className="qms-train-row">
    <span className="qms-train-doc" title={row.doc}>{row.doc}{row.documentVersion ? ` · v${row.documentVersion}` : ''}</span>
    {'label' in state ? <>
      <span className="qms-train-unavailable">{state.label}</span>
      <span className="qms-train-when">{state.note}</span>
    </> : <CoverageFigure current={state.current} of={state.of} lastCycle={row.lastCycle} />}
    {mine && <span className="qms-train-when" data-testid="qms-train-me">{mine}</span>}
    <button className="qms-link" disabled={disabled} aria-label={`My acknowledgement for ${row.doc}`} onClick={() => { if (row.documentId) onOpen(row.documentId); }}>My acknowledgement</button>
  </div>;
}

function CoverageFigure({ current, of, lastCycle }: { current: number; of: number; lastCycle: string }) {
  const pct = of > 0 ? Math.round((current / of) * 100) : 0;
  const tone = pct < 80 ? 'err' : pct < 95 ? 'warn' : 'ok';
  return <>
    <span className="qms-train-bar"><span className="qms-train-fill" data-tone={tone} style={{ width: `${pct}%` }} /></span>
    <span className="qms-train-pct mono" title={`${current} of ${of} assigned have acknowledged the version in force`}>{current}/{of}</span>
    <span className="qms-train-when" title="Most recent acknowledgement by the people assigned">Latest {lastCycle}</span>
  </>;
}

export function DocumentReadButton({ doc, disabled, onOpen }: {
  doc: QmsDoc; disabled: boolean; onOpen: (documentId: number) => void;
}) {
  return <button className="qms-chip" disabled={disabled}
    title="Read this controlled revision and check your personal acknowledgement"
    onClick={() => onOpen(doc.id)}>{I.bookOpen} {doc.status === 'effective' ? 'Read and acknowledge' : 'Open document'}</button>;
}

/* ── Job roles and who must train (P-49; docs/design/QMS_TRAINING_ASSIGNMENT_2026-10-29.md §3.12) ──
   Every change names its reason and goes through the governed QMS routes; the
   server's refusal is shown in its own words. A failed read is said, never
   shown as "no roles" or "nobody assigned". */

const REASON_MIN = 8;
const refusalOf = (err: unknown, fallback: string) => redactInternals(err instanceof Error ? err.message : '', fallback);
const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : '—');

/** One governed act: a reason, then the act; the refusal stays until the next try. */
function ReasonAct({ label, action, hint, extra, ready = true, onSubmit, onCancel }: {
  label: string; action: string; hint: string; extra?: React.ReactNode; ready?: boolean;
  onSubmit: (reason: string) => Promise<void>; onCancel: () => void;
}) {
  const [reason, setReason] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || !ready || reason.trim().length < REASON_MIN) return;
    setBusy(true); setError(null);
    try { await onSubmit(reason.trim()); }
    catch (err) { setError(refusalOf(err, 'The change could not be confirmed. Nothing was changed.')); }
    finally { setBusy(false); }
  };
  return <form className="qms-train-act" aria-label={label} onSubmit={event => void submit(event)}>
    {extra}
    <label>Reason<textarea value={reason} onChange={event => setReason(event.target.value)} minLength={REASON_MIN} maxLength={2000} required disabled={busy} /></label>
    <p className="qms-dialog-hint">{hint} State the reason in at least {REASON_MIN} characters; it is kept with the change.</p>
    {error && <div role="alert">{error}</div>}
    <div className="qms-dialog-actions">
      <button type="button" className="qms-btn ghost" onClick={onCancel} disabled={busy}>Cancel</button>
      <button type="submit" className="qms-btn primary" disabled={busy || !ready || reason.trim().length < REASON_MIN}>{busy ? 'Saving…' : action}</button>
    </div>
  </form>;
}

type RoleAct = { kind: 'create' } | { kind: 'rename' | 'delete' | 'add'; role: JobRole } | { kind: 'remove'; role: JobRole; userId: number; label: string };

/** The organization's job roles and who holds them. Only an administrator changes them (D4). */
export function JobRolesPanel({ onClose }: { onClose: () => void }) {
  const jr = useJobRoles();
  const [act, setAct] = React.useState<RoleAct | null>(null);
  const done = async (write: Promise<unknown>) => { await write; setAct(null); jr.refresh(); };
  return <DialogPanel title="Job roles" onClose={onClose} busy={false}>
    <p>A job role is a job function people hold, such as QA reviewer. Assigning a role to a controlled document requires everyone who holds it to read and acknowledge it.</p>
    {jr.failed && <ErrorState title="Job roles could not be read" message={jr.error} retry={jr.refresh} testId="qms-job-roles-failed" />}
    {!jr.failed && !jr.listing && <div className="qms-empty" role="status">Loading job roles…</div>}
    {jr.listing && <>
      {!jr.listing.canAdminister && <p className="qms-dialog-hint">Only an administrator changes job roles and who holds them.</p>}
      {jr.listing.roles.length === 0 && <div className="qms-empty">No job roles yet.</div>}
      {jr.listing.roles.map(role => <JobRoleRow key={role.id} role={role} canAdminister={jr.listing!.canAdminister} onAct={setAct} />)}
      {jr.listing.canAdminister && !act && <button type="button" className="qms-btn ghost" onClick={() => setAct({ kind: 'create' })}>{I.plus} New job role</button>}
      {act && <JobRoleActForm act={act} people={jr.listing.people} onDone={done} onCancel={() => setAct(null)} />}
    </>}
    <div className="qms-dialog-actions"><button type="button" className="qms-btn ghost" onClick={onClose}>Close</button></div>
  </DialogPanel>;
}

function JobRoleRow({ role, canAdminister, onAct }: { role: JobRole; canAdminister: boolean; onAct: (act: RoleAct) => void }) {
  return <div className="qms-train-role" data-testid={`qms-job-role-${role.id}`}>
    <div className="qms-train-role-head">
      <strong>{role.name}</strong>
      <span className="meta">{role.documentCount === 1 ? '1 document' : `${role.documentCount} documents`}</span>
      {canAdminister && <>
        <button type="button" className="qms-link" onClick={() => onAct({ kind: 'add', role })}>Add a person</button>
        <button type="button" className="qms-link" onClick={() => onAct({ kind: 'rename', role })}>Rename</button>
        <button type="button" className="qms-link" disabled={role.documentCount > 0}
          title={role.documentCount > 0 ? 'Assigned to a document: withdraw those assignments first.' : undefined}
          onClick={() => onAct({ kind: 'delete', role })}>Delete</button>
      </>}
    </div>
    {role.description && <p className="qms-dialog-hint">{role.description}</p>}
    {role.members.length === 0 ? <div className="qms-empty">Nobody holds this role.</div> : <ul className="qms-train-people">
      {role.members.map(m => <li key={m.userId}>
        {m.label}{m.active ? '' : ' (no longer an active member)'} <span className="meta">since {day(m.addedAt)}</span>
        {canAdminister && <button type="button" className="qms-link" onClick={() => onAct({ kind: 'remove', role, userId: m.userId, label: m.label })}>Remove</button>}
      </li>)}
    </ul>}
  </div>;
}

function JobRoleActForm({ act, people, onDone, onCancel }: {
  act: RoleAct; people: JobRoleListing['people']; onDone: (write: Promise<unknown>) => Promise<void>; onCancel: () => void;
}) {
  const [name, setName] = React.useState(act.kind === 'rename' ? act.role.name : '');
  const [description, setDescription] = React.useState(act.kind === 'rename' ? act.role.description ?? '' : '');
  const [userId, setUserId] = React.useState('');
  const held = new Set(act.kind === 'add' ? act.role.members.map(m => m.userId) : []);
  const nameFields = <>
    <label>Name<input value={name} onChange={event => setName(event.target.value)} maxLength={80} required /></label>
    <label>Description (optional)<input value={description} onChange={event => setDescription(event.target.value)} maxLength={500} /></label>
  </>;
  switch (act.kind) {
    case 'create':
      return <ReasonAct label="New job role" action="Create role" hint="The role is listed for assignment once created." extra={nameFields} ready={name.trim().length > 0}
        onCancel={onCancel} onSubmit={reason => onDone(qmsWrite('POST', 'job-roles', { name: name.trim(), ...(description.trim() ? { description: description.trim() } : {}), reason }))} />;
    case 'rename':
      return <ReasonAct label={`Rename ${act.role.name}`} action="Save" hint="Its holders and assignments are unchanged." extra={nameFields} ready={name.trim().length > 0}
        onCancel={onCancel} onSubmit={reason => onDone(qmsWrite('PATCH', `job-roles/${act.role.id}`, { name: name.trim(), description: description.trim() || null, reason }))} />;
    case 'delete':
      return <ReasonAct label={`Delete ${act.role.name}`} action="Delete role" hint={`${act.role.name} is removed; its history is kept.`}
        onCancel={onCancel} onSubmit={reason => onDone(qmsWrite('DELETE', `job-roles/${act.role.id}`, { reason }))} />;
    case 'add':
      return <ReasonAct label={`Add a person to ${act.role.name}`} action="Add" hint="They must then train on every document this role is assigned to." ready={userId !== ''}
        extra={<label>Person<select value={userId} onChange={event => setUserId(event.target.value)} required>
          <option value="">Choose a person</option>
          {people.filter(p => !held.has(p.userId)).map(p => <option key={p.userId} value={String(p.userId)}>{p.label}</option>)}
        </select></label>}
        onCancel={onCancel} onSubmit={reason => onDone(qmsWrite('POST', `job-roles/${act.role.id}/members`, { userId: Number(userId), reason }))} />;
    case 'remove':
      return <ReasonAct label={`Remove ${act.label} from ${act.role.name}`} action="Remove" hint={`${act.label} no longer trains through ${act.role.name}.`}
        onCancel={onCancel} onSubmit={reason => onDone(qmsWrite('DELETE', `job-roles/${act.role.id}/members/${act.userId}`, { reason }))} />;
  }
}

type AssignAct = { kind: 'role' | 'person' } | { kind: 'withdraw'; assignment: TrainingAssignment };

/** Who must read and acknowledge one controlled document: by job role and by name (P-49). */
export function TrainingAssignmentsPanel({ doc, onClose }: { doc: QmsDoc; onClose: () => void }) {
  const ta = useTrainingAssignments(doc.id);
  const jr = useJobRoles();
  const [act, setAct] = React.useState<AssignAct | null>(null);
  const done = async (write: Promise<unknown>) => { await write; setAct(null); ta.refresh(); jr.refresh(); };
  return <DialogPanel title={`Who must train on ${doc.docNumber}`} onClose={onClose} busy={false}>
    <p>{doc.docNumber} {doc.title}. Everyone who holds an assigned job role, and everyone assigned by name, must read and acknowledge the version in force.</p>
    {ta.failed && <ErrorState title="Who must train could not be read" message={ta.error} retry={ta.refresh} testId="qms-assignments-failed" />}
    {!ta.failed && !ta.listing && <div className="qms-empty" role="status">Loading assignments…</div>}
    {ta.listing && <AssignmentsBody documentId={doc.id} listing={ta.listing} roles={jr.listing} rolesFailed={jr.failed} act={act} onAct={setAct} onDone={done} />}
    <div className="qms-dialog-actions"><button type="button" className="qms-btn ghost" onClick={onClose}>Close</button></div>
  </DialogPanel>;
}

function AssignmentsBody({ documentId, listing, roles, rolesFailed, act, onAct, onDone }: {
  documentId: number; listing: TrainingAssignmentListing; roles: JobRoleListing | null; rolesFailed: boolean;
  act: AssignAct | null; onAct: (act: AssignAct | null) => void; onDone: (write: Promise<unknown>) => Promise<void>;
}) {
  const can = listing.canAssign === true;
  return <>
    <TrainableLine trainable={listing.trainable} />
    {listing.canAssign === null && <div role="status">Whether you can change these assignments could not be checked. Try again later.</div>}
    {listing.canAssign === false && <p className="qms-dialog-hint">Only an administrator or a designated QMS approver who can edit changes who must train on this document.</p>}
    {listing.assignments.length === 0 ? <div className="qms-empty">Nobody is assigned to train on this document.</div> : <ul className="qms-train-people">
      {listing.assignments.map(a => <li key={a.id}>
        {a.kind === 'role' ? <>Job role <strong>{a.jobRoleName ?? 'a deleted role'}</strong></> : <><strong>{a.userLabel}</strong>{a.active === false ? ' (no longer an active member)' : ''}</>}
        {' '}<span className="meta">assigned by {a.assignedByLabel} on {day(a.assignedAt)}</span>
        {can && <button type="button" className="qms-link" onClick={() => onAct({ kind: 'withdraw', assignment: a })}>Withdraw</button>}
      </li>)}
    </ul>}
    <PeopleLine listing={listing} />
    {can && !act && <div className="qms-dialog-actions">
      <button type="button" className="qms-btn ghost" onClick={() => onAct({ kind: 'role' })}>Assign a job role</button>
      <button type="button" className="qms-btn ghost" onClick={() => onAct({ kind: 'person' })}>Assign a person</button>
    </div>}
    {can && act && <AssignActForm act={act} documentId={documentId} listing={listing} roles={roles} rolesFailed={rolesFailed} onDone={onDone} onCancel={() => onAct(null)} />}
  </>;
}

function TrainableLine({ trainable }: { trainable: TrainingAssignmentListing['trainable'] }) {
  const parts: string[] = [];
  if (trainable.inForce) parts.push(`Version in force: v${trainable.inForce.version}`);
  if (trainable.pending) parts.push(`v${trainable.pending.version} takes effect ${day(trainable.pending.effectiveDate)}`);
  return <p className="qms-dialog-hint">{parts.length ? parts.join(' · ') : 'No version is approved yet: training opens when one is.'}</p>;
}

function viaWords(via: string[], listing: TrainingAssignmentListing): string {
  const roleName = (id: string) => listing.assignments.find(a => a.jobRoleId === Number(id))?.jobRoleName ?? 'a job role';
  return via.map(v => (v === 'person' ? 'by name' : `through ${roleName(v.slice('role:'.length))}`)).join(' and ');
}

/** The people assigned: all of them for an administrator or QMS approver, otherwise the reader's own line and the count (P-50). */
function PeopleLine({ listing }: { listing: TrainingAssignmentListing }) {
  const count = listing.peopleCount === 1 ? '1 person is' : `${listing.peopleCount} people are`;
  if (listing.peopleScope === 'own') {
    const me = listing.people[0];
    return <p data-testid="qms-assigned-count">{count} assigned.{me ? ` You are assigned ${viaWords(me.via, listing)}, since ${day(me.coveredSince)}.` : ''}</p>;
  }
  return <>
    <p data-testid="qms-assigned-count">{count} assigned.</p>
    {listing.people.length > 0 && <ul className="qms-train-people">
      {listing.people.map(p => <li key={p.userId}>{p.label} <span className="meta">{viaWords(p.via, listing)}, since {day(p.coveredSince)}</span></li>)}
    </ul>}
  </>;
}

function AssignActForm({ act, documentId, listing, roles, rolesFailed, onDone, onCancel }: {
  act: AssignAct; documentId: number; listing: TrainingAssignmentListing; roles: JobRoleListing | null; rolesFailed: boolean;
  onDone: (write: Promise<unknown>) => Promise<void>; onCancel: () => void;
}) {
  const [choice, setChoice] = React.useState('');
  const path = `documents/${documentId}/training-assignments`;
  if (act.kind === 'withdraw') {
    const who = act.assignment.kind === 'role' ? `job role ${act.assignment.jobRoleName ?? ''}`.trim() : act.assignment.userLabel ?? 'this person';
    return <ReasonAct label={`Withdraw ${who}`} action="Withdraw" hint={`${who} no longer has to train on this document; the assignment's history is kept.`}
      onCancel={onCancel} onSubmit={reason => onDone(qmsWrite('DELETE', `${path}/${act.assignment.id}`, { reason }))} />;
  }
  if (rolesFailed || !roles) {
    return <div role={rolesFailed ? 'alert' : 'status'}>{rolesFailed ? 'The job roles and people could not be read, so nothing can be assigned now.' : 'Loading job roles and people…'}</div>;
  }
  const taken = new Set(listing.assignments.map(a => (a.kind === 'role' ? `r${a.jobRoleId}` : `p${a.userId}`)));
  const options = act.kind === 'role'
    ? roles.roles.filter(r => !taken.has(`r${r.id}`)).map(r => ({ value: String(r.id), label: r.name }))
    : roles.people.filter(p => !taken.has(`p${p.userId}`)).map(p => ({ value: String(p.userId), label: p.label }));
  const noun = act.kind === 'role' ? 'Job role' : 'Person';
  return <ReasonAct label={`Assign a ${noun.toLowerCase()}`} action="Assign" ready={choice !== ''}
    hint={act.kind === 'role' ? 'Everyone who holds the role, now or later, must train on this document.' : 'They must train on this document while they are a member.'}
    extra={<label>{noun}<select value={choice} onChange={event => setChoice(event.target.value)} required>
      <option value="">{options.length ? `Choose a ${noun.toLowerCase()}` : `No ${noun.toLowerCase()} left to assign`}</option>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select></label>}
    onCancel={onCancel}
    onSubmit={reason => onDone(qmsWrite('POST', path, { [act.kind === 'role' ? 'jobRoleId' : 'userId']: Number(choice), reason }))} />;
}
