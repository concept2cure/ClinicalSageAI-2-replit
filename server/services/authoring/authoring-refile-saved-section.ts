/** Complete the existing filing write with the reserved saved body, without
 * manufacturing an Authoring content change or replacing its authorship. */
import { z } from 'zod';
import { isDeepStrictEqual } from 'node:util';
import type { PoolClient } from 'pg';
import { requireGovernedReason } from '../../routes/governed-reason';
import { filingSectionKey } from '../../../shared/regulatory/filing-section-key';
import { commitSectionToFiling } from '../c2c/commit-section-to-filing';
import { filingResponse, filingSectionMembers } from '../c2c/filing-section-target';
import { lockDocumentDispositionProgram } from '../document-data-disposition/program-lock';
import { canAccessReportProject } from '../report-os/project-access';
import { qmsAuthoringWriteRefusal } from '../qms/controlled-document-content';
import { createScopedLogger } from '../../utils/logger';
import { assertLineageCoversContent, assertLineageHashesMatchContent, hashSpanText, SpanLineageError } from '../clinical-regulatory-evidence/span-lineage.service';
import { authorizeAuthoringProgram, AuthoringProgramAccessError } from './authoring-program-access';
import { getCurrentAuthoringReadScope, AuthoringReadScopeError } from './authoring-read-scope';
import { ProgramReadAccessError } from '../c2c/current-program-access';
import { decideAuthoringPermission, resolveAuthoringSectionScope, type AuthoringPrincipal } from './authoring-permissions';
import { reserveWritableSection, DocumentWriteReservationError } from './document-lock';
import { reserveSavedDraftSourceReferences, SavedDraftSourceError } from './draft-source-references';
import { assertWorkflowImportRelease, WorkflowImportGovernanceError } from './workflow-import-governance';
import { writeAuthoringAuditTrail, type AuthoringAuditContext, type Queryable } from './authoring-evidence';
import { rollbackAuthoringTransaction, type AuthoringTransactionState } from './authoring-create-outcome';
import type { AuthoringActor, AuthoringPool } from './authoring-documents';

const logger = createScopedLogger('authoring-refile-saved-section');

