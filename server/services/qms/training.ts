import {
  QMS_TRAINING_DECLARATION, qmsTrainingAcknowledgementInputSchema,
  type QmsTrainingAcknowledgementInput, type QmsTrainingContext,
} from '../../../shared/qms/training';
import { writeChainedAuditRow } from '../auditService';
import { GOVERNED_WRITE_ROLES } from '../../middleware/orgMembership';
import { isActiveAccountStatus } from '../account-standing';
import { derivePosture } from '../tenant/tenant-lifecycle';
import type { QmsDocumentRow } from './document-approval-signature';
import { QmsContentRefusedError } from './controlled-document-content';
import { verifiedTrainingReceipt } from './training-content';
import { readQmsTrainingReleaseContext, type CurrentQmsReleaseApproval } from './current-release-approval';
import { isPendingEffective, resolveInForceRelease } from './in-force-release';
import { authorizeQmsTrainingRead } from './training-assignment';

export {
  readQmsTrainingCompliance, readQmsTrainingExpiring, summarizeQmsTrainingCompliance,
  type QmsTrainingComplianceRow, type QmsTrainingExpiry,
} from './training-compliance';
export interface TrainingSqlClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
  discard?(reason: Error): Promise<void>;
}
interface TrainingActor { organizationId: number; userId: number; now?: Date }
interface TrainingInput extends TrainingActor {
  documentId: number; input: QmsTrainingAcknowledgementInput;
  ipAddress?: string; userAgent?: string;
}
export class QmsTrainingRefused extends Error {
  constructor(public readonly status: 403 | 404 | 409 | 503, public readonly code: string, message: string) { super(message); }
}
export class QmsTrainingCommitUnconfirmed extends Error {
  constructor(message = 'The acknowledgement could not be confirmed. Reload the document to check your record before trying again.',
    public readonly code = 'QMS_TRAINING_COMMIT_UNCONFIRMED') { super(message); }
}

function approvedTrainingSignatureId(context: QmsTrainingContext, approval: CurrentQmsReleaseApproval | null): number {
  if (!context.eligible || approval?.state !== 'valid' || approval.signatureId === null) {
    throw new QmsTrainingRefused(approval?.state === 'unavailable' ? 503 : 409,
      approval?.state === 'unavailable' ? 'QMS_TRAINING_APPROVAL_UNAVAILABLE' : 'QMS_TRAINING_UNAVAILABLE',
      context.unavailableReason ?? 'The exact recorded approval signature for this release could not be verified.');
  }
  return approval.signatureId;
}

export async function currentStanding(client: TrainingSqlClient, actor: TrainingActor, lock = false) {
  const { rows } = await client.query(
    lock
      ? `SELECT u.status AS account_status, o.status AS organization_status, o.payment_status, ou.role AS membership_role
       FROM organization_users ou JOIN users u ON u.id = ou.user_id
       JOIN organizations o ON o.id = ou.organization_id
      WHERE ou.organization_id = $1 AND ou.user_id = $2
      FOR SHARE OF ou, u, o`
      : `SELECT u.status AS account_status, o.status AS organization_status, o.payment_status, ou.role AS membership_role
       FROM organization_users ou JOIN users u ON u.id = ou.user_id
       JOIN organizations o ON o.id = ou.organization_id
      WHERE ou.organization_id = $1 AND ou.user_id = $2`,
    [actor.organizationId, actor.userId],
  );
  const member = rows[0];
  if (!member || !isActiveAccountStatus(member.account_status)) throw new QmsTrainingRefused(403, 'QMS_TRAINING_MEMBERSHIP_REQUIRED', 'An active account and current organization membership are required.');
  const posture = derivePosture(actor.organizationId, member.organization_status as string, member.payment_status as string);
  if (posture.decision === 'deny') throw new QmsTrainingRefused(403, posture.code, posture.reason);
  return { ...posture, membershipRole: typeof member.membership_role === 'string' ? member.membership_role.toLowerCase() : null };
}

