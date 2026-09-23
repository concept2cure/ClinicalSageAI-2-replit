/**
 * QMS controlled-document approval as a 21 CFR Part 11 electronic signature.
 *
 * VSR-001 finding F-3 (OQ-QMS-06): `POST /api/mdx/qms/documents/:id/approve`
 * accepted an empty body, set the SOP `effective` and stamped the session user
 * as approver — no re-authentication, no signature meaning, no reason, no
 * `electronic_signatures` row. Under §11.50 an approval that makes an SOP
 * effective is a signed record, and under §11.200(a)(1) the first signing in a
 * session must present every signature component. This module routes the
 * approval through the platform's ONE electronic-signature write path.
 *
 * ── Which credential, and why ────────────────────────────────────────────────
 * Until 2026-09-23 two re-authentication mechanisms existed in the tree:
 *   - PIN (`server/services/part11/pin-verification.ts`, now deleted) — used by
 *     the authoring loop's `/docs/:docId/e-sign`, which writes
 *     `authoring_signatures`, a separate store for UUID-keyed authoring
 *     documents ("the two are different concepts that collided on a name",
 *     authoring.router.ts). The authoring loop now re-verifies with the
 *     password ceremony too (services/part11/reverify-signer.ts).
 *   - Password (+ TOTP when the signer has MFA enabled) — `verifySignerCredentials`
 *     (`server/services/ana-ri/governed-action-signoff.ts`). This is what the
 *     governed `sign` action (`verifyReauth` in c2c/actions.ts), the RBM
 *     approvals in the same /api/mdx family, and the client's
 *     GovernedActionSignoff component all use, and it is the factor set the
 *     `electronic_signatures` row records in `authentication_method`.
 * The password path is canonical for `electronic_signatures`; the PIN path is
 * canonical only for `authoring_signatures`. A QMS approval belongs in
 * `electronic_signatures` (it is the Part 11 table an inspector queries), so it
 * takes the password path.
 *
 * ── What one approval writes, on ONE transaction ─────────────────────────────
 *   1. the `qms_documents` UPDATE (status → effective, approver, approved_at,
 *      effective_date, and `metadata.approval` carrying reason, meaning and the
 *      content digest the signature is bound to);
 *   2. the sha256-chained `audit_logs` + `c2c_ana_actions` ledger pair
 *      (`recordGovernedAction`, command `approve`, target `qms-document:<id>`);
 *   3. exactly one `electronic_signatures` row (`persistGovernedActionSignature`,
 *      the single INSERT path), bound to the document version's content digest.
 * Any throw rolls the whole approval back: the document is never effective
 * without its signature and audit row, and never signed without being effective.
 *
 * ── §11.70 binding ───────────────────────────────────────────────────────────
 * The bound digest is sha256 over the canonical JSON of the document VERSION
 * content read under `FOR UPDATE` before the status flip: identity (id, org,
 * doc number, version), the controlled text (title, type, category, artifact
 * pointer, metadata — where the SOP sections live), and `next_review_date`.
 * Approval stamps (status, approver, approved_at, effective_date, updated_at)
 * are excluded on purpose: they are what the signature APPLIES, not what it
 * signs. The digest is also written to `metadata.approval.contentDigest` so an
 * inspector can recompute it from the stored row.
 *
 * The caller (the route) owns the transaction: BEGIN before, COMMIT after,
 * ROLLBACK on throw. Nothing here opens or closes one.
 *
 * @module server/services/qms/document-approval-signature
 * @compliance 21 CFR Part 11 §11.10(d), §11.10(e), §11.10(g), §11.50, §11.70, §11.200
 */

import { recordGovernedAction } from '../../routes/c2c/actions';
import {
  persistGovernedActionSignature,
  sha256CanonicalJson,
  type SignatureDbClient,
} from '../part11/signature-persistence';
import { TASK_SIGNATURE_MEANINGS } from '../part11/signature-meanings';

/**
 * The §11.50(a)(3) meaning an approval carries. Taken from the platform's
 * signature-meaning enum (`TASK_SIGNATURE_MEANINGS`), not minted here: an
 * approval that makes a controlled document effective means exactly this, so
 * the route accepts this value and no other.
 */
export const QMS_DOCUMENT_APPROVAL_MEANING: (typeof TASK_SIGNATURE_MEANINGS)[number] = 'APPROVED';

/**
 * `electronic_signatures.binding_basis` for a QMS controlled-document approval.
 * Stated explicitly so a reader of the row knows what `bound_payload_digest`
 * is a digest OF (see BINDING_BASIS in signature-persistence for the others).
 */
