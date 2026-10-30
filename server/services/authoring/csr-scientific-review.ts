/** Persistence/read adapter for CSR scientific review in the existing
 * authoring review + chained audit records. No new database or approval path.
 * Call inside the caller's reserved authoring transaction, never on a pool.
 */
import type { Queryable } from './authoring-evidence';
import type { AuthoringSavedSnapshot } from '../../../shared/authoring/peer-review';
import {
  CsrScientificReviewError, canonicalScientificJson, parseScientificReviewSubmission,
  prepareScientificReviewReceipt, scientificTablesSha256,
  type RetainedScientificRun, type ScientificReviewReceipt,
} from './csr-scientific-review-core.js';
import { CSR_TEMPLATE_IDS, isCsrTemplateId, labelledCsr } from '../../../shared/authoring/csr-scientific-review.js';

export interface CsrScientificReviewContext {
  tenantId: number; actorId: string; document: Record<string, unknown>;
  snapshot: AuthoringSavedSnapshot; snapshotHash: string;
}
export interface CsrScientificReviewDependencies {
  loadTables: (q: Queryable, scope: { organizationId: number; programId: string; userId: number },
    runId: string, options: { forRelease: true }) => Promise<RetainedScientificRun>;
  verifyAudit: (row: Record<string, unknown>) => boolean;
  snapshotHash: (snapshot: AuthoringSavedSnapshot) => string;
  verifyReviewer: (q: Queryable, input: CsrScientificReviewContext, reviewerId: string, reviewerEmail: string) => Promise<void>;
}
async function productionDependencies(): Promise<CsrScientificReviewDependencies> {
  const [{ readSavedClinicalTables }, { verifyAuthoringTrailRow }, { hashPayload }, { authoringSnapshotHash }] = await Promise.all([
    import('../csr/saved-clinical-tables.js'), import('./authoring-evidence.js'),
    import('../audit/chain.js'), import('./authoring-content-digests.js'),
  ]);
  return {
    /* readSavedClinicalTables refuses every source whose sourceApproval is not
       'canonical-lifecycle' (csr/saved-clinical-tables.ts), and the core checks
       it again; the object it returns is typed by the wider receipt. */
    loadTables: (q, scope, runId, options) => readSavedClinicalTables(q, scope, runId, options) as Promise<RetainedScientificRun>,
    snapshotHash: authoringSnapshotHash,
    verifyReviewer: async (q, input, reviewerId, reviewerEmail) => {
      const [{ authorizeAuthoringProgram }, { resolveAuthoringDocumentScope, decideAuthoringPermission },
        { assertSignerIsNotAuthor }] = await Promise.all([
        import('./authoring-program-access.js'), import('./authoring-permissions.js'),
        import('../governance/separation-of-duties.js'),
      ]);
      const authorized = await authorizeAuthoringProgram(q, { tenantId: input.tenantId,
        actor: { id: reviewerId, email: reviewerEmail }, programId: scope(input).programId, forWrite: false });
      const documentScope = await resolveAuthoringDocumentScope(q, input.tenantId, input.snapshot.id);
      if (!documentScope || !(await decideAuthoringPermission({ pool: q, principal: authorized.principal,
        scope: documentScope, action: 'review' })).allowed) {
        refusal('CSR_EVIDENCE_REVIEWER_UNAVAILABLE', 'Current independent scientific reviewer authority could not be verified.');
      }
      await assertSignerIsNotAuthor(`authoring-document:${input.snapshot.id}`, input.tenantId, Number(reviewerId),
        { client: q, meaning: 'review' });
    },
    verifyAudit: row => {
      const verdict = verifyAuthoringTrailRow({
        id: String(row.trail_id), operation_type: String(row.operation_type),
        before_content: row.before_content as string | null, after_content: row.after_content as string | null,
        content_hash_before: row.content_hash_before as string | null, content_hash_after: row.content_hash_after as string | null,
        change_reason: row.change_reason as string | null, metadata: row.metadata,
      }, row.chain_details as Record<string, unknown> | null);
      return verdict.chained && verdict.intact === true && hashPayload(row.chain_details) === row.chain_payload_hash;
    },
  };
}
const refusal = (code: string, message: string): never => { throw new CsrScientificReviewError(code, message); };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
function scope(input: CsrScientificReviewContext) {
  const programId = input.document.client_program_id;
  const userId = Number(input.actorId);
  if (!Number.isSafeInteger(input.tenantId) || input.tenantId <= 0 || !Number.isSafeInteger(userId) || userId <= 0 ||
    typeof programId !== 'string' || !UUID.test(programId) || input.document.id !== input.snapshot.id) {
    return refusal('CSR_EVIDENCE_SCOPE_INVALID', 'Current project, document and authenticated reviewer are required.');
  }
  return { organizationId: input.tenantId, programId, userId };
}

