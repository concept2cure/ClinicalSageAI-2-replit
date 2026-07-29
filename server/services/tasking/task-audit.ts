/**
 * Task audit lineage.
 *
 * Records every governed task mutation (create / status transition / link) to the
 * same immutable, SHA-256 hash-chained ledger the Projects governed actions use
 * (`audit_logs` + `c2c_ana_actions`, via recordGovernedAction). This gives tasks a
 * transparent data lineage — who did what, to which task, when, with a tamper-
 * evident chain — which the legacy `/api/regulatory/tasks` mutations lacked.
 *
 * Best-effort and graceful: a lineage-write failure NEVER breaks the task
 * mutation. The DB persistence is certified in the preview/CI loop (the tables
 * ship in migrations/20260527_mutation_primitives.sql); the wiring + graceful
 * degradation are unit-tested.
 *
 * @module server/services/tasking/task-audit
 */
import { pool } from '../../db.js';
import { recordGovernedAction } from '../../routes/c2c/actions.js';

export type TaskAuditCommand = 'task.create' | 'task.transition' | 'task.link';

export interface AuditTaskActionParams {
  /** Verified-JWT org id (the caller's tenant). */
  orgId: number;
  /** The authenticated actor's user id (not a client-supplied value). */
  userId: number | null | undefined;
  command: TaskAuditCommand;
  /** The task's business key (taskId), recorded as target `task:<id>`. */
  taskId: string;
  /** Before/after or descriptive context, hashed into the ledger. */
  payload?: Record<string, unknown>;
  /** Optional reason-for-change captured from the request. */
  reason?: string;
}

function defaultReason(command: TaskAuditCommand): string {
  switch (command) {
    case 'task.create':
      return 'Task created via tasking API';
    case 'task.transition':
      return 'Task status changed via tasking API';
    case 'task.link':
      return 'Task linked via tasking API';
    default:
      return 'Task mutation via tasking API';
  }
}

/**
 * Write one task-mutation lineage record. Never throws — a failed or skipped
 * write degrades to a console warning so the task mutation still succeeds.
 */
export async function auditTaskAction(params: AuditTaskActionParams): Promise<void> {
  const { orgId, userId, command, taskId, payload = {}, reason } = params;

  // Lineage requires a real tenant + actor + target; skip silently otherwise so
  // we never write an attributionless audit row.
  if (!Number.isFinite(orgId) || orgId <= 0) return;
  if (!userId || !Number.isFinite(userId) || userId <= 0) return;
  if (!taskId) return;

  try {
    await recordGovernedAction(pool, {
      orgId,
      userId,
      command,
      target: `task:${taskId}`,
      reason: reason && reason.trim() ? reason.trim() : defaultReason(command),
      payload,
      domain: 'tasking',
      surface: 'tasking-api',
    });
  } catch (err: any) {
    // Best-effort lineage — never break the task mutation on an audit failure.
    console.warn('[tasking] audit lineage write failed (non-fatal):', err?.message);
  }
}
