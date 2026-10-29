/** Release controls for copies of stored workflow content. An import, a model
 * name, and a review verdict are three different facts; none is qualification. */
import { isWorkflowImportOrigin, type WorkflowImportOrigin } from '../../../shared/authoring/source-import';
import { clauseSpans } from '../clinical-regulatory-evidence/lineage-gate';
import { comparableText, MIN_MACHINE_CLAUSE_CHARS } from '../clinical-regulatory-evidence/machine-attribution';
import { assertLineageCoversContent, assertLineageHashesMatchContent, SpanLineageError, hashSpanText, listLiveMachineSpans } from '../clinical-regulatory-evidence/span-lineage.service';
import { sectionsDigest, computeAuthoringSignatureDigest, fullVisibleAuthoringSnapshot, authoringSnapshotHash } from './authoring-content-digests';
import { authoringReviewStanding } from './peer-review';
import type { AuthoringActor } from './authoring-documents';
import type { Queryable } from './authoring-evidence';
import { verifySavedWorkflowImport } from './import-source-references';
import { WORKFLOW_IMPORT_AUTHOR_ID } from './revision-ledger';
import { workflowCopySectionContent } from './workflow-copy-content';
import { hashPayload } from '../audit/chain';
import { isDeepStrictEqual } from 'node:util';
import type { MaterializedWorkflowSource } from './workflow-source-import';
import { assertSignerIsNotAuthor, SeparationOfDutiesError, SeparationOfDutiesAuthorUnresolvedError } from '../governance/separation-of-duties';

export interface WorkflowGovernanceDocument {
  id: string;
  provenance?: unknown;
  client_program_id?: unknown;
  created_by?: unknown;
  title?: unknown;
  module?: unknown;
  locale?: unknown;
  product_code?: unknown;
  version?: unknown;
}
export interface WorkflowGovernanceSection { id: string; code: string; content: string | null; title?: unknown }
export interface WorkflowGovernanceInput {
  organizationId: number;
  doc: WorkflowGovernanceDocument;
  sections: ReadonlyArray<WorkflowGovernanceSection>;
  actor?: AuthoringActor;
}
export interface WorkflowSourceAdoption {
  fingerprint: string;
  contentHash: string;
  snapshotHash: string;
  reviewId: string;
  reviewerId: string;
  scope: 'full-document';
  originalAuthorshipDisclosed: true;
}
export class WorkflowImportGovernanceError extends Error {
  constructor(readonly status: 400 | 403 | 404 | 409 | 503, readonly code: string, message: string) {
    super(message);
    this.name = 'WorkflowImportGovernanceError';
  }
}
const refusal = (code: string, message: string): never => {
  throw new WorkflowImportGovernanceError(409, code, message);
};
function sourceVerificationStatus(error: unknown): 403 | 404 | 409 | 503 {
  const status = Number((error as { status?: unknown }).status);
  return status === 403 ? 403 : status === 404 ? 404 : status === 503 ? 503 : 409;
}

/** The immutable genesis receipt is authoritative. Editing the document's
 * displayed provenance cannot turn a known machine source into a human one. */
async function retainedOrigin(q: Queryable, input: WorkflowGovernanceInput): Promise<{
  origin: WorkflowImportOrigin; sourceCodes: Map<string, string>;
} | null> {
  const rows = await q.query(`SELECT section_id::text, metadata->'provenance'->'importSource' AS origin,
      metadata->>'section_code' AS source_code
    FROM authoring_audit_trail WHERE doc_id=$1 AND tenant_id=$2 AND operation_type='CREATE'
      AND metadata->'provenance'->'importSource'->>'kind' IN ('protocol','csr','ivd-assessment','ivd-document','study-design-crf','agency-response')
    ORDER BY created_at, id`, [input.doc.id, input.organizationId]);
  const first = rows.rows[0]?.origin as WorkflowImportOrigin | undefined;
  if (!first) {
    const visible = (input.doc.provenance as { importSource?: WorkflowImportOrigin } | undefined)?.importSource;
    if (visible && isWorkflowImportOrigin(visible)) refusal('WORKFLOW_ORIGIN_UNVERIFIED', 'The workflow copy has no retained creation receipt. Its origin must be reconciled before release.');
    return null;
  }
  if (!isWorkflowImportOrigin(first) || !Array.isArray(first.sectionOrigins)
    || String(input.doc.client_program_id ?? '').toLowerCase() !== first.programId.toLowerCase()
    || rows.rows.some((row: { origin: WorkflowImportOrigin }) => JSON.stringify(row.origin) !== JSON.stringify(first))) {
    refusal('WORKFLOW_ORIGIN_UNVERIFIED', 'The retained workflow origin or target is inconsistent. Nothing was released.');
  }
  return { origin: first, sourceCodes: new Map(rows.rows.map((row: { section_id: string; source_code: string }) => [row.section_id, row.source_code])) };
}

