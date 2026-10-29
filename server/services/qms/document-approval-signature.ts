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
 * ── Which credential, and why ───────────────────────────────────────────────
 * The platform's one signing ceremony (`server/services/part11/reverify-signer.ts`):
 * the account password, the second factor whenever one is enrolled, and the
 * account's lockout. The route runs it before this module is called, and the
 * factors it verified are what the `electronic_signatures` row records in
 * `authentication_method`. Until 2026-09-23 this route used a second
 * implementation of the same policy (`ana-ri/governed-action-signoff.ts`, now
 * deleted) that did not keep the lockout, and the authoring loop used a
 * separate signing PIN (also retired). A QMS approval belongs in
 * `electronic_signatures`, the Part 11 table an inspector queries.
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
 * ── Retirement (P1-29 / DP-32, security review 2026-09-24) ──────────────────
 * Retiring a controlled document ends its effect for everyone trained on it,
 * and is the same kind of record as the approval that began it. Until
 * 2026-09-26 `POST /api/mdx/qms/documents/:id/retire` was an autocommitted
 * UPDATE with a reason and an audit row written after it. `retireQmsDocumentSigned`
 * is the sibling of `approveQmsDocumentSigned`: the same three writes on the
 * caller's transaction (UPDATE status → retired with `metadata.retired`; the
 * ledger pair, command `retire`; one `electronic_signatures` row, type
 * `qms-document-retirement`), the same refusals class, and the same admissible
 * set the old route had (any document not already retired — narrowing that is a
 * product decision, not this change's). Its digest is `computeQmsDocumentRetirementDigest`:
 * the approval recipe with the stamp the retirement itself writes
 * (`metadata.retired`) excluded, so it recomputes from the stored retired row.
 * The approval recipe is left as it is: a retired document can be revised back
 * to draft and approved again, and that approval's digest must keep covering
 * the row as it then is.
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
  type BindingBasis,
  type SignatureDbClient,
} from '../part11/signature-persistence';
import { TASK_SIGNATURE_MEANINGS, type GovernedSignMeaning } from '../part11/signature-meanings';
import { qmsTrainingSectionSchema } from '../../../shared/qms/training';
import { captureQmsAuthoringContent, persistQmsSignedVersion, authorizeQmsAuthoredSignature, QmsContentRefusedError, type QmsAuthoringSnapshot } from './controlled-document-content';
import { filingAgreesWithEditing } from '../c2c/filing-section-target';
import { QmsControlledTextAuthorshipInvalid, qmsControlledTextAuthorIds } from './controlled-text-authorship';
import { assertCurrentQmsSigningAuthority } from './current-signing-admission';

/**
 * The §11.50(a)(3) meaning an approval carries. Taken from the platform's
 * signature-meaning enum (`TASK_SIGNATURE_MEANINGS`), not minted here: an
 * approval that makes a controlled document effective means exactly this, so
 * the route accepts this value and no other.
 */
export const QMS_DOCUMENT_APPROVAL_MEANING: (typeof TASK_SIGNATURE_MEANINGS)[number] = 'APPROVED';

/**
 * The §11.50(a)(3) meaning a retirement carries (P-51, 2026-10-29): the signer
 * withdraws the document from use, which is not an approval of it. Until then a
 * retirement was signed 'APPROVED'; those stored rows keep the meaning they were
 * signed with. The route accepts this value and no other.
 */
export const QMS_DOCUMENT_RETIREMENT_MEANING = 'retirement' as const satisfies GovernedSignMeaning;

/**
 * `electronic_signatures.binding_basis` for a QMS controlled-document approval,
 * retirement and periodic review. Stated explicitly so a reader of the row
 * knows what `bound_payload_digest` is a digest OF. It is
 * BINDING_BASIS.QMS_DOCUMENT_VERSION_CONTENT in signature-persistence, which
 * names the others; `satisfies` holds the two together without a load-time
 * import of that module, which imports this one through its binders.
 */
export const QMS_DOCUMENT_BINDING_BASIS = 'qms-document-version-content-sha256' as const satisfies BindingBasis;

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

