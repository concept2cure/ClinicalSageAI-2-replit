/**
 * QMS change-control approval as a 21 CFR Part 11 electronic signature.
 *
 * Security review 2026-09-24, DP-31 (remediation plan P1-28). A change was
 * approved on either of two doors with no ceremony: `POST
 * /api/mdx/qms/changes/:id/transition {to:'approved'}` and the AnA tool
 * `qms_change_transition` both reached `transitionChange`, which stamped
 * `approved_by` / `approved_at` with segregation of duties as its only
 * control. There was no re-authentication, no meaning, no `electronic_signatures` row, and
 * the audit write came after the stamp. ICH Q10 §3.2.3 makes approving a change
 * the controlled step; §11.50 makes an approval a signed record.
 *
 * This is the sibling of `document-approval-signature.ts` and follows it
 * exactly. The route runs the platform's one signing ceremony (signing
 * authority, then `reverifySigner`) before calling in, then owns the
 * transaction. One approval writes, on that transaction:
 *   1. the `qms_change_controls` UPDATE (status → approved, approved_by,
 *      approved_at, and `metadata.approval` carrying reason, meaning and the
 *      content digest the signature is bound to);
 *   2. the sha256-chained ledger pair (`recordGovernedAction`, command
 *      `approve`, target `qms-change:<id>`);
 *   3. exactly one `electronic_signatures` row (`persistGovernedActionSignature`),
 *      bound to the change's content digest.
 * Any throw rolls all three back.
 *
 * Refusals reuse `QmsApprovalRefusedError` from the document module, so the
 * two approvals refuse in the same words and map to the same statuses.
 *
 * @module server/services/qms/change-approval-signature
 * @compliance 21 CFR Part 11 §11.10(d), §11.10(e), §11.50, §11.70, §11.200; ICH Q10 §3.2.3
 */

import { recordGovernedAction } from '../../routes/c2c/actions';
import { assertCurrentQmsSigningAuthority } from './current-signing-admission';
import {
  persistGovernedActionSignature,
  sha256CanonicalJson,
  manifestSignatureHash,
  isSignatureWithdrawn,
  type SignatureDbClient,
} from '../part11/signature-persistence';
import {
  QmsApprovalRefusedError,
  type QmsApprovalSignatureRecord,
} from './document-approval-signature';
import { AGENCIES, DOCUMENT_TYPES, AggregateLearningRefusedError, LEARNING_COHORT_MINIMUM, learningClassOf,
  type Agency, type DocumentType, type LearningClassKey } from '../intelligence/ana-failure-learning';

export interface ReviewedLearningArtifact {
  kind: 'aggregate_learning_v1'; libraryVersionId: string; classKey: LearningClassKey;
  agency: Agency; documentType: DocumentType; cohortMinimum: number; tenantCount: number; eventCount: number;
}
export interface LearningPromotion { artifact: ReviewedLearningArtifact; artifactSha256: string }
const learningObject = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
function assertLearningArtifactIdentity(artifact: Record<string, unknown>): void {
  if (artifact.kind !== 'aggregate_learning_v1' || typeof artifact.libraryVersionId !== 'string' ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(artifact.libraryVersionId) ||
      !AGENCIES.includes(artifact.agency as Agency) || !DOCUMENT_TYPES.includes(artifact.documentType as DocumentType)) throw new AggregateLearningRefusedError();
  learningClassOf(artifact.classKey);
}
export function learningPromotionOf(metadata: unknown): LearningPromotion | null {
  const raw = learningObject(metadata).learningPromotion;
  if (raw === undefined) return null;
  const value = learningObject(raw), artifact = learningObject(value.artifact);
  const keys = ['kind', 'libraryVersionId', 'classKey', 'agency', 'documentType', 'cohortMinimum', 'tenantCount', 'eventCount'];
  if (Object.keys(value).length !== 2 || Object.keys(value).some(key => !['artifact', 'artifactSha256'].includes(key)) ||
      Object.keys(artifact).length !== keys.length || Object.keys(artifact).some(key => !keys.includes(key)) ||
      artifact.cohortMinimum !== LEARNING_COHORT_MINIMUM || !Number.isSafeInteger(artifact.tenantCount) ||
      Number(artifact.tenantCount) < LEARNING_COHORT_MINIMUM || !Number.isSafeInteger(artifact.eventCount) ||
      Number(artifact.eventCount) < Number(artifact.tenantCount) || value.artifactSha256 !== sha256CanonicalJson(artifact)) {
    throw new AggregateLearningRefusedError();
  }
  assertLearningArtifactIdentity(artifact);
  return { artifact: artifact as unknown as ReviewedLearningArtifact, artifactSha256: String(value.artifactSha256) };
}