async function inspectedWorkflow(q: Queryable, input: WorkflowGovernanceInput) {
  const retained = await retainedOrigin(q, input);
  if (!retained) return null;
  if (!input.actor) throw new WorkflowImportGovernanceError(403, 'WORKFLOW_ACTOR_REQUIRED', 'Current actor identity is required to verify this workflow copy.');
  const provenance = input.doc.provenance && typeof input.doc.provenance === 'object' ? input.doc.provenance : {};
  let source;
  try {
    source = await verifySavedWorkflowImport({ ...input.doc, provenance: { ...provenance, importSource: retained.origin } }, q,
      { organizationId: input.organizationId, actor: input.actor });
  } catch (error) {
    throw new WorkflowImportGovernanceError(sourceVerificationStatus(error),
      'WORKFLOW_SOURCE_UNAVAILABLE', 'Current access and the exact retained workflow source could not be verified. Nothing was released.');
  }
  if (!source) return refusal('WORKFLOW_ORIGIN_UNVERIFIED', 'The retained workflow source could not be verified.');
  const original = new Map(source.origin.sectionOrigins.map(origin => [origin.code, origin]));
  let knownMachineRemains = false;
  for (const section of input.sections) {
    // Coverage is read from the canonical lineage store. A direct content write
    // without its matching provenance is not a human rewrite.
    await assertLineageCoversContent(input.organizationId, { documentTable: 'authoring_sections', documentId: section.id }, section.content ?? '', q);
    await verifyCurrentLineageHashes(q, { organizationId: input.organizationId, section });
    if (await sectionRetainsKnownMachine(q, { organizationId: input.organizationId, section, original, sourceCodes: retained.sourceCodes })) knownMachineRemains = true;
  }
  // A copied clause moved to another section must not be laundered by that
  // section's local human-save attribution. Use the canonical comparison form,
  // which keeps scientific numbers/operators and ignores silent formatting.
  if (retainedKnownMachineClauses(source, input.sections)) knownMachineRemains = true;
  return { origin: source.origin, knownMachineRemains, contentHash: sectionsDigest(input.sections) };
}

async function verifyCurrentLineageHashes(q: Queryable, input: { organizationId: number; section: WorkflowGovernanceSection }): Promise<void> {
  const { section } = input;
  try {
    await assertLineageHashesMatchContent(input.organizationId,
      { documentTable: 'authoring_sections', documentId: section.id }, section.content ?? '', q);
  } catch (error) {
    if (!(error instanceof SpanLineageError)) throw error;
    refusal('WORKFLOW_LINEAGE_UNVERIFIED', 'Current clause lineage does not describe the saved text. A content write without matching lineage is not a verified human replacement.');
  }
}

/** This stricter retention check is not quote attribution or a similarity score.
 * Prose punctuation/reflow alone must not discharge known generated content.
 * Decimal/group separators immediately before digits and scientific operators
 * remain literal; a different numeric result is never treated as the same fact. */
function qualificationComparison(content: string): string {
  return comparableText(content).replace(/[.,;:!?](?!\d)/g, ' ').replace(/\s+/g, ' ').trim();
}

