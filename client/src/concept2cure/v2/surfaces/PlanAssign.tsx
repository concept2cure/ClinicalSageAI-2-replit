/**
 * Assign — a planned deliverable becomes one person's task, with a due date.
 *
 * docs/design/CLIENT_JOURNEY_2026-10-25.md, pass 3 (decision 4). The task is
 * written to the one task store, unified_tasks, through the one create path
 * the review request already uses (`createAssignedTask`, POST /api/tasks/tasks):
 *
 *   moduleType 'Plan', taskType/category 'deliverable'            the kind
 *   sourceEntityType 'filing_deliverable',
 *   sourceEntityId '<program uuid>:<deliverable id>'              the link
 *   projectId <projects.id behind the program>                    the scope
 *   assigneeId, dueDate, description                              the ask
 *
 * projectId is the numeric projects.id (useProjectTeam().verifiedProjectId),
 * never a Number() of the program UUID: the project's task list and the
 * assignee's work read tasks by it. With no verified projects.id the create
 * is not offered, rather than written unscoped.
 *
 * What a deliverable shows afterwards is read back from the store
 * (GET /api/tasks/tasks/by-module/Plan), keyed by the origin columns, never
 * by the title.
 */
import React, { useEffect, useState } from 'react';
import { apiRequest, serverMessage } from '@/lib/queryClient';
import { isRowsWith, useLiveRows } from '../dataConnect';
import { C2CForm, type C2CFormConfig } from '../C2CForm';
import { I } from '../icons';
import { useAuth } from '@/services/portal/authService';
import { canGovernedWrite } from '@shared/constants/permissions';
import {
  createAssignedTask, isSubmittableReviewer, useAssigneeRoster, type AssignOutcome, type Assignee, type RosterState,
} from '../editor/AssignReviewDialog';
import { TASK_STATE_LABEL } from '../editor/ReviewTasksPanel';
import {
  jobRoleForPlanTaskRole, matchStandardJobRole, PLAN_TASK_ROLE_HOLDERS_ELSEWHERE,
} from '@shared/regulatory/client-type-job-roles';

export const PLAN_TASK_MODULE = 'Plan';
export const PLAN_TASK_ENTITY = 'filing_deliverable';
/** A task of the project's work breakdown (S11 step 3): its owner's task, keyed '<program uuid>:<pyramid task id>'. */
export const PYRAMID_TASK_ENTITY = 'pyramid_task';

/** The origin id of a deliverable's task: this project's deliverable, not the catalogue entry shared by every project. */
export function planTaskKey(programId: string, deliverableId: string): string {
  return `${programId}:${deliverableId}`;
}

export interface PlanDeliverable { id: string; title: string; group: string }

/** A work-breakdown task becomes its owner's task through the same create path as a deliverable, under its own
 *  origin type, so the two never read as each other. The due date is the one the person confirmed in the form,
 *  which starts from the schedule's. */
export function buildPyramidTaskBody(form: {
  programId: string; projectId: number; task: { id: string; name: string; phase: string; critical?: boolean };
  assignee: string; due: string; note: string;
}): Record<string, unknown> {
  return {
    title: form.task.name,
    description: form.note.trim() || undefined,
    moduleType: PLAN_TASK_MODULE,
    moduleSource: 'program-plan',
    category: 'program-plan',
    taskType: 'program-plan',
    priority: form.task.critical ? 'high' : 'medium',
    projectId: form.projectId,
    assigneeId: Number(form.assignee),
    ...(form.due ? { dueDate: new Date(`${form.due}T17:00:00`).toISOString() } : {}),
    sourceEntityType: PYRAMID_TASK_ENTITY,
    sourceEntityId: planTaskKey(form.programId, form.task.id),
    regulatoryImpact: true,
    moduleData: { programId: form.programId, pyramidTaskId: form.task.id, phase: form.task.phase, raisedFrom: 'program-plan' },
    tags: ['plan', 'program-plan'],
  };
}

