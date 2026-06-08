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

import { eq, and, isNull, desc, sql } from 'drizzle-orm';
import { db } from '../../db';
import {
  submissions,
  ectdSequences,
  submissionLeaves,
  coauthorDocuments,
} from '../../../shared/schema';
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

export async function createSubmission(
  input: CreateSubmissionInput,
  ctx: { organizationId: number; userId: number }
): Promise<Submission> {
  const [row] = await db
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
  await auditService.logAction({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: 'SUBMISSION_CREATED',
    resourceType: 'submission',
    resourceId: row.id,
    details: { applicationType: input.applicationType, primaryRegion: input.primaryRegion, clientType: input.clientType },
  });
  logger.info('Created submission', { submissionId: row.id, organizationId: ctx.organizationId });
  return row as Submission;
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

async function getSequence(id: number, ctx: { organizationId: number }): Promise<EctdSequence> {
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
  if (input.documentTable === 'coauthor_documents' && input.documentId) {
    const [doc] = await db
      .select({ id: coauthorDocuments.id })
      .from(coauthorDocuments)
      .where(and(eq(coauthorDocuments.id, input.documentId), eq(coauthorDocuments.organizationId, ctx.organizationId)))
      .limit(1);
    if (!doc) {
      throw new SubmissionError('FORBIDDEN', 'Referenced document not found for this organization.');
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

export default {
  createSubmission,
  listSubmissions,
  getSubmission,
  createSequence,
  listSequences,
  transitionSequence,
  listLeaves,
  upsertLeaf,
  canTransitionSequence,
  isSequenceLocked,
  SubmissionError,
};