function retainedKnownMachineClauses(source: MaterializedWorkflowSource, sections: ReadonlyArray<WorkflowGovernanceSection>): boolean {
  const knownCodes = new Set(source.origin.sectionOrigins.filter(origin => origin.originalAuthorship === 'machine').map(origin => origin.code));
  const current = sections.map(section => qualificationComparison(section.content ?? ''));
  return source.sections.filter(section => knownCodes.has(section.code)).some(section =>
    clauseSpans(workflowCopySectionContent(section.content)).some(clause => {
      const needle = qualificationComparison(clause.text);
      return needle.length >= MIN_MACHINE_CLAUSE_CHARS && current.some(text => text.includes(needle));
    }));
}

async function sectionRetainsKnownMachine(q: Queryable, input: {
  organizationId: number; section: WorkflowGovernanceSection;
  original: Map<string, WorkflowImportOrigin['sectionOrigins'][number]>; sourceCodes: Map<string, string>;
}): Promise<boolean> {
  const { section, original, sourceCodes } = input;
  const live = await listLiveMachineSpans(input.organizationId, { documentTable: 'authoring_sections', documentId: section.id }, q);
  const code = sourceCodes.get(section.id);
  let remains = false;
  for (const span of live.filter(span => span.machineAuthorId === WORKFLOW_IMPORT_AUTHOR_ID)) {
    const text = (section.content ?? '').slice(span.charStart, span.charEnd);
    if (hashSpanText(text) !== span.spanTextSha256) refusal('WORKFLOW_LINEAGE_UNVERIFIED', 'Workflow lineage does not describe the current content. Reconcile the affected text before release.');
    if (!code || !original.has(code)) return refusal('WORKFLOW_LINEAGE_UNVERIFIED', 'Workflow lineage has no verified source section.');
    if (original.get(code)?.originalAuthorship === 'machine') remains = true;
  }
  return remains;
}

/** A retained verdict stays a fact. A new adoption/release action must also
 * satisfy current independence after any later human content contribution. */
async function independentAdoptingReviewer(q: Queryable, input: WorkflowGovernanceInput, reviewerId: string): Promise<boolean> {
  try {
    await assertSignerIsNotAuthor(`authoring-document:${input.doc.id}`, input.organizationId, Number(reviewerId),
      { client: q, meaning: 'review' });
    return true;
  } catch (error) {
    if (error instanceof SeparationOfDutiesError || error instanceof SeparationOfDutiesAuthorUnresolvedError) return false;
    throw new WorkflowImportGovernanceError(503, 'WORKFLOW_REVIEW_AUTHORITY_UNAVAILABLE',
      'Current independent reviewer authority could not be verified. Nothing was released.');
  }
}

async function approvedAssignment(q: Queryable, input: WorkflowGovernanceInput) {
  if (!input.actor) throw new WorkflowImportGovernanceError(403, 'WORKFLOW_ACTOR_REQUIRED', 'Current reviewer identity is required.');
  const result = await q.query(`SELECT r.id::text, r.doc_id::text AS doc_id, r.reviewer_id, u.email,
      r.review_status, r.requested_at, r.requested_by, r.reviewed_at,
      r.reviewed_snapshot, r.reviewed_snapshot_hash, r.review_binding_basis
    FROM authoring_reviews r JOIN users u ON u.id::text=r.reviewer_id
    JOIN organization_users ou ON ou.user_id=u.id AND ou.organization_id=r.tenant_id
    JOIN organizations o ON o.id=ou.organization_id
    WHERE r.doc_id=$1 AND r.tenant_id=$2 AND r.reviewer_id=$3
      AND r.review_status='approved' AND r.reviewed_at IS NOT NULL
      AND r.requested_by IS NOT NULL AND r.requested_at <= r.reviewed_at
      AND r.reviewer_id <> $4 AND u.status='active' AND o.status='active'
    FOR SHARE OF r, u, ou, o`, [input.doc.id, input.organizationId, input.actor.id, String(input.doc.created_by ?? '')]);
  const row = result.rows[0];
  if (result.rows.length !== 1 || !row.email || String(row.email).toLowerCase() !== input.actor.email?.toLowerCase() ||
      authoringReviewStanding(row, authoringSnapshotHash(fullVisibleAuthoringSnapshot(input))) !== 'current' ||
      !await independentAdoptingReviewer(q, input, String(row.reviewer_id))) {
    return refusal('WORKFLOW_REVIEW_ASSIGNMENT_REQUIRED', 'Explicit adoption needs this reviewer’s approved, assigned review of the document. The author cannot adopt their own copy as its reviewer.');
  }
  return row as { id: string; reviewer_id: string; email: string };
}

