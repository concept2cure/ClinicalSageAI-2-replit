/**
 * Submission lifecycle service (canonical core)
 *
 * CRUD + lifecycle transitions for the canonical submission core
 * (`submissions` / `ectd_sequences` / `submission_leaves`). This is the service
 * the spec §8.2 lists first — until now the core had NO service and NO API; it
 * was written only by ingestion and read by nobody.
 *
 * Every read/write is tenant-scoped from the caller's organizationId (never from
 * request input) and every mutation is audited. Lifecycle-state rules are pure
 * functions (testable without a DB).
 *
 * @module server/services/submission-service/submission-service
 */

import { createHash } from 'crypto';
import { eq, and, isNull, desc, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { PoolClient } from 'pg';
import { db, pool } from '../../db';
import {
  submissions,
  ectdSequences,
  submissionLeaves,
  coauthorDocuments,
} from '../../../shared/schema';
import { renderedLeafFiles } from '../../../shared/schema/submissions';
import { unifiedDocuments, workflowDocumentVersions } from '../../../shared/schema/unified_workflow';
import { ctdOnboardingDocuments } from '../../../shared/schema/ctd-projects';
import { readLocalUploadBuffer } from '../anthropic-files';
import { sectionPlainText } from '../c2c/section-content';
import {
  externalDocumentTableReason,
  isPlaceableDocumentTable,
  unplaceableDocumentTableMessage,
} from '../ectd/leaf-document-tables';
import type {
  Submission,
  EctdSequence,
  SubmissionLeaf,
} from '../../../shared/types/database';
import { writeChainedAuditRow } from '../auditService';
import { recordAuditRow, type AuditRowOutcome } from '../audit/audit-write-outcome';
import { deriveGovernedTargetBinding, BINDING_BASIS, isSignatureWithdrawn } from '../part11/signature-persistence';
import { createScopedLogger } from '../../utils/logger';
import {
  validateSectionCode,
  vocabularyForApplicationType,
  type PlacementVocabulary,
} from '../../../shared/regulatory/placement-vocabulary';

const logger = createScopedLogger('submission-service');

// ── Standardized errors ───────────────────────────────────────────────────────

export type SubmissionErrorCode =
  | 'NOT_FOUND'
  | 'INVALID_STATE'
  | 'VALIDATION'
  | 'GOVERNED_REQUIRED'
  | 'DISPATCH_BLOCKED'
  | 'FORBIDDEN';

/**
 * Transitions that are irreversible / outward-facing and must go through the
 * governed e-signature flow (POST /api/c2c/actions sign) — they are NOT allowed
 * via the generic transition endpoint (Part 11, spec §10).
 */
const GOVERNED_TRANSITIONS = new Set(['frozen', 'dispatched']);

export class SubmissionError extends Error {
  constructor(public code: SubmissionErrorCode, message: string) {
    super(message);
    this.name = 'SubmissionError';
  }
}

// ── Pure lifecycle rules ────────────────────────────────────────────────────

export const SEQUENCE_STATUSES = ['draft', 'assembling', 'validated', 'frozen', 'dispatched'] as const;
export type SequenceStatus = (typeof SEQUENCE_STATUSES)[number];

/** Allowed forward transitions for a sequence's status. */
const SEQUENCE_TRANSITIONS: Record<SequenceStatus, SequenceStatus[]> = {
  draft: ['assembling'],
  assembling: ['validated', 'draft'],
  validated: ['frozen', 'assembling'],
  frozen: ['dispatched'],
  dispatched: [],
};

/** Whether a sequence may move from `from` to `to`. Pure. */
export function canTransitionSequence(from: string, to: string): boolean {
  const allowed = SEQUENCE_TRANSITIONS[from as SequenceStatus];
  return Array.isArray(allowed) && allowed.includes(to as SequenceStatus);
}

/** A frozen or dispatched sequence is immutable — its leaves cannot change. Pure. */
export function isSequenceLocked(status: string): boolean {
  return status === 'frozen' || status === 'dispatched';
}

// ── Submissions ───────────────────────────────────────────────────────────────

export interface CreateSubmissionInput {
  title: string;
  productName?: string | null;
  applicationType: string;
  clientType: string;
  primaryRegion: string;
  lifecycleStage?: string;
}

/** Anything that can run the canonical submissions INSERT — the pool-backed
 *  `db`, or a per-request drizzle wrapper over a transaction's PoolClient. */
type SubmissionInsertExecutor = Pick<typeof db, 'insert'>;

/**
 * The ONE definition of what a canonical `submissions` row is created from.
 * Both creation paths (standalone `createSubmission`, transactional
 * `createSubmissionTx`) run through here so the field mapping cannot fork.
 */
async function insertSubmissionRow(
  executor: SubmissionInsertExecutor,
  input: CreateSubmissionInput,
  ctx: { organizationId: number; userId: number }
): Promise<Submission> {
  const [row] = await executor
    .insert(submissions)
    .values({
      title: input.title,
      productName: input.productName ?? null,
      applicationType: input.applicationType,
      clientType: input.clientType,
      primaryRegion: input.primaryRegion,
      lifecycleStage: input.lifecycleStage ?? 'planning',
      organizationId: ctx.organizationId,
      createdBy: ctx.userId,
    })
    .returning();
  return row as Submission;
}

/**
 * A created submission, with what happened to the 21 CFR Part 11 §11.10(e)
 * record of its creation carried on it.
 *
 * WO-16C #133. The audit write below was `await auditService.logAction({…})` at
 * statement position, which discards the `AuditWriteResult` that call resolves.
 * `logAction` never rejects when persistence fails — by deliberate policy, an
 * audit-trail outage must not break the action it records — so awaiting it and
 * throwing the value away reported exactly as much as not awaiting it: the
 * `submissions` row was committed and the caller (POST /api/submissions, which
 * returns this object as its 201 body) was handed a byte-identical success
 * whether the §11.10(e) record for creating this application existed or not.
 *
 * The inserted row is returned intact with `auditTrail` added, so callers that
 * read `id` / `title` / `applicationType` off it are unaffected and the outcome
 * travels with it. `auditTrail` is the key this repository already uses for a
 * service's own row (`CreatedQSubmission.auditTrail` in
 * server/services/q-sub/q-sub.service.ts).
 */
export type CreatedSubmission = Submission & { auditTrail: AuditRowOutcome };

export async function createSubmission(
  input: CreateSubmissionInput,
  ctx: { organizationId: number; userId: number }
): Promise<CreatedSubmission> {
  const row = await insertSubmissionRow(db, input, ctx);
  // Part 11 §11.10(e). `recordAuditRow` neither throws nor rejects, and the
  // INSERT above is already committed when it runs, so the submission stands
  // either way and is never un-created over a lost log row — this is a record
  // beside a committed change, not the change itself. What changes is that the
  // caller is told, in `auditTrail`. The store's own reason for a failure stays
  // in the log line recordAuditRow wrote against this action and resource id;
  // `message` on the failure arm is the only text fit to show a user.
  const auditTrail = await recordAuditRow({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: 'SUBMISSION_CREATED',
    resourceType: 'submission',
    resourceId: row.id,
    details: { applicationType: input.applicationType, primaryRegion: input.primaryRegion, clientType: input.clientType },
  });
  logger.info('Created submission', { submissionId: row.id, organizationId: ctx.organizationId });
  return { ...row, auditTrail };
}

/**
 * Create a canonical submission INSIDE a caller-owned transaction.
 *
 * Runs the same INSERT as `createSubmission`, but on the caller's PoolClient,
 * so the submission commits — or rolls back — atomically with whatever else
 * that transaction creates (e.g. the regulatory program the C2C intake wizard
 * writes in routes/c2c/projects.ts). Mirrors the `createSubmissionTx(client,…)`
 * idiom in services/irb/irb-service.ts.
 *
 * Deliberately does NOT call auditService.logAction: that write runs on its own
 * pooled connection, OUTSIDE the caller's transaction, so on rollback it would
 * leave a sealed record of a submission that does not exist — a fabricated
 * audit trail. The caller owns the transaction and must write its own audit row
 * on the same client (the C2C intake route writes a hash-chained audit_logs row
 * covering both creations).
 */
export function createSubmissionTx(
  client: PoolClient,
  input: CreateSubmissionInput,
  ctx: { organizationId: number; userId: number }
): Promise<Submission> {
  return insertSubmissionRow(drizzle(client), input, ctx);
}

export async function listSubmissions(ctx: { organizationId: number }): Promise<Submission[]> {
  const rows = await db
    .select()
    .from(submissions)
    .where(and(eq(submissions.organizationId, ctx.organizationId), isNull(submissions.deletedAt)))
    .orderBy(desc(submissions.updatedAt));
  return rows as Submission[];
}

export async function getSubmission(
  id: number,
  ctx: { organizationId: number }
): Promise<Submission> {
  const [row] = await db
    .select()
    .from(submissions)
    .where(and(eq(submissions.id, id), eq(submissions.organizationId, ctx.organizationId), isNull(submissions.deletedAt)))
    .limit(1);
  if (!row) throw new SubmissionError('NOT_FOUND', 'Submission not found for this organization.');
  return row as Submission;
}

// ── Sequences ───────────────────────────────────────────────────────────────

export interface CreateSequenceInput {
  submissionId: number;
  region: string;
  sequenceNumber: string;
  type?: string;
}

/**
 * A created eCTD sequence, with what happened to the §11.10(e) record of its
 * creation carried on it.
 *
 * WO-16C #133, same defect and same reasoning as `CreatedSubmission`: the audit
 * write below was awaited at statement position and its `AuditWriteResult`
 * discarded, so a sequence created for a filing — an original, an amendment, an
 * annual report — could not be told apart from one whose creation record was
 * lost. The inserted row is returned intact with `auditTrail` added.
 */
export type CreatedSequence = EctdSequence & { auditTrail: AuditRowOutcome };

export async function createSequence(
  input: CreateSequenceInput,
  ctx: { organizationId: number; userId: number }
): Promise<CreatedSequence> {
  // Tenant ownership of the parent submission.
  await getSubmission(input.submissionId, ctx);
  const [row] = await db
    .insert(ectdSequences)
    .values({
      submissionId: input.submissionId,
      region: input.region,
      sequenceNumber: input.sequenceNumber,
      type: input.type ?? 'original',
      status: 'draft',
      organizationId: ctx.organizationId,
      createdBy: ctx.userId,
    })
    .returning();
  // Part 11 §11.10(e). The INSERT above is committed before this runs; a failed
  // audit write never deletes the sequence (a filing's sequence numbering is
  // regulatory state — removing a created sequence to make its log row's absence
  // tidy would be the worse lie). The caller is handed the outcome instead.
  const auditTrail = await recordAuditRow({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: 'SEQUENCE_CREATED',
    resourceType: 'ectd_sequence',
    resourceId: row.id,
    details: { submissionId: input.submissionId, region: input.region, sequenceNumber: input.sequenceNumber },
  });
  return { ...(row as EctdSequence), auditTrail };
}

export async function listSequences(
  submissionId: number,
  ctx: { organizationId: number }
): Promise<EctdSequence[]> {
  await getSubmission(submissionId, ctx);
  const rows = await db
    .select()
    .from(ectdSequences)
    .where(
      and(
        eq(ectdSequences.submissionId, submissionId),
        eq(ectdSequences.organizationId, ctx.organizationId),
        isNull(ectdSequences.deletedAt)
      )
    )
    .orderBy(ectdSequences.sequenceNumber);
  return rows as EctdSequence[];
}

export async function getSequence(id: number, ctx: { organizationId: number }): Promise<EctdSequence> {
  const [row] = await db
    .select()
    .from(ectdSequences)
    .where(and(eq(ectdSequences.id, id), eq(ectdSequences.organizationId, ctx.organizationId), isNull(ectdSequences.deletedAt)))
    .limit(1);
  if (!row) throw new SubmissionError('NOT_FOUND', 'Sequence not found for this organization.');
  return row as EctdSequence;
}

/**
 * A sequence whose status was moved by the generic (non-governed) transition,
 * with what happened to the §11.10(e) record of that move carried on it.
 *
 * WO-16C #133. The audit write below was awaited at statement position and its
 * `AuditWriteResult` discarded, so POST
 * /api/submissions/sequences/:seqId/transition answered 200 with the moved
 * sequence whether or not the row recording who moved it — and from what — was
 * written. Note the contrast one section down: the
 * governed transitions (`frozen`, `dispatched`, and transmit) do not use this
 * path at all; their audit row is written by `applySequenceChangeWithAudit` in
 * the same transaction as the state change and a failure rolls the state change
 * back. That guarantee is deliberately NOT extended here — this transition is
 * reversible (`assembling` ⇄ `draft`, `validated` ⇄ `assembling`) and internal,
 * so its rule is the repository's default: the action stands and the caller is
 * told.
 */
export type TransitionedSequence = EctdSequence & { auditTrail: AuditRowOutcome };

/** Transition a sequence's status, enforcing the pure transition rules + audit. */
export async function transitionSequence(
  id: number,
  toStatus: string,
  ctx: { organizationId: number; userId: number }
): Promise<TransitionedSequence> {
  const seq = await getSequence(id, ctx);
  if (GOVERNED_TRANSITIONS.has(toStatus)) {
    throw new SubmissionError(
      'GOVERNED_REQUIRED',
      `Transition to ${toStatus} is irreversible and must go through the governed e-signature flow (POST /api/c2c/actions sign), not this endpoint.`
    );
  }
  if (!canTransitionSequence(seq.status, toStatus)) {
    throw new SubmissionError('INVALID_STATE', `Cannot transition sequence from ${seq.status} to ${toStatus}.`);
  }
  const frozenAt = toStatus === 'frozen' ? new Date() : undefined;
  /* Same compare-and-set as the governed twin: `seq.status` was read above and
     canTransitionSequence was evaluated against it, so the write must apply only
     while the row still holds that value. Without the predicate two concurrent
     callers both passed the check and both wrote, and the second overwrote a
     transition it never saw. */
  const [row] = await db
    .update(ectdSequences)
    .set({ status: toStatus, updatedAt: new Date(), ...(frozenAt ? { frozenAt } : {}) })
    .where(
      and(
        eq(ectdSequences.id, id),
        eq(ectdSequences.organizationId, ctx.organizationId),
        eq(ectdSequences.status, seq.status),
      ),
    )
    .returning();
  if (!row) {
    throw new SubmissionError(
      'INVALID_STATE',
      `Sequence ${id} is no longer in state '${seq.status}' — it changed while this transition was being applied. Re-read the sequence and retry if the transition still applies.`,
    );
  }
  // Part 11 §11.10(e). The UPDATE above is committed; the status is not moved
  // back when this write fails. `SEQUENCE_FROZEN` appears in the action below
  // only because it is the action name for a `frozen` target — `frozen` is in
  // GOVERNED_TRANSITIONS and was already refused at the top of this function, so
  // the branch this reaches in practice is `SEQUENCE_TRANSITIONED`.
  const auditTrail = await recordAuditRow({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: toStatus === 'frozen' ? 'SEQUENCE_FROZEN' : 'SEQUENCE_TRANSITIONED',
    resourceType: 'ectd_sequence',
    resourceId: id,
    details: { from: seq.status, to: toStatus },
  });
  return { ...(row as EctdSequence), auditTrail };
}

// ── Governed freeze / dispatch (the SUBMIT step of assemble→submit→transmit) ──
//
// `frozen` and `dispatched` are irreversible and outward-facing, so the generic
// transitionSequence() above refuses them. These appliers are the ONLY path that
// can produce those states, and each enforces — atomically — BOTH governance
// gates, so neither can be bypassed:
//   1. a Part 11 e-signature: a recorded `sign` governed action on THIS exact
//      sequence target, by THIS actor (proves a human authorized it); and
//   2. the deterministic dispatch gate: server-computed validation errors + open
//      Shadow Review criticals (proves the dossier is actually clear).
// The actual transmission to the agency gateway stays separate, behind the
// governed transmit_submission tool.

/** The governed transitions a sequence signature can authorize — one act each. */
export type GovernedSequenceStep = 'freeze' | 'dispatch' | 'transmit';

const STEP_AUDIT_ACTION: Record<GovernedSequenceStep, string> = {
  freeze: 'SEQUENCE_FROZEN',
  dispatch: 'SEQUENCE_DISPATCHED',
  transmit: 'ECTD_TRANSMITTED',
};

/**
 * Why a recorded governed `sign` action does not authorize `step` on `target`
 * for this actor, or null when it does. Four things are checked, and each used
 * to be missing:
 *   - the action exists, on this exact target, by this actor, executed;
 *   - its declared intent is this step (11.50: the meaning of the signature).
 *     One `sign` used to authorize freeze, dispatch and transmit alike;
 *   - it has not already been spent on a governed transition (a replay of the
 *     freeze-time actionId used to dispatch and transmit too);
 *   - the sequence's leaf manifest still hashes to the digest bound at signing
 *     (11.70). The digest was persisted and never consulted, so a leaf edited
 *     after signing was frozen under a signature applied to different bytes.
 */
async function governedSignatureRefusal(
  signatureActionId: string,
  target: string,
  ctx: { organizationId: number; userId: number },
  step: GovernedSequenceStep,
): Promise<string | null> {
  const action = await db.execute(sql`
    SELECT id, payload FROM c2c_ana_actions
    WHERE id = ${signatureActionId}
      AND org_id = ${ctx.organizationId}
      AND command = 'sign'
      AND target = ${target}
      AND state = 'executed'
      AND proposed_by = ${ctx.userId}
    LIMIT 1
  `);
  const row = ((action as { rows?: Array<{ payload?: unknown }> }).rows ?? [])[0];
  if (!row) return 'no executed sign action on this sequence by this actor';

  const payload = typeof row.payload === 'string' ? safeJson(row.payload) : (row.payload as Record<string, unknown> | null);
  const intent = typeof payload?.intent === 'string' ? payload.intent : null;
  if (intent !== step) {
    return `the sign action declares intent '${intent ?? 'none'}', not '${step}'; sign this step with its own meaning`;
  }

  const sequenceId = target.slice(target.indexOf(':') + 1);
  const spent = await db.execute(sql`
    SELECT 1 FROM audit_logs
    WHERE tenant_id = ${ctx.organizationId}
      AND table_name = 'ectd_sequence'
      AND record_id = ${sequenceId}
      AND action IN ('SEQUENCE_FROZEN', 'SEQUENCE_DISPATCHED', 'ECTD_TRANSMITTED')
      AND (new_values::jsonb ->> 'signatureActionId') = ${signatureActionId}
    LIMIT 1
  `);
  if (((spent as { rows?: unknown[] }).rows?.length ?? 0) > 0) {
    return 'this sign action already authorized a governed transition; each step needs its own signature';
  }

  /* The withdrawal columns are selected, not just the binding ones. A governed
     revocation (persistGovernedSignatureRevocation) marks a signature out of
     force by setting superseded_by / is_valid=false / verification_status, and
     deliberately leaves bound_payload_digest, binding_basis and
     signature_manifest byte-identical — §11.70 requires the superseded
     signature be retained unaltered. It also writes a NEW c2c_ana_actions row
     rather than touching the original `sign` row, so every earlier check in this
     function still matches a revoked signature: the sign action is still
     'executed' by the same actor, the declared intent is unchanged, the
     spent-check filters different actions, and the leaf-manifest digest still
     agrees because revocation does not alter content.

     Reading only the binding columns therefore could not distinguish a live
     signature from a withdrawn one, and revocation — the product's own §11.70
     mechanism for taking an authorization back — had no effect on freeze or
     transmit. (Dispatch was covered, because its Gate 2 release-signature check
     does apply this predicate.) */
  const esig = await db.execute(sql`
    SELECT bound_payload_digest, binding_basis, superseded_by, is_valid, verification_status
      FROM electronic_signatures
    WHERE organization_id = ${ctx.organizationId}
      AND signed_target = ${target}
      AND (signature_manifest::jsonb ->> 'actionId') = ${signatureActionId}
    LIMIT 1
  `);
  const sig = ((esig as unknown as {
    rows?: Array<{
      bound_payload_digest: string | null;
      binding_basis: string | null;
      superseded_by: unknown;
      is_valid: unknown;
      verification_status: unknown;
    }>;
  }).rows ?? [])[0];
  if (!sig) return 'no electronic signature record is bound to this sign action';
  if (isSignatureWithdrawn(sig)) {
    return 'the electronic signature authorizing this step has been revoked; obtain a new signature';
  }
  if (sig.binding_basis !== BINDING_BASIS.ECTD_SEQUENCE_LEAF_MANIFEST || !sig.bound_payload_digest) {
    return 'the signature is not bound to this sequence\'s leaf manifest; re-sign the sequence';
  }
  const current = await deriveGovernedTargetBinding(
    { query: (text: string, params?: unknown[]) => pool.query(text, params) as Promise<{ rows: any[] }> },
    target,
    ctx.organizationId,
  );
  if (current.digest !== sig.bound_payload_digest) {
    return 'the sequence changed after it was signed (leaf manifest digest differs); re-sign the current content';
  }
  return null;
}

function safeJson(text: string): Record<string, unknown> | null {
  try { return JSON.parse(text) as Record<string, unknown>; } catch { return null; }
}


/**
 * Apply a sequence state change and its hash-chained audit row in ONE
 * transaction. auditService.logAction swallows a persistence failure by policy
 * (an audit outage must not break a general user action); for a Part 11
 * governed transition the claim is the opposite — no freeze, dispatch or
 * transmission without its audit row — so the row is written with
 * writeChainedAuditRow on the same client and a failure rolls the state
 * change back.
 */
async function applySequenceChangeWithAudit(
  update: {
    text: string;
    params: unknown[];
    /**
     * What zero affected rows MEANS for this caller. When the UPDATE carries a
     * compare-and-set predicate, zero rows is a LOST RACE (the state moved after
     * it was read), not a missing sequence, and reporting "not found" for it
     * would send the operator looking for the wrong problem.
     */
    noRowsRefusal?: string;
  },
  audit: { organizationId: number; userId: number; action: string; resourceId: number; details: Record<string, unknown> },
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const res = (await client.query(update.text, update.params)) as { rowCount?: number | null };
    if (!res.rowCount) {
      throw update.noRowsRefusal
        ? new SubmissionError('INVALID_STATE', update.noRowsRefusal)
        : new SubmissionError('NOT_FOUND', 'Sequence not found for this organization.');
    }
    await writeChainedAuditRow(client, {
      organizationId: audit.organizationId,
      userId: audit.userId,
      action: audit.action,
      resourceType: 'ectd_sequence',
      resourceId: audit.resourceId,
      details: audit.details,
    });
    await client.query('COMMIT');
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* the failure below is the one to report */ }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Refuse a governed step when the package this sequence would transmit is not
 * transmittable — the rule transmitSequence applies (assembledTransmitBlockers),
 * run on the same assembly before the sequence is locked.
 */
async function assertSequencePackageable(
  id: number,
  ctx: { organizationId: number; userId: number },
  step: GovernedSequenceStep,
): Promise<void> {
  const { assembleSequence, assembledTransmitBlockers } = await import('../ectd/assemble-from-core');
  let assembled: Awaited<ReturnType<typeof assembleSequence>>;
  try {
    // The agency identifiers only fill backbone text; the blockers do not
    // depend on them, and nothing assembled here is sent.
    assembled = await assembleSequence({
      sequenceId: id,
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      applicationId: `UNASSIGNED-SEQ-${id}`,
      sponsorId: `UNASSIGNED-ORG-${ctx.organizationId}`,
      sponsorName: `UNASSIGNED (organization ${ctx.organizationId})`,
    });
  } catch (err) {
    throw new SubmissionError(
      'DISPATCH_BLOCKED',
      `Refusing to ${step}: the sequence does not assemble into a package (${err instanceof Error ? err.message : String(err)}). ` +
        'Fix it while the leaves can still be changed.',
    );
  }
  try {
    const gaps = assembledTransmitBlockers(assembled);
    if (gaps.length > 0) {
      throw new SubmissionError(
        'DISPATCH_BLOCKED',
        `Refusing to ${step}: ${gaps.join('; ')}. Transmit would refuse this package, and once the sequence is ` +
          `${step === 'freeze' ? 'frozen' : 'dispatched'} its leaves can no longer be changed.`,
      );
    }
  } finally {
    await assembled.cleanup();
  }
}

async function applyGovernedSequenceTransition(
  id: number,
  toStatus: 'frozen' | 'dispatched',
  ctx: { organizationId: number; userId: number },
  signatureActionId: string
): Promise<EctdSequence> {
  const seq = await getSequence(id, ctx);
  if (!canTransitionSequence(seq.status, toStatus)) {
    throw new SubmissionError('INVALID_STATE', `Cannot transition sequence from ${seq.status} to ${toStatus}.`);
  }

  // Gate 1 — Part 11 e-signature must govern THIS sequence, for THIS step,
  // signed by THIS actor, unspent, and bound to the current leaf manifest.
  const target = `ectd-sequence:${id}`;
  const step: GovernedSequenceStep = toStatus === 'frozen' ? 'freeze' : 'dispatch';
  const refusal = await governedSignatureRefusal(signatureActionId, target, ctx, step);
  if (refusal !== null) {
    throw new SubmissionError(
      'GOVERNED_REQUIRED',
      `A valid e-signature is required: sign ${target} via POST /api/c2c/actions/sign with intent '${step}', then pass its actionId. Refused: ${refusal}.`
    );
  }

  // Gate 2 — deterministic dispatch gate (server-computed inputs; tamper-proof),
  // composed for THIS step. Freeze takes every gate except the REQUIREMENT for a
  // §11.70 release signature: that control is the transmit re-check, a release
  // signature comes from a signed package orchestrator run, and requiring one to
  // freeze inverted the order the product works in — freeze, then build and sign
  // the release. A tampered signature still blocks a freeze, and dispatch is
  // unchanged. See assess-dispatch-readiness → composeDispatchGatesForStep.
  const { assessSequenceDispatchReadiness } = await import('../ectd/assess-dispatch-readiness');
  const assessment = await assessSequenceDispatchReadiness({ sequenceId: id, organizationId: ctx.organizationId });
  const stepGate = toStatus === 'frozen' ? assessment.freezeGate : assessment.gate;
  if (!stepGate.cleared) {
    throw new SubmissionError(
      'DISPATCH_BLOCKED',
      `Dispatch gate blocks ${toStatus}: ${stepGate.blockers.join(' ')}`
    );
  }

  // Gate 3 — the package this sequence would transmit (2026-09-23, W5/D7).
  // Transmit refuses a package that leaves out a placed leaf, carries an
  // unapproved document, or cannot materialize a source (assembledTransmit-
  // Blockers). Readiness does not assemble, so those refusals used to surface
  // only at transmit — after freeze had made the leaves immutable and dispatch
  // had removed every way back: a signed sequence that could never be sent.
  // The same assembly and the same rule run here, while the author can still act.
  await assertSequencePackageable(id, ctx, step);

  // The state change and its chained audit row commit together, or neither.
  // 'dispatched' queues the sequence for transmit (dispatch_status pending);
  // it is not yet sent.
  await applySequenceChangeWithAudit(
    {
      /* COMPARE-AND-SET on the status this transition was authorized against.
         `seq.status` was read at the top of this function, and everything since —
         three queries in governedSignatureRefusal, deriveGovernedTargetBinding,
         and the whole dispatch readiness assessment including an external
         validator call — is a window in which another author can move the same
         sequence. Without the predicate both callers' UPDATEs applied, each
         spending its own signature and each writing a §11.10(e) row, so the
         ledger recorded two irreversible transitions from a state only one of
         them actually observed. */
      text: toStatus === 'frozen'
        ? `UPDATE ectd_sequences SET status = $1, updated_at = NOW(), frozen_at = NOW() WHERE id = $2 AND organization_id = $3 AND deleted_at IS NULL AND status = $4`
        : `UPDATE ectd_sequences SET status = $1, updated_at = NOW(), dispatch_status = 'pending' WHERE id = $2 AND organization_id = $3 AND deleted_at IS NULL AND status = $4`,
      params: [toStatus, id, ctx.organizationId, seq.status],
      noRowsRefusal:
        `Sequence ${id} is no longer in state '${seq.status}' — it changed while this ${step} was being authorized. ` +
        `Re-check the sequence and sign again if the transition still applies.`,
    },
    {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: STEP_AUDIT_ACTION[step],
      resourceId: id,
      details: {
        from: seq.status,
        to: toStatus,
        signatureActionId,
        validationErrors: assessment.validationErrors,
        unacknowledgedShadowCriticals: assessment.unacknowledgedShadowCriticals,
      },
    },
  );
  logger.info('Governed sequence transition applied', { id, toStatus, organizationId: ctx.organizationId });
  return getSequence(id, ctx);
}

/** Freeze a validated sequence. Governed: requires e-signature + a clear dispatch gate. */
export function freezeSequence(
  id: number,
  ctx: { organizationId: number; userId: number },
  signatureActionId: string
): Promise<EctdSequence> {
  return applyGovernedSequenceTransition(id, 'frozen', ctx, signatureActionId);
}

/** Mark a frozen sequence dispatched. Governed: requires e-signature + a clear gate.
 *  This records intent; actual transmission stays behind transmit_submission. */
export function dispatchSequence(
  id: number,
  ctx: { organizationId: number; userId: number },
  signatureActionId: string
): Promise<EctdSequence> {
  return applyGovernedSequenceTransition(id, 'dispatched', ctx, signatureActionId);
}

// ── Transmit (the TRANSMIT step — assemble → send to the agency gateway) ──────
//
// Connects a DISPATCHED sequence to the real agency gateway: it re-verifies the
// e-signature + dispatch gate, assembles the package bytes, selects the regional
// gateway, and transmits — but ONLY when the org has credentials for that
// gateway+environment (otherwise it reports `gateway_not_configured` honestly
// rather than failing). The gateway implementation persists the
// submission_transmittals record and performs the real transport (AS2 / OAuth2 /
// mTLS+HMAC). Tenant-scoped + audited.

/**
 * Select the agency gateway for a submission by region AND client type. The EU
 * splits by product class: device/IVD (mdx|ivd) register through EUDAMED, while
 * drug/biologic dossiers go through CESP. FDA (incl. eSTAR) routes through ESG;
 * Japan through the PMDA gateway.
 */
export function selectGateway(
  region: string,
  clientType: string
): { gwRegion: string; gwName: string } | null {
  switch (region) {
    case 'fda':
      return { gwRegion: 'fda', gwName: 'esg' };
    case 'jp':
    case 'pmda':
      return { gwRegion: 'pmda', gwName: 'pmda_gateway' };
    case 'eu':
    case 'ema':
      return clientType === 'mdx' || clientType === 'ivd'
        ? { gwRegion: 'ema', gwName: 'eudamed' }
        : { gwRegion: 'ema', gwName: 'cesp' };
    case 'ca':
      return { gwRegion: 'ca', gwName: 'hc_cesg' };
    case 'uk':
      return { gwRegion: 'uk', gwName: 'mhra_gateway' };
    case 'cn':
      return { gwRegion: 'cn', gwName: 'nmpa_gateway' };
    case 'au':
      return { gwRegion: 'au', gwName: 'tga_ebs' };
    case 'ch':
      return { gwRegion: 'ch', gwName: 'swissmedic_egateway' };
    case 'br':
      return { gwRegion: 'br', gwName: 'anvisa_gateway' };
    case 'in':
      return { gwRegion: 'in', gwName: 'cdsco_sugam' };
    case 'kr':
      return { gwRegion: 'kr', gwName: 'mfds_dbio' };
    case 'sg':
      return { gwRegion: 'sg', gwName: 'hsa_prism' };
    default:
      return null;
  }
}

/** Project a gateway transmit status onto the sequence's coarse dispatch_status. */
/**
 * Why a dispatched sequence must not be transmitted again, or null. The only
 * guard was status === 'dispatched', which transmit never changes, so a second
 * call — same signature — produced a second real transmittal at the agency.
 * A rejected transmission may be retried; a sent or acknowledged one may not.
 */
export const TRANSMITTING_STATUS = 'transmitting';

export function resendRefusal(dispatchStatus: string | null | undefined): string | null {
  if (dispatchStatus === TRANSMITTING_STATUS) {
    return `A transmit of this sequence is already in flight (dispatch status '${dispatchStatus}'). It is not sent again while that attempt is unresolved — confirm at the agency whether the package arrived before retrying.`;
  }
  if (dispatchStatus === 'sent' || dispatchStatus === 'acknowledged') {
    return `Sequence was already transmitted (dispatch status '${dispatchStatus}'); it is not sent again. A correction is a new sequence.`;
  }
  return null;
}

function toDispatchStatus(status: string): 'sent' | 'acknowledged' | 'rejected' {
  if (status === 'rejected' || status === 'validation_failed') return 'rejected';
  if (status === 'ack3_received' || status === 'validation_passed' || status === 'completed') return 'acknowledged';
  return 'sent';
}

export interface TransmitSequenceParams {
  sequenceId: number;
  ctx: { organizationId: number; userId: number };
  signatureActionId: string;
  /**
   * Required. This defaulted to 'production' — the exact defect
   * submission-gateways/types.ts records as the reason TransmitAuthorization
   * exists — so an omitted environment sent the package to the live agency
   * endpoint.
   */
  environment?: 'staging' | 'production';
  /**
   * The agency application number (IND/NDA/BLA). Required to transmit — an
   * absent one used to be spelled UNASSIGNED-SEQ-<id> in the backbone and on
   * the SFTP path and sent anyway. Both stay optional in the TYPE so the HTTP
   * route's optional fields still compile; transmitSequence refuses at runtime.
   */
  applicationId?: string;
  sponsorId?: string;
  sponsorName?: string;
}

export interface TransmitSequenceResult {
  transmitted: boolean;
  /** Set when not transmitted (e.g. 'gateway_not_configured'). */
  reason?: string;
  /**
   * What happened to the §11.10(e) row for a transmit that was NOT performed.
   *
   * WO-16C #133. Set ONLY on the `gateway_not_configured` return below, which is
   * the one audit write in this function that goes through `recordAuditRow`; it
   * was `await auditService.logAction({…})` at statement position, so the
   * `transmitted: false` answer was identical whether or not the attempt was
   * recorded anywhere. Deliberately a key of its own: the successful path's
   * `ECTD_TRANSMITTED` row is written by `applySequenceChangeWithAudit` inside
   * the same transaction as the dispatch_status update and rolls that update
   * back if it cannot be written, so it needs no field here — and because this
   * key is never set on that path, it can never be read as that row's outcome.
   */
  skipAudit?: AuditRowOutcome;
  region: string;
  gateway: string;
  transmittalId?: number;
  transmissionId?: string | null;
  status?: string;
  dispatchStatus: string;
  /**
   * Package checks the transmit guard ran that FAILED without blocking (a
   * flag-gated check not enforced here), as "name: detail". null = the guard
   * reported nothing, which is not "all passed". Set on a performed transmit.
   */
  preTransmitFailedChecks?: string[] | null;
  /** The transmit guard's warnings (e.g. evidence it could not check). */
  preTransmitWarnings?: string[] | null;
}

/**
 * Claim the transmit slot with a COMPARE-AND-SET, before any bytes leave.
 *
 * `dispatch_status` is the only thing preventing a second real transmission to
 * an agency, and it used to be read at the top of transmitSequence and written
 * only AFTER the wire. Everything in between — both gates, the readiness
 * assessment, package assembly, and the AS2/SFTP transfer itself — was a window
 * in which a second caller read the same 'pending', passed the same guard, and
 * transmitted the same sequence again. The single-use signature check could not
 * catch it either: it looks for an audit row that is written after the transfer.
 *
 * Taking the claim here narrows that to a single atomic UPDATE. The predicate is
 * the value that was read, so exactly one concurrent caller wins and the loser
 * is refused with the ordinary INVALID_STATE wording.
 *
 * It is deliberately NOT inside applySequenceChangeWithAudit: that helper rolls
 * its state change back when the §11.10(e) row cannot be written, which is right
 * for freeze but wrong once a package is already at the agency — it left
 * dispatch_status at 'pending' with the bytes delivered, so the operator's retry
 * sent them a second time. The claim commits on its own and therefore survives
 * that rollback.
 */
async function claimTransmitSlot(sequenceId: number, organizationId: number): Promise<boolean> {
  const res = await pool.query(
    `UPDATE ectd_sequences
        SET dispatch_status = $3, updated_at = NOW()
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
        AND status = 'dispatched'
        AND (dispatch_status IS NULL OR dispatch_status IN ('pending', 'rejected'))
      RETURNING id`,
    [sequenceId, organizationId, TRANSMITTING_STATUS],
  );
  return (res.rowCount ?? res.rows?.length ?? 0) > 0;
}

/**
 * Release a claim taken for an attempt that failed BEFORE the wire, so a
 * packaging error does not wedge the sequence. Only ever called on the pre-wire
 * path: once gw.transmit has been entered, delivery is ambiguous and the claim
 * is deliberately left standing for a human to resolve.
 */
async function releaseTransmitSlot(sequenceId: number, organizationId: number): Promise<void> {
  await pool.query(
    `UPDATE ectd_sequences SET dispatch_status = 'pending', updated_at = NOW()
      WHERE id = $1 AND organization_id = $2 AND dispatch_status = $3`,
    [sequenceId, organizationId, TRANSMITTING_STATUS],
  );
}

/**
 * Transmit a dispatched sequence to its regional agency gateway. Governed:
 * requires a valid e-signature on the sequence target AND a clear dispatch gate.
 * Real transmission only occurs when the gateway is configured for the org.
 */
export async function transmitSequence(params: TransmitSequenceParams): Promise<TransmitSequenceResult> {
  const { sequenceId, ctx, signatureActionId } = params;
  if (params.environment !== 'staging' && params.environment !== 'production') {
    throw new SubmissionError('VALIDATION', 'Transmit requires an explicit environment: staging or production.');
  }
  const environment = params.environment;
  const applicationId = typeof params.applicationId === 'string' ? params.applicationId.trim() : '';
  if (!applicationId || /^UNASSIGNED/i.test(applicationId)) {
    throw new SubmissionError(
      'VALIDATION',
      'Transmit requires the agency application number; a sequence with none recorded is assembled for inspection only, never sent.',
    );
  }

  const seq = await getSequence(sequenceId, ctx);
  if (seq.status !== 'dispatched') {
    throw new SubmissionError('INVALID_STATE', `Sequence must be dispatched before transmit (current: ${seq.status}).`);
  }
  const resend = resendRefusal(seq.dispatchStatus);
  if (resend) throw new SubmissionError('INVALID_STATE', resend);

  // Gate 1 — Part 11 e-signature on this sequence, for transmit, by this actor.
  const target = `ectd-sequence:${sequenceId}`;
  const refusal = await governedSignatureRefusal(signatureActionId, target, ctx, 'transmit');
  if (refusal !== null) {
    throw new SubmissionError(
      'GOVERNED_REQUIRED',
      `A valid e-signature is required: sign ${target} via POST /api/c2c/actions/sign with intent 'transmit', then pass its actionId. Refused: ${refusal}.`
    );
  }

  // Gate 2 — deterministic dispatch gate must still be clear (defense in depth).
  const { assessSequenceDispatchReadiness } = await import('../ectd/assess-dispatch-readiness');
  const assessment = await assessSequenceDispatchReadiness({ sequenceId, organizationId: ctx.organizationId });
  if (!assessment.gate.cleared) {
    throw new SubmissionError('DISPATCH_BLOCKED', `Dispatch gate blocks transmit: ${assessment.gate.blockers.join(' ')}`);
  }

  // Route by region AND client type (EU device/IVD → EUDAMED, else CESP).
  const submission = await getSubmission(seq.submissionId, ctx);
  const route = selectGateway(seq.region, submission.clientType);
  if (!route) {
    throw new SubmissionError('VALIDATION', `No transmit gateway is mapped for region "${seq.region}".`);
  }

  const { getGateway } = await import('../submission-gateways/index');
  // gwRegion and gwName are always valid Region/GatewayName values returned by selectGateway
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gw = getGateway(route.gwRegion as any, route.gwName as any);

  // Honest: only transmit when the org has credentials for this gateway+env.
  if (!(await gw.isConfigured(ctx.organizationId, environment))) {
    // Part 11 §11.10(e) for an attempt that changed nothing: no package was
    // assembled, no bytes left the server, and no row was updated, so there is
    // nothing here to revert and the refusal itself is already reported to the
    // caller in `reason`. This audit row is nonetheless the only place the
    // attempt is persisted at all, so its loss is reported too, in `skipAudit`,
    // rather than leaving "we never tried" and "we tried and could not record
    // it" as the same response (WO-16C #133).
    const skipAudit = await recordAuditRow({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'ECTD_TRANSMIT_SKIPPED',
      resourceType: 'ectd_sequence',
      resourceId: sequenceId,
      details: { region: seq.region, gateway: route.gwName, reason: 'gateway_not_configured', environment },
    });
    return {
      transmitted: false,
      reason: 'gateway_not_configured',
      skipAudit,
      region: seq.region,
      gateway: route.gwName,
      dispatchStatus: seq.dispatchStatus ?? 'pending',
    };
  }

  /* Claim the send before a single byte is assembled or transmitted. Past this
     point a concurrent caller is refused by the compare-and-set rather than by a
     status it read minutes ago. */
  if (!(await claimTransmitSlot(sequenceId, ctx.organizationId))) {
    const fresh = await getSequence(sequenceId, ctx);
    throw new SubmissionError(
      'INVALID_STATE',
      resendRefusal(fresh.dispatchStatus) ??
        `Sequence ${sequenceId} is no longer in a transmittable state (dispatch status '${fresh.dispatchStatus ?? 'unknown'}').`,
    );
  }

  // Assemble the package bytes, then hand them to the gateway. A failure
  // anywhere below and BEFORE gw.transmit released nothing to the agency, so the
  // claim taken above is released and the sequence stays transmittable.
  const { assembleSequence } = await import('../ectd/assemble-from-core');
  let assembled;
  try {
    assembled = await assembleSequence({
    sequenceId,
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    // Never fabricate an agency identifier (regulatory-identifiers.ts): these
    // become <application-number>/<procedure-number>, <id>/<company-id> and
    // <name>/<company-name> in the regional backbone, and the application id is
    // also a package filename component. An unassigned value SAYS it is
    // unassigned, in the wording the transmit path already uses.
    applicationId,
      sponsorId: params.sponsorId ?? `UNASSIGNED-ORG-${ctx.organizationId}`,
      sponsorName: params.sponsorName ?? `UNASSIGNED (organization ${ctx.organizationId})`,
    });
  } catch (err) {
    await releaseTransmitSlot(sequenceId, ctx.organizationId);
    throw err;
  }

  // A dossier transmitted to an agency must physically contain every leaf's
  // file. `assemble` surfaces every leaf whose source could not be materialized
  // into the package — and the packager DROPS those leaves from the ZIP
  // (resolveFile → null → skipped). That is true for BOTH a genuine defect (a
  // coauthor/unified row missing in the org, or an unsupported document_table)
  // AND a known-external pointer (vault S3 / ctd_onboarding upload) whose bytes
  // were not fetched into the package: in either case the transmitted sequence
  // would be MISSING that document. There is no "external reference" in an eCTD
  // backbone — a leaf resolves to a file inside the sequence. So fail closed on
  // ANY unresolved leaf (release the staged bundle and block), classifying the
  // cause only for the operator message.
  const unresolved = assembled.unresolvedLeaves;
  if (unresolved.length > 0) {
    await assembled.cleanup();
    const isExternal = (l: { documentTable: string | null }) =>
      externalDocumentTableReason(l.documentTable) !== null;
    const defects = unresolved.filter((l) => !isExternal(l));
    const external = unresolved.filter(isExternal);
    const parts: string[] = [];
    if (defects.length > 0) {
      parts.push(
        `${defects.length} reference a document that could not be assembled ` +
          `(${defects.map((d) => `${d.documentTable}:${d.documentId}`).join(', ')})`,
      );
    }
    if (external.length > 0) {
      parts.push(
        `${external.length} external-storage document(s) (vault/onboarding) whose bytes were not materialized into the package ` +
          `(${external.map((d) => `${d.documentTable}:${d.documentId}`).join(', ')})`,
      );
    }
    await releaseTransmitSlot(sequenceId, ctx.organizationId);
    throw new SubmissionError(
      'DISPATCH_BLOCKED',
      `Transmit blocked — the transmitted sequence would be missing ${unresolved.length} leaf file(s): ${parts.join('; ')}. ` +
        `Every eCTD leaf must be physically present in the package.`,
    );
  }

  // 2026-09-22 (W5/D7): two more ways a sequence reached the gateway missing
  // what the author placed — a leaf left out of the ZIP (`skipped`) and a draft
  // leaf shipped in it (`unfinalized`) — both computed by assembly and read by
  // nobody here. See assembledTransmitBlockers. The governed freeze and dispatch
  // now refuse on the same rule before the leaves lock (assertSequencePackageable),
  // so this is the re-check at the irreversible step; the claim is released
  // because nothing was sent.
  const { assembledTransmitBlockers } = await import('../ectd/assemble-from-core');
  const gaps = assembledTransmitBlockers(assembled);
  if (gaps.length > 0) {
    await assembled.cleanup();
    await releaseTransmitSlot(sequenceId, ctx.organizationId);
    throw new SubmissionError(
      'DISPATCH_BLOCKED',
      `Transmit blocked — ${gaps.join('; ')}. A transmitted sequence must carry every placed leaf, and only approved documents.`,
    );
  }

  let result;
  try {
    result = await gw.transmit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      programId: null,
      packageId: null,
      bundle: assembled.bundle,
      environment,
      submissionType: seq.type ?? undefined,
      metadata: { applicationId, sequence: seq.sequenceNumber, environment },
      // Gate 1 above already verified this signature governs THIS sequence and
      // was made by THIS actor; the gateway layer now requires that proof to be
      // named rather than merely to have happened somewhere up the stack.
      authorization: {
        kind: 'governed-signature',
        signatureActionId,
        actorUserId: ctx.userId,
      },
    });
  } catch (err) {
    // The guard refused before handing anything to the gateway: nothing was
    // sent, so the claim is released and the sequence stays transmittable.
    // Any other failure may have reached the agency and is left for a human.
    // 2026-09-23 (W5/D7).
    const { refusedBeforeWire } = await import('../submission-gateways/index');
    if (refusedBeforeWire(err)) await releaseTransmitSlot(sequenceId, ctx.organizationId);
    throw err;
  } finally {
    // The gateway has consumed the bundle bytes (or failed); either way the
    // staged temp package is no longer needed.
    await assembled.cleanup();
  }

  const dispatchStatus = toDispatchStatus(result.status);
  // null = the guard reported nothing (never read as "all passed").
  const failedPreTransmitChecks = result.preTransmit
    ? result.preTransmit.checks.filter((c) => !c.passed).map((c) => `${c.name}: ${c.detail}`)
    : null;
  await applySequenceChangeWithAudit(
    {
      // Predicated on the claim taken before the wire: this row is the one that
      // resolves THIS attempt. If the §11.10(e) write fails, applySequenceChange-
      // WithAudit rolls this back and the sequence stays 'transmitting' — bytes
      // are already at the agency, so the correct posture is a state a human must
      // resolve, not 'pending', which silently invited a second send.
      text: `UPDATE ectd_sequences SET dispatch_status = $1, updated_at = NOW() WHERE id = $2 AND organization_id = $3 AND dispatch_status = $4`,
      params: [dispatchStatus, sequenceId, ctx.organizationId, TRANSMITTING_STATUS],
      noRowsRefusal:
        `Sequence ${sequenceId} was no longer the in-flight transmit when the result came back; ` +
        `its dispatch status was resolved by something else. The package WAS handed to the gateway — ` +
        `confirm at the agency before any further action.`,
    },
    {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'ECTD_TRANSMITTED',
      resourceId: sequenceId,
      details: {
        region: seq.region,
        gateway: route.gwName,
        transmittalId: result.transmittalId,
        transmissionId: result.transmissionId ?? null,
        status: result.status,
        environment,
        signatureActionId,
        // The package checks that FAILED without blocking, and the guard's
        // warnings, on the §11.10(e) record of the send (2026-09-22, W5/D7).
        preTransmitFailedChecks: failedPreTransmitChecks,
        preTransmitWarnings: result.preTransmit?.warnings ?? null,
      },
    },
  );
  logger.info('Transmitted sequence to agency gateway', { sequenceId, region: seq.region, gateway: route.gwName, status: result.status });

  return {
    transmitted: true,
    region: seq.region,
    gateway: route.gwName,
    transmittalId: result.transmittalId,
    transmissionId: result.transmissionId,
    status: result.status,
    dispatchStatus,
    preTransmitFailedChecks: failedPreTransmitChecks,
    preTransmitWarnings: result.preTransmit?.warnings ?? null,
  };
}