export function buildDeliverableTaskBody(form: {
  programId: string; projectId: number; deliverable: PlanDeliverable;
  assignee: string; due: string; note: string;
}): Record<string, unknown> {
  return {
    title: `Prepare: ${form.deliverable.title}`,
    description: form.note.trim() || undefined,
    moduleType: PLAN_TASK_MODULE,
    moduleSource: 'project-plan',
    category: 'deliverable',
    taskType: 'deliverable',
    priority: 'medium',
    projectId: form.projectId,
    assigneeId: Number(form.assignee),
    ...(form.due ? { dueDate: new Date(`${form.due}T17:00:00`).toISOString() } : {}),
    sourceEntityType: PLAN_TASK_ENTITY,
    sourceEntityId: planTaskKey(form.programId, form.deliverable.id),
    regulatoryImpact: true,
    moduleData: { programId: form.programId, deliverableId: form.deliverable.id, group: form.deliverable.group, raisedFrom: 'project-plan' },
    tags: ['plan', 'deliverable'],
  };
}

const DELIVERABLE_TASK_WORDS = {
  noun: 'assignment',
  unmatched: 'The response did not confirm this assignment. Check the project’s tasks before assigning again.',
};

export interface PlanAssignment { taskId: string; assigneeName: string | null; dueDate: string | null; status: string }
interface PlanTaskRow {
  taskId?: unknown; title?: unknown; sourceEntityType?: unknown; sourceEntityId?: unknown;
  assigneeId?: unknown; assigneeName?: unknown; dueDate?: unknown; status?: unknown; createdAt?: unknown;
}

const createdAt = (row: PlanTaskRow) => { const t = new Date(String(row?.createdAt ?? '')).getTime(); return Number.isFinite(t) ? t : 0; };

/** Each of this project's deliverables (or, with PYRAMID_TASK_ENTITY, work-breakdown tasks) that has a task, keyed by
 *  its id; the newest task wins. */
export function planAssignments(rows: unknown, programId: string, entity: string = PLAN_TASK_ENTITY): Map<string, PlanAssignment> {
  const out = new Map<string, PlanAssignment>();
  const prefix = `${programId}:`;
  const newestFirst = (Array.isArray(rows) ? [...rows] as PlanTaskRow[] : []).sort((a, b) => createdAt(b) - createdAt(a));
  for (const row of newestFirst) {
    const origin = String(row?.sourceEntityId ?? '');
    if (row?.sourceEntityType !== entity || !origin.startsWith(prefix) || row.status === 'cancelled') continue;
    const id = origin.slice(prefix.length);
    if (out.has(id)) continue;
    out.set(id, {
      taskId: String(row.taskId ?? ''),
      assigneeName: row.assigneeName == null ? null : String(row.assigneeName),
      dueDate: row.dueDate == null ? null : String(row.dueDate),
      status: String(row.status ?? 'pending'),
    });
  }
  return out;
}

/** One of the signed-in person's open tasks in this project's plan (S11 step 4, "Due for you"). */
export interface PlanDueItem {
  taskId: string;
  /** A document of the filing, or a task of the work breakdown. */
  kind: 'document' | 'work';
  title: string;
  dueDate: string | null;
  status: string;
}

const CLOSED = new Set(['completed', 'cancelled']);
const dueMs = (iso: string | null) => { const t = iso ? new Date(iso).getTime() : NaN; return Number.isFinite(t) ? t : Infinity; };

/** The person's open tasks of this project's plan, by due date (none last). Read from the same rows the plan's
 *  assignments come from (GET /api/tasks/tasks/by-module/Plan), by assignee: the task store's own record. */