/** A current persisted curator grant is additional to the ordinary QMS signing gate. */
export async function assertCurrentLearningCurator(client: SignatureDbClient, userId: number): Promise<void> {
  // tenant-isolation-safe: a platform role grant is not a tenant's; curating shared learning is a platform act. The read is the authenticated signer's own grant and account status (users is the global identity table), keyed by userId.
  const grant = await client.query(`SELECT g.id FROM platform_role_grants g JOIN users u ON u.id=g.user_id
    WHERE g.user_id=$1 AND g.revoked_at IS NULL AND LOWER(g.role)=ANY($2::text[]) AND u.status='active'
    FOR SHARE OF u`, [userId, ['super_admin', 'platform_admin']]);
  if (!grant.rows.some(row => Number.isSafeInteger(Number(row.id)) && Number(row.id) > 0)) throw new AggregateLearningRefusedError();
}

/** What `bound_payload_digest` is a digest OF, stated on the signature row. */
export const QMS_CHANGE_BINDING_BASIS = 'qms-change-control-content-sha256';

/** The only state a change is approved from (CHANGE_TRANSITIONS). */
const APPROVABLE_STATE = 'under_assessment';

/** The qms_change_controls columns the approval reads. */
export interface QmsChangeRow {
  id: number;
  organization_id: number;
  change_number: string;
  title: string;
  description: string | null;
  change_type: string;
  classification: string;
  risk_level: string | null;
  status: string;
  reason: string | null;
  impact_assessment: string | null;
  implementation_plan: string | null;
  proposed_by: number | null;
  target_implementation_date: string | Date | null;
  qms_document_id: number | null;
  metadata: Record<string, unknown> | null;
  [key: string]: unknown;
}

/**
 * The content digest a change approval is bound to (§11.70): what is being
 * approved — the change as proposed and assessed. Pure and exported so an
 * inspector, or a test, can recompute it from the stored row. `metadata.approval`
 * is excluded because the approval writes it and it carries this digest.
 */
export function computeQmsChangeContentDigest(row: QmsChangeRow): string {
  const metadata = { ...(row.metadata ?? {}) } as Record<string, unknown>;
  delete metadata.approval;
  const target = row.target_implementation_date;
  return sha256CanonicalJson({
    kind: 'qms-change-control-content',
    id: row.id,
    organizationId: row.organization_id,
    changeNumber: row.change_number,
    title: row.title,
    description: row.description ?? null,
    changeType: row.change_type,
    classification: row.classification,
    riskLevel: row.risk_level ?? null,
    reason: row.reason ?? null,
    impactAssessment: row.impact_assessment ?? null,
    implementationPlan: row.implementation_plan ?? null,
    targetImplementationDate:
      target == null ? null : target instanceof Date ? target.toISOString().slice(0, 10) : String(target).slice(0, 10),
    qmsDocumentId: row.qms_document_id ?? null,
    metadata,
  });
}

export interface ApproveQmsChangeSignedParams {
  orgId: number;
  /** The signer — already authorized (isSigningAuthorized) and re-verified (reverifySigner). */
  userId: number;
  changeId: number;
  reason: string;
  /** The declared §11.50 meaning; the route admits only 'APPROVED'. */
  meaning: string;
  /** The factors reverifySigner actually verified — never more. */
  authenticationMethod: 'password' | 'password+totp';
  secondFactorVerified: boolean;
  ipAddress: string | null;
  learningReview?: { expectedArtifactSha256: string; invariantAccepted: true };
  /**
   * The content digest of the change as the approver read it: the register read sends each change's
   * `content_digest`, and the signature dialog shows that row. The approval signs only that content (§11.50, §11.70);
   * a change edited since it was read is refused, and nothing is signed.
   */
  expectedContentDigest: string;
}

async function reviewedLearningApproval(client: SignatureDbClient, row: QmsChangeRow, params: ApproveQmsChangeSignedParams) {
  const promotion = learningPromotionOf(row.metadata);
  if (!promotion) {
    if (params.learningReview !== undefined) throw new AggregateLearningRefusedError(400);
    return null;
  }
  await assertCurrentLearningCurator(client, params.userId);
  if (!Number.isSafeInteger(row.proposed_by) || params.learningReview?.invariantAccepted !== true ||
      params.learningReview.expectedArtifactSha256 !== promotion.artifactSha256) throw new AggregateLearningRefusedError(409);
  const { readLearningCohort } = await import('./changeControl.service');
  const cohort = await readLearningCohort(promotion.artifact);
  if (cohort.tenantCount !== promotion.artifact.tenantCount || cohort.eventCount !== promotion.artifact.eventCount) throw new AggregateLearningRefusedError(409);
  return { libraryVersionId: promotion.artifact.libraryVersionId, artifactSha256: promotion.artifactSha256, invariantAccepted: true as const };
}

