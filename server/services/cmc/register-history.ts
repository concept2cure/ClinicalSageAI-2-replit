/**
 * @fileoverview What happened to one CMC register record, for a reader.
 * @module server/services/cmc/register-history
 *
 * ## The defect this closes
 *
 * URS-CMC-021 and URS-CMC-025 put every register create and every register
 * edit on the tenant's hash-chained ledger, with the operator, the fields that
 * moved and both values. 21 CFR 11.10(e) asks for two things, though, and the
 * second one is about reading:
 *
 * > … audit trails to independently record the date and time of operator
 * > entries and actions that create, modify, or delete electronic records.
 * > **Record changes shall not obscure previously recorded information.**
 *
 * The before-values were recorded and **no working route returned them**:
 *
 * | Route | What it gives a reader |
 * |---|---|
 * | `GET /api/audit-trail/ledger` | the act, the actor, the chain — newest-first across the whole tenant, with no changed fields and no way to ask about one record |
 * | `GET /api/part11/audit-trail/:entityId` | nothing: deliberately disconnected, selects six columns that do not exist, from a table nothing writes, with no tenant predicate (see its own header) |
 *
 * So a QA reviewer or an inspector looking at one analytical method could not
 * see that its acceptance criterion was widened last Tuesday, by whom, or what
 * it said before — even though the platform had recorded all three. An audit
 * trail nobody can read against the record it is about does not meet 11.10(e),
 * whatever is in the table.
 *
 * ## Why one route over the chain, and not a history table per register
 *
 * `audit_logs` already holds every chained act against a register row, keyed by
 * `(tenant_id, table_name, record_id)`: the create, every edit, the signature,
 * a signed retirement, a change proposal. A per-register history table would be
 * a second place for the same fact, and — being an ordinary table — one that
 * whoever can update the row can update too. The chain is per tenant, sealed,
 * and the runtime role holds no UPDATE or DELETE on it.
 *
 * ## Specifications are deliberately not in the map
 *
 * `GET /api/cmc/specifications/:id/history`
 * (`server/api/cmc/specificationRoutes.ts:520`) already answers this question
 * for the specification register, from `specification_audit_log` — a
 * per-version store this route cannot see, holding each limit's own revision
 * history rather than the chain's record of the write. Adding `specifications`
 * here would give a reader two different answers to one question, so the
 * register is left to the route that already serves it.
 *
 * ## Fail closed
 *
 * A caught read failure is never an empty history: an empty §11.10(e) trail and
 * a trail that could not be read are indistinguishable to an inspector, and the
 * first one is a claim this module is not entitled to make. `MissingAuditStore`
 * carries the schema case up so the route answers 503.
 */

import { and, eq } from 'drizzle-orm';
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core';
import {
  analyticalMethods,
  cmcChangeControl,
  cmcCharacterizationStudies,
  cmcContainerClosures,
  cmcDissolutionProfiles,
  cmcFormulationRecords,
  cmcImpurityProfiles,
  cmcMaterialSpecs,
  cmcReferenceStandards,
  drugProducts,
  drugSubstances,
  processValidation,
  qcTesting,
  stabilityStudies,
} from '../../../shared/schema';
import { manufacturingProcesses } from '../../../shared/cmc-schema';
import { cmcComparabilityAssessments } from '../../../shared/schema/regulatory-atoms';
import {
  CMC_REGISTER_HISTORY_PATHS,
  type CmcRegisterHistoryPath,
} from '../../../shared/constants/cmc-register-history';
import { db } from '../../db';
import { isUuid } from '../../middleware/uuidParam';
import { CMC_REGISTER_CREATE, type CmcRegister } from './register-audit';
import { CMC_REGISTER_UPDATE } from './register-edit-audit';
import { CMC_REGISTER_RETIRE_SIGNED } from './signed-record';

