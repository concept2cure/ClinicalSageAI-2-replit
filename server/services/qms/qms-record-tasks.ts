/**
 * A supplier's next audit and re-approval, and an internal audit's planned
 * date, as tasks for the person who owes them (Quality reminders, 2026-10-29).
 *
 * Each date is one open task in the one task store, keyed by the record:
 * `qms-supplier-audit:<id>`, `qms-supplier-reapproval:<id>` and
 * `qms-internal-audit:<id>`. The due-date sweep (jobs/taskDueSweep.ts) gives the
 * notice each asks for, and says once more when it is overdue.
 *
 * The task follows the record:
 *   - a supplier's audit task is completed when an update records the audit
 *     (its last audit date), and replaced when the next audit date moves;
 *   - its re-approval task is completed when an update records the approval;
 *   - a revoked supplier owes neither;
 *   - an internal audit owes its start while it is planned, and its task is
 *     completed once the audit starts or closes, and cancelled with the audit.
 * A supplier's tasks go to the person who recorded the change, because the
 * register names no owner; an audit's go to its lead auditor. The store and the
 * close-then-write are services/tasking/source-task.ts. Planning is pure.
 *
 * @module server/services/qms/qms-record-tasks
 */
import { replaceSourceTask, type SourceTaskNext, type SourceTaskOutcome } from '../tasking/source-task';

export const SUPPLIER_AUDIT_TASK_SOURCE = 'qms_supplier_audit';
export const SUPPLIER_REAPPROVAL_TASK_SOURCE = 'qms_supplier_reapproval';
export const INTERNAL_AUDIT_TASK_SOURCE = 'qms_internal_audit';
/** Notice before a supplier audit or re-approval (an audit takes arranging). */
export const SUPPLIER_REMIND_DAYS = 30;
export const INTERNAL_AUDIT_REMIND_DAYS = 14;

export interface RecordTaskPlan {
  sourceEntityType: string;
  sourceEntityId: string;
  next: SourceTaskNext | null;
  same: (metadata: Record<string, unknown>) => boolean;
  closeAs: 'completed' | 'cancelled';
}

const dayOf = (d: Date | string | null | undefined): string | null => {
  if (!d) return null;
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? null : t.toISOString().slice(0, 10);
};

export interface SupplierTaskSource {
  id: number; supplier_name: string; supplier_code: string | null; approval_status: string;
  next_audit_date: Date | string | null; reapproval_date: Date | string | null;
}

type SupplierDate = 'audit' | 'reapproval';
const SUPPLIER_DATE: Record<SupplierDate, { source: string; doneBy: string; title: string; owed: string; records: string }> = {
  audit: { source: SUPPLIER_AUDIT_TASK_SOURCE, doneBy: 'lastAuditDate', title: 'Supplier audit due', owed: 'its supplier audit', records: 'the audit date' },
  reapproval: { source: SUPPLIER_REAPPROVAL_TASK_SOURCE, doneBy: 'approvalDate', title: 'Supplier re-approval due', owed: 're-approval', records: 'the approval' },
};

function supplierDatePlan(s: SupplierTaskSource, kind: SupplierDate, due: string | null, recorded: readonly string[], assigneeId: number | null): RecordTaskPlan {
  const k = SUPPLIER_DATE[kind];
  const done = recorded.includes(k.doneBy);
  const name = s.supplier_code ? `${s.supplier_name} (${s.supplier_code})` : s.supplier_name;
  return {
    sourceEntityType: k.source,
    sourceEntityId: `qms-supplier-${kind}:${s.id}`,
    closeAs: done ? 'completed' : 'cancelled',
    /* Recording the audit (or the approval) always ends the open task, even when the next date was not moved. */
    same: (m) => !done && m.due === due,
    next: s.approval_status === 'revoked' || !due ? null : {
      moduleType: 'Quality',
      title: `${k.title}: ${name}`,
      description: `${name} is due for ${k.owed} on ${due}. Record ${k.records} in Quality, Suppliers (Update); that closes this task.`,
      category: `supplier-${kind}`,
      taskType: kind === 'audit' ? 'review' : 'action',
      ...(assigneeId ? { assigneeId } : {}),
      priority: 'medium',
      dueDate: new Date(`${due}T00:00:00Z`),
      tags: ['qms', 'supplier'],
      metadata: { supplierId: s.id, kind, due, remindDaysBefore: SUPPLIER_REMIND_DAYS },
    },
  };
}