/*
 * Only a document under review is approved. Until 2026-10-08 this set held
 * 'draft' as well, so one signature made a draft that no one had been asked to
 * review effective, and the register's Approve dialog said so ("v1.2 becomes
 * effective when you sign", QA walk 2026-10-08, J8). A draft is sent for review
 * first — PATCH /api/mdx/qms/documents/:id with status 'in_review', the
 * register's "Send for review" — and the approval then signs what was reviewed.
 */
const APPROVABLE_STATES: ReadonlySet<string> = new Set(['in_review']);

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

/**
 * The content digest a QMS retirement signature is bound to (§11.70): the
 * approval recipe over the same version content, with `metadata.retired`
 * excluded as well — the retirement writes that block and stores this digest
 * inside it, so including it would make the digest self-referential (the same
 * reason the recipe above excludes `metadata.approval`). Pure and exported so
 * an inspector can recompute it from the stored, retired row.
 */
export function computeQmsDocumentRetirementDigest(row: QmsDocumentRow): string {
  const metadata = { ...(row.metadata ?? {}) } as Record<string, unknown>;
  delete metadata.retired;
  return computeQmsDocumentContentDigest({ ...row, metadata });
}

export type QmsApprovalRefusalCode = 'NOT_FOUND' | 'INVALID_STATE' | 'SELF_APPROVAL' | 'INVALID_AUTHORSHIP' | 'FILING_DIVERGED';

/** A refusal the route maps to a status. Nothing has been written when thrown. */
export class QmsApprovalRefusedError extends Error {
  constructor(public readonly code: QmsApprovalRefusalCode, message: string) {
    super(message);
    this.name = 'QmsApprovalRefusedError';
  }
}

/**
 * P-29.2: a seal may not be applied over a filing that no longer holds this
 * document's text.
 *
 * The approval below stamps `authoring_documents.status = 'APPROVED'`, a
 * sealing status, and binds a §11.50 signature to the content. So the filed
 * copy must have been proven equal FIRST — this is the fourth seal, found by
 * `ci:filing-exit-agreement` on its own first run rather than by any list.
 *
 * Only the `different` subset refuses, exactly as `filingBlocksSeal` in
 * authoring.router.ts decides it: `empty` is a section the filing has no row
 * for, which the authoring seal reports and seals anyway. Two answers to one
 * question is the divergence the D2 consolidation removed.
 *
 * Called before any write, so nothing has been signed or stamped when it
 * throws — the contract QmsApprovalRefusedError already states.
 */
async function refuseIfFilingDiverged(
  client: SignatureDbClient, authoringDocId: string, orgId: number,
): Promise<void> {
  const agreement = await filingAgreesWithEditing(client, { authoringDocId, tenantId: orgId });
  const rewritten = agreement.diverged.filter((d) => d.filed === 'different');
  if (rewritten.length === 0) return;
  /* Name what the approver can OPEN, not only the filing node: for an
     assembled node the key is `2.5` and no authoring section carries that
     code, so a refusal naming only the key sends them looking for a section
     that does not exist. Same rule, same reason, as the authoring refusal. */
  const named = rewritten.map((d) => (d.section.code === d.key ? d.key : `${d.section.code} (filed at ${d.key})`));
  const one = named.length === 1;
  throw new QmsApprovalRefusedError(
    'FILING_DIVERGED',
    `Not approved — the filed copy of ${one ? 'section' : 'sections'} ${named.join(', ')} ${one ? 'is' : 'are'} `
    + 'not the text this document holds. Approving seals the text for filing, so the signature would attest to '
    + `text the submission does not contain. Re-file it from the editor: open ${one ? 'that section' : 'those sections'}, `
    + 'make any edit and save, which rewrites the filed copy. Then approve again. Nothing was signed.',
  );
}