export const QMS_DOCUMENT_BINDING_BASIS = 'qms-document-version-content-sha256';

/** The qms_documents columns the approval reads. */
export interface QmsDocumentRow {
  id: number;
  organization_id: number;
  doc_number: string;
  title: string;
  doc_type: string;
  category: string | null;
  version: string;
  status: string;
  effective_date: string | Date | null;
  next_review_date: string | Date | null;
  author_id: number | null;
  approver_id: number | null;
  approved_at: string | Date | null;
  superseded_by_id: number | null;
  artifact_id: number | null;
  metadata: Record<string, unknown> | null;
  [key: string]: unknown;
}

const APPROVABLE_STATES: ReadonlySet<string> = new Set(['draft', 'in_review']);

/**
 * The content digest a QMS approval signature is bound to (§11.70). Pure and
 * exported so an inspector — or a test — can recompute it from the stored row.
 * `metadata.approval` is excluded: it is written BY the approval and carries
 * this digest, so including it would make the digest self-referential.
 */
export function computeQmsDocumentContentDigest(row: QmsDocumentRow): string {
  const metadata = { ...(row.metadata ?? {}) } as Record<string, unknown>;
  delete metadata.approval;
  const toDateString = (v: string | Date | null): string | null =>
    v == null ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
  return sha256CanonicalJson({
    kind: 'qms-document-version-content',
    id: row.id,
    organizationId: row.organization_id,
    docNumber: row.doc_number,
    version: row.version,
    title: row.title,
    docType: row.doc_type,
    category: row.category ?? null,
    artifactId: row.artifact_id ?? null,
    nextReviewDate: toDateString(row.next_review_date),
    metadata,
  });
}

export type QmsApprovalRefusalCode = 'NOT_FOUND' | 'INVALID_STATE' | 'SELF_APPROVAL';

/** A refusal the route maps to a status. Nothing has been written when thrown. */
export class QmsApprovalRefusedError extends Error {
  constructor(public readonly code: QmsApprovalRefusalCode, message: string) {
    super(message);
    this.name = 'QmsApprovalRefusedError';
  }
}

export interface ApproveQmsDocumentSignedParams {
  orgId: number;
  /** The signer — already re-authenticated (verifySignerCredentials) and authorized (isSigningAuthorized). */
  userId: number;
  documentId: number;
  /** Reason for change, captured on the ledger, the signature and the document. */
  reason: string;
  /** The declared §11.50 meaning; the route admits only QMS_DOCUMENT_APPROVAL_MEANING. */
  meaning: string;
  /** Optional YYYY-MM-DD; defaults to the stored effective_date, else today. */
  effectiveDate: string | null;
  /** The factors verifySignerCredentials actually verified — never more. */
  authenticationMethod: 'password' | 'password+totp';
  secondFactorVerified: boolean;
  ipAddress: string | null;
}

export interface QmsApprovalSignatureRecord {
  id: number;
  signedAt: string;
  actionId: string;
  auditId: string;
  sha256Chain: string;
  meaning: string;
  boundPayloadDigest: string;
  bindingBasis: string;
  authenticationMethod: string;
  secondFactorVerified: boolean;
}

export interface ApproveQmsDocumentSignedResult {
  document: QmsDocumentRow;
  signature: QmsApprovalSignatureRecord;
}

/** Read the row under lock and apply the refusals. Nothing is written. */
async function lockApprovableDocument(
  client: SignatureDbClient,
  orgId: number,
  userId: number,
  documentId: number,
): Promise<QmsDocumentRow> {
  // Read the version content under lock so the digest is over the exact row
  // the UPDATE changes, and the two-person check sees the same author.
  const current = await client.query(
    `SELECT * FROM qms_documents
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
      FOR UPDATE`,
    [documentId, orgId],
  );
  const row = current.rows[0] as QmsDocumentRow | undefined;
  if (!row) {
    throw new QmsApprovalRefusedError('NOT_FOUND', 'Document not found in this organization.');
  }
  if (!APPROVABLE_STATES.has(row.status)) {
    throw new QmsApprovalRefusedError(
      'INVALID_STATE',
      `Document is ${row.status}; only a draft or in_review document can be approved.`,
    );
  }
  // §11.10(d) two-person rule, the same rule the RBM approvals in this family
  // and the governed sign action apply: the author may not approve their own
  // controlled document. A row with no recorded author cannot be checked, and
  // the signed record says so (twoPersonRule) rather than staying silent.
  if (row.author_id != null && row.author_id === userId) {
    throw new QmsApprovalRefusedError(
      'SELF_APPROVAL',
      'You authored this document, so you cannot also approve it. A second person has to review and sign it (21 CFR Part 11 §11.10(d)).',
    );
  }
  return row;
}