async function currentReceipt(client: TrainingSqlClient, actor: TrainingActor, context: QmsTrainingContext) {
  if (!context.eligible) return null;
  const now = actor.now ?? new Date();
  const { rows } = await client.query(
    `SELECT * FROM qms_training_records WHERE organization_id = $1 AND user_id = $2
      AND document_id = $3 AND document_version = $4 AND metadata->>'contentDigest' = $5
      AND acknowledgment_method = 'attestation' AND trainer_id IS NULL AND quiz_score IS NULL
      AND (expires_at IS NULL OR expires_at > $6::timestamptz)
      ORDER BY acknowledged_at DESC, id DESC`,
    [actor.organizationId, actor.userId, context.documentId, context.documentVersion, context.contentDigest, now.toISOString()],
  );
  for (const row of rows) {
    const receipt = verifiedTrainingReceipt(row, now);
    if (receipt && receipt.userId === actor.userId && receipt.documentId === context.documentId && receipt.documentVersion === context.documentVersion && receipt.contentDigest === context.contentDigest) return receipt;
  }
  return null;
}

/**
 * The versions training reads (P-49): the version in force (while a successor
 * is drafted, or approved for a later day, its signed predecessor), and the
 * version approved for a later day, which may be read and acknowledged ahead
 * of it. A first version approved for a later day is both: nothing is in force.
 */
async function trainableVersions(client: TrainingSqlClient, document: QmsDocumentRow) {
  const inForce = (await resolveInForceRelease(client, document))?.release ?? null;
  const pending = isPendingEffective(document) ? document : null;
  return { primary: inForce ?? document, pending, successor: inForce && pending ? pending : null };
}

/** The successor's context for this reader: refused to someone who may not read it, with the reason and none of its text. */
async function successorContext(client: TrainingSqlClient, input: TrainingActor & { document: QmsDocumentRow }, successor: QmsDocumentRow) {
  try {
    await authorizeQmsTrainingRead(client, input.organizationId, input.userId, successor);
  } catch (error) {
    if (!(error instanceof QmsContentRefusedError) || (error.status !== 403 && error.status !== 404)) throw error;
    const { context } = await readQmsTrainingReleaseContext(client, successor, input.now, { ahead: true });
    return { ...context, eligible: false, sections: [], unavailableReason: error.message, acknowledgement: null };
  }
  const { context } = await readQmsTrainingReleaseContext(client, successor, input.now, { ahead: true });
  return { ...context, acknowledgement: await currentReceipt(client, input, context) };
}

export async function readQmsTrainingContext(client: TrainingSqlClient, input: TrainingActor & { document: QmsDocumentRow }) {
  if (input.document.organization_id !== input.organizationId) throw new QmsTrainingRefused(404, 'QMS_TRAINING_NOT_FOUND', 'Document not found in this organization.');
  const posture = await currentStanding(client, input);
  // Access is decided on what is read (in-force-release.ts), and being assigned grants reading it (D3).
  const { primary, pending, successor } = await trainableVersions(client, input.document);
  await authorizeQmsTrainingRead(client, input.organizationId, input.userId, primary);
  const { context } = await readQmsTrainingReleaseContext(client, primary, input.now, { ahead: primary === pending });
  const acknowledgement = await currentReceipt(client, input, context);
  const canEditControlledText = posture.decision === 'allow' && !!posture.membershipRole
    && GOVERNED_WRITE_ROLES.has(posture.membershipRole) && !input.document.authoring_document_id && ['draft', 'in_review'].includes(input.document.status);
  const next = successor ? await successorContext(client, input, successor) : null;
  const refusal = posture.decision === 'allow' ? {} : { eligible: false, unavailableReason: posture.reason };
  return { ...context, acknowledgement, canEditControlledText, ...refusal,
    ...(next ? { successor: { ...next, ...refusal } } : {}) };
}

