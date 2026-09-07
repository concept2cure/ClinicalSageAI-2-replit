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
import { db } from '../../db';
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
import auditService from '../auditService';
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

/** Confirm a recorded governed `sign` action authorizes this target for this actor. */
async function verifyGovernedSignature(
  signatureActionId: string,
  target: string,
  ctx: { organizationId: number; userId: number }
): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT id FROM c2c_ana_actions
    WHERE id = ${signatureActionId}
      AND org_id = ${ctx.organizationId}
      AND command = 'sign'
      AND target = ${target}
      AND state = 'executed'
      AND proposed_by = ${ctx.userId}
    LIMIT 1
  `);
  return ((result as { rows?: unknown[] }).rows?.length ?? 0) > 0;
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

  // Gate 1 — Part 11 e-signature must govern THIS sequence, signed by THIS actor.
  const target = `ectd-sequence:${id}`;
  if (!(await verifyGovernedSignature(signatureActionId, target, ctx))) {
    throw new SubmissionError(
      'GOVERNED_REQUIRED',
      `A valid e-signature is required: sign ${target} via POST /api/c2c/actions/sign, then pass its actionId.`
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

  const now = new Date();
  const patch: Record<string, unknown> = { status: toStatus, updatedAt: now };
  if (toStatus === 'frozen') patch.frozenAt = now;
  if (toStatus === 'dispatched') patch.dispatchStatus = 'pending'; // queued for transmit; not yet sent

  const [row] = await db
    .update(ectdSequences)
    .set(patch)
    .where(and(eq(ectdSequences.id, id), eq(ectdSequences.organizationId, ctx.organizationId)))
    .returning();

  await auditService.logAction({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: toStatus === 'frozen' ? 'SEQUENCE_FROZEN' : 'SEQUENCE_DISPATCHED',
    resourceType: 'ectd_sequence',
    resourceId: id,
    details: {
      from: seq.status,
      to: toStatus,
      signatureActionId,
      validationErrors: assessment.validationErrors,
      unacknowledgedShadowCriticals: assessment.unacknowledgedShadowCriticals,
    },
  });
  logger.info('Governed sequence transition applied', { id, toStatus, organizationId: ctx.organizationId });
  return row as EctdSequence;
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
function toDispatchStatus(status: string): 'sent' | 'acknowledged' | 'rejected' {
  if (status === 'rejected' || status === 'validation_failed') return 'rejected';
  if (status === 'ack3_received' || status === 'validation_passed' || status === 'completed') return 'acknowledged';
  return 'sent';
}

export interface TransmitSequenceParams {
  sequenceId: number;
  ctx: { organizationId: number; userId: number };
  signatureActionId: string;
  environment?: 'staging' | 'production';
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
  const environment = params.environment ?? 'production';

  const seq = await getSequence(sequenceId, ctx);
  if (seq.status !== 'dispatched') {
    throw new SubmissionError('INVALID_STATE', `Sequence must be dispatched before transmit (current: ${seq.status}).`);
  }

  // Gate 1 — Part 11 e-signature on this sequence, by this actor.
  const target = `ectd-sequence:${sequenceId}`;
  if (!(await verifyGovernedSignature(signatureActionId, target, ctx))) {
    throw new SubmissionError(
      'GOVERNED_REQUIRED',
      `A valid e-signature is required: sign ${target} via POST /api/c2c/actions/sign, then pass its actionId.`
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
    applicationId: params.applicationId ?? `SEQ-${sequenceId}`,
    sponsorId: params.sponsorId ?? `ORG-${ctx.organizationId}`,
    sponsorName: params.sponsorName ?? `Organization ${ctx.organizationId}`,
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
      metadata: { applicationId: params.applicationId ?? `SEQ-${sequenceId}`, sequence: seq.sequenceNumber, environment },
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
  await db
    .update(ectdSequences)
    .set({ dispatchStatus, updatedAt: new Date() })
    .where(and(eq(ectdSequences.id, sequenceId), eq(ectdSequences.organizationId, ctx.organizationId)));

  await auditService.logAction({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: 'ECTD_TRANSMITTED',
    resourceType: 'ectd_sequence',
    resourceId: sequenceId,
    details: {
      region: seq.region,
      gateway: route.gwName,
      transmittalId: result.transmittalId,
      status: result.status,
      environment,
    },
  });
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
export const LEAF_SOURCE_TENANCY_TABLES: ReadonlySet<string> = new Set(Object.keys(LEAF_SOURCE_VERIFIERS));

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
  documentId: number,
  organizationId: number,
): Promise<string | null> {
  const verify = LEAF_SOURCE_VERIFIERS[documentTable];
  return verify ? verify(documentId, organizationId) : null;
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
    input.documentTable && input.documentId
      ? await verifyLeafSource(input.documentTable, input.documentId, ctx.organizationId)
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
