/**
 * Task audit lineage.
 *
 * Records every governed task mutation (create / status transition / link) to the
 * same immutable, SHA-256 hash-chained ledger the Projects governed actions use
 * (`audit_logs` + `c2c_ana_actions`, via recordGovernedAction). This gives tasks a
 * transparent data lineage — who did what, to which task, when, with a tamper-
 * evident chain — which the legacy `/api/regulatory/tasks` mutations lacked.
 *
 * Two contracts, chosen by the caller. The /api/tasks routes
 * (taskManagement.routes.ts) use `auditTaskActionInTx`: the lineage row is
 * written on the task write's own transaction and a failure THROWS, so the write
 * rolls back with it — "the task changed and its ledger says so" is one fact.
 * (2026-09-23: those routes used the owned, best-effort branch below and
 * discarded its outcome at nine sites, so a PIN-signed completion could commit
 * with no ledger row and answer 200.) The owned branch of `auditTaskAction`
 * remains best-effort for callers with no transaction of their own, and REPORTS
 * its outcome rather than hiding it. Not yet moved: unifiedTasks.routes.ts
 * (/api/regulatory/tasks — three sites, still baselined in
 * ci:discarded-audit-write) and the completion cascade in task-side-effects.ts,
 * which changes successor status with no lineage row at all.
 *
 * @module server/services/tasking/task-audit
 */
import { pool } from '../../db.js';

/** Anything that can run a query — the pool, or a client inside a transaction. */
type Queryable = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };
import { recordGovernedAction } from '../../routes/c2c/actions.js';
import { queryableFromDrizzle, type DrizzleRunner } from '../../db/drizzle-queryable.js';
import { createScopedLogger } from '../../utils/logger.js';

const logger = createScopedLogger('task-audit');

export type TaskAuditCommand =
  | 'task.create'
  | 'task.transition'
  | 'task.link'
  | 'task.assign'
  | 'task.notify'
  | 'task.delete';

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
    case 'task.assign':
      return 'Task assigned via tasking API';
    case 'task.notify':
      return 'Task notification sent via tasking API';
    case 'task.delete':
      return 'Task archived (soft delete) via tasking API';
    default:
      return 'Task mutation via tasking API';
  }
}

/**
 * What became of the task-mutation lineage record.
 *
 * WO-16C #133, in the second of this repository's audit-writing mechanisms. This
 * function returned `Promise<void>`, so its fifteen callers could not report an
 * outcome even if they wanted to — a deeper defect than a discarded one, because
 * there was nothing to discard. Three genuinely different things happened behind
 * that one signature:
 *
 *   `{ recorded: true }`                      the row committed
 *   `{ recorded: false, 'NOT_ATTRIBUTABLE' }` orgId / userId / taskId was missing,
 *                                             so no row was written — the policy
 *                                             is deliberate (never write an
 *                                             attributionless lineage row) and the
 *                                             silence about it was not
 *   `{ recorded: false, 'WRITE_FAILED' }`     the owned transaction rolled back
 *
 * `enlisted` says which transaction wrote it, because the two branches have
 * different and deliberate failure policies: an enlisted write lets the failure
 * PROPAGATE, since the caller's rollback is the correct outcome and "the task
 * changed and its lineage says so" should be one fact. Only the owned branch is
 * best-effort.
 */
export type TaskAuditOutcome =
  | { recorded: true; enlisted: boolean }
  | { recorded: false; reason: 'NOT_ATTRIBUTABLE' | 'WRITE_FAILED'; enlisted: boolean };

/**
 * Write one task-mutation lineage record and REPORT what happened to it.
 *
 * Never throws on the owned-transaction path — a failed write degrades so the task
 * mutation still succeeds — but the caller is told, which it was not before. An
 * enlisted write still throws, deliberately; see `TaskAuditOutcome`.
 */