export function planDueFor(rows: unknown, programId: string, userId: string | number | null | undefined): PlanDueItem[] {
  const me = userId == null ? '' : String(userId).trim();
  if (!me) return [];
  const prefix = `${programId}:`;
  const kinds: Record<string, PlanDueItem['kind']> = { [PLAN_TASK_ENTITY]: 'document', [PYRAMID_TASK_ENTITY]: 'work' };
  return (Array.isArray(rows) ? rows as PlanTaskRow[] : [])
    .filter(row => kinds[String(row?.sourceEntityType)] && String(row?.sourceEntityId ?? '').startsWith(prefix)
      && String(row?.assigneeId ?? '') === me && !CLOSED.has(String(row?.status ?? '')))
    .map(row => ({
      taskId: String(row.taskId ?? ''), kind: kinds[String(row.sourceEntityType)], title: String(row.title ?? 'Untitled task'),
      dueDate: row.dueDate == null ? null : String(row.dueDate), status: String(row.status ?? 'pending'),
    }))
    .sort((a, b) => dueMs(a.dueDate) - dueMs(b.dueDate));
}

/** The project's plan tasks (deliverables and work-breakdown tasks), and whether they could be read. */
export function usePlanAssignments(programId: string, epoch: number) {
  const read = useLiveRows<PlanTaskRow>(`/api/tasks/tasks/by-module/${PLAN_TASK_MODULE}`, [programId, epoch], isRowsWith<PlanTaskRow>('taskId', 'sourceEntityType'));
  return {
    loading: read.loading, error: read.error ?? null,
    byDeliverable: planAssignments(read.rows, programId),
    byPyramidTask: planAssignments(read.rows, programId, PYRAMID_TASK_ENTITY),
    rows: read.rows,
  };
}

const DATE = { year: 'numeric', month: 'short', day: 'numeric' } as const;
function dueWords(iso: string | null): string {
  const d = iso ? new Date(iso) : null;
  return d && Number.isFinite(d.getTime()) ? `, due ${d.toLocaleDateString(undefined, DATE)}` : ', no due date';
}

/** "Assigned to Dana, due Nov 3", or the task's own state ("Task completed: Dana…") — the task's, never the
 *  deliverable's: a finished task does not make a deliverable complete. Words, never colour alone. */
export function AssignmentLine({ assignment }: { assignment: PlanAssignment }) {
  const who = assignment.assigneeName ?? 'a person whose name was not returned';
  const state = assignment.status === 'pending' ? 'Assigned to'
    : `Task ${(TASK_STATE_LABEL[assignment.status]?.label ?? assignment.status).toLowerCase()}:`;
  return <span className="pj-plan-assigned" data-testid="plan-assignment">{state} {who}{dueWords(assignment.dueDate)}</span>;
}

/** The organisation's job roles and who holds each (GET /api/mdx/qms/job-roles, P-49). */
export interface JobRoleHolders { name: string; members: Array<{ userId: number; label: string; active: boolean }> }
export type HoldersState = 'loading' | 'ready' | 'error';

/**
 * Who the work breakdown proposes for a task (P-119): the job role its role key means in the standard catalog
 * (shared/regulatory/client-type-job-roles.ts), and the active members who hold that job role in this organisation.
 * A lookup, never a guess: an organisation's role counts only when its name is a standard role's name, and a task
 * whose role the catalog does not know proposes no one.
 */
export function proposedOwners(taskRole: string | undefined, roles: JobRoleHolders[]): { roleName: string; holderIds: string[] } | null {
  const role = jobRoleForPlanTaskRole(taskRole);
  if (!role) return null;
  const keys = new Set([role.key, ...(PLAN_TASK_ROLE_HOLDERS_ELSEWHERE[String(taskRole ?? '').trim().toLowerCase()] ?? [])]);
  const holderIds = roles.filter(r => keys.has(matchStandardJobRole(r.name)?.key ?? ''))
    .flatMap(r => r.members.filter(m => m.active).map(m => String(m.userId)));
  return { roleName: role.name, holderIds: [...new Set(holderIds)] };
}