// ── Leaves (Builder tree) ──────────────────────────────────────────────────

export async function listLeaves(
  sequenceId: number,
  ctx: { organizationId: number }
): Promise<SubmissionLeaf[]> {
  await getSequence(sequenceId, ctx);
  const rows = await db
    .select()
    .from(submissionLeaves)
    .where(
      and(
        eq(submissionLeaves.sequenceId, sequenceId),
        eq(submissionLeaves.organizationId, ctx.organizationId),
        isNull(submissionLeaves.deletedAt)
      )
    )
    .orderBy(submissionLeaves.sectionCode);
  return rows as SubmissionLeaf[];
}

export interface UpsertLeafInput {
  sequenceId: number;
  leafId?: number; // when set, update; else insert
  sectionCode: string;
  title: string;
  granularity?: string | null;
  lifecycleOp?: string;
  documentTable?: string | null;
  documentId?: number | null;
  /** The uuid half of the polymorphic reference, for uuid-keyed stores
   *  (vault.documents). A leaf carries this OR documentId, never both. */
  documentUuid?: string | null;
  documentType?: string | null;
  parentLeafId?: number | null;
  /** MD5 (or other) checksum of the leaf's rendered bytes, for the eCTD index-md5. */
  checksum?: string | null;
}

/**
 * Tenancy + source pin for a leaf's document pointer, one entry per document
 * table the READ side (server/services/ectd/leaf-source-resolver.ts) can
 * materialize.
 *
 * ── Why a table-keyed dispatch and not another `if` ──────────────────────────
 * This block used to be two hand-written `if (input.documentTable === …)`
 * branches — coauthor_documents and rendered_leaf_files — under a comment
 * promising "no dangling cross-tenant document pointers". The resolver could
 * materialize five tables. The other three (unified_documents,
 * ctd_onboarding_documents, c2c_document_sections) were written straight
 * through: any id, from any organization or from nothing at all, was stored
 * verbatim and left unpinned. The read side fails closed per table, so no
 * foreign bytes ever reached a package — but dispatch readiness only checks
 * that a pointer is PRESENT, so such a sequence reads as READY and only falls
 * over at assembly as an `unresolved` leaf.
 *
 * Each verifier proves the document resolves IN THE CALLER'S ORGANIZATION
 * (throwing FORBIDDEN otherwise) and returns the digest to pin, taken from the
 * SAME org-scoped read — a second query could race a concurrent edit and pin
 * content the tenancy check never saw. Its predicate mirrors the resolver's for
 * that table exactly; when a new source is added there, the drift guard in
 * __tests__/leaf-source-tenancy.pglite.test.ts fails until it is added here.
 *
 * NULL, never sha256(''), is the pin for every "nothing to pin" case: sha256('')
 * is a real constant that would look exactly like a pin that had been taken and
 * would then "match" any other empty document forever.
 */