/** What the requirement is decided from: the stored document row and its id.
 * Never the framed snapshot, so a document that is not a CSR is not framed. */
type CsrScientificIdentity = Pick<CsrScientificReviewContext, 'tenantId' | 'document'> & {
  snapshot: Pick<AuthoringSavedSnapshot, 'id'>;
};

/** Stored identity wins over a caller's document-type selection. A built-in
 * CSR template (CSR_TEMPLATE_IDS), a retained CSR origin or an earlier
 * scientific receipt keeps the requirement after rename. The template is read
 * from the stored row, never only from the caller's copy, which may not carry it
 * (2026-10-30). Unknown native templates still require separate inventory
 * qualification. */
export async function requiresCsrScientificReview(q: Queryable, input: CsrScientificIdentity): Promise<boolean> {
  const doc = input.document;
  if ([doc.module, doc.product_code, doc.title].some(labelledCsr)) return true;
  if (isCsrTemplateId(doc.template_id)) return true;
  const p = object(doc.provenance) ? doc.provenance : {};
  if (object(p.importSource) && p.importSource.kind === 'csr') return true;
  const retained = await q.query(`SELECT EXISTS (
    SELECT 1 FROM authoring_audit_trail t WHERE t.doc_id=$1 AND t.tenant_id=$2
      AND ((t.operation_type='CREATE' AND t.metadata->'provenance'->'importSource'->>'kind'='csr')
        OR (t.operation_type='document_reviewed' AND t.metadata->'csrScientificEvidence'->>'format'='c2c.csr-scientific-review.v1'))
    ) OR EXISTS (
    SELECT 1 FROM authoring_documents d WHERE d.id=$1 AND d.tenant_id=$2
      AND lower(to_jsonb(d)->>'template_id') = ANY($3::text[])
    ) AS required`, [input.snapshot.id, input.tenantId, [...CSR_TEMPLATE_IDS]]);
  if (retained.rows.length !== 1 || typeof retained.rows[0].required !== 'boolean') {
    return refusal('CSR_EVIDENCE_IDENTITY_UNAVAILABLE', 'The retained scientific-review requirement could not be checked.');
  }
  return retained.rows[0].required;
}

export async function previewCsrScientificEvidence(q: Queryable, input: CsrScientificReviewContext,
  rawRunIds: unknown, dependencies?: CsrScientificReviewDependencies) {
  const resolved = scope(input);
  if (!Array.isArray(rawRunIds) || rawRunIds.length < 1 || rawRunIds.length > 10 ||
    rawRunIds.some(id => typeof id !== 'string' || !UUID.test(id)) || new Set(rawRunIds).size !== rawRunIds.length) {
    return refusal('CSR_EVIDENCE_INPUT_INVALID', 'Select one to ten distinct retained analysis run IDs.');
  }
  const deps = dependencies ?? await productionDependencies();
  if (deps.snapshotHash(input.snapshot) !== input.snapshotHash) {
    return refusal('CSR_EVIDENCE_SNAPSHOT_INVALID', 'The saved-document snapshot did not verify.');
  }
  const runs: RetainedScientificRun[] = [];
  // Serial lock order is stable across requests and releases; no new tenant pool.
  for (const runId of [...rawRunIds].sort()) {
    runs.push(await deps.loadTables(q, resolved, runId, { forRelease: true }));
  }
  if (runs.some(run => run.programId !== resolved.programId) || runs.some(run => !rawRunIds.includes(run.runId))) {
    return refusal('CSR_EVIDENCE_SCOPE_INVALID', 'The retained tables are outside the selected program.');
  }
  return { documentId: input.snapshot.id, snapshotHash: input.snapshotHash,
    tablesSha256: scientificTablesSha256(runs), runs,
    scientificQualification: 'not-established' as const };
}