/** A register, as the history route addresses it: by the path its CRUD uses. */
export interface RegisterHistoryTarget {
  register: CmcRegister;
  /** The table the audit rows name, and the row's own home. */
  table: PgTable;
  /** The two columns the ownership check needs, as columns — so no table or
   *  column name is ever interpolated into SQL text to build the predicate. */
  id: AnyPgColumn;
  organizationId: AnyPgColumn;
  /** A serial register parses its id; a uuid one must not be parsed to NaN. */
  idKind: 'integer' | 'uuid';
  /** What a reader calls the thing, for a refusal that names it. */
  noun: string;
}

/**
 * Every register path that has an edit door, by the path segment its own routes
 * use, keyed by the shared list the client reads too — so a register the UI
 * offers a History action for and this map does not describe will not compile.
 *
 * `server/services/cmc/__tests__/register-history.test.ts` pins the other
 * direction, against `server/api/cmc/routes.ts`: a register that gains a PUT
 * and not an entry here would record its edits and never show them.
 */
export const REGISTER_HISTORY_PATHS: Record<CmcRegisterHistoryPath, RegisterHistoryTarget> = {
  'analytical-methods': {
    register: 'analytical_method', table: analyticalMethods, id: analyticalMethods.id,
    organizationId: analyticalMethods.organizationId, idKind: 'integer', noun: 'analytical method',
  },
  'process-validation': {
    register: 'process_validation', table: processValidation, id: processValidation.id,
    organizationId: processValidation.organizationId, idKind: 'integer', noun: 'process validation record',
  },
  'stability-studies': {
    register: 'stability_study', table: stabilityStudies, id: stabilityStudies.id,
    organizationId: stabilityStudies.organizationId, idKind: 'integer', noun: 'stability study',
  },
  'qc-testing': {
    register: 'qc_test', table: qcTesting, id: qcTesting.id,
    organizationId: qcTesting.organizationId, idKind: 'integer', noun: 'QC result',
  },
  'change-control': {
    register: 'change_control', table: cmcChangeControl, id: cmcChangeControl.id,
    organizationId: cmcChangeControl.organizationId, idKind: 'integer', noun: 'change-control record',
  },
  'drug-substances': {
    register: 'drug_substance', table: drugSubstances, id: drugSubstances.id,
    organizationId: drugSubstances.organizationId, idKind: 'integer', noun: 'drug substance',
  },
  'drug-products': {
    register: 'drug_product', table: drugProducts, id: drugProducts.id,
    organizationId: drugProducts.organizationId, idKind: 'integer', noun: 'drug product',
  },
  'container-closures': {
    register: 'container_closure', table: cmcContainerClosures, id: cmcContainerClosures.id,
    organizationId: cmcContainerClosures.organizationId, idKind: 'integer', noun: 'container closure record',
  },
  'reference-standards': {
    register: 'reference_standard', table: cmcReferenceStandards, id: cmcReferenceStandards.id,
    organizationId: cmcReferenceStandards.organizationId, idKind: 'integer', noun: 'reference standard',
  },
  'impurity-profiles': {
    register: 'impurity_profile', table: cmcImpurityProfiles, id: cmcImpurityProfiles.id,
    organizationId: cmcImpurityProfiles.organizationId, idKind: 'integer', noun: 'impurity profile',
  },
  'dissolution-profiles': {
    register: 'dissolution_profile', table: cmcDissolutionProfiles, id: cmcDissolutionProfiles.id,
    organizationId: cmcDissolutionProfiles.organizationId, idKind: 'integer', noun: 'dissolution profile',
  },
  'material-specs': {
    register: 'material_spec', table: cmcMaterialSpecs, id: cmcMaterialSpecs.id,
    organizationId: cmcMaterialSpecs.organizationId, idKind: 'integer', noun: 'material specification',
  },
  'formulation-records': {
    register: 'formulation_record', table: cmcFormulationRecords, id: cmcFormulationRecords.id,
    organizationId: cmcFormulationRecords.organizationId, idKind: 'integer', noun: 'formulation record',
  },
  'manufacturing-processes': {
    /* uuid, not serial — found by the map-vs-schema test below, which failed
       with "manufacturing-processes: id is PgUUID: expected 'integer' to be
       'uuid'" on the first run. Declared integer, every history read of this
       register would have parsed its id to NaN and answered 404. */
    register: 'manufacturing_process', table: manufacturingProcesses, id: manufacturingProcesses.id,
    organizationId: manufacturingProcesses.organizationId, idKind: 'uuid', noun: 'manufacturing process',
  },
  'characterization-studies': {
    register: 'characterization_study', table: cmcCharacterizationStudies, id: cmcCharacterizationStudies.id,
    organizationId: cmcCharacterizationStudies.organizationId, idKind: 'integer', noun: 'characterization study',
  },
  'comparability-studies': {
    register: 'comparability_study', table: cmcComparabilityAssessments, id: cmcComparabilityAssessments.id,
    organizationId: cmcComparabilityAssessments.organizationId, idKind: 'uuid',
    noun: 'comparability assessment',
  },
};