export interface ApproveQmsChangeSignedResult {
  change: QmsChangeRow;
  signature: QmsApprovalSignatureRecord;
}

/** Read the change under lock and apply the refusals. Nothing is written. */
async function lockApprovableChange(
  client: SignatureDbClient,
  orgId: number,
  userId: number,
  changeId: number,
): Promise<QmsChangeRow> {
  const current = await client.query(
    `SELECT * FROM qms_change_controls
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
      FOR UPDATE`,
    [changeId, orgId],
  );
  const row = current.rows[0] as QmsChangeRow | undefined;
  if (!row) throw new QmsApprovalRefusedError('NOT_FOUND', 'Change not found in this organization.');
  if (row.status !== APPROVABLE_STATE) {
    throw new QmsApprovalRefusedError(
      'INVALID_STATE',
      `This change is ${row.status}; only a change under assessment can be approved.`,
    );
  }
  // Segregation of duties (ICH Q10; §11.10(d)): the person who proposed a change
  // does not also approve it. A change with no recorded proposer cannot be
  // checked, and the signed record says so (twoPersonRule) rather than staying silent.
  if (row.proposed_by != null && Number(row.proposed_by) === Number(userId)) {
    throw new QmsApprovalRefusedError(
      'SELF_APPROVAL',
      'You proposed this change, so you cannot also approve it. A second person has to review and sign it (21 CFR Part 11 §11.10(d)).',
    );
  }
  return row;
}

/**
 * Sign what was read: the content digest of the locked row, which must be the digest of the change as the approver
 * read it. Until 2026-11-10 an edit landing between the dialog opening and the signature was signed unseen: the dialog
 * sent no revision, and the digest was computed from whatever the row then held. Nothing is written when it refuses.
 */
function contentAsRead(row: QmsChangeRow, expectedContentDigest: string): string {
  const contentDigest = computeQmsChangeContentDigest(row);
  if (expectedContentDigest !== contentDigest) {
    throw new QmsApprovalRefusedError('CHANGED_SINCE_READ',
      'This change was edited after you opened it, so it is not what you read. Nothing was signed. Read it again, then approve.');
  }
  return contentDigest;
}

/**
 * Approve a change as a signed act, on the caller's transaction client. See the
 * module header for the three writes and the rollback rule.
 */
export async function approveQmsChangeSigned(
  client: SignatureDbClient,
  params: ApproveQmsChangeSignedParams,
): Promise<ApproveQmsChangeSignedResult> {
  const { orgId, userId, changeId } = params;
  const row = await lockApprovableChange(client, orgId, userId, changeId);
  const contentDigest = contentAsRead(row, params.expectedContentDigest);
  await assertCurrentQmsSigningAuthority(client, { organizationId: orgId, userId, target: `qms-change:${changeId}` });
  const learningReview = await reviewedLearningApproval(client, row, params);
  const twoPersonRule = row.proposed_by != null ? 'enforced' : 'not_applicable_no_proposer_recorded';
  const target = `qms-change:${changeId}`;
  const occurredAt = new Date();

  const updated = await client.query(
    `UPDATE qms_change_controls
        SET status = 'approved',
            approved_by = $3,
            approved_at = $4::timestamptz,
            metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
              'approval',
              jsonb_build_object(
                'reason', $5::text,
                'meaning', $6::text,
                'contentDigest', $7::text,
                'bindingBasis', $8::text,
                'by', $3::int,
                'at', $4::timestamptz,
                'twoPersonRule', $9::text
              )
            ),
            updated_at = NOW()
      WHERE id = $1 AND organization_id = $2 AND status = '${APPROVABLE_STATE}' AND deleted_at IS NULL
      RETURNING *`,
    [changeId, orgId, userId, occurredAt.toISOString(), params.reason, params.meaning, contentDigest,
     QMS_CHANGE_BINDING_BASIS, twoPersonRule],
  );
  const change = updated.rows[0] as QmsChangeRow | undefined;
  if (!change) {
    // The FOR UPDATE read makes this unreachable in practice; refuse rather
    // than sign a row that did not change.
    throw new QmsApprovalRefusedError('INVALID_STATE', 'The change moved before the approval could be applied.');
  }

  const gov = await recordGovernedAction(client, {
    orgId,
    userId,
    command: 'approve',
    target,
    reason: params.reason,
    payload: {
      meaning: params.meaning,
      contentDigest,
      bindingBasis: QMS_CHANGE_BINDING_BASIS,
      changeNumber: row.change_number,
      classification: row.classification,
      fromStatus: row.status,
      toStatus: 'approved',
    },
    domain: 'qms',
    surface: 'api',
  });

  const signed = await persistGovernedActionSignature(client, {
    orgId,
    userId,
    target,
    reason: params.reason,
    payload: { meaning: params.meaning },
    actionId: gov.actionId,
    auditId: gov.auditId,
    sha256Chain: gov.sha256Chain,
    authenticationMethod: params.authenticationMethod,
    secondFactorVerified: params.secondFactorVerified,
    ipAddress: params.ipAddress,
    occurredAt,
    signatureType: 'qms-change-approval',
    command: 'approve',
    binding: {
      digest: contentDigest,
      basis: QMS_CHANGE_BINDING_BASIS,
      note:
        'sha256 over the canonical qms_change_controls content (id, organization, change number, title, description, type, classification, risk, reason, impact assessment, implementation plan, target date, controlled-document pointer, metadata minus metadata.approval) read under FOR UPDATE at approval time — the same digest stored on metadata.approval.contentDigest.',
    },
    extraManifest: { changeNumber: row.change_number, classification: row.classification, twoPersonRule,
      ...(learningReview ? { learningReview } : {}) },
    complianceStatement:
      'QMS change-control approval (ICH Q10 §3.2.3; EU GMP Annex 15; 21 CFR 820.70) applied as an electronic signature under 21 CFR Part 11 §11.50/§11.70/§11.200; ledger-chained to the audit_logs sha256 chain.',
  });

  return {
    change,
    signature: {
      id: signed.id,
      signedAt: signed.signedAt.toISOString(),
      actionId: gov.actionId,
      auditId: gov.auditId,
      sha256Chain: gov.sha256Chain,
      meaning: params.meaning,
      boundPayloadDigest: contentDigest,
      bindingBasis: QMS_CHANGE_BINDING_BASIS,
      authenticationMethod: params.authenticationMethod,
      secondFactorVerified: params.secondFactorVerified,
    },
  };
}

