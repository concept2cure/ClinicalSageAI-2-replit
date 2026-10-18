/**
 * @fileoverview Who recorded a CMC register row — the §11.10(e) half of a register write.
 * @module server/services/cmc/register-audit
 *
 * ## The defect this closes
 *
 * GA plan item 2 (decision 2026-10-05). A CMC register row recorded **when**
 * it was written and never **who** wrote it.
 *
 * Not "the writer was not audited" — the writer was not recorded anywhere. On
 * the provisioned database none of the nine register tables
 * (`drug_substances`, `drug_products`, `cmc_material_specs`,
 * `cmc_formulation_records`, `cmc_container_closures`,
 * `cmc_characterization_studies`, `manufacturing_processes`,
 * `quality_specifications`, `cmc_batch_records`) carries a `created_by`,
 * `updated_by` or any other attribution column, and the audit chain held no
 * row for a register create either: of the CMC actions on record, every one is
 * a *governed act* — a change proposal, a source-evidence link, a
 * contradiction resolve, a specification approval withdrawn, a signed
 * retirement. The data entry those signatures are **about** was anonymous.
 *
 * So an inspector asking "who recorded this specification limit?" had no
 * answer, and the separation-of-duties question a section approval needs to
 * ask — is this approver the last writer of the records the section cites? —
 * could not be asked at all.
 *
 * 21 CFR Part 11 §11.10(e) asks for audit trails that "independently record
 * the date and time of operator entries and actions that create, modify, or
 * delete electronic records". The time was there; the operator was not.
 *
 * ## Why the chain, and not a column
 *
 * `created_by` on nine tables would be a second place for one fact, and a
 * column is not tamper-evident: a row's own attribution can be updated by
 * whoever can update the row. The audit chain is per tenant, hash-chained and
 * sealed (`services/audit/chain.ts`), the runtime role holds no UPDATE or
 * DELETE on it, and it already carries every governed CMC act — so the
 * register write belongs beside them, in the same stream an inspector reads.
 *
 * ## Why it commits with the row
 *
 * The audit row is written on the **caller's transaction**, through
 * `queryableFromDrizzle`, so the record and the record of who made it commit
 * together or neither does. A register row that exists with no audit row is
 * exactly the anonymous record this module exists to prevent, and a
 * best-effort write would produce one on every audit failure. The repo's
 * control map already claims "atomic audit on launch-path writes" for the
 * launch catalog; CMC joined that catalog on 2026-10-12.
 *
 * ## Why an absent actor refuses
 *
 * A write with no attributable operator is not a write this platform may make.
 * Both doors have one — the route from the session (`req.user.id`), the guided
 * interview's projector from the session it commits for — so an absent actor
 * is a programming error, and it fails loudly rather than writing an
 * unattributable regulated record.
 */

import { getTableName } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { db } from '../../db';
import { writeChainedAuditRow } from '../auditService';
import { queryableFromDrizzle, type DrizzleRunner } from '../../db/drizzle-queryable.js';
import type { LinkableRow } from './link-to-module3';

/** The action a register create records on the chain. */
export const CMC_REGISTER_CREATE = 'cmc.register.create' as const;

/**
 * Who made the write.
 *
 * `userId` is REQUIRED and nullable rather than optional, which is what makes
 * a swapped argument a compile error at the seven call sites: `express.Request`
 * declares `userId?: number` (shared/types/express.d.ts) and the Module 3
 * `ProjectSource` declares none, so neither can stand in for an actor, and an
 * actor cannot stand in for a project source. The interview projector's own
 * `RegisterWriteScope` carries `userId: number | null` and so satisfies it
 * directly.
 *
 * A number because `audit_logs.actor_id` is an integer; a row whose actor does
 * not resolve to one is not attributable.
 */
export interface RegisterActor {
  userId: number | null;
}