type LeafSourceVerifier = (documentId: number, organizationId: number) => Promise<string | null>;

const forbidRef = () =>
  new SubmissionError('FORBIDDEN', 'Referenced document not found for this organization.');

const sha256Hex = (value: string | Buffer): string =>
  createHash('sha256')
    .update(typeof value === 'string' ? Buffer.from(value, 'utf8') : value)
    .digest('hex');

const LEAF_SOURCE_VERIFIERS: Record<string, LeafSourceVerifier> = {
  /** Authoring store. Pin = sha256 of the stored body text. */
  coauthor_documents: async (documentId, organizationId) => {
    const [doc] = await db
      .select({ id: coauthorDocuments.id, content: coauthorDocuments.content })
      .from(coauthorDocuments)
      .where(and(eq(coauthorDocuments.id, documentId), eq(coauthorDocuments.organizationId, organizationId)))
      .limit(1);
    if (!doc) throw forbidRef();
    return typeof doc.content === 'string' && doc.content.length > 0 ? sha256Hex(doc.content) : null;
  },

  /* Bytes this server rendered for a filing. The pin is the sha256 recorded
     when the bytes were rendered, which is exactly what the resolver
     re-verifies before staging them. */
  rendered_leaf_files: async (documentId, organizationId) => {
    const [rendered] = await db
      .select({ sha256: renderedLeafFiles.sha256 })
      .from(renderedLeafFiles)
      .where(and(eq(renderedLeafFiles.id, documentId), eq(renderedLeafFiles.organizationId, organizationId)))
      .limit(1);
    if (!rendered) throw forbidRef();
    return rendered.sha256;
  },

  /* Unified workflow document: the row is the tenant boundary, the body lives
     in the latest workflow_document_versions row (read org-scoped directly, as
     the resolver does, not only transitively through the parent).

     The pin is over JSON.stringify(version.content). That is a CHANGE
     DETECTOR, not a canonical serialization: it depends on the driver
     preserving stored key order, so a pin that stops matching after a driver or
     column-type change is not by itself tamper evidence. It is pinned this way
     because an inspector can re-derive it from that single column; digesting
     rendered text instead would drift with the renderer. */
  unified_documents: async (documentId, organizationId) => {
    const [doc] = await db
      .select({ id: unifiedDocuments.id })
      .from(unifiedDocuments)
      .where(and(eq(unifiedDocuments.id, documentId), eq(unifiedDocuments.organizationId, organizationId)))
      .limit(1);
    if (!doc) throw forbidRef();
    const [version] = await db
      .select({ content: workflowDocumentVersions.content })
      .from(workflowDocumentVersions)
      .where(
        and(
          eq(workflowDocumentVersions.documentId, documentId),
          eq(workflowDocumentVersions.organizationId, organizationId),
        ),
      )
      .orderBy(desc(workflowDocumentVersions.version))
      .limit(1);
    return version && version.content != null ? sha256Hex(JSON.stringify(version.content)) : null;
  },

  /* Uploaded CTD binary. Tenancy is the row's organization_id; the pin is the
     sha256 of the upload's bytes.

     The byte read fails SOFT (pin NULL when the file is missing/rotated): the
     placement is a metadata write, and making it depend on disk availability
     would refuse a leaf the assembler can still legitimately report as
     unresolved. Tenancy itself never fails soft — the row lookup above already
     decided that. */
  ctd_onboarding_documents: async (documentId, organizationId) => {
    const [doc] = await db
      .select({ storagePath: ctdOnboardingDocuments.storagePath })
      .from(ctdOnboardingDocuments)
      .where(and(eq(ctdOnboardingDocuments.id, documentId), eq(ctdOnboardingDocuments.organizationId, organizationId)))
      .limit(1);
    if (!doc) throw forbidRef();
    let buf: Buffer | null;
    try {
      buf = await readLocalUploadBuffer(doc.storagePath);
    } catch {
      buf = null;
    }
    return buf && buf.length > 0 ? sha256Hex(buf) : null;
  },

  /* Governed authoring store (MDR/IVDR). c2c_document_sections carries NO
     organization column: its tenant scope is the parent c2c_documents.org_id,
     so the JOIN below IS the tenant gate — exactly the predicate the resolver
     uses. Issued through drizzle's `db.execute` so the same PGlite harness the
     sibling branches use covers it. Pin = sha256 of the canonical section text
     (sectionPlainText), the same reading of the body the packager renders. */
  c2c_document_sections: async (documentId, organizationId) => {
    const res = await db.execute(sql`
      SELECT s.content
        FROM c2c_document_sections s
        JOIN c2c_documents d ON d.id = s.document_id
       WHERE s.id = ${documentId} AND d.org_id = ${organizationId}
       LIMIT 1`);
    const rows = ((res as unknown as { rows?: unknown[] }).rows ?? res) as Array<{ content: unknown }>;
    if (!rows[0]) throw forbidRef();
    // jsonb arrives parsed from node-postgres and PGlite; tolerate a driver
    // that hands back the serialized string.
    let content: unknown = rows[0].content;
    if (typeof content === 'string') {
      try { content = JSON.parse(content); } catch { /* keep as text */ }
    }
    const text = sectionPlainText(content).trim();
    return text ? sha256Hex(text) : null;
  },
};