/** Recompute exact content and inspect the actual retained signature; approval stamps alone never admit a library artifact. */
function learningSignatureInstant(value: unknown): string | null {
  const date = new Date(value instanceof Date ? value.getTime() : String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
export async function readReviewedLearningChangeApproval(client: SignatureDbClient, change: QmsChangeRow, promotion: LearningPromotion) {
  if (!['approved', 'in_implementation', 'verification', 'closed'].includes(change.status) ||
      !Number.isSafeInteger(change.approved_by) || !change.approved_at ||
      learningPromotionOf(change.metadata)?.artifactSha256 !== promotion.artifactSha256) throw new AggregateLearningRefusedError();
  const found = await client.query(`SELECT * FROM electronic_signatures WHERE organization_id=$1 AND signed_target=$2
    AND signature_type='qms-change-approval' AND signer_id=$3 AND signed_at=$4::timestamptz FOR SHARE`,
  [change.organization_id, `qms-change:${change.id}`, change.approved_by, change.approved_at]);
  if (found.rows.length !== 1) throw new AggregateLearningRefusedError();
  const row = found.rows[0], manifest = learningObject(row.signature_manifest), review = learningObject(manifest.learningReview);
  const pairs = [[row.bound_payload_digest, computeQmsChangeContentDigest(change)], [row.binding_basis, QMS_CHANGE_BINDING_BASIS],
    [manifest.kind, 'governed-sign'], [row.signature_meaning, 'APPROVED'], [manifest.reason, row.signature_purpose],
    [manifest.signerName, row.signer_name], [manifest.signerEmail, row.signer_email],
    [manifest.changeNumber, change.change_number], [manifest.classification, change.classification],
    [learningSignatureInstant(manifest.signedAt), learningSignatureInstant(change.approved_at)],
    [manifest.boundPayloadDigest, row.bound_payload_digest], [manifest.bindingBasis, row.binding_basis],
    [manifest.organizationId, change.organization_id], [manifest.signerId, change.approved_by],
    [manifest.target, `qms-change:${change.id}`], [manifest.command, 'approve'], [manifest.meaning, 'APPROVED'],
    [review.libraryVersionId, promotion.artifact.libraryVersionId], [review.artifactSha256, promotion.artifactSha256], [review.invariantAccepted, true]];
  if (isSignatureWithdrawn(row) || !pairs.every(([actual, expected]) => actual === expected) ||
      typeof row.signature_hash !== 'string' || manifestSignatureHash(manifest) !== row.signature_hash) throw new AggregateLearningRefusedError();
  await assertCurrentLearningCurator(client, Number(change.approved_by));
  return { signatureId: Number(row.id), signatureHash: row.signature_hash };
}