/** The job roles, read once when the Assign form opens for a work-breakdown task. */
function useJobRoleHolders(wanted: boolean): { roles: JobRoleHolders[]; state: HoldersState } {
  const [read, setRead] = useState<{ roles: JobRoleHolders[]; state: HoldersState }>({ roles: [], state: 'loading' });
  useEffect(() => {
    if (!wanted) return undefined;
    let alive = true;
    void (async () => {
      try {
        const res = await apiRequest('GET', '/api/mdx/qms/job-roles');
        const json = (await res.json().catch(() => null)) as { data?: { roles?: JobRoleHolders[] } } | null;
        const roles = res.ok && Array.isArray(json?.data?.roles) ? json.data.roles : null;
        if (alive) setRead(roles ? { roles, state: 'ready' } : { roles: [], state: 'error' });
      } catch {
        if (alive) setRead({ roles: [], state: 'error' });
      }
    })();
    return () => { alive = false; };
  }, [wanted]);
  return read;
}

/** The proposal in words under Person, and the roster with the role's holders first. The person still chooses.
 *  `status` is the part that changes while the form is open (the job roles land or fail): C2CForm's live region. */
function proposalFor(roster: Assignee[], proposal: AssignProposal | undefined): { desc?: string; status?: string; roster: Assignee[] } {
  if (!proposal?.owners) return { roster };
  const { roleName, holderIds } = proposal.owners;
  const desc = `The work breakdown gives this task to the ${roleName}.`;
  if (proposal.state === 'loading') return { roster, desc, status: '' };
  if (proposal.state === 'error') return { roster, desc, status: 'Who holds that job role could not be read.' };
  const holders = roster.filter(a => holderIds.includes(String(a.id)));
  if (!holders.length) return { roster, desc, status: 'No one in your organisation holds that job role yet.' };
  return {
    desc, status: `Listed first: ${holders.length === 1 ? 'the person who holds' : 'the people who hold'} that job role.`,
    roster: [...holders.map(a => ({ ...a, label: `${a.label ?? a.name} (${roleName})` })), ...roster.filter(a => !holders.includes(a))],
  };
}

export interface AssignProposal { owners: ReturnType<typeof proposedOwners>; state: HoldersState }

export function assignForm(title: string, members: Assignee[], rosterState: RosterState, due?: { value: string; desc: string }, proposal?: AssignProposal): C2CFormConfig {
  const unread = rosterState === 'error';
  const { roster, desc, status } = proposalFor(members, rosterState === 'ready' ? proposal : undefined);
  return {
    eyebrow: 'Plan',
    title: `Assign: ${title}`,
    sub: 'Creates a task for one person, with a due date. It appears in their tasks and in this project’s tasks.',
    submitLabel: 'Assign',
    busy: rosterState === 'loading' ? 'Reading your organisation’s members…' : undefined,
    notice: unread ? 'The member list could not be read, so no one can be chosen. Close this and press Assign again to read it again.' : undefined,
    fields: unread ? [] : [
      { key: 'assignee', label: 'Person', type: 'select', required: true,
        options: roster.map(a => ({ value: a.id, label: a.label ?? a.name })),
        ...(roster.length ? (desc ? { desc, descStatus: status } : {}) : { desc: 'No members in this organisation yet, so no one can be chosen.' }) },
      { key: 'due', label: 'Due date', type: 'date', required: true, ...(due ? { default: due.value, desc: due.desc } : {}) },
      { key: 'note', label: 'Note', type: 'textarea', rows: 3, placeholder: 'What they should know (optional)' },
    ],
  };
}

function AssignDrawer({ deliverable, due, taskRole, onCancel, onSubmit }: {
  deliverable: PlanDeliverable; due?: { value: string; desc: string }; taskRole?: string; onCancel: () => void; onSubmit: (values: Record<string, string>) => void;
}) {
  const { roster, rosterState } = useAssigneeRoster();
  const holders = useJobRoleHolders(Boolean(jobRoleForPlanTaskRole(taskRole)));
  const proposal = { owners: proposedOwners(taskRole, holders.roles), state: holders.state };
  return <C2CForm config={assignForm(deliverable.title, roster, rosterState, due, proposal)} onCancel={onCancel} onSubmit={onSubmit} />;
}