/**
 * The document tables upsertLeaf verifies tenancy for. Exported so the drift
 * guard can assert this set still covers everything the read-side resolver
 * branches on — a new resolver source with no verifier here would be storable
 * unchecked and unpinned, which is the defect this dispatch closes.
 */
/**
 * Verifiers for UUID-KEYED stores. Same contract as LEAF_SOURCE_VERIFIERS —
 * prove the document resolves in the caller's organization, return the digest
 * to pin, take both from one org-scoped read — but keyed by uuid rather than by
 * integer, because `submission_leaves` addresses two key spaces
 * (migrations/20260917b_submission_leaf_document_uuid.sql).
 *
 * Kept as a SECOND map rather than widening every existing verifier's
 * signature: the integer verifiers are correct and their predicates mirror the
 * resolver's branch for their table exactly, and rewriting five of them to
 * carry a parameter four will never use is churn on the code path that decides
 * what reaches a regulator.
 */
type LeafSourceUuidVerifier = (documentUuid: string, organizationId: number) => Promise<string | null>;

/** Guards the ::uuid cast; a malformed value would raise 22P02 rather than a refusal. */
const LEAF_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const LEAF_SOURCE_UUID_VERIFIERS: Record<string, LeafSourceUuidVerifier> = {
  /* The vault. Scoped THROUGH THE PROGRAMME, which is the authoritative owner
     of a vault document — vault.documents carries organization_id too, but it
     is nullable by design (unattributable rows are quarantined) and so is
     attribution rather than a scope to filter on. Pin = content_hash, which is
     exactly what the resolver re-verifies before staging the bytes, so a source
     altered after filing is detectable at assembly. */
  vault_documents: async (documentUuid, organizationId) => {
    if (!LEAF_UUID_RE.test(documentUuid)) throw forbidRef();
    const res = await pool.query(
      `SELECT d.content_hash
         FROM vault.documents d
        WHERE d.id = $1::uuid
          AND d.deleted_at IS NULL
          AND EXISTS (
            SELECT 1 FROM regulatory_programs rp
             WHERE rp.id = d.program_id
               AND rp.organization_id = $2
               AND rp.deleted_at IS NULL
          )
        LIMIT 1`,
      [documentUuid, organizationId],
    );
    const row = res.rows[0] as { content_hash: string | null } | undefined;
    if (!row) throw forbidRef();
    return row.content_hash ?? null;
  },
};