/** The qms_documents UPDATE: status → effective plus the approval stamps. */
async function applyApproval(
  client: SignatureDbClient,
  params: ApproveQmsDocumentSignedParams,
  contentDigest: string,
  occurredAt: Date,
  twoPersonRule: string,
): Promise<QmsDocumentRow> {
  const updated = await client.query(
    `UPDATE qms_documents
        SET status = 'effective',
            approver_id = $3,
            approved_at = $6::timestamptz,
            effective_date = COALESCE($4::date, effective_date, $6::date),
            metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
              'approval',
              jsonb_build_object(
                'reason', $5::text,
                'meaning', $7::text,
                'contentDigest', $8::text,
                'bindingBasis', $9::text,
                'by', $3::int,
                'at', $6::timestamptz,
                'twoPersonRule', $10::text
              )
            ),
            updated_at = NOW()
      WHERE id = $1 AND organization_id = $2
        AND status IN ('draft','in_review')
        AND deleted_at IS NULL
      RETURNING *`,
    [
      params.documentId,
      params.orgId,
      params.userId,
      params.effectiveDate,
      params.reason,
      occurredAt.toISOString(),
      params.meaning,
      contentDigest,
      QMS_DOCUMENT_BINDING_BASIS,
      twoPersonRule,
    ],
  );
  const document = updated.rows[0] as QmsDocumentRow | undefined;
  if (!document) {
    // The FOR UPDATE read makes this unreachable in practice; refuse rather
    // than sign a row that did not change.
    throw new QmsApprovalRefusedError('INVALID_STATE', 'Document state changed before approval could be applied.');
  }
  return document;
}

/**
 * Approve a controlled document as a signed act, on the caller's transaction
 * client. See the module header for the three writes and the rollback rule.
 */
export async function approveQmsDocumentSigned(
  client: SignatureDbClient,
  params: ApproveQmsDocumentSignedParams,
): Promise<ApproveQmsDocumentSignedResult> {
  const { orgId, userId, documentId } = params;
  const row = await lockApprovableDocument(client, orgId, userId, documentId);
  const twoPersonRule = row.author_id != null ? 'enforced' : 'not_applicable_no_author_recorded';
  const contentDigest = computeQmsDocumentContentDigest(row);
  const target = `qms-document:${documentId}`;
  const occurredAt = new Date();

  const document = await applyApproval(client, params, contentDigest, occurredAt, twoPersonRule);

  // §11.10(e): the chained ledger pair, same transaction.
  const gov = await recordGovernedAction(client, {
    orgId,
    userId,
    command: 'approve',
    target,
    reason: params.reason,
    payload: {
      meaning: params.meaning,
      contentDigest,
      bindingBasis: QMS_DOCUMENT_BINDING_BASIS,
      docNumber: row.doc_number,
      version: row.version,
      fromStatus: row.status,
      toStatus: 'effective',
    },
    domain: 'qms',
    surface: 'api',
  });

  // §11.50/§11.70/§11.200: the one electronic_signatures row, same transaction.
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
    signatureType: 'qms-document-approval',
    command: 'approve',
    binding: {
      digest: contentDigest,
      basis: QMS_DOCUMENT_BINDING_BASIS,
      note:
        'sha256 over the canonical qms_documents version content (id, organization, doc number, version, title, type, category, artifact pointer, next review date, metadata minus metadata.approval) read under FOR UPDATE at approval time — the same digest stored on metadata.approval.contentDigest.',
    },
    extraManifest: { docNumber: row.doc_number, version: row.version, twoPersonRule },
    complianceStatement:
      'QMS controlled-document approval (21 CFR 820.40 / ISO 13485 §4.2.4) applied as an electronic signature under 21 CFR Part 11 §11.50/§11.70/§11.200; ledger-chained to the audit_logs sha256 chain.',
  });

  return {
    document,
    signature: {
      id: signed.id,
      signedAt: signed.signedAt.toISOString(),
      actionId: gov.actionId,
      auditId: gov.auditId,
      sha256Chain: gov.sha256Chain,
      meaning: params.meaning,
      boundPayloadDigest: contentDigest,
      bindingBasis: QMS_DOCUMENT_BINDING_BASIS,
      authenticationMethod: params.authenticationMethod,
      secondFactorVerified: params.secondFactorVerified,
    },
  };
}