/** The existing assigned-review ceremony calls this before its UPDATE. The
 * returned object belongs in that action's immutable/chained audit metadata.
 * No body field can mark a source qualified; reviewer identity is server-bound.
 */
export async function prepareCsrScientificApproval(q: Queryable, input: CsrScientificReviewContext & {
  reviewId: string; submission?: unknown;
}, dependencies?: CsrScientificReviewDependencies): Promise<ScientificReviewReceipt | null> {
  const required = await requiresCsrScientificReview(q, input);
  if (!required) {
    if (input.submission !== undefined) return refusal('CSR_EVIDENCE_SCOPE_INVALID', 'CSR evidence cannot be attached to a different document class.');
    return null;
  }
  if (input.submission === undefined) {
    return refusal('CSR_SCIENTIFIC_REVIEW_REQUIRED', 'Approve this CSR only after mapping its saved result claims to the retained approved tables. Source previews do not constitute approval.');
  }
  const submission = parseScientificReviewSubmission(input.submission);
  const preview = await previewCsrScientificEvidence(q, input, submission.runIds, dependencies);
  return prepareScientificReviewReceipt({ organizationId: input.tenantId, programId: scope(input).programId,
    documentId: input.snapshot.id, snapshotHash: input.snapshotHash, reviewId: input.reviewId,
    reviewerId: input.actorId, snapshot: input.snapshot, submission, runs: preview.runs });
}

/** Used before reviewer/approver signing and controlled release. Reconstructs
 * current source tables and compares the full retained human-review receipt.
 * It neither fabricates receipts nor modifies historical evidence.
 */
export async function requireCurrentCsrScientificApproval(q: Queryable, input: CsrScientificReviewContext,
  dependencies?: CsrScientificReviewDependencies): Promise<ScientificReviewReceipt | null> {
  if (!await requiresCsrScientificReview(q, input)) return null;
  return currentCsrScientificApproval(q, input, dependencies);
}