/** The document tables that name their document by UUID rather than by integer. */
export const LEAF_UUID_KEYED_TABLES: ReadonlySet<string> = new Set(Object.keys(LEAF_SOURCE_UUID_VERIFIERS));

export const LEAF_SOURCE_TENANCY_TABLES: ReadonlySet<string> = new Set([
  ...Object.keys(LEAF_SOURCE_VERIFIERS),
  ...Object.keys(LEAF_SOURCE_UUID_VERIFIERS),
]);

/**
 * Prove the referenced document belongs to `organizationId` and return the
 * digest to pin on the leaf (null when there is nothing to pin).
 *
 * A table with no registered verifier (vault_documents — UUID-keyed and
 * program-scoped, so an integer leaf id cannot address it tenant-safely — or an
 * unknown string) keeps today's behaviour: stored unverified and unpinned, and
 * surfaced as an unresolved leaf at assembly. Widening that is a separate
 * decision; the drift guard exists so it is a decision rather than an omission.
 */
async function verifyLeafSource(
  documentTable: string,
  ref: { documentId: number | null; documentUuid: string | null },
  organizationId: number,
): Promise<string | null> {
  if (ref.documentUuid) {
    const verifyUuid = LEAF_SOURCE_UUID_VERIFIERS[documentTable];
    return verifyUuid ? verifyUuid(ref.documentUuid, organizationId) : null;
  }
  if (ref.documentId) {
    const verify = LEAF_SOURCE_VERIFIERS[documentTable];
    return verify ? verify(ref.documentId, organizationId) : null;
  }
  return null;
}

