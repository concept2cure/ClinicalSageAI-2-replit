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
import type {
  Submission,
  EctdSequence,
  SubmissionLeaf,
} from '../../../shared/types/database';
import auditService, { writeChainedAuditRow } from '../auditService';
import { deriveGovernedTargetBinding, BINDING_BASIS } from '../part11/signature-persistence';
import { createScopedLogger } from '../../utils/logger';

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

export async function createSubmission(
  input: CreateSubmissionInput,
  ctx: { organizationId: number; userId: number }
): Promise<Submission> {
  const row = await insertSubmissionRow(db, input, ctx);
  await auditService.logAction({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: 'SUBMISSION_CREATED',
    resourceType: 'submission',
    resourceId: row.id,
    details: { applicationType: input.applicationType, primaryRegion: input.primaryRegion, clientType: input.clientType },
  });
  logger.info('Created submission', { submissionId: row.id, organizationId: ctx.organizationId });
  return row;
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

export async function createSequence(
  input: CreateSequenceInput,
  ctx: { organizationId: number; userId: number }
): Promise<EctdSequence> {
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
  await auditService.logAction({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: 'SEQUENCE_CREATED',
    resourceType: 'ectd_sequence',
    resourceId: row.id,
    details: { submissionId: input.submissionId, region: input.region, sequenceNumber: input.sequenceNumber },
  });
  return row as EctdSequence;
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

/** Transition a sequence's status, enforcing the pure transition rules + audit. */
export async function transitionSequence(
  id: number,
  toStatus: string,
  ctx: { organizationId: number; userId: number }
): Promise<EctdSequence> {
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
  const [row] = await db
    .update(ectdSequences)
    .set({ status: toStatus, updatedAt: new Date(), ...(frozenAt ? { frozenAt } : {}) })
    .where(and(eq(ectdSequences.id, id), eq(ectdSequences.organizationId, ctx.organizationId)))
    .returning();
  await auditService.logAction({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: toStatus === 'frozen' ? 'SEQUENCE_FROZEN' : 'SEQUENCE_TRANSITIONED',
    resourceType: 'ectd_sequence',
    resourceId: id,
    details: { from: seq.status, to: toStatus },
  });
  return row as EctdSequence;
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
    WHERE table_name = 'ectd_sequence'
      AND record_id = ${sequenceId}
      AND action IN ('SEQUENCE_FROZEN', 'SEQUENCE_DISPATCHED', 'ECTD_TRANSMITTED')
      AND (new_values::jsonb ->> 'signatureActionId') = ${signatureActionId}
    LIMIT 1
  `);
  if (((spent as { rows?: unknown[] }).rows?.length ?? 0) > 0) {
    return 'this sign action already authorized a governed transition; each step needs its own signature';
  }

  const esig = await db.execute(sql`
    SELECT bound_payload_digest, binding_basis FROM electronic_signatures
    WHERE organization_id = ${ctx.organizationId}
      AND signed_target = ${target}
      AND (signature_manifest::jsonb ->> 'actionId') = ${signatureActionId}
    LIMIT 1
  `);
  const sig = ((esig as unknown as { rows?: Array<{ bound_payload_digest: string | null; binding_basis: string | null }> }).rows ?? [])[0];
  if (!sig) return 'no electronic signature record is bound to this sign action';
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
  update: { text: string; params: unknown[] },
  audit: { organizationId: number; userId: number; action: string; resourceId: number; details: Record<string, unknown> },
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const res = (await client.query(update.text, update.params)) as { rowCount?: number | null };
    if (!res.rowCount) throw new SubmissionError('NOT_FOUND', 'Sequence not found for this organization.');
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

  // Gate 2 — deterministic dispatch gate (server-computed inputs; tamper-proof).
  const { assessSequenceDispatchReadiness } = await import('../ectd/assess-dispatch-readiness');
  const assessment = await assessSequenceDispatchReadiness({ sequenceId: id, organizationId: ctx.organizationId });
  if (!assessment.gate.cleared) {
    throw new SubmissionError(
      'DISPATCH_BLOCKED',
      `Dispatch gate blocks ${toStatus}: ${assessment.gate.blockers.join(' ')}`
    );
  }

  // The state change and its chained audit row commit together, or neither.
  // 'dispatched' queues the sequence for transmit (dispatch_status pending);
  // it is not yet sent.
  await applySequenceChangeWithAudit(
    {
      text: toStatus === 'frozen'
        ? `UPDATE ectd_sequences SET status = $1, updated_at = NOW(), frozen_at = NOW() WHERE id = $2 AND organization_id = $3 AND deleted_at IS NULL`
        : `UPDATE ectd_sequences SET status = $1, updated_at = NOW(), dispatch_status = 'pending' WHERE id = $2 AND organization_id = $3 AND deleted_at IS NULL`,
      params: [toStatus, id, ctx.organizationId],
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
export function resendRefusal(dispatchStatus: string | null | undefined): string | null {
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
  region: string;
  gateway: string;
  transmittalId?: number;
  transmissionId?: string | null;
  status?: string;
  dispatchStatus: string;
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
    await auditService.logAction({
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
      region: seq.region,
      gateway: route.gwName,
      dispatchStatus: seq.dispatchStatus ?? 'pending',
    };
  }

  // Assemble the package bytes, then hand them to the gateway.
  const { assembleSequence } = await import('../ectd/assemble-from-core');
  const assembled = await assembleSequence({
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
  const { EXTERNAL_DOCUMENT_TABLES } = await import('../ectd/leaf-source-resolver');
  const unresolved = assembled.unresolvedLeaves;
  if (unresolved.length > 0) {
    await assembled.cleanup();
    const isExternal = (l: { documentTable: string | null }) =>
      l.documentTable != null && l.documentTable in EXTERNAL_DOCUMENT_TABLES;
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
    throw new SubmissionError(
      'DISPATCH_BLOCKED',
      `Transmit blocked — the transmitted sequence would be missing ${unresolved.length} leaf file(s): ${parts.join('; ')}. ` +
        `Every eCTD leaf must be physically present in the package.`,
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
  } finally {
    // The gateway has consumed the bundle bytes (or failed); either way the
    // staged temp package is no longer needed.
    await assembled.cleanup();
  }

  const dispatchStatus = toDispatchStatus(result.status);
  await applySequenceChangeWithAudit(
    {
      text: `UPDATE ectd_sequences SET dispatch_status = $1, updated_at = NOW() WHERE id = $2 AND organization_id = $3`,
      params: [dispatchStatus, sequenceId, ctx.organizationId],
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
  documentType?: string | null;
  parentLeafId?: number | null;
  /** MD5 (or other) checksum of the leaf's rendered bytes, for the eCTD index-md5. */
  checksum?: string | null;
}

/** Create or update a leaf placement. Refuses if the parent sequence is locked. */
export async function upsertLeaf(
  input: UpsertLeafInput,
  ctx: { organizationId: number; userId: number }
): Promise<SubmissionLeaf> {
  const seq = await getSequence(input.sequenceId, ctx);
  if (isSequenceLocked(seq.status)) {
    throw new SubmissionError('INVALID_STATE', `Sequence is ${seq.status}; its leaves are immutable.`);
  }

  // When a leaf points at the canonical document table, the target must belong
  // to the caller's org — no dangling cross-tenant document pointers.
  /* Source pin (GA ledger L23). The leaf records where the document lives and
     the MD5 of its RENDERED bytes; neither says what the SOURCE contained when
     it was filed. So "this went to the agency — is the document behind it still
     what went?" had no answer: `document_id` resolves to the document as it is
     now, and editing it after filing changes nothing on the leaf.

     The digest is taken from the SAME org-scoped read that already proves the
     document belongs to the caller, so the bytes pinned are the bytes the
     tenancy check passed on — a second query could race a concurrent edit and
     pin content the check never saw. */
  let documentContentSha256: string | null = null;
  if (input.documentTable === 'coauthor_documents' && input.documentId) {
    const [doc] = await db
      .select({ id: coauthorDocuments.id, content: coauthorDocuments.content })
      .from(coauthorDocuments)
      .where(and(eq(coauthorDocuments.id, input.documentId), eq(coauthorDocuments.organizationId, ctx.organizationId)))
      .limit(1);
    if (!doc) {
      throw new SubmissionError('FORBIDDEN', 'Referenced document not found for this organization.');
    }
    /* An empty or absent body pins NOTHING rather than the digest of an empty
       string. sha256('') is a real, constant hex value that would look exactly
       like a pin that had been taken, and would then "match" any other empty
       document forever. NULL is the honest record of "no content to pin". */
    documentContentSha256 =
      typeof doc.content === 'string' && doc.content.length > 0
        ? createHash('sha256').update(doc.content, 'utf8').digest('hex')
        : null;
  }

  /* A rendered filing document (rendered_leaf_files) is the other pointer the
     resolver can materialize. Same tenancy rule as above — an id that does not
     resolve in this organization is refused, not silently stored — and the pin
     is the sha256 recorded when the bytes were rendered, which is exactly what
     the resolver re-verifies before staging them. */
  if (input.documentTable === 'rendered_leaf_files' && input.documentId) {
    const [rendered] = await db
      .select({ sha256: renderedLeafFiles.sha256 })
      .from(renderedLeafFiles)
      .where(and(eq(renderedLeafFiles.id, input.documentId), eq(renderedLeafFiles.organizationId, ctx.organizationId)))
      .limit(1);
    if (!rendered) {
      throw new SubmissionError('FORBIDDEN', 'Referenced document not found for this organization.');
    }
    documentContentSha256 = rendered.sha256;
  }

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
    await auditService.logAction({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'LEAF_UPDATED',
      resourceType: 'submission_leaf',
      resourceId: input.leafId,
      details: { sectionCode: input.sectionCode, lifecycleOp: input.lifecycleOp },
    });
    return row as SubmissionLeaf;
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
      documentType: input.documentType ?? null,
      parentLeafId: input.parentLeafId ?? null,
      checksum: input.checksum ?? null,
      documentContentSha256,
      documentPinnedAt: documentContentSha256 ? new Date() : null,
      organizationId: ctx.organizationId,
      createdBy: ctx.userId,
    })
    .returning();
  await auditService.logAction({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: 'LEAF_CREATED',
    resourceType: 'submission_leaf',
    resourceId: row.id,
    details: { sequenceId: input.sequenceId, sectionCode: input.sectionCode },
  });
  return row as SubmissionLeaf;
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
export async function removeLeaf(
  leafId: number,
  sequenceId: number,
  ctx: { organizationId: number; userId: number }
): Promise<void> {
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

  await auditService.logAction({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: 'LEAF_REMOVED',
    resourceType: 'submission_leaf',
    resourceId: leafId,
    details: { sequenceId, sectionCode: row.sectionCode },
  });
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
