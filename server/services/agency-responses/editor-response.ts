/** Saved Authoring text enters the existing response writer only after current source/version checks. */
import { createHash } from 'node:crypto';
import { parse } from 'node-html-parser';
import type { RequestSqlClient } from '../../db/requestDb';
import { AGENCY_RESPONSE_SECTION_CODE, agencyResponseImportId } from '../../../shared/authoring/source-import';
import { looksLikeHtml } from '../../../shared/authoring/plain-text-html';
import { renderSection } from '../authoring/authoring-read-render';
import { AuthoringReadScopeError, getCurrentAuthoringReadScope, requireAuthoringReadScopeStillCurrent } from '../authoring/authoring-read-scope';
import { AuthoringProgramAccessError, authorizeAuthoringProgram } from '../authoring/authoring-program-access';
import { WorkflowImportGovernanceError, verifyWorkflowImportWorkingCopy } from '../authoring/workflow-import-governance';
import { SpanLineageError, listLiveMachineSpans } from '../clinical-regulatory-evidence/span-lineage.service';
import { listProgramAnchorCandidates } from '../c2c/program-project-anchor';
import { ProgramReadAccessError, requireCurrentProgramAccess } from '../c2c/current-program-access';
import type { Queryable, WriteScope } from './response-service';

export interface EditorResponseSource {
  documentId: string; sectionId: string; expectedSha256: string; expectedUpdatedAt: string;
}
export class EditorResponseError extends Error {
  constructor(readonly status: 400 | 403 | 404 | 409 | 503, readonly code: string, message: string) { super(message); }
}
export function editorResponseRefusal(error: unknown) {
  if (error instanceof EditorResponseError || error instanceof AuthoringReadScopeError
    || error instanceof AuthoringProgramAccessError || error instanceof ProgramReadAccessError
    || error instanceof WorkflowImportGovernanceError) return { status: error.status, code: error.code, message: error.message };
  if (error instanceof SpanLineageError) return { status: 409 as const, code: 'EDITOR_RESPONSE_LINEAGE_UNVERIFIED',
    message: 'The saved editor response no longer matches its recorded lineage. Reconcile it through the editor before copying.' };
  return null;
}
type Scope = WriteScope & { eventId: string; questionId: number };
type DocumentRow = { id: string; client_program_id: string; provenance: unknown; status: string; created_by: string };
type SectionRow = { id: string; code: string; title: string; content: string | null; updated_at: unknown };
const hash = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const fail = (status: EditorResponseError['status'], code: string, text: string): never => { throw new EditorResponseError(status, code, text); };
function updatedAt(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value));
  if (!Number.isFinite(date.getTime())) return fail(503, 'EDITOR_RESPONSE_UNAVAILABLE', 'The saved editor version could not be verified.');
  return date.toISOString();
}

/** The answer register is plain text. Refuse unsupported structure rather than silently flatten it. */
export function plainEditorResponse(content: string): string {
  if (renderSection(content).spans.length) return fail(409, 'EDITOR_RESPONSE_PENDING_CHANGES', 'Accept or reject the saved tracked suggestions in the editor before using this response.');
  if (!looksLikeHtml(content)) return content;
  const root = parse(content);
  if (root.querySelectorAll('*').some(node => !['p', 'br'].includes((node.rawTagName || '').toLowerCase()) || Object.keys(node.attributes).length > 0)) {
    return fail(409, 'EDITOR_RESPONSE_FORMAT_UNSUPPORTED', 'This response register preserves plain paragraphs. Rich formatting, tables, references, media and fields need a supported response-package format; nothing was copied.');
  }
  // The export block parser makes both <br> and </p> block boundaries. This
  // stricter boundary accepts only p/br, so decoded node text preserves the
  // difference without flattening any richer structure into the register.
  return root.childNodes.map(node => node.text + (node.nodeType === 1 && (node as { rawTagName?: string }).rawTagName?.toLowerCase() === 'p' ? '\n\n' : ''))
    .join('').replace(/\n\n$/, '');
}