/**
 * A created or updated leaf placement, with what happened to the §11.10(e)
 * record of that placement carried on it.
 *
 * WO-16C #133. Both audit writes in `upsertLeaf` — `LEAF_CREATED` on the insert
 * branch, `LEAF_UPDATED` on the update branch — were awaited at statement
 * position with their `AuditWriteResult` discarded. A placement decides where a
 * document is filed in a package that goes to an agency, and every write path
 * funnels through here: the REST route (PUT
 * /api/submissions/sequences/:seqId/leaves), AnA's `place_into_sequence`, the
 * IND lifecycle persistence, the IND forms route and CMC Module 3 placement.
 * Each got a leaf row back and no way to tell a recorded placement from an
 * unrecorded one.
 *
 * Exactly ONE of the two rows is written per call — the branches are mutually
 * exclusive on `input.leafId` — so `auditTrail` is always that one row's
 * outcome and is never another row's under a borrowed name; which action it was
 * is the same distinction as which branch ran.
 */
export type UpsertedLeaf = SubmissionLeaf & { auditTrail: AuditRowOutcome };

/** Create or update a leaf placement. Refuses if the parent sequence is locked. */
/**
 * The section-code vocabulary this sequence's leaves are judged against, read
 * from its submission's `applicationType`.
 *
 * Fails SAFE, not open: a submission row that cannot be read gives `ctd`, the
 * strictest vocabulary and the one every submission in this product uses
 * today. A lookup failure must never widen what may be written into a package.
 */