/**
 * The Assign button for one deliverable, its drawer, and the outcome in words.
 * A viewer is not offered it (the server refuses their task writes), nor is a
 * project whose projects.id is not verified.
 */
export function AssignAction({ deliverable, programId, projectId, assigned = false, onAssigned, due, buildBody, taskRole }: {
  deliverable: PlanDeliverable; programId: string; projectId: number | null;
  /** Someone already has it: a second Assign adds a person, it does not move the first task. */
  assigned?: boolean; onAssigned: () => void;
  /** The due date the form starts from, and where it came from (a work-breakdown task's back-scheduled date). */
  due?: { value: string; desc: string };
  /** The task body, where it is not a deliverable's (buildPyramidTaskBody). */
  buildBody?: (form: { assignee: string; due: string; note: string }) => Record<string, unknown>;
  /** A work-breakdown task's role key: the form names its job role and lists the people who hold it first. */
  taskRole?: string;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<AssignOutcome | null>(null);
  if (!canGovernedWrite(user) || projectId === null) return null;
  const submit = async (values: Record<string, string>) => {
    setOpen(false);
    if (!isSubmittableReviewer(values.assignee ?? '')) {
      setOutcome({ ok: false, unconfirmed: false, message: 'No one was chosen, so nothing was assigned.' });
      return;
    }
    setBusy(true);
    const form = { assignee: values.assignee, due: values.due ?? '', note: values.note ?? '' };
    const body = buildBody ? buildBody(form) : buildDeliverableTaskBody({ programId, projectId, deliverable, ...form });
    const result = await createAssignedTask(body, DELIVERABLE_TASK_WORDS);
    setBusy(false);
    setOutcome(result);
    // An unconfirmed outcome may have written: read again so the lists say what is there.
    if (result.ok || result.unconfirmed) onAssigned();
  };
  return <>
    <button type="button" className="btn ghost" disabled={busy} onClick={() => { setOutcome(null); setOpen(true); }}>
      {I.users} {busy ? 'Assigning…' : assigned ? 'Assign another person' : 'Assign'}
    </button>
    {outcome && !outcome.ok && <p className="pf-sel-m pj-plan-assign-msg" role="alert" data-testid="plan-assign-error">{outcome.message}</p>}
    {outcome?.ok && <p className="pf-sel-m pj-plan-assign-msg" role="status">Assigned{outcome.assigneeName ? ` to ${outcome.assigneeName}` : ''}. The task is in their tasks and this project’s tasks.</p>}
    {open && <AssignDrawer deliverable={deliverable} due={due} taskRole={taskRole} onCancel={() => setOpen(false)} onSubmit={v => void submit(v)} />}
  </>;
}

/**
 * "Due for you" (THE_PROGRAM §8, item 2): the signed-in person's open tasks in this project's plan, by date, first in
 * the Plan step. A task past its due date says so in words. Nothing assigned is said; an unread list is said as
 * unread, never as nothing assigned.
 */
export function DueForYou({ items, unread, today = new Date() }: { items: PlanDueItem[]; unread: boolean; today?: Date }) {
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return (
    <section className="pj-sec" aria-labelledby="pj-due-h" data-testid="pj-due-for-you">
      <div className="pj-sec-h"><h2 id="pj-due-h">Due for you</h2></div>
      {unread ? <p className="pj-desc" role="status">Your tasks in this project could not be read.</p>
        : !items.length ? <p className="pj-desc pj-fact-none">Nothing in this project&apos;s plan is assigned to you.</p>
        : <ul className="pj-due-list">{items.map(item => {
          const due = dueMs(item.dueDate);
          const late = due !== Infinity && due < startOfToday;
          const state = item.status === 'pending' ? '' : ` · ${(TASK_STATE_LABEL[item.status]?.label ?? item.status).toLowerCase()}`;
          return <li key={item.taskId} className="pj-due-row" data-late={late || undefined}>
            <span className="pj-due-t">{item.title}</span>
            <span className="pj-due-k">{item.kind === 'work' ? 'Work' : 'Document'}</span>
            <span className="pj-due-d">{due === Infinity ? 'No due date' : `Due ${new Date(due).toLocaleDateString(undefined, DATE)}`}{late ? ' · past due' : ''}{state}</span>
          </li>;
        })}</ul>}
    </section>
  );
}

/** The body that moves an owner's task to the schedule's date: tasking's governed reschedule (PATCH
 *  /api/tasks/tasks/:taskId, action 'reschedule'), with the date the person was shown, so a task moved meanwhile is
 *  refused as stale, and the reason they state. The date is the end of that working day, as Assign records it. */
export function buildRescheduleBody(scheduleDay: string, currentDueDate: string | null, reason: string): Record<string, unknown> {
  const shown = currentDueDate ? new Date(currentDueDate) : null;
  return {
    action: 'reschedule',
    dueDate: new Date(`${scheduleDay}T17:00:00`).toISOString(),
    expectedDueDate: shown && Number.isFinite(shown.getTime()) ? shown.toISOString() : null,
    reason,
  };
}

/**
 * "Use the schedule's date" (S11): when the plan's date for a task has moved since it was assigned, the owner's task
 * is moved to it. A governed change: it asks for the reason and tasking records it on the ledger. Not offered to a
 * viewer. A refusal is said, with nothing changed.
 */
export function UseScheduleDate({ assignment, scheduleDay, scheduleWords, onMoved }: {
  assignment: PlanAssignment; scheduleDay: string; scheduleWords: string; onMoved: () => void;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);
  if (!canGovernedWrite(user) || !assignment.taskId) return null;
  const submit = async (values: Record<string, string>) => {
    setOpen(false); setBusy(true); setSaid(null);
    try {
      const res = await apiRequest('PATCH', `/api/tasks/tasks/${encodeURIComponent(assignment.taskId)}`,
        buildRescheduleBody(scheduleDay, assignment.dueDate, values.reason ?? ''));
      const json = (await res.json().catch(() => null)) as { success?: boolean; error?: string; code?: string } | null;
      if (!res.ok || !json?.success) {
        const unknown = json?.error === 'OUTCOME_UNKNOWN';
        setSaid({ ok: false, text: unknown
          ? 'The save could not be confirmed. The task is read again so you can see its date.'
          : `The due date was not changed: ${(serverMessage(json) ?? `the server refused it (HTTP ${res.status})`).replace(/[.\s]+$/, '')}.` });
        if (unknown) onMoved();
        return;
      }
      setSaid({ ok: true, text: `The task is now due ${scheduleWords}.` });
      onMoved();
    } catch (e) {
      setSaid({ ok: false, text: `The due date was not changed: ${e instanceof Error ? e.message : 'the request failed'}.` });
    } finally { setBusy(false); }
  };
  return <>
    <button type="button" className="btn ghost" disabled={busy} onClick={() => { setSaid(null); setOpen(true); }}>
      {I.clock} {busy ? 'Moving…' : 'Use the schedule’s date'}
    </button>
    {said && <p className="pf-sel-m pj-plan-assign-msg" role={said.ok ? 'status' : 'alert'}>{said.text}</p>}
    {open && <C2CForm onCancel={() => setOpen(false)} onSubmit={v => void submit(v)} config={{
      eyebrow: 'Plan', title: `Move this task to ${scheduleWords}`,
      sub: 'Changes the due date of the owner’s task to the schedule’s date. The owner is reminded against the new date.',
      governed: 'Recorded with your reason in the audit trail.', submitLabel: 'Change the due date',
      fields: [{ key: 'reason', label: 'Reason', type: 'text', required: true, placeholder: 'e.g. The target submission date moved' }],
    }} />}
  </>;
}