async function currentCopy(q: Queryable, scope: Scope, documentId: string, sectionId: string, forWrite: boolean) {
  const executor = q as RequestSqlClient;
  const readInput = { organizationId: scope.orgId, userId: scope.userId, documentId };
  const access = await getCurrentAuthoringReadScope(executor, readInput);
  if (!access.sectionIds.includes(sectionId)) return fail(404, 'EDITOR_RESPONSE_NOT_FOUND', 'That saved editor response was not found.');
  const documents = await q.query(`SELECT id::text,client_program_id::text,provenance,status,created_by
    FROM authoring_documents WHERE id=$1 AND tenant_id=$2 FOR SHARE`, [documentId, scope.orgId]);
  const doc = documents.rows[0] as DocumentRow | undefined;
  if (!doc?.client_program_id) return fail(404, 'EDITOR_RESPONSE_NOT_FOUND', 'That saved editor response was not found.');
  const actor = { id: String(scope.userId), email: access.actor.email };
  const program = await authorizeAuthoringProgram(q, { tenantId: scope.orgId, actor, programId: doc.client_program_id, forWrite });
  if (program.projectId !== scope.projectId) return fail(404, 'EDITOR_RESPONSE_NOT_FOUND', 'That saved editor response was not found in this project.');
  const sections = await q.query(`SELECT id::text,code,title,content,updated_at FROM authoring_sections
    WHERE id=$1 AND doc_id=$2 AND tenant_id=$3 FOR SHARE`, [sectionId, documentId, scope.orgId]);
  const section = sections.rows[0] as SectionRow | undefined;
  if (!section || section.code !== AGENCY_RESPONSE_SECTION_CODE) return fail(404, 'EDITOR_RESPONSE_NOT_FOUND', 'Choose this question’s saved response section.');
  await requireAuthoringReadScopeStillCurrent(executor, readInput, access);
  return { doc, section, actor, access, readInput };
}

async function checkedSource(q: Queryable, scope: Scope, copy: Awaited<ReturnType<typeof currentCopy>>, expectedRevision: number) {
  const verified = await verifyWorkflowImportWorkingCopy(q, { organizationId: scope.orgId, doc: copy.doc,
    sections: [copy.section], actor: copy.actor });
  const origin = verified?.origin;
  if (!origin || origin.kind !== 'agency-response' || origin.id !== agencyResponseImportId(scope.eventId, scope.questionId)
    || origin.selection.kind !== 'agency-response' || origin.selection.eventId !== scope.eventId
    || origin.selection.questionId !== scope.questionId || origin.version !== String(expectedRevision)) {
    return fail(409, 'EDITOR_RESPONSE_SOURCE_CHANGED', 'This working copy does not describe the current question and response revision. Preview the current response and prepare its editor copy.');
  }
  if (verified.knownMachineRemains) return fail(409, 'EDITOR_RESPONSE_MODEL_QUALIFICATION_REQUIRED', 'Known source-generated text remains on its existing qualification hold. Nothing was copied to the response register.');
  return { origin, responseText: plainEditorResponse(copy.section.content ?? '') };
}

/** Called inside the existing governed response transaction, after visibleLetter locks the letter. */
export async function responseFromSavedEditor(q: Queryable, scope: Scope, source: EditorResponseSource, expectedRevision: number) {
  const copy = await currentCopy(q, scope, source.documentId, source.sectionId, true);
  const content = copy.section.content ?? '';
  if (hash(content) !== source.expectedSha256 || updatedAt(copy.section.updated_at) !== updatedAt(source.expectedUpdatedAt)) {
    return fail(409, 'EDITOR_RESPONSE_CHANGED', 'The saved editor response changed after preview. Refresh and review it before another save.');
  }
  const checked = await checkedSource(q, scope, copy, expectedRevision);
  if (checked.responseText.length > 100000) return fail(409, 'EDITOR_RESPONSE_TOO_LARGE', 'The saved response exceeds the response register limit.');
  const spans = await listLiveMachineSpans(scope.orgId, { documentTable: 'authoring_sections', documentId: source.sectionId }, q);
  await requireAuthoringReadScopeStillCurrent(q as RequestSqlClient, copy.readInput, copy.access);
  return { responseText: checked.responseText, source: { documentId: source.documentId, sectionId: source.sectionId,
    sectionSha256: hash(content), sectionUpdatedAt: updatedAt(copy.section.updated_at), sourceFingerprint: checked.origin.fingerprint,
    sourceResponseRevision: expectedRevision, sourceKind: 'agency-response',
    machineAuthors: [...new Set(spans.map(span => span.machineAuthorId))],
    authorship: 'retained saved-section lineage; copying is not a human-origin or model-qualification assertion' } };
}