async function placementVocabularyForSequence(
  seq: EctdSequence,
  ctx: { organizationId: number },
): Promise<PlacementVocabulary> {
  const rows = await db
    .select({ applicationType: submissions.applicationType })
    .from(submissions)
    .where(and(eq(submissions.id, seq.submissionId), eq(submissions.organizationId, ctx.organizationId)))
    .limit(1);
  // Defensive destructure rather than `const [row] =`: this read only decides
  // how STRICT the code gate is, and a shape it did not expect must narrow to
  // `ctd`, never throw a placement away.
  const applicationType = Array.isArray(rows) ? rows[0]?.applicationType : undefined;
  return vocabularyForApplicationType(applicationType ?? null);
}

export async function upsertLeaf(
  input: UpsertLeafInput,
  ctx: { organizationId: number; userId: number }
): Promise<UpsertedLeaf> {
  const seq = await getSequence(input.sequenceId, ctx);
  if (isSequenceLocked(seq.status)) {
    throw new SubmissionError('INVALID_STATE', `Sequence is ${seq.status}; its leaves are immutable.`);
  }

  /* The leaf's SECTION CODE decides where the document lands in the package:
     the packager derives the leaf's module, its folder and which backbone
     carries it from this string (regional-packager `leafPackagePath`). Nothing
     on the write path constrained it — the route schema takes any 64-character
     string and the placement dialog is a free text input whose own placeholder
     suggested `m1/us/1.2` — so a value that is not a CTD code became a FOLDER
     NAME, and a package shipped with a top-level `mm/m1-us-1-2/` directory and
     a backbone pointing into it.

     The gate is deliberately code-SHAPE, not published-heading membership: four
     of the codes this product itself writes (m1.5, m1.7, m1.9, m1.13 — the IND
     annual report among them) are absent from FDA's published Module 1 table,
     so a placeability gate here would refuse the product's own filings. That
     mismatch is real and reported separately; it is not a reason to reject a
     well-formed code.

     The value is stored EXACTLY as given. Readers match on the spelling that
     was written (the IND checklist looks for `m1.1.1`), so canonicalising here
     would silently detach them from their own rows; the packager canonicalises
     when it derives the layout. */
  /* WHICH vocabulary the code is judged against is a property of the
     SUBMISSION TYPE, not of this function.

     This gate ran `normalizeCtdCode` on every code, which is right for an eCTD
     sequence and refused two whole submission types that do not file on CTD
     headings: a 510(k) files on eSTAR sections, and an IRB package files on
     artifact slots that are not numbered at all. The refusal read as a
     validation error about a malformed code, so it looked like a caller bug
     rather than a missing capability.

     Each type is now judged against its own vocabulary, strictly — the CTD
     branch is byte-for-byte the rule that was here, and an unknown or absent
     application type resolves to `ctd`, so every existing caller behaves
     exactly as before. A bare module ('3') is still a CONTAINER, never a
     place a document can go. */
  const vocabulary = await placementVocabularyForSequence(seq, ctx);
  const verdict = validateSectionCode(input.sectionCode, vocabulary);
  if (!verdict.ok) {
    throw new SubmissionError('VALIDATION', verdict.message ?? `Section code "${input.sectionCode}" is not valid for this submission.`);
  }

  /* The leaf's document pointer is POLYMORPHIC — `document_table` is a plain
     string. Nothing constrained it here, so a misspelled or invented table was
     stored verbatim, audited as a placement, and reported dispatch-CLEAR by the
     readiness validator (which only checks that a pointer is PRESENT); the
     mistake only surfaced at assembly, as an unresolvable leaf, typically at the
     end of a filing window. Refuse it at the write boundary instead — this is
     the single choke point every caller funnels through (the REST route, AnA's
     place_into_sequence, ind-lifecycle persistence and CMC placement). */
  if (input.documentTable != null && !isPlaceableDocumentTable(input.documentTable)) {
    throw new SubmissionError('VALIDATION', unplaceableDocumentTableMessage(input.documentTable));
  }

  /* THE KEY SPACE MUST MATCH THE TABLE. `submission_leaves` addresses two of
     them — integer `document_id` for most stores, uuid `document_uuid` for
     vault.documents — and this is the one place that rule is enforced.
     Deliberately here and not as a CHECK constraint: the constraint would have
     to name tables, which is exactly the vocabulary leaf-document-tables.ts
     owns and keeps in step with the resolver's real branches, and splitting one
     rule across a migration and a module is how the two drift.

     Both directions are refused, because both produce a leaf that looks placed
     and resolves to nothing: a vault leaf with only an integer cannot address
     its document, and an integer-keyed leaf carrying a uuid names a document in
     a store that has no uuids. */
  if (input.documentTable != null) {
    const uuidKeyed = LEAF_UUID_KEYED_TABLES.has(input.documentTable);
    if (uuidKeyed && input.documentId != null) {
      throw new SubmissionError(
        'VALIDATION',
        `"${input.documentTable}" is addressed by document_uuid, not document_id. Its documents are uuid-keyed; an integer cannot name one.`,
      );
    }
    if (!uuidKeyed && input.documentUuid != null) {
      throw new SubmissionError(
        'VALIDATION',
        `"${input.documentTable}" is addressed by document_id, not document_uuid. Only ${[...LEAF_UUID_KEYED_TABLES].sort().join(', ')} name a document by uuid.`,
      );
    }
    if (uuidKeyed && input.documentUuid == null) {
      throw new SubmissionError(
        'VALIDATION',
        `A leaf on "${input.documentTable}" must carry document_uuid — without it the leaf names no document and would be filed as unresolvable.`,
      );
    }
  }

  /* Tenancy + source pin for the document this leaf points at. One table-keyed
     step (LEAF_SOURCE_VERIFIERS above) covers every source the resolver can
     materialize: it proves the target belongs to the caller's org — no dangling
     cross-tenant document pointers — and returns the digest to pin.

     Source pin (GA ledger L23). The leaf records where the document lives and
     the MD5 of its RENDERED bytes; neither says what the SOURCE contained when
     it was filed. So "this went to the agency — is the document behind it still
     what went?" had no answer: `document_id` resolves to the document as it is
     now, and editing it after filing changes nothing on the leaf. */
  const documentContentSha256: string | null =
    input.documentTable && (input.documentId || input.documentUuid)
      ? await verifyLeafSource(
          input.documentTable,
          { documentId: input.documentId ?? null, documentUuid: input.documentUuid ?? null },
          ctx.organizationId,
        )
      : null;

  // A lifecycle op that supersedes a prior leaf (replace|append|delete) carries a
  // parentLeafId — the GUID of the leaf it acts on. That parent MUST belong to the
  // caller's org AND live in THIS sequence; otherwise the eCTD lifecycle chain
  // would link a modified-file operation to a leaf the tenant doesn't own or that
  // sits in another sequence, corrupting the index. (The document pointer above is
  // checked the same way; parentLeafId must not be the weaker link.)
  if (input.parentLeafId != null) {
    const [parent] = await db
      .select({ id: submissionLeaves.id })
      .from(submissionLeaves)
      .where(
        and(
          eq(submissionLeaves.id, input.parentLeafId),
          eq(submissionLeaves.sequenceId, input.sequenceId),
          eq(submissionLeaves.organizationId, ctx.organizationId),
          isNull(submissionLeaves.deletedAt)
        )
      )
      .limit(1);
    if (!parent) {
      throw new SubmissionError(
        'FORBIDDEN',
        'parentLeafId must reference a leaf in this sequence owned by this organization.'
      );
    }
  }

  if (input.leafId) {
    const [row] = await db
      .update(submissionLeaves)
      .set({
        sectionCode: input.sectionCode,
        title: input.title,
        granularity: input.granularity ?? null,
        ...(input.lifecycleOp ? { lifecycleOp: input.lifecycleOp } : {}),
        documentTable: input.documentTable ?? null,
        documentId: input.documentId ?? null,
        documentUuid: input.documentUuid ?? null,
        documentType: input.documentType ?? null,
        parentLeafId: input.parentLeafId ?? null,
        ...(input.checksum !== undefined ? { checksum: input.checksum } : {}),
        /* Re-pinned on every update, because an update can re-point the leaf at
           a different document — carrying the previous pin forward would attest
           to content this leaf no longer references. Clearing to NULL when the
           new target has no pinnable content is likewise correct: unknown. */
        documentContentSha256,
        documentPinnedAt: documentContentSha256 ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(submissionLeaves.id, input.leafId),
          eq(submissionLeaves.sequenceId, input.sequenceId),
          eq(submissionLeaves.organizationId, ctx.organizationId)
        )
      )
      .returning();
    if (!row) throw new SubmissionError('NOT_FOUND', 'Leaf not found for this organization/sequence.');
    // Part 11 §11.10(e). The UPDATE above is committed (and NOT_FOUND has already
    // been thrown if it matched nothing), so the re-placement is never undone
    // over a lost log row — reverting the pointer would leave the leaf attesting
    // to a document it no longer references. The caller is told instead.
    const auditTrail = await recordAuditRow({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'LEAF_UPDATED',
      resourceType: 'submission_leaf',
      resourceId: input.leafId,
      details: { sectionCode: input.sectionCode, lifecycleOp: input.lifecycleOp },
    });
    return { ...(row as SubmissionLeaf), auditTrail };
  }

  const [row] = await db
    .insert(submissionLeaves)
    .values({
      sequenceId: input.sequenceId,
      sectionCode: input.sectionCode,
      title: input.title,
      granularity: input.granularity ?? null,
      lifecycleOp: input.lifecycleOp ?? 'new',
      documentTable: input.documentTable ?? null,
      documentId: input.documentId ?? null,
      documentUuid: input.documentUuid ?? null,
      documentType: input.documentType ?? null,
      parentLeafId: input.parentLeafId ?? null,
      checksum: input.checksum ?? null,
      documentContentSha256,
      documentPinnedAt: documentContentSha256 ? new Date() : null,
      organizationId: ctx.organizationId,
      createdBy: ctx.userId,
    })
    .returning();
  // Part 11 §11.10(e), on the same terms as the update branch: the INSERT above
  // is committed, the placement stands, and the outcome rides out on the row.
  const auditTrail = await recordAuditRow({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: 'LEAF_CREATED',
    resourceType: 'submission_leaf',
    resourceId: row.id,
    details: { sequenceId: input.sequenceId, sectionCode: input.sectionCode },
  });
  return { ...(row as SubmissionLeaf), auditTrail };
}