export async function auditTaskAction(
  params: AuditTaskActionParams,
  /**
   * A client ALREADY inside the caller's transaction. Pass it when the task
   * mutation is itself transactional and the lineage row should commit or roll
   * back with it — that is strictly better than the default, because it makes
   * "the task changed and its lineage says so" one fact rather than two.
   */
  executor?: Queryable,
): Promise<TaskAuditOutcome> {
  const { orgId, userId, command, taskId, payload = {}, reason } = params;

  /* Lineage requires a real tenant + actor + target, and an attributionless row is
     worse than none — that policy is unchanged. What changed is that the skip is
     no longer SILENT: it was indistinguishable from a committed row, so a task
     mutation whose actor could not be resolved produced no lineage and no signal
     to say so. */
  const enlisted = executor !== undefined;
  if (
    !Number.isFinite(orgId) ||
    orgId <= 0 ||
    !userId ||
    !Number.isFinite(userId) ||
    userId <= 0 ||
    !taskId
  ) {
    logger.warn('Task lineage SKIPPED — no attributable tenant, actor or target', {
      orgId,
      hasUserId: Boolean(userId),
      taskId: taskId || null,
      command,
    });
    return { recorded: false, reason: 'NOT_ATTRIBUTABLE', enlisted };
  }

  const row = {
    orgId,
    userId,
    command,
    target: `task:${taskId}`,
    reason: reason && reason.trim() ? reason.trim() : defaultReason(command),
    payload,
    domain: 'tasking' as const,
    surface: 'tasking-api',
  };

  /* THE HASH CHAIN NEEDS A TRANSACTION, and this used to pass `pool`.
     recordGovernedAction runs three statements: computeAuditChainSealed issues
     `SELECT sha256_chain … ORDER BY … LIMIT 1 FOR UPDATE` to take the chain
     lock, then INSERTs into audit_logs, then into c2c_ana_actions. Its
     contract says so explicitly (server/services/audit/chain.ts): "A pool
     client that is already inside the caller's transaction. The SELECT FOR
     UPDATE is issued here; the caller must not release the transaction until
     after the INSERT."

     On the POOL each of those is its own implicit single-statement
     transaction. The FOR UPDATE lock is therefore released the instant the
     SELECT commits — BEFORE the INSERT — so two concurrent task mutations can
     both read the same previous hash and both write a row claiming it as their
     predecessor. That is a FORKED chain: two rows with the same
     prev_sha256_chain, which is precisely the tamper-evidence the ledger
     exists to provide, broken by concurrency rather than by an attacker. The
     two INSERTs are also non-atomic, so a half-written pair is possible.

     One transaction now spans all three. When the caller supplies its own
     client the row commits with the mutation it records; otherwise this opens
     and owns one. */
  if (executor) {
    // Enlisted in the caller's transaction: their rollback is the correct
    // outcome, so a failure here propagates rather than being swallowed — the
    // deliberate opposite of the owned-transaction branch below, which is
    // best-effort. Left uncaught rather than caught-and-rethrown: the rethrow
    // was behaviourally identical and tripped no-useless-catch, and that single
    // error failed the Lint job, which Test/Build/Integration Tests all declare
    // `needs: lint` on — so one dead catch block was skipping the suite.
    await recordGovernedAction(executor, row);
    return { recorded: true, enlisted: true };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await recordGovernedAction(client, row);
    await client.query('COMMIT');
    return { recorded: true, enlisted: false };
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => undefined);
    // Best-effort lineage — never break the task mutation on an audit failure.
    // The ROLLBACK above is what keeps a failure from leaving half a pair. The
    // store's own message stays in this log line and is NOT returned: several
    // callers forward their result to a tenant client (ci:server-error-leaks).
    console.warn('[tasking] audit lineage write failed (non-fatal):', err?.message);
    return { recorded: false, reason: 'WRITE_FAILED', enlisted: false };
  } finally {
    client.release();
  }
}

/**
 * A task write's lineage row did not land. Thrown INSIDE the write's transaction
 * so the write rolls back with it; the route answers 500 AUDIT_WRITE_FAILED.
 * Carries no store text — callers forward their result to a tenant client.
 */
export class TaskAuditNotRecordedError extends Error {
  readonly code = 'AUDIT_WRITE_FAILED' as const;
  constructor(readonly reason: 'NOT_ATTRIBUTABLE' | 'WRITE_FAILED') {
    super(`Task lineage was not recorded (${reason}).`);
    this.name = 'TaskAuditNotRecordedError';
  }
}

/**
 * Record the lineage row on the SAME transaction as the task write it describes,
 * or throw so that transaction rolls back.
 *
 * `tx` is the Drizzle transaction the route holds; it is adapted, not escaped
 * (queryableFromDrizzle), so recordGovernedAction's chain lock and both INSERTs
 * run on the write's own connection. NOT_ATTRIBUTABLE throws too: a governed
 * write whose actor cannot be named must not commit silently unrecorded.
 */
export async function auditTaskActionInTx(
  tx: DrizzleRunner,
  params: AuditTaskActionParams,
): Promise<void> {
  let outcome: TaskAuditOutcome;
  try {
    outcome = await auditTaskAction(params, queryableFromDrizzle(tx));
  } catch (err: any) {
    // The store's message stays in the log, never in the thrown error.
    logger.error('Task lineage write failed; rolling back the task write', {
      command: params.command,
      taskId: params.taskId,
      err: err?.message,
    });
    throw new TaskAuditNotRecordedError('WRITE_FAILED');
  }
  if (!outcome.recorded) throw new TaskAuditNotRecordedError(outcome.reason);
}