/** Thrown rather than writing a regulated record nobody is named for. */
export class RegisterActorMissingError extends Error {
  readonly code = 'REGISTER_ACTOR_MISSING' as const;
  constructor(register: string) {
    super(
      `A ${register.replace(/_/g, ' ')} record cannot be written without the person recording it: ` +
        `21 CFR Part 11 §11.10(e) requires the operator on every entry that creates a record. ` +
        `Nothing was written.`,
    );
    this.name = 'RegisterActorMissingError';
  }
}

/** The actor, or the refusal. Pure. */
export function resolveRegisterActor(actor: RegisterActor | null | undefined, register: string): number {
  const id = Number(actor?.userId);
  if (!Number.isInteger(id) || id <= 0) throw new RegisterActorMissingError(register);
  return id;
}

/**
 * Record a register create on the audit chain, on the caller's transaction.
 *
 * `details` is the row as written — which is what an audit trail of a create
 * holds: the entry the operator made. (`old_values` stays NULL here because a
 * create has no prior state; `writeChainedAuditRow` hard-codes it NULL for
 * every caller, which is the open DP-13 and not this change's to fix.)
 *
 * Throws on failure, so the caller's transaction rolls back and the row the
 * audit describes is not left behind.
 */
export async function recordRegisterCreate(tx: DrizzleRunner, params: RegisterCreateRecord): Promise<void> {
  await recordRegisterCreateOn(queryableFromDrizzle(tx), params);
}

/**
 * The same record, written on a pg-style client — the shape the raw-SQL
 * registers' pinned connection has. The Drizzle entry above adapts its
 * transaction to exactly this and delegates, so there is one writer of
 * `cmc.register.create` whichever path the create came down.
 */
export async function recordRegisterCreateOn(
  client: { query: (text: string, params?: unknown[]) => Promise<unknown> },
  params: RegisterCreateRecord,
): Promise<void> {
  await writeChainedAuditRow(client as never, {
    action: CMC_REGISTER_CREATE,
    userId: params.actorId,
    tenantId: params.organizationId,
    organizationId: params.organizationId,
    resourceType: params.table,
    resourceId: String(params.recordId),
    details: {
      register: params.register,
      projectId: params.projectId,
      recordId: params.recordId,
      row: params.row,
    },
  } as never);
}

/** What a register create's audit row carries. */
interface RegisterCreateRecord {
  organizationId: number;
  actorId: number;
  /** Which register, from the one catalogue below. */
  register: CmcRegister;
  /** The table the row landed in, so the trail names the record exactly. */
  table: string;
  recordId: string | number;
  /** The program the record is filed under, or null when it is unfiled. */
  projectId: string | null;
  /** The row as written. */
  row: Record<string, unknown>;
}

/* ─── The registers, and the one way each one's create is recorded ────────── */

/**
 * Every CMC register whose create this module records, by its canonical name.
 *
 * One list, because "who recorded this?" must have the same answer whichever
 * register is asked about: a register missing from here is a register an
 * inspector cannot attribute, and the separation-of-duties check a section
 * approval needs (is the approver the last writer of the records the section
 * cites?) is only as complete as this list.
 *
 * The first seven are the ones with a shared service create
 * (`register-writes.ts`, also the guided interview's commit targets); the rest
 * are created in their route and recorded there. The table each one lands in
 * is not restated here — `insertRegisterRow` takes it from the Drizzle
 * definition and `createOnConnection` from its caller, so the
 * recorded table is always the one actually written.
 */
export type CmcRegister =
  | 'drug_substance'
  | 'drug_product'
  | 'container_closure'
  | 'material_spec'
  | 'formulation_record'
  | 'manufacturing_process'
  | 'characterization_study'
  | 'analytical_method'
  | 'process_validation'
  | 'stability_study'
  | 'qc_test'
  | 'change_control'
  | 'reference_standard'
  | 'impurity_profile'
  | 'dissolution_profile'
  | 'comparability_study'
  | 'batch_record'
  | 'specification';