/**
 * Remove a misplaced leaf from a DRAFT-stage sequence (BP-W1-6 find F05: a
 * wrong placement could only be corrected in place, never removed — the first
 * end-to-end chain exercise had to clean its own mistakes with SQL).
 *
 * Soft delete, because every reader of `submission_leaves` — listLeaves, the
 * assembler, dispatch readiness — already filters `deleted_at IS NULL`, and a
 * hard delete would erase the row an audit event refers to. Guards mirror
 * upsertLeaf: the sequence must belong to the caller's org and must not be
 * frozen/dispatched, and a leaf that another leaf's `parentLeafId` points at
 * cannot be removed — that would orphan the lifecycle chain.
 */
/**
 * What a removal did: which leaf was soft-deleted, and what happened to the
 * §11.10(e) record of the removal.
 *
 * WO-16C #133. This function returned `void`, and its audit write was awaited at
 * statement position with the `AuditWriteResult` discarded — so a caller had
 * nothing at all to distinguish a recorded removal from an unrecorded one. It
 * now returns the outcome. The removal is a SOFT delete, so the fact that the
 * leaf was withdrawn survives in `submission_leaves.deleted_at` independently of
 * this row; what the audit row adds is who withdrew it, when, and from which
 * section — which is why it is reported rather than being allowed to fail
 * silently, and why its loss is still not a reason to put the leaf back.
 *
 * DELETE /api/submissions/sequences/:seqId/leaves/:leafId answers 204 with an
 * empty body today and therefore does not yet forward this; carrying it into the
 * response is a change to that route, not to this service.
 */
export type RemovedLeaf = { leafId: number; auditTrail: AuditRowOutcome };

export async function removeLeaf(
  leafId: number,
  sequenceId: number,
  ctx: { organizationId: number; userId: number }
): Promise<RemovedLeaf> {
  const seq = await getSequence(sequenceId, ctx);
  if (isSequenceLocked(seq.status)) {
    throw new SubmissionError('INVALID_STATE', `Sequence is ${seq.status}; its leaves are immutable.`);
  }

  const [dependent] = await db
    .select({ id: submissionLeaves.id })
    .from(submissionLeaves)
    .where(
      and(
        eq(submissionLeaves.parentLeafId, leafId),
        eq(submissionLeaves.organizationId, ctx.organizationId),
        isNull(submissionLeaves.deletedAt)
      )
    )
    .limit(1);
  if (dependent) {
    throw new SubmissionError(
      'INVALID_STATE',
      'Another leaf’s lifecycle operation references this leaf; remove or re-point that leaf first.'
    );
  }

  const [row] = await db
    .update(submissionLeaves)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(submissionLeaves.id, leafId),
        eq(submissionLeaves.sequenceId, sequenceId),
        eq(submissionLeaves.organizationId, ctx.organizationId),
        isNull(submissionLeaves.deletedAt)
      )
    )
    .returning();
  if (!row) throw new SubmissionError('NOT_FOUND', 'Leaf not found for this organization/sequence.');

  // Part 11 §11.10(e). The soft delete above is committed and is not reinstated
  // when this write fails: un-deleting the leaf would put a document back into a
  // sequence the operator removed it from, which is a worse answer than a lost
  // log row. The action stands and the caller is told.
  const auditTrail = await recordAuditRow({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: 'LEAF_REMOVED',
    resourceType: 'submission_leaf',
    resourceId: leafId,
    details: { sequenceId, sectionCode: row.sectionCode },
  });
  return { leafId, auditTrail };
}

export default {
  createSubmission,
  createSubmissionTx,
  listSubmissions,
  getSubmission,
  createSequence,
  listSequences,
  transitionSequence,
  listLeaves,
  upsertLeaf,
  removeLeaf,
  canTransitionSequence,
  isSequenceLocked,
  SubmissionError,
};