/** One act against the record, as a reader sees it. */
export interface RegisterHistoryEntry {
  /** ISO-8601 instant, and the order key: oldest first, as a history reads. */
  at: string;
  /** The action as the chain recorded it — never rewritten, only labelled. */
  act: string;
  /** A reader's name for that action. */
  label: string;
  actorId: number | null;
  /** The person, named from `public.actor_name`; null when the chain has no actor. */
  actor: string | null;
  /** The reference an inspector traces by. A display name is not an identity. */
  actorRef: string | null;
  reason: string | null;
  /** The fields that moved, each with both values. Empty for a create. */
  changed: Record<string, { from: unknown; to: unknown }>;
  changedFields: string[];
  /** The §11.50 signature record this act carries, when it carries one. */
  signatureRef: string | null;
  signatureMeaning: string | null;
  /** The chain's own order key, and whether the row is sealed into it. */
  seq: number | null;
  sealed: boolean;
  /**
   * Where this act's reason is recorded, when it is recorded somewhere this
   * store cannot see. Null when the reason is in `reason`, or when the act
   * captures none. Never a reason — a pointer to one, so a reader is told
   * "look here" rather than shown a blank that reads as "none was given".
   */
  reasonElsewhere?: string | null;
}

/**
 * Which store answered. A payload comes from exactly one, and the two attest
 * differently: `audit_logs` is the tenant's sealed hash chain, while a
 * specification's own revision log is an ordinary table holding each limit
 * change with its values. A row's `sealed: false` means "no chain position" in
 * both — but only in the first case does it mean the row PREDATES the chain,
 * so the reader is told which store it is reading rather than being left to
 * infer it from a marker that means two things.
 */
export type RegisterHistoryStore = 'audit_chain' | 'specification_revision_log';

/** One record's history, and whether it is all of it. */
export interface RegisterHistory {
  store: RegisterHistoryStore;
  entries: RegisterHistoryEntry[];
  /**
   * True when the record has more acts than one read returns. What is missing
   * is the OLDEST — possibly the create — so a reader is told rather than
   * shown a history that starts in the middle as if it started there.
   */
  earlierActsNotShown: boolean;
}

/** The read could not be made. Never reported as an empty history. */
export class MissingAuditStore extends Error {
  constructor(readonly pgCode: string) {
    super(`audit store unavailable (${pgCode})`);
    this.name = 'MissingAuditStore';
  }
}

/** The register paths this route serves. The shared list is the source: a path
 *  on it with no target above is a compile error, which is the point. */
export const REGISTER_HISTORY_PATH_NAMES: readonly CmcRegisterHistoryPath[] = CMC_REGISTER_HISTORY_PATHS;

/**
 * What a reader calls each act. An action with no entry here is shown as the
 * chain recorded it rather than as something friendlier and less true.
 */