/** The transaction handle `db.transaction` hands its callback. */
type RegisterTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * The Drizzle path: a register row and the record of WHO recorded it, in one
 * transaction.
 *
 * ── Why the audit row cannot simply follow the insert ────────────────────────
 * `services/audit/chain.ts` says it in its own header: the caller MUST run
 * `computeAuditChain*` and its INSERT in one transaction, because the chain
 * position is taken under `pg_advisory_xact_lock` and announced in a
 * transaction-local GUC that the `audit_logs` BEFORE INSERT trigger reads.
 * Outside one, both end with the statement that made them and the row is
 * recorded as a legacy row with no position.
 *
 * And the regulated reason, which is the same reason: a create that wrote the
 * row and then its audit row would, on any audit failure, leave behind exactly
 * the unattributable regulated record this module exists to prevent. Here the
 * two commit together or neither does.
 *
 * The actor is resolved BEFORE the transaction opens, so a create with nobody
 * to name writes nothing at all rather than opening one and rolling it back.
 *
 * A Module 3 write-through stays OUTSIDE, where it already was: a propagation
 * failure never rolls the register row back (`link-to-module3.ts`), and the
 * link is not part of the entry the operator made.
 */
export async function insertRegisterRow<T extends PgTable>(
  orgId: number,
  actor: RegisterActor | null | undefined,
  register: CmcRegister,
  table: T,
  values: T['$inferInsert'],
): Promise<T['$inferSelect']> {
  const actorId = resolveRegisterActor(actor, register);
  return db.transaction(async (tx: RegisterTx) => {
    const [row] = (await tx.insert(table).values(values as never).returning()) as Array<T['$inferSelect']>;
    const filed = row as unknown as LinkableRow;
    await recordRegisterCreate(tx, {
      organizationId: orgId,
      actorId,
      register,
      table: getTableName(table),
      recordId: filed.id,
      projectId: filed.projectId ?? filed.project_id ?? null,
      row: row as unknown as Record<string, unknown>,
    });
    return row;
  });
}

/** The pg client shape the raw-SQL registers' creates run on. */
export interface RegisterClient {
  query: (text: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
  release: (err?: Error) => void;
}

/** A pool that can pin one connection for a transaction. */
export interface RegisterPool {
  connect: () => Promise<RegisterClient>;
}

/**
 * The raw-SQL path, for the registers whose create is an `INSERT … RETURNING`
 * in its route rather than a Drizzle insert in a service: the batch record, the
 * quality specification and the comparability assessment.
 *
 * Same contract as `insertRegisterRow`, for the same reasons — one pinned
 * connection, one transaction, the actor resolved before it opens — because
 * `pool.query` takes whichever idle connection the pool hands back and the
 * chain's advisory lock and announcement would not survive the trip.
 *
 * `insert` is given the pinned client and returns the row it wrote; whatever
 * else it needs to write (a register's own history row) runs on the same
 * client and commits with it.
 */
export async function createOnConnection<Row extends { id: number | string }>(
  pool: RegisterPool,
  params: {
    organizationId: number;
    actor: RegisterActor | null | undefined;
    register: CmcRegister;
    /** The table the row lands in, as the INSERT names it. */
    table: string;
  },
  insert: (client: RegisterClient) => Promise<Row>,
): Promise<Row> {
  const actorId = resolveRegisterActor(params.actor, params.register);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const row = await insert(client);
    const filed = row as unknown as LinkableRow;
    await recordRegisterCreateOn(client, {
      organizationId: params.organizationId,
      actorId,
      register: params.register,
      table: params.table,
      recordId: row.id,
      projectId: filed.projectId ?? filed.project_id ?? null,
      row: row as unknown as Record<string, unknown>,
    });
    await client.query('COMMIT');
    return row;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export default {
  recordRegisterCreate,
  recordRegisterCreateOn,
  resolveRegisterActor,
  insertRegisterRow,
  createOnConnection,
  CMC_REGISTER_CREATE,
};