const requestSchema = z.object({
  filingOnly: z.literal(true), expectedDocumentId: z.string().uuid(),
  expectedFilingDocumentId: z.string().min(1).max(512).refine(value => value.trim() === value
    && [...value].every(character => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127)),
  expectedProgramId: z.string().uuid(), expectedUpdatedAt: z.string().datetime({ offset: true }), changeReason: z.unknown(),
}).strict();
type RefileRequest = z.infer<typeof requestSchema> & { changeReason: string };
interface SavedSection { id: string; doc_id: string; code: string; content: string | null; title: string | null; updated_at: Date | string }
interface SavedDocument {
  id: string; client_program_id: string; c2c_document_id?: string; provenance?: unknown;
  status: string; created_by: string; title: string; module: string; locale: string; product_code: string; version: string;
}
interface RefileContext {
  pool: AuthoringPool; tenantId: number; actor: AuthoringActor; principal: AuthoringPrincipal | null;
  audit: AuthoringAuditContext; sectionId: string; body: unknown;
  retainedDraftSource: (inputs: unknown) => string | null;
}
class RefileRefusal extends Error {
  constructor(readonly status: 400 | 403 | 404 | 409 | 503, readonly code: string, message: string) { super(message); }
}
const refuse = (code: string, message: string, status: 400 | 403 | 404 | 409 | 503 = 409): never => {
  throw new RefileRefusal(status, code, message);
};
function parseRequest(body: unknown): RefileRequest {
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return refuse('REFILING_REQUEST_INVALID', 'Re-filing needs only the exact saved section, document, project, filing, timestamp and reason.', 400);
  const reason = requireGovernedReason(parsed.data.changeReason);
  if (!reason.ok) return refuse('REASON_REQUIRED', reason.error, 400);
  return { ...parsed.data, changeReason: reason.reason };
}
function sourceIdentity(request: RefileRequest, sectionId: string) {
  return { documentId: request.expectedDocumentId, sectionId, programId: request.expectedProgramId,
    filingDocumentId: request.expectedFilingDocumentId, updatedAt: request.expectedUpdatedAt };
}
const transactionUncertain = (state: AuthoringTransactionState): boolean => state.commitAttempted || !!state.discardConnection;
function releaseReservedClient(client: { release: (error?: Error) => void } | undefined, state: AuthoringTransactionState) {
  try { client?.release(state.discardConnection); }
  catch (error) { logger.error('Reserved re-filing connection could not be released', { err: error instanceof Error ? error.message : String(error) }); }
}
function refusalPayload(error: unknown) {
  if (error instanceof RefileRefusal || error instanceof DocumentWriteReservationError
    || error instanceof AuthoringProgramAccessError || error instanceof WorkflowImportGovernanceError
    || error instanceof AuthoringReadScopeError || error instanceof ProgramReadAccessError) {
    return { status: error.status, body: { success: false, code: error.code, error: error.message } };
  }
  if (error instanceof SavedDraftSourceError) return { status: 409, body: { success: false, code: error.code, error: error.message } };
  if (error instanceof SpanLineageError) return { status: 409, body: { success: false, code: 'LINEAGE_UNVERIFIED',
    error: 'The saved text and its existing authorship could not be verified. Reconcile the affected section before re-filing.' } };
  return { status: 503, body: { success: false, code: 'REFILING_UNAVAILABLE', error: 'The saved text could not be re-filed. Nothing was changed.' } };
}
async function readDocument(q: Queryable, tenantId: number, sectionId: string): Promise<SavedDocument> {
  const rows = await q.query(`SELECT d.* FROM authoring_documents d JOIN authoring_sections s
    ON s.doc_id=d.id AND s.tenant_id=d.tenant_id WHERE s.id=$1 AND s.tenant_id=$2`, [sectionId, tenantId]);
  if (rows.rows.length !== 1) return refuse('SECTION_NOT_FOUND', 'The saved section was not found.', 404);
  return rows.rows[0];
}
function verifyIdentity(request: RefileRequest, doc: SavedDocument, section: SavedSection) {
  if (doc.id !== request.expectedDocumentId || section.doc_id !== request.expectedDocumentId
    || doc.client_program_id !== request.expectedProgramId || doc.c2c_document_id !== request.expectedFilingDocumentId) {
    return refuse('REFILING_SOURCE_CHANGED', 'The saved section, project or filing relationship changed. Reload the document before continuing.');
  }
  const actual = new Date(section.updated_at).getTime(), expected = Date.parse(request.expectedUpdatedAt);
  if (!Number.isFinite(actual) || !Number.isFinite(expected) || actual !== expected) {
    return refuse('REFILING_SOURCE_CHANGED', 'The saved section changed. Reload the document before continuing.');
  }
}
async function requireFullCurrentRead(q: Queryable, context: RefileContext, documentId: string, programId: string) {
  const current = await getCurrentAuthoringReadScope(q, { organizationId: context.tenantId, userId: Number(context.actor.id),
    programId, documentId });
  if (!current.documentIds.includes(documentId)) return refuse('REFILING_PERMISSION_DENIED', 'Re-filing requires current permission to read the complete saved document.', 403);
  return current;
}
async function assertExpectedSectionParent(q: Queryable, context: RefileContext, documentId: string) {
  const identity = await resolveAuthoringSectionScope(q, context.tenantId, context.sectionId);
  if (!identity) return refuse('SECTION_NOT_FOUND', 'The saved section was not found.', 404);
  if (identity.docId !== documentId) return refuse('REFILING_SOURCE_CHANGED', 'The section relationship changed. Reload the document before continuing.');
}
async function authorizeReservedSource(q: Queryable, context: RefileContext, doc: SavedDocument) {
  const access = await authorizeAuthoringProgram(q, { tenantId: context.tenantId, actor: context.actor,
    programId: doc.client_program_id, principal: context.principal ?? undefined });
  const retained = await q.query(`SELECT id FROM projects WHERE id=$1 AND organization_id=$2 AND regulatory_program_id=$3 FOR SHARE`,
    [access.projectId, context.tenantId, doc.client_program_id]);
  if (retained.rows.length !== 1) return refuse('PROJECT_PERMISSION_DENIED', 'The current project relationship could not be verified.', 403);
  await q.query(`SELECT project_id FROM project_visibility_settings WHERE project_id=$1 AND organization_id=$2 FOR SHARE`,
    [access.projectId, context.tenantId]);
  if (!await canAccessReportProject(context.tenantId, { userId: Number(context.actor.id), role: access.role }, access.projectId, q, { forWrite: true })) {
    return refuse('PROJECT_PERMISSION_DENIED', 'Your current project access does not permit re-filing.', 403);
  }
  // Retain the grants the canonical object decision reads until this act ends.
  await q.query(`SELECT id FROM doc_permissions WHERE doc_id=$1 AND tenant_id=$2 FOR SHARE`, [doc.id, context.tenantId]);
  const scope = { tenantId: context.tenantId, docId: doc.id, sectionId: context.sectionId,
    documentStatus: doc.status, createdBy: String(doc.created_by ?? '') };
  const current = await requireFullCurrentRead(q, context, doc.id, doc.client_program_id);
  const principal = { id: context.actor.id, email: current.actor.email, roles: [current.actor.role.toUpperCase()] };
  const decision = await decideAuthoringPermission({ pool: q, principal, action: 'edit', scope });
  if (!decision.allowed) return refuse('REFILING_PERMISSION_DENIED', 'Your current document access does not permit re-filing.', 403);
  return { ...access, principal, role: current.actor.role };
}
async function reserveQmsGovernance(q: Queryable, tenantId: number, documentId: string) {
  // Quality lifecycle owns the QMS-row → Authoring-parent lock order. Retain
  // its current governing rows before taking the writable parent reservation.
  await q.query(`SELECT d.id FROM qms_documents d WHERE d.organization_id=$1
    AND (d.authoring_document_id=$2::uuid OR d.metadata->'retainedAuthoringDocuments' ? $2::text
      OR EXISTS (SELECT 1 FROM qms_document_versions v WHERE v.document_id=d.id
        AND v.organization_id=$1 AND v.authoring_document_id=$2::uuid)) FOR SHARE OF d`, [tenantId, documentId]);
}
async function assertCurrentQmsWrite(q: Queryable, tenantId: number, documentId: string) {
  const refusal = await qmsAuthoringWriteRefusal(q, tenantId, documentId);
  if (refusal) return refuse(refusal.code, refusal.error, refusal.status);
}
async function verifyContributors(q: Queryable, context: RefileContext, doc: SavedDocument, section: SavedSection) {
  const outline = await q.query(`SELECT s.section_key FROM c2c_document_sections s JOIN c2c_documents d
    ON d.id=s.document_id WHERE d.id=$1 AND d.org_id=$2 AND d.project_id=$3`,
  [doc.c2c_document_id, context.tenantId, doc.client_program_id]);
  const key = filingSectionKey(outline.rows.map((row: { section_key: string }) => row.section_key), section.code);
  if (!key) return refuse('REFILING_NOT_COMMITTED', 'The saved section does not have a current filing destination. Nothing was re-filed.');
  const members = await filingSectionMembers(q, { sectionId: section.id, tenantId: context.tenantId, key });
  for (const member of members) {
    const ref = { documentTable: 'authoring_sections', documentId: member.id };
    await assertLineageCoversContent(context.tenantId, ref, member.content ?? '', q);
    await assertLineageHashesMatchContent(context.tenantId, ref, member.content ?? '', q);
  }
  return key;
}
async function exactRecordedDraftSource(q: Queryable, context: RefileContext, section: SavedSection): Promise<string | null> {
  const revision = await q.query(`SELECT content, content_sha256, inputs FROM doc_revisions
    WHERE section_id=$1 AND tenant_id=$2 ORDER BY created_at DESC, id DESC LIMIT 1`, [section.id, context.tenantId]);
  const latest = revision.rows[0];
  return latest && latest.content === section.content && latest.content_sha256 === hashSpanText(section.content ?? '')
    ? context.retainedDraftSource(latest.inputs) : null;
}