const ACT_LABELS: Record<string, string> = {
  /* Each name comes from the module that writes it, not from a second spelling
     here: `register-create-recorded.test.ts` holds a one-writer contract on the
     create action, and a label map with its own copy of the string both fails
     that contract and is free to drift from it. */
  [CMC_REGISTER_CREATE]: 'Recorded',
  [CMC_REGISTER_UPDATE]: 'Changed',
  [CMC_REGISTER_RETIRE_SIGNED]: 'Retired',
  /* A governed act's action is built as `c2c.work.${command}`
     (server/routes/c2c/actions.ts), so there is no constant to import; `sign`
     is the command every register signature uses. */
  'c2c.work.sign': 'Signed',
  /* The change-PROPOSAL register's own action (cmc-change-control-service.ts). */
  CMC_CHANGE_PROPOSED: 'Change proposed',
};

const HISTORY_SQL = `
  SELECT a.id::text AS id, a.action, a.actor_id, a.reason, a.new_values,
         a.occurred_at, a.sha256_chain, a.chain_seq,
         u.name  AS actor_name,
         u.email AS actor_email,
         es.id::text         AS signature_id,
         es.signature_meaning AS signature_meaning
    FROM audit_logs a
    LEFT JOIN LATERAL public.actor_name(a.actor_id) u ON TRUE
    LEFT JOIN electronic_signatures es
           ON es.organization_id = a.tenant_id
          AND es.signature_manifest::jsonb->>'auditId' = a.id::text
   WHERE a.tenant_id = $1
     AND a.table_name = $2
     AND a.record_id = $3
   ORDER BY a.occurred_at DESC, a.chain_seq DESC NULLS LAST, a.id DESC
   LIMIT $4`;

/**
 * How many acts one read returns. A record with more is read newest-first and
 * presented oldest-first, so what a cap hides is the record's BEGINNING — and
 * the reader is told, because a history silently missing its create reads as a
 * record that was never recorded.
 */
export const HISTORY_LIMIT = 500;