/** `recorded` is the fields this act set (the PATCH body's keys); a create records none. */
export function supplierTaskPlans(s: SupplierTaskSource, recorded: readonly string[], assigneeId: number | null): RecordTaskPlan[] {
  return [
    supplierDatePlan(s, 'audit', dayOf(s.next_audit_date), recorded, assigneeId),
    supplierDatePlan(s, 'reapproval', dayOf(s.reapproval_date), recorded, assigneeId),
  ];
}

export interface InternalAuditTaskSource {
  id: number; audit_number: string; scope: string; status: string; planned_date: Date | string | null; auditor_lead_id: number | null;
}

export function internalAuditTaskPlan(a: InternalAuditTaskSource, actorId: number | null): RecordTaskPlan {
  const due = dayOf(a.planned_date);
  const assigneeId = a.auditor_lead_id ?? actorId;
  return {
    sourceEntityType: INTERNAL_AUDIT_TASK_SOURCE,
    sourceEntityId: `qms-internal-audit:${a.id}`,
    /* Started or closed is done; cancelled, or still planned on a moved date, withdraws the task. */
    closeAs: a.status === 'in_progress' || a.status === 'closed' ? 'completed' : 'cancelled',
    same: (m) => m.due === due,
    next: a.status !== 'planned' || !due ? null : {
      moduleType: 'Quality',
      title: `Internal audit ${a.audit_number} is planned for ${due}`,
      description: `Internal audit ${a.audit_number} (${a.scope}) is planned to start on ${due}. Record its start in Quality, `
        + 'Internal audits (Record progress); that closes this task.',
      category: 'internal-audit',
      taskType: 'review',
      ...(assigneeId ? { assigneeId } : {}),
      priority: 'medium',
      dueDate: new Date(`${due}T00:00:00Z`),
      tags: ['qms', 'internal-audit'],
      metadata: { auditId: a.id, due, remindDaysBefore: INTERNAL_AUDIT_REMIND_DAYS },
    },
  };
}

/** After a supplier is added or updated. Never throws: the act it follows has committed. */
export async function scheduleSupplierTasks(
  organizationId: number, s: SupplierTaskSource, recorded: readonly string[], actorId: number,
): Promise<SourceTaskOutcome[]> {
  const out: SourceTaskOutcome[] = [];
  for (const plan of supplierTaskPlans(s, recorded, actorId)) out.push(await replaceSourceTask({ organizationId, ...plan, actorId }));
  return out;
}

/** After an internal audit is planned or moved. Never throws. */
export const scheduleInternalAuditTask = (organizationId: number, a: InternalAuditTaskSource, actorId: number): Promise<SourceTaskOutcome> =>
  replaceSourceTask({ organizationId, ...internalAuditTaskPlan(a, actorId), actorId });

export const DEVIATION_TASK_SOURCE = 'qms_deviation';
/** Notice before a deviation's target closure: investigations run on weeks, not months. */
export const DEVIATION_REMIND_DAYS = 7;

export interface DeviationTaskSource {
  id: number; deviation_number: string; title: string; classification: string; status: string;
  target_closure_date: Date | string | null;
}

/**
 * A deviation owes its close by its target date (P-49), to the person who
 * recorded the date, until it is closed. A critical deviation's task is
 * critical, a major one's high.
 */
export function deviationTaskPlan(d: DeviationTaskSource, actorId: number | null): RecordTaskPlan {
  const due = dayOf(d.target_closure_date);
  const closed = d.status === 'closed';
  const priority = d.classification === 'critical' ? 'critical' : d.classification === 'major' ? 'high' : 'medium';
  return {
    sourceEntityType: DEVIATION_TASK_SOURCE,
    sourceEntityId: `qms-deviation:${d.id}`,
    closeAs: closed ? 'completed' : 'cancelled',
    same: (m) => m.due === due,
    next: closed || !due ? null : {
      moduleType: 'Quality',
      title: `Close deviation ${d.deviation_number}: ${d.title}`,
      description: `Deviation ${d.deviation_number} (${d.classification}) is due to close on ${due}. Record its investigation `
        + 'in Quality, Deviations, and send it for approval; the close is signed.',
      category: 'deviation',
      taskType: 'action',
      ...(actorId ? { assigneeId: actorId } : {}),
      priority,
      dueDate: new Date(`${due}T00:00:00Z`),
      tags: ['qms', 'deviation'],
      metadata: { deviationId: d.id, due, remindDaysBefore: DEVIATION_REMIND_DAYS },
    },
  };
}

/** After a deviation is recorded, moved or closed. Never throws. */
export const scheduleDeviationTask = (organizationId: number, d: DeviationTaskSource, actorId: number): Promise<SourceTaskOutcome> =>
  replaceSourceTask({ organizationId, ...deviationTaskPlan(d, actorId), actorId });