/** The receipt check itself, for a document already known to be a CSR. */
async function currentCsrScientificApproval(q: Queryable, input: CsrScientificReviewContext,
  dependencies?: CsrScientificReviewDependencies): Promise<ScientificReviewReceipt> {
  const deps = dependencies ?? await productionDependencies();
  const resolved = scope(input);
  if (deps.snapshotHash(input.snapshot) !== input.snapshotHash) {
    return refusal('CSR_EVIDENCE_SNAPSHOT_INVALID', 'The current document snapshot could not be verified.');
  }
  const result = await q.query(`SELECT r.id::text AS review_id, r.reviewer_id, r.reviewed_snapshot,
      r.reviewed_snapshot_hash, r.review_binding_basis, r.requested_at, r.reviewed_at, r.requested_by, u.email AS reviewer_email,
      t.id::text AS trail_id, t.operation_type, t.before_content, t.after_content,
      t.content_hash_before, t.content_hash_after, t.change_reason, t.metadata, t.actor_id,
      a.new_values AS chain_details, a.payload_hash AS chain_payload_hash
    FROM authoring_reviews r
    JOIN authoring_audit_trail t ON t.doc_id::text=r.doc_id::text AND t.tenant_id=r.tenant_id
      AND t.operation_type='document_reviewed' AND t.metadata->>'review_status'='approved'
      AND t.metadata->'csrScientificEvidence'->>'reviewId'=r.id::text
    JOIN audit_logs a ON a.tenant_id=t.tenant_id AND a.record_id=t.doc_id::text
      AND a.action='authoring.section.document_reviewed' AND a.new_values->>'trailId'=t.id::text
    JOIN users u ON u.id::text=r.reviewer_id AND u.status='active'
    JOIN organization_users ou ON ou.user_id=u.id AND ou.organization_id=r.tenant_id
    JOIN organizations o ON o.id=ou.organization_id AND o.status='active'
    WHERE r.doc_id::text=$1 AND r.tenant_id=$2 AND r.review_status='approved'
      AND r.reviewed_snapshot_hash=$3 AND r.review_binding_basis='authoring-full-visible-v1'
      AND r.requested_by IS NOT NULL AND r.requested_at<=r.reviewed_at
      AND t.actor_id::text=r.reviewer_id
    ORDER BY t.created_at DESC, t.id DESC LIMIT 1 FOR SHARE OF r, u, ou, o`,
  [input.snapshot.id, input.tenantId, input.snapshotHash]);
  if (result.rows.length !== 1) return refusal('CSR_SCIENTIFIC_REVIEW_REQUIRED', 'No current assigned scientific-review receipt covers this saved CSR. Nothing was signed or released.');
  const row = result.rows[0];
  await deps.verifyReviewer(q, input, String(row.reviewer_id), String(row.reviewer_email ?? ''));
  if (!deps.verifyAudit(row) || deps.snapshotHash(row.reviewed_snapshot as AuthoringSavedSnapshot) !== input.snapshotHash) {
    return refusal('CSR_EVIDENCE_RECEIPT_INVALID', 'The scientific review audit or saved-content binding did not verify.');
  }
  const stored = object(row.metadata) ? row.metadata.csrScientificEvidence : undefined;
  if (!object(stored) || stored.organizationId !== input.tenantId || stored.programId !== resolved.programId ||
    stored.documentId !== input.snapshot.id || stored.snapshotHash !== input.snapshotHash ||
    stored.reviewId !== row.review_id || stored.reviewerId !== row.reviewer_id ||
    stored.scope !== 'human-reviewed-mapped-tlf-cells' || stored.independentClinicalValidationEstablished !== false) {
    return refusal('CSR_EVIDENCE_RECEIPT_INVALID', 'The retained scientific receipt is not bound to this tenant, review and document.');
  }
  const submission = parseScientificReviewSubmission(stored.submission);
  const preview = await previewCsrScientificEvidence(q, input, submission.runIds, deps);
  const current = prepareScientificReviewReceipt({ organizationId: input.tenantId, programId: resolved.programId,
    documentId: input.snapshot.id, snapshotHash: input.snapshotHash, reviewId: String(row.review_id),
    reviewerId: String(row.reviewer_id), snapshot: input.snapshot, submission, runs: preview.runs });
  if (canonicalScientificJson(current) !== canonicalScientificJson(stored)) {
    return refusal('CSR_EVIDENCE_RECEIPT_CHANGED', 'Source evidence or the scientific receipt changed. Re-review the current CSR before signing.');
  }
  return current;
}

/** Adapter for the existing freeze/sign/export boundary. The caller already
 * holds the parent document and source reservations; this does not re-auth.
 *
 * Every release of every Authoring document passes here, so what the document
 * is comes first, from its stored row and id. Only a CSR is framed as the
 * full-visible snapshot. Until 2026-10-29 the snapshot was framed first, and a
 * row it refuses made the release of a document that is not a CSR answer 500
 * (csr-scientific-release-order.test.ts).
 */
export async function assertCsrScientificRelease(q: Queryable, input: {
  organizationId: number;
  doc: { id: string; title?: unknown; module?: unknown; locale?: unknown; product_code?: unknown; version?: unknown; client_program_id?: unknown; provenance?: unknown };
  sections: ReadonlyArray<{ id: string; code: string; content: string | null; title?: unknown }>;
  actor?: { id: string; email?: string | null };
}): Promise<void> {
  const identity = { tenantId: input.organizationId, document: { ...input.doc }, snapshot: { id: input.doc.id } };
  if (!await requiresCsrScientificReview(q, identity)) return;
  const { fullVisibleAuthoringSnapshot, authoringSnapshotHash } = await import('./authoring-content-digests.js');
  const snapshot = fullVisibleAuthoringSnapshot({ doc: input.doc, sections: input.sections });
  await currentCsrScientificApproval(q, { ...identity, actorId: input.actor?.id ?? '',
    snapshot, snapshotHash: authoringSnapshotHash(snapshot) });
}
