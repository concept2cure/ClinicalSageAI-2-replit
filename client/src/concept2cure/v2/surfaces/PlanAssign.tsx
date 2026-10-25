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
import React, { useState } from 'react';
import { isRowsWith, useLiveRows } from '../dataConnect';
import { C2CForm, type C2CFormConfig } from '../C2CForm';
import { I } from '../icons';
import { useAuth } from '@/services/portal/authService';
import { canGovernedWrite } from '@shared/constants/permissions';
import {
  createAssignedTask, isSubmittableReviewer, useAssigneeRoster, type AssignOutcome, type Assignee, type RosterState,
} from '../editor/AssignReviewDialog';
import { TASK_STATE_LABEL } from '../editor/ReviewTasksPanel';

export const PLAN_TASK_MODULE = 'Plan';
export const PLAN_TASK_ENTITY = 'filing_deliverable';

/** The origin id of a deliverable's task: this project's deliverable, not the catalogue entry shared by every project. */
export function planTaskKey(programId: string, deliverableId: string): string {
  return `${programId}:${deliverableId}`;
}

export interface PlanDeliverable { id: string; title: string; group: string }

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
interface PlanTaskRow { taskId?: unknown; sourceEntityType?: unknown; sourceEntityId?: unknown; assigneeName?: unknown; dueDate?: unknown; status?: unknown; createdAt?: unknown }

const createdAt = (row: PlanTaskRow) => { const t = new Date(String(row?.createdAt ?? '')).getTime(); return Number.isFinite(t) ? t : 0; };

/** Each of this project's deliverables that has a task, keyed by deliverable id; the newest task wins. */
export function planAssignments(rows: unknown, programId: string): Map<string, PlanAssignment> {
  const out = new Map<string, PlanAssignment>();
  const prefix = `${programId}:`;
  const newestFirst = (Array.isArray(rows) ? [...rows] as PlanTaskRow[] : []).sort((a, b) => createdAt(b) - createdAt(a));
  for (const row of newestFirst) {
    const origin = String(row?.sourceEntityId ?? '');
    if (row?.sourceEntityType !== PLAN_TASK_ENTITY || !origin.startsWith(prefix) || row.status === 'cancelled') continue;
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

/** The project's deliverable tasks, and whether they could be read. */
export function usePlanAssignments(programId: string, epoch: number) {
  const read = useLiveRows<PlanTaskRow>(`/api/tasks/tasks/by-module/${PLAN_TASK_MODULE}`, [programId, epoch], isRowsWith<PlanTaskRow>('taskId', 'sourceEntityType'));
  return { loading: read.loading, error: read.error ?? null, byDeliverable: planAssignments(read.rows, programId) };
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

export function assignForm(title: string, roster: Assignee[], rosterState: RosterState): C2CFormConfig {
  const unread = rosterState === 'error';
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
        ...(roster.length ? {} : { desc: 'No members in this organisation yet, so no one can be chosen.' }) },
      { key: 'due', label: 'Due date', type: 'date', required: true },
      { key: 'note', label: 'Note', type: 'textarea', rows: 3, placeholder: 'What they should know (optional)' },
    ],
  };
}

function AssignDrawer({ deliverable, onCancel, onSubmit }: {
  deliverable: PlanDeliverable; onCancel: () => void; onSubmit: (values: Record<string, string>) => void;
}) {
  const { roster, rosterState } = useAssigneeRoster();
  return <C2CForm config={assignForm(deliverable.title, roster, rosterState)} onCancel={onCancel} onSubmit={onSubmit} />;
}

/**
 * The Assign button for one deliverable, its drawer, and the outcome in words.
 * A viewer is not offered it (the server refuses their task writes), nor is a
 * project whose projects.id is not verified.
 */
export function AssignAction({ deliverable, programId, projectId, assigned = false, onAssigned }: {
  deliverable: PlanDeliverable; programId: string; projectId: number | null;
  /** Someone already has it: a second Assign adds a person, it does not move the first task. */
  assigned?: boolean; onAssigned: () => void;
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
    const body = buildDeliverableTaskBody({ programId, projectId, deliverable, assignee: values.assignee, due: values.due ?? '', note: values.note ?? '' });
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
    {open && <AssignDrawer deliverable={deliverable} onCancel={() => setOpen(false)} onSubmit={v => void submit(v)} />}
  </>;
}
