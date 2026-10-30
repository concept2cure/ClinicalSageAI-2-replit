/**
 * A CAPA's target close date and its action items' due dates, as tasks for the
 * people who owe them (Quality reminders, 2026-10-29).
 *
 * One open task per CAPA, keyed `capa:<id>`, due on its target close date for as
 * long as it is not closed. One per action item, keyed `capa-action:<id>`, due on
 * its due date until it is done or cancelled. Each goes to the user the record
 * names, when it names one by id, and otherwise to the person who recorded it.
 * Each asks the due-date sweep (jobs/taskDueSweep.ts) for 14 days' notice, and
 * the sweep says once more when it is overdue.
 *
 * The task follows the record. A CAPA closed (effective or not) or an action
 * done completes its task, and an action cancelled cancels it. A CAPA reopened
 * after a close found it not effective is owed again. A move that changes no
 * date changes no task. The store and the close-then-write are
 * services/tasking/source-task.ts. Planning is pure, so it can be tested.
 *
 * @module server/services/capa-mdr/capa-tasks
 */
import type { CapaAction, CapaRecord } from '../../../shared/schema/capa-mdr';
import { replaceSourceTask, type SourceTaskNext, type SourceTaskOutcome } from '../tasking/source-task';

export const CAPA_TASK_SOURCE = 'capa_record';
export const CAPA_ACTION_TASK_SOURCE = 'capa_action';
/** Notice before a CAPA or action falls due (taskDueSweep reads it). */
export const CAPA_REMIND_DAYS = 14;
const CLOSED_CAPA: readonly string[] = ['closed_effective', 'closed_not_effective'];

export interface SourceTaskPlan {
  sourceEntityType: string;
  sourceEntityId: string;
  next: SourceTaskNext | null;
  same: (metadata: Record<string, unknown>) => boolean;
  closeAs: 'completed' | 'cancelled';
}

const dayOf = (d: Date | string | null | undefined): string | null => (d ? new Date(d).toISOString().slice(0, 10) : null);
const userIdOf = (v: string | number | null | undefined): number | null => {
  const text = v == null ? '' : String(v);
  return /^[1-9]\d*$/.test(text) ? Number(text) : null;
};
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export type CapaTaskSource = Pick<CapaRecord, 'id' | 'capaCode' | 'title' | 'state' | 'riskLevel' | 'targetCloseDate' | 'assignedTo' | 'createdBy'>;

export function capaTaskPlan(capa: CapaTaskSource): SourceTaskPlan {
  const due = dayOf(capa.targetCloseDate);
  const closed = CLOSED_CAPA.includes(capa.state);
  const assigneeId = userIdOf(capa.assignedTo) ?? userIdOf(capa.createdBy);
  return {
    sourceEntityType: CAPA_TASK_SOURCE,
    sourceEntityId: `capa:${capa.id}`,
    closeAs: closed ? 'completed' : 'cancelled',
    same: (m) => m.targetClose === due,
    next: closed || !due ? null : {
      moduleType: 'Quality',
      title: `Close ${capa.capaCode}: ${clip(capa.title, 120)}`,
      description: `${capa.capaCode} ${capa.title} is due to close on ${due}. Move it through its lifecycle in Quality, CAPA; `
        + 'the close records the effectiveness check.',
      category: 'capa',
      taskType: 'action',
      ...(assigneeId ? { assigneeId } : {}),
      priority: capa.riskLevel === 'high' || capa.riskLevel === 'critical' ? 'high' : 'medium',
      dueDate: new Date(`${due}T00:00:00Z`),
      tags: ['qms', 'capa'],
      metadata: { capaId: capa.id, capaCode: capa.capaCode, targetClose: due, remindDaysBefore: CAPA_REMIND_DAYS },
    },
  };
}

export type CapaActionTaskSource = Pick<CapaAction, 'id' | 'capaId' | 'n' | 'description' | 'state' | 'dueDate' | 'owner'>;

/** `recordedBy` is who added the action: the task's assignee when its owner is not a user id. */
export function capaActionTaskPlan(action: CapaActionTaskSource, capaCode: string | null, recordedBy: number | null): SourceTaskPlan {
  const due = dayOf(action.dueDate);
  const ended = action.state === 'done' || action.state === 'cancelled';
  const assigneeId = userIdOf(action.owner) ?? recordedBy;
  const name = `${capaCode ?? 'CAPA'} action ${action.n}`;
  const owner = action.owner && userIdOf(action.owner) === null ? ` Owner: ${action.owner}.` : '';
  return {
    sourceEntityType: CAPA_ACTION_TASK_SOURCE,
    sourceEntityId: `capa-action:${action.id}`,
    closeAs: action.state === 'done' ? 'completed' : 'cancelled',
    same: (m) => m.due === due,
    next: ended || !due ? null : {
      moduleType: 'Quality',
      title: `${name}: ${clip(action.description, 120)}`,
      description: `${name} is due on ${due}.${owner} Record it done in Quality, CAPA, with the evidence that it was done.`,
      category: 'capa-action',
      taskType: 'action',
      ...(assigneeId ? { assigneeId } : {}),
      priority: 'medium',
      dueDate: new Date(`${due}T00:00:00Z`),
      tags: ['qms', 'capa'],
      metadata: { capaId: action.capaId, actionId: action.id, n: action.n, due, remindDaysBefore: CAPA_REMIND_DAYS },
    },
  };
}

const replace = (organizationId: number, plan: SourceTaskPlan, actorId: number) =>
  replaceSourceTask({ organizationId, ...plan, actorId });

/** After a CAPA is raised or moved. Never throws: the act it follows has committed. */
export const scheduleCapaTask = (organizationId: number, capa: CapaTaskSource, actorId: number): Promise<SourceTaskOutcome> =>
  replace(organizationId, capaTaskPlan(capa), actorId);

/** After an action item is added or moved. Never throws. */
export const scheduleCapaActionTask = (
  organizationId: number, action: CapaActionTaskSource, capaCode: string | null, actorId: number,
): Promise<SourceTaskOutcome> => replace(organizationId, capaActionTaskPlan(action, capaCode, actorId), actorId);
