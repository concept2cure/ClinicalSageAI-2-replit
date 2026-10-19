/**
 * The §11.10(e) other half: WHO CHANGED a register row, and what they changed.
 *
 * `register-audit.ts` records every register CREATE on the tenant's audit
 * chain — the entry the operator made. Every register EDIT was a bare
 * `db.update` or `pool.query` with no audit row and no middleware behind it
 * (`bootstrap/register-core-routes.ts` mounts only authentication and the write
 * role gate over `/api/cmc`). So the register layer recorded who entered a
 * value and never who changed it, which is the half an inspector reads for a
 * record that has been changed:
 *
 *   21 CFR 11.10(e) — "Use of secure, computer-generated, time-stamped audit
 *   trails to independently record the date and time of operator entries and
 *   actions that create, modify, or delete electronic records."
 *
 * ## What the row holds
 *
 * `writeChainedAuditRow` hard-codes `old_values` NULL for every caller (the
 * open DP-13), so the before state goes in `details` instead, as a DIFF: one
 * entry per field the edit actually changed, with its `from` and its `to`. A
 * diff rather than two whole rows because that is what the trail is read for —
 * "what did this person change" — and because a snapshot pair invites the
 * reader to diff two JSON blobs by eye and miss the one field that moved.
 *
 * A patch that changes nothing writes NO audit row: an edit that moved no
 * value is not an operator action on the record, and recording one would fill
 * the trail with rows an inspector then has to rule out. The row is still
 * re-read and returned, so the caller's behaviour is unchanged.
 *
 * ## Why it shares the row's transaction
 *
 * The same two reasons as the create (see `register-audit.ts`): the chain
 * position is taken under `pg_advisory_xact_lock` and announced in a
 * transaction-local GUC the `audit_logs` trigger reads, so a row written
 * outside the transaction is recorded with no position; and an edit that
 * changed the record and then failed to record it would leave exactly the
 * unattributable change this module exists to prevent.
 *
 * @module server/services/cmc/register-edit-audit
 */
import { getTableName, type SQL } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { db } from '../../db';
import { writeChainedAuditRow } from '../auditService.js';
/* The same bridge the create path uses, from its own module rather than
   through register-audit: one import of the canonical adapter. */
import { queryableFromDrizzle } from '../../db/drizzle-queryable.js';
import {
  resolveRegisterActor,
  type CmcRegister,
  type RegisterActor,
  type RegisterClient,
} from './register-audit';

/** The action every register edit is recorded under. One name, one meaning. */
export const CMC_REGISTER_UPDATE = 'cmc.register.update' as const;

/** One field the edit moved. */
export interface FieldChange {
  from: unknown;
  to: unknown;
}

/**
 * What changed between the stored row and the row as written, by the column
 * names the ROW uses — so the trail names the record's own columns rather than
 * whatever the request body called them.
 *
 * Compared by JSON shape, not by `!==`, because a register's json columns
 * (`ich_q2_parameters`, `process_parameters`, acceptance criteria) come back as
 * objects and two equal objects are never `===`. A column absent from `after`
 * is not a change: an UPDATE writes the columns it was given.
 */