/** Called after the parent document lock, before credential consumption. This
 * permits a reviewer to record review while a known-machine release hold stands. */
export async function prepareWorkflowImportAdoption(q: Queryable, input: WorkflowGovernanceInput & { explicit: boolean }): Promise<WorkflowSourceAdoption | null> {
  await requireCsrScientificRelease(q, input);
  const state = await inspectedWorkflow(q, input);
  if (!state || !input.explicit) return null;
  const review = await approvedAssignment(q, input);
  return { fingerprint: state.origin.fingerprint, contentHash: state.contentHash, snapshotHash: authoringSnapshotHash(fullVisibleAuthoringSnapshot(input)), reviewId: review.id,
    reviewerId: review.reviewer_id, scope: 'full-document', originalAuthorshipDisclosed: true };
}

async function hasCurrentAdoption(q: Queryable, input: WorkflowGovernanceInput, fingerprint: string, contentHash: string): Promise<boolean> {
  const result = await q.query(`SELECT s.signer_email, s.meaning, s.content_hash, s.covered_content_hash,
      s.signature_digest, t.metadata->'workflowSourceAdoption' AS adoption,
      a.new_values->'workflowSourceAdoption' AS chained_adoption, a.new_values AS chained_values,
      a.payload_hash AS chained_payload_hash, r.id::text AS review_id, r.doc_id::text AS doc_id, r.reviewer_id,
      r.review_status, r.requested_at, r.requested_by, r.reviewed_at,
      r.reviewed_snapshot, r.reviewed_snapshot_hash, r.review_binding_basis
    FROM authoring_signatures s
    JOIN authoring_audit_trail t ON t.doc_id::text=s.doc_id::text AND t.tenant_id=s.tenant_id
      AND t.operation_type IN ('E_SIGN','SIGN') AND t.metadata->>'signatureId'=s.id::text
    JOIN authoring_reviews r ON r.id::text=t.metadata->'workflowSourceAdoption'->>'reviewId'
      AND r.doc_id::text=s.doc_id::text AND r.tenant_id=s.tenant_id
    JOIN users u ON u.id::text=r.reviewer_id AND lower(u.email)=lower(s.signer_email)
    JOIN organization_users ou ON ou.user_id=u.id AND ou.organization_id=r.tenant_id
    JOIN organizations o ON o.id=ou.organization_id
    JOIN audit_logs a ON a.tenant_id=s.tenant_id AND a.record_id=s.doc_id::text
      AND a.action IN ('authoring.document.e-sign','authoring.document.sign') AND a.new_values->>'signatureId'=s.id::text
    WHERE s.doc_id=$1 AND s.tenant_id=$2 AND s.meaning='REVIEWER' AND s.content_hash=$3
      AND t.actor_id=r.reviewer_id AND t.actor_email=s.signer_email
      AND r.review_status='approved' AND r.reviewed_at IS NOT NULL AND r.requested_by IS NOT NULL
      AND r.reviewer_id <> $4 AND r.requested_at <= r.reviewed_at AND r.reviewed_at <= s.signed_at
      AND r.requested_at <= s.signed_at AND u.status='active' AND o.status='active'`,
  [input.doc.id, input.organizationId, contentHash, String(input.doc.created_by ?? '')]);
  const candidates = result.rows.filter((row: { signer_email: string; meaning: string; content_hash: string; covered_content_hash: string | null;
    signature_digest: string; adoption: WorkflowSourceAdoption; chained_adoption: WorkflowSourceAdoption;
    chained_values: unknown; chained_payload_hash: string; review_id: string; doc_id: string; reviewer_id: string;
    review_status: string; requested_at: unknown; requested_by: unknown; reviewed_at: unknown;
    reviewed_snapshot: unknown; reviewed_snapshot_hash: unknown; review_binding_basis: unknown }) => {
    const adoption = row.adoption;
    const snapshotHash = authoringSnapshotHash(fullVisibleAuthoringSnapshot(input));
    return authoringReviewStanding(row, snapshotHash) === 'current' &&
      adoption?.fingerprint === fingerprint && adoption.contentHash === contentHash && adoption.snapshotHash === snapshotHash && adoption.reviewId === row.review_id
      && adoption.reviewerId === row.reviewer_id && adoption.scope === 'full-document' && adoption.originalAuthorshipDisclosed === true
      && isDeepStrictEqual(adoption, row.chained_adoption)
      && hashPayload(row.chained_values) === row.chained_payload_hash
      && row.signature_digest === computeAuthoringSignatureDigest({ signerEmail: row.signer_email, meaning: row.meaning,
        contentHash: row.content_hash, coveredContentHash: row.covered_content_hash });
  });
  for (const row of candidates) {
    if (await independentAdoptingReviewer(q, input, String(row.reviewer_id))) return true;
  }
  return false;
}