export interface ApproveQmsDocumentSignedParams {
  orgId: number;
  /** The signer — already re-authenticated (reverifySigner) and authorized (isSigningAuthorized). */
  userId: number;
  documentId: number;
  /** Reason for change, captured on the ledger, the signature and the document. */
  reason: string;
  /** The declared §11.50 meaning; the route admits only QMS_DOCUMENT_APPROVAL_MEANING. */
  meaning: string;
  /** Optional YYYY-MM-DD; defaults to the stored effective_date, else today. */
  effectiveDate: string | null;
  /** The factors reverifySigner actually verified — never more. */
  authenticationMethod: 'password' | 'password+totp';
  secondFactorVerified: boolean;
  ipAddress: string | null;
  /**
   * The review route's part in the approval (RR4, §2.8; services/qms/qms-review-route.ts):
   * `before` runs under the row lock, after the content digest is computed and
   * before anything is written, and refuses an approval the route does not admit
   * (returning what `after` needs, or null for a document with no route);
   * `after` runs on the same transaction once the signature row exists.
   */
  route?: QmsApprovalRoute;
}

/** What the review route contributes to an approval (RR4). */
export interface QmsApprovalRoute {
  before: (client: SignatureDbClient, row: QmsDocumentRow, contentDigest: string) => Promise<unknown>;
  after: (client: SignatureDbClient, routed: unknown, signatureId: number) => Promise<void>;
}
const noRoute = async (): Promise<null> => null;

/**
 * The content a QMS approval signs, and its §11.70 digest: the version row as
 * it stands, with the canonical authored sections captured under lock when the
 * document is authored in the editor. One recipe, read by the approval, by the
 * review route's send (the route's content_digest) and by the `qms-document`
 * binder for a review signature (governed-target-binders.ts), so a review and
 * the approval that follows it bind the same digest (RR4, §2.8: "the review
 * digest equals the approval digest").
 */