/** This joins the canonical source, authorization, assembly, filing and audit
 * boundaries. It never writes authoring_sections, revisions or span lineage. */
export async function refileSavedAuthoringSection(context: RefileContext) {
  let request: RefileRequest;
  try { request = parseRequest(context.body); } catch (error) { return refusalPayload(error); }
  const source = sourceIdentity(request, context.sectionId);
  const state: AuthoringTransactionState = { began: false, commitAttempted: false };
  let client: Awaited<ReturnType<AuthoringPool['connect']>> | undefined;
  try {
    client = await context.pool.connect();
    state.began = true; await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
    await lockDocumentDispositionProgram(client, context.tenantId, request.expectedProgramId);
    await assertExpectedSectionParent(client, context, request.expectedDocumentId);
    const admitted = await requireFullCurrentRead(client, context, request.expectedDocumentId, request.expectedProgramId);
    const reserved = await readDocument(client, context.tenantId, context.sectionId);
    await reserveSavedDraftSourceReferences(reserved, client, context.tenantId, { ...context.actor, email: admitted.actor.email });
    await reserveQmsGovernance(client, context.tenantId, reserved.id);
    await reserveWritableSection(client, context.sectionId, context.tenantId);
    const doc = await readDocument(client, context.tenantId, context.sectionId);
    const rows = await client.query(`SELECT * FROM authoring_sections WHERE doc_id=$1 AND tenant_id=$2
      ORDER BY order_index, created_at, id FOR UPDATE`, [doc.id, context.tenantId]);
    const sections = rows.rows as SavedSection[];
    const section = sections.find(row => row.id === context.sectionId);
    if (!section) return refuse('SECTION_NOT_FOUND', 'The saved section was not found.', 404);
    verifyIdentity(request, doc, section);
    if (reserved.client_program_id !== doc.client_program_id || !isDeepStrictEqual(reserved.provenance, doc.provenance)) {
      return refuse('REFILING_SOURCE_CHANGED', 'The saved source changed. Reload the document before continuing.');
    }
    const access = await authorizeReservedSource(client, context, doc);
    await assertCurrentQmsWrite(client, context.tenantId, doc.id);
    await assertWorkflowImportRelease(client, { organizationId: context.tenantId, doc, sections,
      actor: { ...context.actor, email: access.principal.email } });
    const key = await verifyContributors(client, context, doc, section);
    const committed = await commitSectionToFiling({ client: client as PoolClient, sectionId: section.id,
      content: section.content ?? '', tenantId: context.tenantId, actorId: context.actor.id,
      reason: request.changeReason, draftSource: await exactRecordedDraftSource(client, context, section) });
    if (!committed.committed) return refuse('REFILING_NOT_COMMITTED', committed.reason);
    if (committed.documentId !== source.filingDocumentId || committed.sectionKey !== key) {
      return refuse('REFILING_SOURCE_CHANGED', 'The filing destination changed. Nothing was re-filed.');
    }
    await writeAuthoringAuditTrail({ ...context.audit, actorId: context.actor.id, actorRole: access.role,
      actorEmail: access.principal.email ?? 'unknown' },
      { docId: doc.id, sectionId: section.id, operationType: 'COMMIT',
      beforeContent: null, afterContent: null, changeReason: request.changeReason, executor: client,
      metadata: { filingOnly: true, revision_created: false, source, filing: filingResponse(committed), savedContentSha256: hashSpanText(section.content ?? '') } });
    state.commitAttempted = true;
    await client.query('COMMIT'); state.began = false;
    return { status: 200, body: { success: true, refiled: true, revision_created: false, source, filing: filingResponse(committed) } };
  } catch (error) {
    if (client && !state.commitAttempted) await rollbackAuthoringTransaction(client, state);
    if (transactionUncertain(state)) {
      state.discardConnection = new Error('Saved-section filing transaction outcome is unconfirmed');
      return { status: 503, body: { success: false, code: 'OUTCOME_UNKNOWN', retryAllowed: false, source,
        error: 'The re-filing outcome could not be confirmed. Keep this document and filing identity for reconciliation. Do not retry re-filing.' } };
    }
    return refusalPayload(error);
  } finally { releaseReservedClient(client, state); }
}