export function diffRows(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Record<string, FieldChange> {
  const changed: Record<string, FieldChange> = {};
  for (const key of Object.keys(after)) {
    /* updated_at moves on every edit by definition; recording it as a change
       would put one meaningless entry in every diff. */
    if (key === 'updatedAt' || key === 'updated_at') continue;
    const from = before[key];
    const to = after[key];
    if (sameValue(from, to)) continue;
    changed[key] = { from: scrub(from), to: scrub(to) };
  }
  return changed;
}

/** Equal for audit purposes: same JSON, or both absent. */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if ((a === null || a === undefined) && (b === null || b === undefined)) return true;
  if (a instanceof Date || b instanceof Date) {
    const left = a instanceof Date ? a.toISOString() : a;
    const right = b instanceof Date ? b.toISOString() : b;
    return JSON.stringify(left) === JSON.stringify(right);
  }
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/** A value as the trail should hold it: a Date as its instant, anything else as itself. */
function scrub(value: unknown): unknown {
  return value instanceof Date ? value.toISOString() : value ?? null;
}

/** What a register edit's audit row carries. */
export interface RegisterUpdateRecord {
  organizationId: number;
  actorId: number;
  register: CmcRegister;
  /** The table the row lives in, so the trail names the record exactly. */
  table: string;
  recordId: string | number;
  projectId: string | null;
  /** The fields the edit moved, with their before and after. */
  changed: Record<string, FieldChange>;
  /** The reason, where the edit is one that requires one. */
  reason?: string | null;
}

/** Record a register edit on the chain, on the caller's pg-style client. */
export async function recordRegisterUpdateOn(
  client: { query: (text: string, params?: unknown[]) => Promise<unknown> },
  params: RegisterUpdateRecord,
): Promise<void> {
  await writeChainedAuditRow(client as never, {
    action: CMC_REGISTER_UPDATE,
    userId: params.actorId,
    tenantId: params.organizationId,
    organizationId: params.organizationId,
    resourceType: params.table,
    resourceId: String(params.recordId),
    ...(params.reason ? { reason: params.reason } : {}),
    details: {
      register: params.register,
      projectId: params.projectId,
      recordId: params.recordId,
      /* The fields that moved, each with its before and after. `old_values` is
         NULL for every caller of the chained writer (DP-13), so the before
         state lives here. */
      changed: params.changed,
      changedFields: Object.keys(params.changed),
    },
  } as never);
}

/** The transaction handle `db.transaction` hands its callback. */
type RegisterTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** A row that may name the programme it is filed under, either case. */
interface FiledRow {
  id: string | number;
  projectId?: string | null;
  project_id?: string | null;
}

/**
 * The Drizzle path: read the row, apply the patch, and record what moved — one
 * transaction, or nothing.
 *
 * The stored row is read FOR UPDATE inside the transaction, not before it: a
 * diff computed against a row read outside would describe a change against a
 * state some other writer had already replaced, and the trail would name the
 * wrong `from`.
 *
 * Returns the updated row, or undefined when the id is not this tenant's —
 * which the caller answers 404 to, exactly as it did before.
 */
export async function updateRegisterRow<T extends PgTable>(a: {
  orgId: number;
  actor: RegisterActor | null | undefined;
  register: CmcRegister;
  table: T;
  /** The row's identity, as a Drizzle predicate over its own columns. */
  where: SQL | undefined;
  patch: Record<string, unknown>;
  reason?: string | null;
}): Promise<T['$inferSelect'] | undefined> {
  const actorId = resolveRegisterActor(a.actor, a.register);
  return db.transaction(async (tx: RegisterTx) => {
    const [before] = (await tx.select().from(a.table as never).for('update').where(a.where)) as Array<
      Record<string, unknown>
    >;
    if (!before) return undefined;
    const [after] = (await tx
      .update(a.table)
      .set(a.patch as never)
      .where(a.where)
      .returning()) as Array<T['$inferSelect']>;
    if (!after) return undefined;
    const changed = diffRows(before, after as unknown as Record<string, unknown>);
    /* An edit that moved nothing is not an operator action on the record. */
    if (Object.keys(changed).length > 0) {
      const filed = after as unknown as FiledRow;
      await recordRegisterUpdateOn(queryableFromDrizzle(tx), {
        organizationId: a.orgId,
        actorId,
        register: a.register,
        table: getTableName(a.table),
        recordId: filed.id,
        projectId: filed.projectId ?? filed.project_id ?? null,
        changed,
        reason: a.reason ?? null,
      });
    }
    return after;
  });
}

/** A pool that can pin one connection for a transaction. */
interface RegisterPool {
  connect: () => Promise<RegisterClient>;
}

/**
 * The raw-SQL path, for the registers whose edit is an `UPDATE … RETURNING` in
 * its route: same contract, one pinned connection, the actor resolved before
 * the transaction opens.
 *
 * `read` returns the stored row (the caller's own SELECT, which it should run
 * `FOR UPDATE`), and `update` returns the row it wrote. Both run on the pinned
 * client and commit with the audit row.
 */
export async function updateOnConnection<Row extends { id: string | number }>(
  pool: RegisterPool,
  params: {
    organizationId: number;
    actor: RegisterActor | null | undefined;
    register: CmcRegister;
    table: string;
    reason?: string | null;
  },
  read: (client: RegisterClient) => Promise<Record<string, unknown> | undefined>,
  update: (client: RegisterClient) => Promise<Row | undefined>,
): Promise<Row | undefined> {
  const actorId = resolveRegisterActor(params.actor, params.register);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const before = await read(client);
    if (!before) {
      await client.query('ROLLBACK');
      return undefined;
    }
    const after = await update(client);
    if (!after) {
      await client.query('ROLLBACK');
      return undefined;
    }
    const changed = diffRows(before, after as unknown as Record<string, unknown>);
    if (Object.keys(changed).length > 0) {
      const filed = after as unknown as FiledRow;
      await recordRegisterUpdateOn(client, {
        organizationId: params.organizationId,
        actorId,
        register: params.register,
        table: params.table,
        recordId: after.id,
        projectId: filed.projectId ?? filed.project_id ?? null,
        changed,
        reason: params.reason ?? null,
      });
    }
    await client.query('COMMIT');
    return after;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