async function programForQuestion(q: Queryable, scope: Scope): Promise<string | null> {
  const anchors = await listProgramAnchorCandidates(q, { orgId: scope.orgId, eligibility: 'non-deleted' });
  const matches = anchors.filter(candidate => candidate.anchor?.id === scope.projectId);
  if (matches.length !== 1) return null;
  const access = await requireCurrentProgramAccess(q, { organizationId: scope.orgId, userId: scope.userId, programId: matches[0].programId });
  return access.projectId === scope.projectId ? access.programId : null;
}
function sourceRevision(doc: DocumentRow): number {
  const value = (doc.provenance as { importSource?: { version?: unknown } } | null)?.importSource?.version;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return fail(409, 'EDITOR_RESPONSE_SOURCE_CHANGED', 'This working copy has no verified source revision.');
  const revision = Number(value);
  if (!Number.isSafeInteger(revision) || revision < 0 || revision > 2147483647) return fail(409, 'EDITOR_RESPONSE_SOURCE_CHANGED', 'This working copy has no verified source revision.');
  return revision;
}
async function previewCopy(q: Queryable, scope: Scope, identity: { doc_id: string; section_id: string }, revision: number) {
  let copy;
  try { copy = await currentCopy(q, scope, identity.doc_id, identity.section_id, false); }
  catch (error) { if (Number((error as { status?: number }).status) === 404) return null; throw error; }
  const base = { documentId: copy.doc.id, sectionId: copy.section.id, sha256: hash(copy.section.content ?? ''),
    updatedAt: updatedAt(copy.section.updated_at), sourceRevision: sourceRevision(copy.doc) };
  try {
    const checked = await checkedSource(q, scope, copy, revision);
    return { ...base, ready: true, refusal: null, text: checked.responseText };
  } catch (error) {
    const refusal = editorResponseRefusal(error);
    if (refusal?.status !== 409) throw error;
    return { ...base, ready: false, refusal: refusal.message, text: null };
  }
}

/** Metadata candidates are filtered by the canonical object ACL before any saved content is read. */
export async function readResponseEditorSources(q: Queryable, scope: Scope, currentRevision: number) {
  const source = { kind: 'agency-response' as const, eventId: scope.eventId, questionId: scope.questionId };
  const programId = await programForQuestion(q, scope);
  if (!programId) return { programId: null, source, currentRevision, copies: [],
    unavailableReason: 'This letter needs one recorded project relationship before it can open in the document editor.' };
  const candidates = await q.query(`SELECT d.id::text AS doc_id,s.id::text AS section_id
    FROM authoring_documents d JOIN authoring_sections s ON s.doc_id=d.id AND s.tenant_id=d.tenant_id
    WHERE d.tenant_id=$1 AND d.client_program_id=$2 AND s.code=$3
      AND d.provenance->'importSource'->>'kind'='agency-response'
      AND d.provenance->'importSource'->>'id'=$4
    ORDER BY d.created_at DESC,d.id,s.id LIMIT 20`,
  [scope.orgId, programId, AGENCY_RESPONSE_SECTION_CODE, agencyResponseImportId(scope.eventId, scope.questionId)]);
  const copies = [];
  for (const identity of candidates.rows) {
    const copy = await previewCopy(q, scope, identity, currentRevision);
    if (copy) copies.push(copy);
  }
  return { programId, source, currentRevision, copies };
}