async function recordAcknowledgement(client: TrainingSqlClient, params: TrainingInput) {
  const now = params.now ?? new Date();
  const posture = await currentStanding(client, params, true);
  if (posture.decision !== 'allow') throw new QmsTrainingRefused(403, posture.code, posture.reason);
  const { rows } = await client.query(
    `SELECT * FROM qms_documents WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL FOR UPDATE`,
    [params.documentId, params.organizationId],
  );
  const document = rows[0] as QmsDocumentRow | undefined;
  if (!document) throw new QmsTrainingRefused(404, 'QMS_TRAINING_NOT_FOUND', 'Document not found in this organization.');
  // The row stays locked. The acknowledgement is of the version the body names: the
  // version in force or the one approved for a later day (P-49); anything else is stale.
  const { primary, pending, successor } = await trainableVersions(client, document);
  const release = [primary, successor].find(candidate => candidate?.version === params.input.documentVersion) ?? primary;
  await authorizeQmsTrainingRead(client, params.organizationId, params.userId, release);
  const { context, approval } = await readQmsTrainingReleaseContext(client, release, now, { lock: true, ahead: release === pending });
  const releaseApprovalSignatureId = approvedTrainingSignatureId(context, approval);
  if (params.input.documentVersion !== context.documentVersion || params.input.contentDigest !== context.contentDigest) throw new QmsTrainingRefused(409, 'QMS_TRAINING_STALE', 'The released revision changed. Reload and read it before acknowledging.');
  const existing = await currentReceipt(client, { ...params, now }, context);
  if (existing) return { acknowledgement: existing, alreadyAcknowledged: true };
  const expiresAt = new Date(now.getTime() + 365 * 86_400_000);
  const metadata = { declaration: QMS_TRAINING_DECLARATION, contentDigest: context.contentDigest,
    bindingBasis: 'qms-document-version-content-sha256', releaseApprovalSignatureId, documentSnapshot: release,
    effectiveDate: context.effectiveDate ?? null, inForceAtAcknowledgement: context.inForce !== false };
  const inserted = await client.query(
    `INSERT INTO qms_training_records (organization_id, user_id, document_id, document_version,
       acknowledgment_method, acknowledged_at, expires_at, metadata)
     VALUES ($1, $2, $3, $4, 'attestation', $5::timestamptz, $6::timestamptz, $7::jsonb) RETURNING *`,
    [params.organizationId, params.userId, params.documentId, context.documentVersion, now.toISOString(), expiresAt.toISOString(), JSON.stringify(metadata)],
  );
  const acknowledgement = verifiedTrainingReceipt(inserted.rows[0], now);
  if (!acknowledgement) throw new Error('Persisted training receipt could not be verified');
  await writeChainedAuditRow(client, {
    tenantId: params.organizationId, userId: params.userId, action: 'mdx.qms.training.acknowledge',
    resourceType: 'qms_document', resourceId: String(params.documentId),
    ipAddress: params.ipAddress, userAgent: params.userAgent,
    details: { method: 'attestation', documentVersion: context.documentVersion, contentDigest: context.contentDigest,
      releaseApprovalSignatureId, effectiveDate: context.effectiveDate ?? null, inForceAtAcknowledgement: context.inForce !== false,
      declaration: QMS_TRAINING_DECLARATION, trainingRecordId: acknowledgement.id },
  });
  return { acknowledgement, alreadyAcknowledged: false };
}

/** The request owns the pinned connection; this mutation owns exactly one transaction. */
export async function acknowledgeQmsTraining(client: TrainingSqlClient, params: TrainingInput) {
  const input = qmsTrainingAcknowledgementInputSchema.parse(params.input);
  return withQmsTrainingTransaction(client, () => recordAcknowledgement(client, { ...params, input }));
}

export async function withQmsTrainingTransaction<T>(client: TrainingSqlClient, mutation: () => Promise<T>, uncertainMessage?: string) {
  await client.query('BEGIN');
  let commitAttempted = false;
  try {
    const result = await mutation();
    commitAttempted = true;
    await client.query('COMMIT');
    return result;
  } catch (error) {
    if (commitAttempted) {
      await client.discard?.(error instanceof Error ? error : new Error('QMS training commit unconfirmed'));
      throw new QmsTrainingCommitUnconfirmed(uncertainMessage);
    }
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
}