export async function qmsSignedContent(
  client: SignatureDbClient,
  current: QmsDocumentRow,
  requireText = true,
): Promise<{ authoredContent: QmsAuthoringSnapshot | null; row: QmsDocumentRow; contentDigest: string }> {
  const authoredContent = current.authoring_document_id ? await captureQmsAuthoringContent(client, current, requireText) : null;
  const row = authoredContent ? { ...current, metadata: { ...(current.metadata ?? {}), authoringContent: authoredContent } } : current;
  return { authoredContent, row, contentDigest: computeQmsDocumentContentDigest(row) };
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

/**
 * Read the row under lock, tenant-scoped. Nothing is written. The version
 * content is read under lock so the digest is over the exact row the UPDATE
 * changes, and the two-person check sees the same author.
 */
async function lockDocumentRow(
  client: SignatureDbClient,
  orgId: number,
  documentId: number,
): Promise<QmsDocumentRow> {
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
  return row;
}

/** Read the row under lock and apply the approval refusals. Nothing is written. */
async function lockApprovableDocument(
  client: SignatureDbClient,
  orgId: number,
  userId: number,
  documentId: number,
): Promise<QmsDocumentRow> {
  const row = await lockDocumentRow(client, orgId, documentId);
  if (!APPROVABLE_STATES.has(row.status)) {
    throw new QmsApprovalRefusedError(
      'INVALID_STATE',
      row.status === 'draft'
        ? 'This document is a draft. Send it for review first; only a document under review can be approved. Nothing was signed.'
        : `Document is ${row.status}; only a document under review can be approved. Nothing was signed.`,
    );
  }
  // The original creator and every recorded controlled-text contributor remain
  // authors; changing the procedure never lets its writer sign their own work.
  let contributors: number[];
  try { contributors = qmsControlledTextAuthorIds(row.metadata); }
  catch (error) {
    if (error instanceof QmsControlledTextAuthorshipInvalid) throw new QmsApprovalRefusedError('INVALID_AUTHORSHIP', error.message);
    throw error;
  }
  if (row.author_id === userId || contributors.includes(userId)) {
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
  signedContent: { contentDigest: string; occurredAt: Date; twoPersonRule: string; authoredContent: QmsAuthoringSnapshot | null },
): Promise<QmsDocumentRow> {
  const { contentDigest, occurredAt, twoPersonRule, authoredContent } = signedContent;
  const updated = await client.query(
    `UPDATE qms_documents
        SET status = 'effective',
            approver_id = $3,
            approved_at = $6::timestamptz,
            effective_date = COALESCE($4::date, effective_date, $6::date),
            metadata = COALESCE(metadata, '{}'::jsonb) || CASE WHEN $11::jsonb IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('authoringContent', $11::jsonb) END || jsonb_build_object(
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
        AND status = 'in_review'
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
      authoredContent ? JSON.stringify(authoredContent) : null,
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
  const current = await lockApprovableDocument(client, orgId, userId, documentId);
  await assertCurrentQmsSigningAuthority(client, { organizationId: orgId, userId, target: `qms-document:${documentId}` });
  const { authoredContent, row, contentDigest } = await qmsSignedContent(client, current);
  if (!authoredContent && !qmsTrainingSectionSchema.array().min(1).safeParse(current.metadata?.sections).success)
    throw new QmsContentRefusedError(409, 'QMS_CONTENT_REQUIRED', 'Save actual controlled procedure text before review or approval. A registry entry or template outline cannot be approved.');
  if (authoredContent) await authorizeQmsAuthoredSignature(client, orgId, userId, authoredContent);
  if (authoredContent) await refuseIfFilingDiverged(client, authoredContent.documentId, orgId);
  const routed = await (params.route?.before ?? noRoute)(client, row, contentDigest);
  const controlledTextAuthorUserIds = qmsControlledTextAuthorIds(row.metadata);
  const twoPersonRule = row.author_id != null || controlledTextAuthorUserIds.length > 0 ? 'enforced' : 'not_applicable_no_author_recorded';
  const target = `qms-document:${documentId}`;
  const occurredAt = new Date();

  const document = await applyApproval(client, params, { contentDigest, occurredAt, twoPersonRule, authoredContent });

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
      originalAuthorId: row.author_id,
      controlledTextAuthorUserIds,
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
    extraManifest: { docNumber: row.doc_number, version: row.version, twoPersonRule, originalAuthorId: row.author_id, controlledTextAuthorUserIds },
    complianceStatement:
      'QMS controlled-document approval (21 CFR 820.40 / ISO 13485 §4.2.4) applied as an electronic signature under 21 CFR Part 11 §11.50/§11.70/§11.200; ledger-chained to the audit_logs sha256 chain.',
  });

  if (authoredContent) {
    await persistQmsSignedVersion(client, document, authoredContent, contentDigest, signed.id);
    await client.query(`UPDATE authoring_documents SET status = 'APPROVED', approved_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND tenant_id = $2`, [authoredContent.documentId, orgId]);
  }
  // RR4 (§2.8): on a routed document, the approver's task closes on this
  // signature and the route completes, on this transaction.
  if (routed) await params.route!.after(client, routed, signed.id);

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

/* ── Retirement ─────────────────────────────────────────────────────────────── */

/** The retirement takes the approval's parameters less the effective date, which it does not set, and carries the retirement meaning. */
export type RetireQmsDocumentSignedParams = Omit<ApproveQmsDocumentSignedParams, 'effectiveDate' | 'meaning'> & {
  meaning: typeof QMS_DOCUMENT_RETIREMENT_MEANING;
};

export interface RetireQmsDocumentSignedResult {
  document: QmsDocumentRow;
  signature: QmsApprovalSignatureRecord;
}

/**
 * Read the row under lock and apply the retirement refusal. The admissible
 * set is the one the unsigned route had — any document not already retired —
 * kept on purpose: narrowing it (effective/superseded only) is a lifecycle
 * decision for the founder, not a security fix. There is no two-person rule
 * here: nothing in the plan row asks for one, and a retirement is not an
 * approval of the author's own work.
 */
async function lockRetirableDocument(
  client: SignatureDbClient,
  orgId: number,
  documentId: number,
): Promise<QmsDocumentRow> {
  const row = await lockDocumentRow(client, orgId, documentId);
  if (row.status === 'retired') {
    throw new QmsApprovalRefusedError('INVALID_STATE', 'Document is already retired; nothing was changed.');
  }
  return row;
}

/** The qms_documents UPDATE: status → retired plus the retirement stamp. */
async function applyRetirement(
  client: SignatureDbClient,
  params: RetireQmsDocumentSignedParams,
  fromStatus: string,
  contentDigest: string,
  occurredAt: Date,
): Promise<QmsDocumentRow> {
  const updated = await client.query(
    `UPDATE qms_documents
        SET status = 'retired',
            metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
              'retired',
              jsonb_build_object(
                'reason', $4::text,
                'meaning', $5::text,
                'contentDigest', $6::text,
                'bindingBasis', $7::text,
                'by', $3::int,
                'at', $8::timestamptz,
                'fromStatus', $9::text
              )
            ),
            updated_at = NOW()
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL AND status <> 'retired'
      RETURNING *`,
    [
      params.documentId,
      params.orgId,
      params.userId,
      params.reason,
      params.meaning,
      contentDigest,
      QMS_DOCUMENT_BINDING_BASIS,
      occurredAt.toISOString(),
      fromStatus,
    ],
  );
  const document = updated.rows[0] as QmsDocumentRow | undefined;
  if (!document) {
    // The FOR UPDATE read makes this unreachable in practice; refuse rather
    // than sign a row that did not change.
    throw new QmsApprovalRefusedError('INVALID_STATE', 'Document state changed before the retirement could be applied.');
  }
  return document;
}

/**
 * Retire a controlled document as a signed act, on the caller's transaction
 * client: the UPDATE (status → retired, `metadata.retired` carrying reason,
 * meaning, the bound digest, who, when and the state it left), the chained
 * ledger pair (command `retire`) and exactly one `electronic_signatures` row.
 * Any throw rolls all three back — the document is never retired without its
 * signature and audit row, and never signed without being retired.
 */
export async function retireQmsDocumentSigned(
  client: SignatureDbClient,
  params: RetireQmsDocumentSignedParams,
): Promise<RetireQmsDocumentSignedResult> {
  const { orgId, userId, documentId } = params;
  const row = await lockRetirableDocument(client, orgId, documentId);
  if (row.authoring_document_id) await authorizeQmsAuthoredSignature(client,orgId,userId,await captureQmsAuthoringContent(client,row,false));
  await assertCurrentQmsSigningAuthority(client, { organizationId: orgId, userId, target: `qms-document:${documentId}` });
  const contentDigest = computeQmsDocumentRetirementDigest(row);
  const target = `qms-document:${documentId}`;
  const occurredAt = new Date();
  // RR4 (§2.9): retiring a document in review is an exit from review; its open route is withdrawn below.
  const routed = await (params.route?.before ?? noRoute)(client, row, contentDigest);

  const document = await applyRetirement(client, params, row.status, contentDigest, occurredAt);

  // §11.10(e): the chained ledger pair, same transaction.
  const gov = await recordGovernedAction(client, {
    orgId,
    userId,
    command: 'retire',
    target,
    reason: params.reason,
    payload: {
      meaning: params.meaning,
      contentDigest,
      bindingBasis: QMS_DOCUMENT_BINDING_BASIS,
      docNumber: row.doc_number,
      version: row.version,
      fromStatus: row.status,
      toStatus: 'retired',
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
    signatureType: 'qms-document-retirement',
    command: 'retire',
    binding: {
      digest: contentDigest,
      basis: QMS_DOCUMENT_BINDING_BASIS,
      note:
        'sha256 over the canonical qms_documents version content (id, organization, doc number, version, title, type, category, artifact pointer, next review date, metadata minus metadata.approval and metadata.retired) read under FOR UPDATE at retirement time — the same digest stored on metadata.retired.contentDigest; recompute from the stored row with computeQmsDocumentRetirementDigest.',
    },
    extraManifest: { docNumber: row.doc_number, version: row.version, fromStatus: row.status },
    complianceStatement:
      'QMS controlled-document retirement (21 CFR 820.40 / ISO 13485 §4.2.4 obsolete-document control) applied as an electronic signature under 21 CFR Part 11 §11.50/§11.70/§11.200; ledger-chained to the audit_logs sha256 chain.',
  });
  if (routed) await params.route!.after(client, routed, signed.id);

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