/** A pg-style client: the route hands in its own tenant-pinned one. */
export interface HistoryQueryable {
  query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

/** `{changed: {...}}` as `recordRegisterUpdateOn` writes it, read back defensively. */
function changedFrom(details: unknown): Record<string, { from: unknown; to: unknown }> {
  const parsed = typeof details === 'string' ? safeJson(details) : details;
  if (!parsed || typeof parsed !== 'object') return {};
  const changed = (parsed as { changed?: unknown }).changed;
  if (!changed || typeof changed !== 'object' || Array.isArray(changed)) return {};
  const out: Record<string, { from: unknown; to: unknown }> = {};
  for (const [field, value] of Object.entries(changed as Record<string, unknown>)) {
    if (value && typeof value === 'object' && 'from' in value && 'to' in value) {
      out[field] = { from: (value as { from: unknown }).from, to: (value as { to: unknown }).to };
    }
  }
  return out;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function nonEmpty(value: unknown): string | null {
  const text = typeof value === 'string' ? value.trim() : '';
  return text === '' ? null : text;
}

/** The instant, as ISO-8601. An unparseable one is said to be unknown, not
 *  turned into an exception that loses the whole history. */
function instantOf(value: unknown): string {
  const at = value instanceof Date ? value : new Date(String(value ?? ''));
  return Number.isNaN(at.getTime()) ? 'unknown' : at.toISOString();
}

function entryOf(row: Record<string, unknown>): RegisterHistoryEntry {
  const changed = changedFrom(row.new_values);
  const actorId = row.actor_id == null ? null : Number(row.actor_id);
  const act = String(row.action ?? '');
  const signatureId = nonEmpty(row.signature_id);
  return {
    at: instantOf(row.occurred_at),
    act,
    label: ACT_LABELS[act] ?? act,
    actorId,
    actor: nonEmpty(row.actor_name) ?? nonEmpty(row.actor_email),
    actorRef: actorId == null ? null : `user:${actorId}`,
    reason: nonEmpty(row.reason),
    changed,
    changedFields: Object.keys(changed),
    signatureRef: signatureId ? `electronic_signatures:${signatureId}` : null,
    signatureMeaning: nonEmpty(row.signature_meaning),
    seq: row.chain_seq == null ? null : Number(row.chain_seq),
    sealed: nonEmpty(row.sha256_chain) != null,
  };
}

/**
 * Is this record one of this organisation's? Through Drizzle on the mapped
 * columns, so the predicate carries no table or column name in SQL text.
 *
 * `false` is also the answer for another tenant's record, which is why the
 * route answers 404 and not 403: the existence of a record in another
 * organisation is not this caller's to learn.
 */
export async function registerRecordIsTenants(
  target: RegisterHistoryTarget,
  recordId: string,
  orgId: number,
): Promise<boolean> {
  const key = target.idKind === 'integer' ? Number.parseInt(recordId, 10) : recordId.trim();
  if (target.idKind === 'integer' && !Number.isInteger(key)) return false;
  if (target.idKind === 'uuid' && !isUuid(String(key))) return false;
  const rows = await db
    .select({ id: target.id })
    .from(target.table as never)
    .where(and(eq(target.id, key), eq(target.organizationId, orgId)))
    .limit(1);
  return rows.length === 1;
}

/**
 * Every chained act recorded against one register record, oldest first.
 *
 * Unsealed rows are included and marked `sealed: false` rather than hidden: a
 * legacy row with no chain position is part of what happened to the record, and
 * a history that quietly drops it reads as a record that was never touched.
 */
export async function readRegisterHistory(
  client: HistoryQueryable,
  params: { orgId: number; tableName: string; recordId: string },
): Promise<RegisterHistory> {
  try {
    /* One more than the cap, so a record with more acts is known to have them
       rather than guessed at from a full page. */
    const result = await client.query(HISTORY_SQL, [
      params.orgId,
      params.tableName,
      params.recordId,
      HISTORY_LIMIT + 1,
    ]);
    const rows = result.rows.slice(0, HISTORY_LIMIT);
    return {
      store: 'audit_chain',
      /* Read newest-first by the chain's order; presented oldest-first, which
         is how a history is read. */
      entries: rows.map(entryOf).reverse(),
      earlierActsNotShown: result.rows.length > HISTORY_LIMIT,
    };
  } catch (error) {
    const code = typeof error === 'object' && error !== null ? String((error as { code?: unknown }).code ?? '') : '';
    // 42P01 undefined_table, 42703 undefined_column, 42883 undefined_function
    // (public.actor_name is provisioned by migrations/20260929_actor_names.sql).
    if (code === '42P01' || code === '42703' || code === '42883') throw new MissingAuditStore(code);
    throw error;
  }
}

/* ── The specification register's own revision log ─────────────────────────
 *
 * Specifications are deliberately absent from REGISTER_HISTORY_PATHS, for the
 * reason this file's header gives: `specification_audit_log` already answers
 * "what happened to this specification", and holding the register in both
 * places would give a reader two different answers to one question.
 *
 * What it did NOT have was a reader. `GET /api/cmc/specifications/:id/history`
 * has existed since the register was written and no screen in the product ever
 * called it, so the one register whose limits an inspector asks about first was
 * the one register whose changes could not be read — while the other sixteen
 * gained the panel on 2026-10-18. This reads that store into the SAME shape the
 * chain reader returns, so the product has one history panel and not two: the
 * route is reached, nothing is rebuilt, and no second UI exists to drift.
 *
 * The three writers are in `server/api/cmc/specificationRoutes.ts`: the create
 * (`new_values` only), the update and the approval withdrawal, and the governed
 * approval. The approval and the withdrawal ALSO write the sealed chain — the
 * signature is what an approval is attested by — so those rows appear in both
 * stores and this one is read for the field values the chain does not carry.
 */

/** A reader's name for each action `specification_audit_log` records. */
const SPEC_ACT_LABELS: Record<string, string> = {
  created: 'Specification recorded',
  updated: 'Specification edited',
  approved: 'Specification approved',
  approval_withdrawn: 'Approval withdrawn',
};

/** The acts this register performs under a signature, which captures a reason. */
const SIGNED_SPEC_ACTS = new Set(['approved', 'approval_withdrawn']);

/** Columns every row carries and no reader is asking about. */
const SPEC_DIFF_SKIP = new Set(['updated_at', 'updatedAt', 'created_at', 'createdAt']);

/** A snapshot pair, as the two JSONB columns hold it. */
function snapshot(value: unknown): Record<string, unknown> | null {
  const parsed = typeof value === 'string' ? safeJson(value) : value;
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
}

/**
 * What moved between two whole-row snapshots.
 *
 * Compared by JSON shape, as `diffRows` does for the chain writer: two reads of
 * a `json` or `numeric` column are never `===`, and a diff that trusted
 * identity would report every field on every edit. A create (no previous
 * snapshot) reports NO changed field, which is what the chain's history does
 * for a create too — the values are the record, not a change to it.
 */
function specChanges(previous: unknown, next: unknown): Record<string, { from: unknown; to: unknown }> {
  const before = snapshot(previous);
  const after = snapshot(next);
  if (!before || !after) return {};
  const out: Record<string, { from: unknown; to: unknown }> = {};
  for (const field of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (SPEC_DIFF_SKIP.has(field)) continue;
    const from = before[field] ?? null;
    const to = after[field] ?? null;
    if (JSON.stringify(from) !== JSON.stringify(to)) out[field] = { from, to };
  }
  return out;
}

/** `changed_by` is TEXT and holds a user id; anything else is not an id. */
function specActorId(value: unknown): number | null {
  const text = typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '';
  return /^[0-9]+$/.test(text) ? Number(text) : null;
}

function specEntryOf(
  row: Record<string, unknown>,
  named?: { name: string | null; email: string | null },
): RegisterHistoryEntry {
  const changed = specChanges(row.previous_values, row.new_values);
  const actorId = specActorId(row.changed_by);
  const act = String(row.action ?? '');
  return {
    at: instantOf(row.created_at),
    act,
    label: SPEC_ACT_LABELS[act] ?? act,
    actorId,
    /* The row itself may carry the name (a caller that joined it), else the
       optional second read, else nobody — never a guess. */
    actor: nonEmpty(row.actor_name) ?? nonEmpty(row.actor_email) ?? named?.name ?? named?.email ?? null,
    /* The id as recorded, even when it is not a user id, so a reader traces
       what the row actually says rather than a tidied version of it. */
    actorRef: actorId == null ? nonEmpty(row.changed_by) : `user:${actorId}`,
    /* This store has no reason column, and the acts that carry one — an
       approval and a withdrawal — record it on the chain row and the §11.50
       signature beside it. So the reason is not read here, and it must not be
       shown as "—" either: a blank beside "Specification approved" reads as an
       approval given with no reason, which would be a §11 finding about a
       signature that in fact captured one. `reasonElsewhere` says where it is,
       and the panel prints that instead of a dash. */
    reason: null,
    reasonElsewhere: SIGNED_SPEC_ACTS.has(act)
      ? 'recorded with the signature for this act (governed actions)'
      : null,
    changed,
    changedFields: Object.keys(changed),
    signatureRef: null,
    signatureMeaning: null,
    seq: null,
    /* Not a chain position. The panel reads `store` to say so in this store's
       own terms rather than calling the row "unsealed", which would assert it
       predates the ledger. */
    sealed: false,
  };
}

/**
 * Newest-first, capped one past the limit so a longer history is known to be
 * longer. The tenant predicate is on `quality_specifications`, joined —
 * `specification_audit_log` carries no tenant column of its own, so the row's
 * ownership is its specification's.
 *
 * `id` is read too, and it is the tie-break after `created_at`: three of these
 * rows can share a timestamp to the microsecond (a create and its linkage, an
 * approval and its withdrawal in one script), and an unstable order makes the
 * 500-row cap drop a different row on each read.
 *
 * The actor's NAME is deliberately not joined here — see `namesFor` below.
 */
const SPEC_HISTORY_SQL = `
    SELECT sal.id,
           sal.action,
           sal.changed_by,
           sal.previous_values,
           sal.new_values,
           sal.created_at
      FROM specification_audit_log sal
      JOIN quality_specifications qs ON qs.id = sal.specification_id
     WHERE sal.specification_id = $1
       AND qs.tenant_id = $2
     ORDER BY sal.created_at DESC, sal.id DESC
     LIMIT $3`;

/**
 * The names of the accounts that acted, resolved SEPARATELY and optionally.
 *
 * `public.actor_name` is a helper (migrations/20260929_actor_names.sql), and
 * the chain reader calls it inside its one statement — so where the function is
 * absent the whole read raises 42883 and the history answers 503. That is the
 * right failure for a missing audit STORE and the wrong one for a missing
 * display name: it turns a cosmetic dependency into an outage, and the contract
 * test caught exactly that (503 where the owning tenant must get its history).
 *
 * So the substance is read without it, and the names are a second query that is
 * allowed to fail. When it does, every act still carries `actorRef` —
 * `user:<id>`, the reference an inspector traces by — and the panel says
 * "unnamed account" rather than inventing one. What is never affected is WHAT
 * changed, WHEN, and by WHICH account.
 */
async function namesFor(
  client: HistoryQueryable,
  ids: number[],
): Promise<Map<number, { name: string | null; email: string | null }>> {
  const out = new Map<number, { name: string | null; email: string | null }>();
  if (ids.length === 0) return out;
  try {
    const { rows } = await client.query(
      `SELECT i AS id, u.name, u.email
         FROM unnest($1::int[]) AS i
         LEFT JOIN LATERAL public.actor_name(i) u ON TRUE`,
      [ids],
    );
    for (const r of rows) {
      const id = Number(r.id);
      if (Number.isInteger(id)) out.set(id, { name: nonEmpty(r.name), email: nonEmpty(r.email) });
    }
  } catch {
    /* No names available. The history is unchanged; only the display name is
       missing, and the panel has an honest word for that. */
  }
  return out;
}

/**
 * Every recorded change to one specification, oldest first.
 *
 * Fails closed exactly as the chain reader does: a missing table, column or
 * `public.actor_name` is carried up as `MissingAuditStore` so the route answers
 * 503, because "no changes recorded" and "the store could not be read" are
 * indistinguishable to an inspector and only one of them is a claim this module
 * may make.
 */
export async function readSpecificationHistory(
  client: HistoryQueryable,
  params: { orgId: number; specificationId: string },
): Promise<RegisterHistory> {
  try {
    const result = await client.query(SPEC_HISTORY_SQL, [
      params.specificationId,
      params.orgId,
      HISTORY_LIMIT + 1,
    ]);
    const rows = result.rows.slice(0, HISTORY_LIMIT);
    const names = await namesFor(
      client,
      [...new Set(rows.map((r) => specActorId(r.changed_by)).filter((id): id is number => id !== null))],
    );
    return {
      store: 'specification_revision_log',
      entries: rows.map((r) => specEntryOf(r, names.get(specActorId(r.changed_by) ?? -1))).reverse(),
      earlierActsNotShown: result.rows.length > HISTORY_LIMIT,
    };
  } catch (error) {
    const code = typeof error === 'object' && error !== null ? String((error as { code?: unknown }).code ?? '') : '';
    if (code === '42P01' || code === '42703' || code === '42883') throw new MissingAuditStore(code);
    throw error;
  }
}