/** Every controlled boundary calls this on the same reserved document/source
 * snapshot it releases. A review may adopt uncertain authorship; it cannot turn
 * positively generated text without a qualified generation receipt into PQ. */

/** Same reserved transaction as the native freeze/sign/export caller. */
async function requireCsrScientificRelease(q: Queryable, input: WorkflowGovernanceInput): Promise<void> {
  try {
    const { assertCsrScientificRelease } = await import('./csr-scientific-review.js');
    await assertCsrScientificRelease(q, input);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error &&
        typeof error.code === 'string' && error.code.startsWith('CSR_')) {
      throw new WorkflowImportGovernanceError(sourceVerificationStatus(error), error.code,
        'No current scientific-review receipt covers the saved CSR and its approved source versions. Nothing was signed or released.');
    }
    throw error;
  }
}

/** Every gate must pass; the order only decides which refusal is reported.
 * Workflow model-qualification and adoption are reported before the CSR
 * scientific-review receipt: replacing unqualified machine text changes the
 * snapshot, which invalidates any scientific receipt bound to it, so asking for
 * that receipt first would send the reviewer through work that must be redone.
 * The CSR gate still runs for native (non-imported) CSR documents. */
export async function assertWorkflowImportRelease(q: Queryable, input: WorkflowGovernanceInput): Promise<void> {
  const state = await inspectedWorkflow(q, input);
  if (state) {
    if (state.knownMachineRemains) refusal('WORKFLOW_MODEL_QUALIFICATION_REQUIRED',
      'Stored machine-generated text remains in this copy without retained qualified generation evidence. Review and source identity do not establish model qualification. Replace the affected text through the governed human editing path before release.');
    if (!await hasCurrentAdoption(q, input, state.origin.fingerprint, state.contentHash)) {
      refusal('WORKFLOW_HUMAN_ADOPTION_REQUIRED', 'Release needs an assigned reviewer’s approved review and explicit REVIEWER electronic signature adopting this exact full document. Earlier reviews and imported signatures do not cover this copy.');
    }
  }
  await requireCsrScientificRelease(q, input);
}

/** An uncontrolled review copy may retain uncertain/unqualified source prose,
 * but it still needs current access, exact source identity and honest lineage. */
export async function verifyWorkflowImportWorkingCopy(q: Queryable, input: WorkflowGovernanceInput): Promise<{
  origin: WorkflowImportOrigin; knownMachineRemains: boolean;
} | null> {
  const state = await inspectedWorkflow(q,input);
  return state ? { origin:state.origin,knownMachineRemains:state.knownMachineRemains } : null;
}
