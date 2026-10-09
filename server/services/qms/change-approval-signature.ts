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
import {
  persistGovernedActionSignature,
  sha256CanonicalJson,
  type SignatureDbClient,
} from '../part11/signature-persistence';
import {
  QmsApprovalRefusedError,
  type QmsApprovalSignatureRecord,
} from './document-approval-signature';

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
 * Approve a change as a signed act, on the caller's transaction client. See the
 * module header for the three writes and the rollback rule.
 */
export async function approveQmsChangeSigned(
  client: SignatureDbClient,
  params: ApproveQmsChangeSignedParams,
): Promise<ApproveQmsChangeSignedResult> {
  const { orgId, userId, changeId } = params;
  const row = await lockApprovableChange(client, orgId, userId, changeId);
  const twoPersonRule = row.proposed_by != null ? 'enforced' : 'not_applicable_no_proposer_recorded';
  const contentDigest = computeQmsChangeContentDigest(row);
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
    extraManifest: { changeNumber: row.change_number, classification: row.classification, twoPersonRule },
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
