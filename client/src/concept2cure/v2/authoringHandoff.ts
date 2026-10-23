/** The canonical specialist-to-editor writer. Receipts, project visits and
 * signed-in account scope are confirmed before content or navigation proceeds. */
import { apiRequest, ApiRequestError, redactInternals, serverMessage } from '@/lib/queryClient';
import { authService } from '@/services/portal/authService';
import { unboundNotice } from './governanceNotice';
import { captureShellProjectGuard, shellProgramId } from './shellProject';
import { setEditorTarget } from './editorTarget';
import { useAuthoringHandoffController } from './authoringHandoffRecovery';
import { hasAuthoringCreationOutcome, readAuthoringCreationRecovery, type AuthoringCreationRecoveryIdentity } from './editor/authoringCreationRecovery';
export type { AuthoringHandoffController, AuthoringHandoffRecoveryState } from './authoringHandoffRecovery';

export interface AuthoringHandoff {
  title: string;
  /** The specialist states its own CTD module; the server otherwise defaults to M3. */
  module: string;
  /** A working identifier, never a guessed CTD filing location. */
  code: string;
  content: string;
  subject: string;
}
export interface HandoffContext {
  programId: string | null;
  code: string;
  isCurrent: () => boolean;
}
export type AuthoringHandoffResult = HandoffContext & (
  | { ok: true; docId: string; programId: string; bound: boolean | null; message: string; reused?: boolean }
  | { ok: false; phase: 'refused' | 'unknown' | 'partial' | 'stale' | 'blocked'; docId?: string; message: string }
);
type StageResult =
  | { phase: 'confirmed'; body: Record<string, unknown>; row: Record<string, unknown> }
  | { phase: 'refused' | 'unknown' | 'stale'; message?: string; recovery?: AuthoringCreationRecoveryIdentity };
const nonempty = (value: unknown): value is string => typeof value === 'string' && Boolean(value.trim());
const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;

function captureHandoffContext(code: string, mounted: () => boolean): HandoffContext {
  const programId = shellProgramId();
  const projectCurrent = captureShellProjectGuard();
  const session = authService.captureSessionReadGuard();
  const account = authService.getUser();
  const actor = `${account?.organizationId ?? ''}:${account?.id ?? ''}`;
  return { programId, code, isCurrent: () => mounted() && projectCurrent() && session.sameRevision()
    && `${authService.getUser()?.organizationId ?? ''}:${authService.getUser()?.id ?? ''}` === actor };
}

function confirmedStage(kind: 'document' | 'section', raw: unknown, request: Record<string, unknown>): StageResult {
  const body = record(raw);
  const row = record(body?.[kind]);
  if (body?.success !== true || !row || !nonempty(row.id) || typeof row.title !== 'string') return { phase: 'unknown' };
  const matches = kind === 'document' ? row.client_program_id === request.client_program_id
    : row.doc_id === request.doc_id && row.code === request.code;
  return matches ? { phase: 'confirmed', body, row } : { phase: 'unknown' };
}

async function writeHandoffStage(kind: 'document' | 'section', request: Record<string, unknown>, current: () => boolean): Promise<StageResult> {
  try {
    const response = await apiRequest('POST', kind === 'document' ? '/api/authoring/docs' : '/api/authoring/sections', request);
    if (!current()) return { phase: 'stale' };
    const body: unknown = await response.json().catch(() => null);
    if (!current()) return { phase: 'stale' };
    if (kind === 'document' && hasAuthoringCreationOutcome(body)) return recoveryStage(body, request);
    if (!response.ok) return { phase: response.status >= 400 && response.status < 500 ? 'refused' : 'unknown', message: response.status === 401 ? 'your session isn’t authenticated' : serverMessage(body) ?? undefined };
    return confirmedStage(kind, body, request);
  } catch (error) {
    if (!current()) return { phase: 'stale' };
    if (kind === 'document' && error instanceof ApiRequestError && hasAuthoringCreationOutcome(error.payload)) return recoveryStage(error.payload, request);
    return error instanceof ApiRequestError && error.status >= 400 && error.status < 500
      ? { phase: 'refused', message: redactInternals(error.message, 'The server refused this write.') } : { phase: 'unknown' };
  }
}

function recoveryStage(body: unknown, request: Record<string, unknown>): StageResult {
  const recovery = readAuthoringCreationRecovery(body, authService.getUser()?.organizationId,
    typeof request.client_program_id === 'string' ? request.client_program_id : null);
  return { phase: 'unknown', ...(recovery ? { recovery } : {}) };
}

function failedHandoff(context: HandoffContext, result: Exclude<StageResult, { phase: 'confirmed' }>, subject: string, docId?: string): AuthoringHandoffResult {
  if (result.recovery && !docId) return { ...context, ok: false, phase: 'unknown', docId: result.recovery.documentId,
    message: `Document ${result.recovery.documentId}: ${result.recovery.creationOutcome === 'committed' ? 'creation committed, but its current handoff could not be confirmed' : 'creation outcome is unconfirmed'}. Check this exact document in its original project before continuing. Do not retry creation; ${subject} is still here.` };
  const known = docId ? `Document ${docId} was created, but its text` : 'The document';
  if (result.phase === 'stale') return { ...context, ok: false, phase: 'stale', ...(docId ? { docId } : {}),
    message: 'The project or signed-in account changed while the handoff was running. Check working documents in the original project before creating another copy.' };
  if (result.phase === 'refused') return { ...context, ok: false, phase: docId ? 'partial' : 'refused', ...(docId ? { docId } : {}),
    message: docId ? `${known} did not save — ${result.message ?? 'the server refused the text write'}. Staying here so you do not lose ${subject}. Check that document before retrying.`
      : `Couldn’t create the document — ${result.message ?? 'the server refused it'}. Nothing was saved; ${subject} is still here.` };
  return { ...context, ok: false, phase: 'unknown', ...(docId ? { docId } : {}),
    message: docId ? `${known} save could not be confirmed. Check that document in the original project before creating another copy; ${subject} is still here.`
      : `Could not confirm whether the document was saved. Check working documents in the original project before creating another copy; ${subject} is still here.` };
}

function bindingOutcome(body: Record<string, unknown>): boolean | null {
  const governance = record(body.governance);
  if (governance?.bound === false) return false;
  return governance?.bound === true && nonempty(governance.c2cDocumentId) ? true : null;
}

/** No automatic retry: a missing response can follow a committed write. The
 * existing two-request path can leave a document without a confirmed section. */
export async function saveToAuthoring(h: AuthoringHandoff, mounted: () => boolean = () => true): Promise<AuthoringHandoffResult> {
  const context = captureHandoffContext(h.code, mounted);
  if (!context.programId) return { ...context, ok: false, phase: 'refused',
    message: `Not opened — open a project first: a document belongs to a project. Nothing was saved; ${h.subject} is still here.` };
  if (!context.isCurrent()) return failedHandoff(context, { phase: 'stale' }, h.subject);
  const created = await writeHandoffStage('document', {
    title: h.title, module: h.module, client_program_id: context.programId,
  }, context.isCurrent);
  if (created.phase !== 'confirmed') return failedHandoff(context, created, h.subject);
  const docId = String(created.row.id);
  if (!context.isCurrent()) return failedHandoff(context, { phase: 'stale' }, h.subject, docId);
  const saved = await writeHandoffStage('section', {
    doc_id: docId, code: h.code, title: h.title, content: h.content,
  }, context.isCurrent);
  if (saved.phase !== 'confirmed') return failedHandoff(context, saved, h.subject, docId);
  if (!context.isCurrent()) return failedHandoff(context, { phase: 'stale' }, h.subject, docId);
  return { ...context, ok: true, programId: context.programId, docId, bound: bindingOutcome(created.body),
    message: `Saved to the authoring store as “${h.title}” — open Document authoring to edit it.` + unboundNotice(created.body.governance) };
}

/** Explicit continuation into an already confirmed document; callers verify
 * its current project membership and section inventory before invoking it. */
async function continueAuthoringText(h: AuthoringHandoff, context: HandoffContext, docId: string): Promise<AuthoringHandoffResult> {
  if (!context.isCurrent()) return failedHandoff(context, { phase: 'stale' }, h.subject, docId);
  const saved = await writeHandoffStage('section', { doc_id: docId, code: h.code, title: h.title, content: h.content }, context.isCurrent);
  if (saved.phase !== 'confirmed') return failedHandoff(context, saved, h.subject, docId);
  return { ...context, ok: true, programId: context.programId!, docId, bound: null,
    message: `Text saved to the existing working document “${h.title}”. Filing binding was not rechecked.` };
}

/** All specialist actions in this mounted owner share one attempt lane. */
export function useAuthoringHandoff() {
  return useAuthoringHandoffController({ save: saveToAuthoring, capture: captureHandoffContext, continueText: continueAuthoringText });
}

/** Use the existing exact-target channel; a stale receipt never changes it. */
export function openSavedAuthoring(result: AuthoringHandoffResult, onNav: (id: string) => void): boolean {
  if (!result.ok || !result.isCurrent()) return false;
  setEditorTarget({ docType: null, docId: result.docId, programId: result.programId, code: result.code });
  onNav('document-authoring');
  return true;
}

export type { WorkflowImportSource } from '@shared/authoring/source-import';
import type { AuthoringImportOrigin, AuthoringImportSource, AuthoringSourceImportData, AuthoringSourceImportPreviewData,
  BinaryImportOrigin, BinaryImportSource, WorkflowImportOrigin, WorkflowImportSource } from '@shared/authoring/source-import';
import { stableStringify } from '@shared/canonical-json';
import { authoringCurrentReadPath } from './editor/authoringCurrentRead';

export type SourceImportResult = AuthoringSourceImportData;
export interface SourceIntakeRequest {
  actor: { userId: number; organizationId: number };
  headers: Record<string, string>;
  current: () => boolean;
}
export interface SourceIntakeFailure {
  ok: false;
  phase: 'refused' | 'unknown' | 'stale';
  message: string;
  recovery?: AuthoringCreationRecoveryIdentity;
  identifiedOutcome?: boolean;
}
export type SourceIntakeReply<T> = { ok: true; data: T } | SourceIntakeFailure;
export interface SourceImportInspectionAttempt {
  preview?: AuthoringSourceImportPreviewData;
  recovery?: AuthoringCreationRecoveryIdentity;
  identifiedOutcome?: boolean;
}
export type SourceImportInspection = { ok: true; inventory: Array<{ id: string; title: string }>; data?: SourceImportResult } | SourceIntakeFailure;

export function isWorkflowSource(source: unknown): source is WorkflowImportSource {
  if (!source || typeof source !== 'object') return false;
  const kind = (source as { kind?: unknown }).kind;
  return kind === 'protocol' || kind === 'csr' || kind === 'ivd-assessment' || kind === 'ivd-document';
}

/** Stable selection identity; ordering does not change a CSR selection. */
export function workflowSourceKey(source: WorkflowImportSource): string {
  if (source.kind !== 'csr') return `${source.kind}:${source.documentId}`;
  if (source.sectionNumbers !== undefined && (!Array.isArray(source.sectionNumbers) || !source.sectionNumbers.every(s => typeof s === 'string'))) return 'invalid-selection';
  return `csr:${source.jobId}:${[...new Set(source.sectionNumbers?.map(s => s.trim()) ?? [])].sort().join(',')}`;
}
const importHash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
const importUuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const importInteger = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0 && Number(value) <= 2147483647;
const stringList = (value: unknown): value is string[] => Array.isArray(value) && value.every(s => typeof s === 'string');
const nullableText = (value: unknown): boolean => value === null || typeof value === 'string';
const nullableUuid = (value: unknown): boolean => value === null || importUuid(value);
const nullableInteger = (value: unknown): boolean => value === null || importInteger(value);
const uniqueCodes = (rows: Array<{ code: string }>): boolean => new Set(rows.map(row => row.code.trim().toUpperCase())).size === rows.length;

function validWorkflowSource(source: unknown): source is WorkflowImportSource {
  if (!isWorkflowSource(source)) return false;
  if (source.kind === 'protocol') return importInteger(source.documentId);
  if (source.kind !== 'csr') return importUuid(source.documentId);
  return importInteger(source.jobId) && (source.sectionNumbers === undefined || (Array.isArray(source.sectionNumbers)
    && source.sectionNumbers.length > 0 && source.sectionNumbers.length <= 200 && source.sectionNumbers.every(nonempty)));
}
function validBinarySource(source: unknown): source is BinaryImportSource {
  const value = record(source);
  return value?.kind === 'vault' ? importUuid(value.documentId) : value?.kind === 'data-room' && importInteger(value.sourceId);
}
function validSectionOrigin(section: WorkflowImportOrigin['sectionOrigins'][number]): boolean {
  return !!section && nonempty(section.code) && importHash(section.contentSha256) && nonempty(section.sourceRowId)
    && ['machine', 'template', 'unknown'].includes(section.originalAuthorship)
    && ['unrecorded', 'recorded-name-only'].includes(section.modelEvidence) && nullableText(section.model);
}
const workflowConversions: Record<WorkflowImportSource['kind'], WorkflowImportOrigin['conversion']> = {
  protocol: 'protocol-structure', csr: 'ich-e3-sections', 'ivd-assessment': 'ivd-assessment-snapshot', 'ivd-document': 'ivd-document-snapshot',
};
function validWorkflowScope(origin: WorkflowImportOrigin): boolean {
  const scope = origin.sourceScope;
  return !!scope && ['organization', 'program', 'project'].includes(scope.level)
    && nullableUuid(scope.programId) && nullableInteger(scope.projectId);
}
function validWorkflowMetadata(origin: WorkflowImportOrigin): boolean {
  return nullableText(origin.version) && origin.documentType === null && origin.sectionCode === null
    && origin.conversion === workflowConversions[origin.kind] && validWorkflowScope(origin)
    && !!origin.association && ['recorded', 'explicit'].includes(origin.association.mode) && nullableText(origin.association.reason);
}
function validWorkflowOrigins(origin: WorkflowImportOrigin): boolean {
  return Array.isArray(origin.sectionOrigins) && origin.sectionOrigins.length > 0 && origin.sectionOrigins.every(validSectionOrigin)
    && uniqueCodes(origin.sectionOrigins) && stringList(origin.gaps) && validWorkflowMetadata(origin);
}
export function workflowOriginMatches(origin: WorkflowImportOrigin | undefined, programId: string, source: WorkflowImportSource | undefined): boolean {
  if (!origin || !importUuid(programId) || !validWorkflowSource(source) || origin.kind !== source.kind || origin.programId !== programId) return false;
  const id = source.kind === 'csr' ? source.jobId : source.documentId;
  if (origin.id !== String(id) || !validWorkflowSource(origin.selection) || workflowSourceKey(origin.selection) !== workflowSourceKey(source)) return false;
  return importHash(origin.fingerprint) && nonempty(origin.title) && validWorkflowOrigins(origin);
}
function validPreviewSections(sections: AuthoringSourceImportPreviewData['sections']): boolean {
  return Array.isArray(sections) && sections.length > 0 && sections.every(s => !!s && nonempty(s.code)
    && typeof s.title === 'string' && importHash(s.contentSha256)) && uniqueCodes(sections);
}
function matchingPreviewScope(data: AuthoringSourceImportPreviewData, programId: string): boolean {
  const association = data.association;
  if (data.fingerprint !== data.origin.fingerprint || data.target?.programId !== programId || !importInteger(data.target.projectId)) return false;
  return !!association && association.targetProgramId === programId && association.mode === data.origin.association.mode
    && typeof association.required === 'boolean' && typeof association.reasonRequired === 'boolean'
    && nullableUuid(association.sourceProgramId) && nullableInteger(association.sourceProjectId);
}
export function readWorkflowPreview(body: unknown, programId: string, source: WorkflowImportSource): AuthoringSourceImportPreviewData | null {
  const envelope = body as { success?: boolean; data?: AuthoringSourceImportPreviewData } | null;
  const data = envelope?.data;
  if (envelope?.success !== true || !data || data.preview !== true || !workflowOriginMatches(data.origin, programId, source)) return null;
  if (!matchingPreviewScope(data, programId) || !validPreviewSections(data.sections) || !stringList(data.gaps) || !stringList(data.warnings)) return null;
  const origins = new Map(data.origin.sectionOrigins.map(section => [section.code.trim().toUpperCase(), section.contentSha256]));
  return origins.size === data.sections.length && data.sections.every(section => origins.get(section.code.trim().toUpperCase()) === section.contentSha256) ? data : null;
}
function validSavedSectionKeys(sections: AuthoringSourceImportData['sections']): boolean {
  if (!sections.every(s => !!s && importUuid(s.id) && nonempty(s.code))) return false;
  const ids = new Set(sections.map(s => String(s.id).toLowerCase()));
  const codes = new Set(sections.map(s => String(s.code).trim().toUpperCase()));
  return ids.size === sections.length && codes.size === sections.length;
}
function actualSavedSection(section: Record<string, unknown>, doc: AuthoringSourceImportData['doc']): boolean {
  return section.doc_id === doc.id && section.tenant_id === doc.tenant_id && typeof section.title === 'string'
    && (typeof section.content === 'string' || section.content === null)
    && Number.isSafeInteger(section.order_index) && Number(section.order_index) >= 0 && Number(section.order_index) <= 2147483647;
}
function validSavedCopy(data: AuthoringSourceImportData | undefined, programId: string): data is AuthoringSourceImportData {
  const doc = data?.doc;
  if (!doc || !importUuid(doc.id) || !nonempty(doc.title) || doc.client_program_id !== programId || !importInteger(doc.tenant_id)) return false;
  return !!data && typeof data.reused === 'boolean' && stringList(data.warnings) && Array.isArray(data.sections) && (data.reused || data.sections.length > 0)
    && validSavedSectionKeys(data.sections) && data.sections.every(section => actualSavedSection(section, doc));
}
function savedSectionsMatch(data: AuthoringSourceImportData, preview: AuthoringSourceImportPreviewData): boolean {
  const codes = new Set(preview.sections.map(s => s.code.trim().toUpperCase()));
  return data.sections.length === codes.size && data.sections.every(section => codes.has(String(section.code).trim().toUpperCase()));
}
const originFields = ['kind', 'id', 'programId', 'title', 'documentType', 'sectionCode', 'conversion'];
const workflowOriginFields = [...originFields, 'fingerprint', 'selection', 'gaps', 'version', 'sourceScope', 'association', 'sectionOrigins'];
const binaryOriginFields = [...originFields, 'fileName', 'mimeType', 'sha256'];
function sameRecordedOrigin(stored: AuthoringImportOrigin, returned: AuthoringImportOrigin, fields: string[]): boolean {
  const project = (origin: AuthoringImportOrigin) => Object.fromEntries(fields.map(key => [key, (origin as unknown as Record<string, unknown>)[key]]));
  return stableStringify(project(stored)) === stableStringify(project(returned));
}
function recordedWorkflowMatches(data: AuthoringSourceImportData, programId: string, source: WorkflowImportSource): boolean {
  const provenance = record(data.doc.provenance);
  const stored = provenance?.importSource as WorkflowImportOrigin | undefined;
  return provenance?.source === 'import' && !!stored && workflowOriginMatches(stored, programId, source)
    && sameRecordedOrigin(stored, data.origin, workflowOriginFields);
}

/** Reused copies keep their actual edited sections. Source hashes describe the
 * imported source version, not the editor's subsequently transformed HTML. */
export function readWorkflowImportResult(body: unknown, programId: string, source: WorkflowImportSource, preview: AuthoringSourceImportPreviewData): AuthoringSourceImportData | null {
  const envelope = body as { success?: boolean; data?: AuthoringSourceImportData } | null;
  const data = envelope?.data;
  if (envelope?.success !== true || !validSavedCopy(data, programId) || !isWorkflowSource(data.origin)) return null;
  if (!readWorkflowPreview({ success: true, data: preview }, programId, source) || !workflowOriginMatches(data.origin as WorkflowImportOrigin, programId, source)) return null;
  if ((data.origin as WorkflowImportOrigin).fingerprint !== preview.fingerprint || !recordedWorkflowMatches(data, programId, source)) return null;
  return data.reused || savedSectionsMatch(data, preview) ? data : null;
}
function binaryOriginMatches(origin: unknown, programId: string, source: BinaryImportSource): origin is BinaryImportOrigin {
  const row = record(origin);
  if (!row || !importUuid(programId) || !validBinarySource(source) || row.kind !== source.kind || row.programId !== programId) return false;
  const id = source.kind === 'vault' ? source.documentId : String(source.sourceId);
  return row.id === id && nonempty(row.title) && nonempty(row.fileName) && nonempty(row.mimeType) && importHash(row.sha256)
    && nullableText(row.documentType) && nullableText(row.sectionCode) && ['docx-structure', 'extracted-text'].includes(String(row.conversion));
}
/** Binary receipts require the saved rows and recorded source version too. */
export function readSourceImportResult(body: unknown, programId: string, source: AuthoringImportSource): SourceImportResult | null {
  const envelope = body as { success?: boolean; data?: AuthoringSourceImportData } | null;
  const data = envelope?.data;
  if (!validBinarySource(source) || envelope?.success !== true || !validSavedCopy(data, programId) || !binaryOriginMatches(data.origin, programId, source)) return null;
  const provenance = record(data.doc.provenance);
  const stored = provenance?.importSource;
  return provenance?.source === 'import' && binaryOriginMatches(stored, programId, source)
    && sameRecordedOrigin(stored, data.origin, binaryOriginFields) ? data : null;
}

const intakeStale = (): SourceIntakeFailure => ({ ok: false, phase: 'stale', message: 'The source, project or signed-in account changed. Reopen this source in its original project before continuing.' });
const intakeRefused = (message: string): SourceIntakeFailure => ({ ok: false, phase: 'refused', message });
const intakeUnknown = (): SourceIntakeFailure => ({ ok: false, phase: 'unknown', message: 'The working-copy save could not be confirmed. Check working documents in the original project before creating another copy.' });
function intakeCurrent(request: SourceIntakeRequest): boolean {
  try { return request.current(); } catch { return false; }
}
function pinIntakeRequest(request: SourceIntakeRequest): SourceIntakeRequest | null {
  if (!intakeCurrent(request) || !importInteger(request.actor.userId) || !importInteger(request.actor.organizationId)) return null;
  if (!nonempty(request.headers.Authorization) || request.headers['x-organization-id'] !== String(request.actor.organizationId)) return null;
  return { actor: { ...request.actor }, headers: { ...request.headers }, current: request.current };
}
function capturedCopy(data: SourceImportResult, request: SourceIntakeRequest): boolean {
  const creator = data.doc.created_by;
  return data.doc.tenant_id === request.actor.organizationId && (typeof creator === 'string' || typeof creator === 'number')
    && String(creator) === String(request.actor.userId);
}
function typedIntakeOutcome(body: unknown, programId: string, request: SourceIntakeRequest): SourceIntakeFailure {
  const recovery = readAuthoringCreationRecovery(body, request.actor.organizationId, programId);
  return { ...intakeUnknown(), identifiedOutcome: true, ...(recovery ? { recovery } : {}) };
}
function failedIntakeResponse(body: unknown, status: number, create: boolean, programId: string, request: SourceIntakeRequest): SourceIntakeFailure {
  if (create && hasAuthoringCreationOutcome(body)) return typedIntakeOutcome(body, programId, request);
  if (create && (status === 408 || status >= 500 || status < 400)) return intakeUnknown();
  return intakeRefused(serverMessage(body) ?? 'The source and target could not be verified. Check access and reload the source preview before retrying.');
}
function failedIntakeError(error: unknown, create: boolean, programId: string, request: SourceIntakeRequest): SourceIntakeFailure {
  if (!intakeCurrent(request)) return intakeStale();
  if (create && error instanceof ApiRequestError && hasAuthoringCreationOutcome({ code: error.code })) return typedIntakeOutcome(error.payload, programId, request);
  return error instanceof ApiRequestError ? failedIntakeResponse(error.payload, error.status, create, programId, request)
    : create ? intakeUnknown() : intakeRefused('The saved source could not be read. Check access and reload its preview.');
}
async function requestSourceIntake<T>(programId: string, payload: Record<string, unknown>, request: SourceIntakeRequest,
  create: boolean, read: (body: unknown) => T | null): Promise<SourceIntakeReply<T>> {
  if (!intakeCurrent(request)) return intakeStale();
  try {
    const response = await apiRequest('POST', '/api/authoring/import/source', payload, request.headers);
    if (!intakeCurrent(request)) return intakeStale();
    const body: unknown = await response.json().catch(() => null);
    if (!intakeCurrent(request)) return intakeStale();
    if (!response.ok || (create && hasAuthoringCreationOutcome(body))) return failedIntakeResponse(body, response.status, create, programId, request);
    const data = read(body);
    return data ? { ok: true, data } : failedIntakeResponse(body, response.status, create, programId, request);
  } catch (error) { return failedIntakeError(error, create, programId, request); }
}
function pinSource<T extends AuthoringImportSource>(source: T): T {
  return { ...source, ...(source.kind === 'csr' && source.sectionNumbers ? { sectionNumbers: [...source.sectionNumbers] } : {}) };
}
function pinPreview(preview: AuthoringSourceImportPreviewData): AuthoringSourceImportPreviewData {
  return JSON.parse(JSON.stringify(preview)) as AuthoringSourceImportPreviewData;
}
export function previewWorkflowImport(programId: string, source: WorkflowImportSource, request: SourceIntakeRequest): Promise<SourceIntakeReply<AuthoringSourceImportPreviewData>> {
  const pinned = pinIntakeRequest(request);
  if (!pinned) return Promise.resolve(intakeStale());
  const selected = pinSource(source);
  if (!importUuid(programId) || !validWorkflowSource(selected)) return Promise.resolve(intakeRefused('Choose a saved source and an existing project.'));
  return requestSourceIntake(programId, { programId, source: selected, previewOnly: true }, pinned, false, body => readWorkflowPreview(body, programId, selected));
}
export function createWorkflowImport(programId: string, source: WorkflowImportSource, preview: AuthoringSourceImportPreviewData, reason: string,
  options: { request: SourceIntakeRequest; associationReason?: string }): Promise<SourceIntakeReply<SourceImportResult>> {
  const request = pinIntakeRequest(options.request);
  if (!request) return Promise.resolve(intakeStale());
  const selected = pinSource(source);
  if (!readWorkflowPreview({ success: true, data: preview }, programId, selected)) return Promise.resolve(intakeRefused('Reload the saved source preview before creating a working copy.'));
  const expected = pinPreview(preview);
  return requestSourceIntake(programId, { programId, source: selected, expectedFingerprint: expected.fingerprint, reason,
    ...(options.associationReason ? { associationReason: options.associationReason } : {}) }, request, true, body => {
    const data = readWorkflowImportResult(body, programId, selected, expected);
    return data && capturedCopy(data, request) ? data : null;
  });
}
export function createBinaryImport(programId: string, source: AuthoringImportSource, reason: string, request: SourceIntakeRequest): Promise<SourceIntakeReply<SourceImportResult>> {
  const pinned = pinIntakeRequest(request);
  if (!pinned) return Promise.resolve(intakeStale());
  const selected = pinSource(source);
  if (!importUuid(programId) || !validBinarySource(selected)) return Promise.resolve(intakeRefused('Choose a saved source and an existing project.'));
  return requestSourceIntake(programId, { programId, source: selected, reason }, pinned, true, body => {
    const data = readSourceImportResult(body, programId, selected);
    return data && capturedCopy(data, pinned) ? data : null;
  });
}

type IntakeInventoryRow = { id: string; title: string; readScope: 'document' | 'sections' };
function readIntakeInventory(body: unknown, programId: string): IntakeInventoryRow[] | null {
  const envelope = record(body);
  if (envelope?.success !== true || !Array.isArray(envelope.documents)) return null;
  const rows = envelope.documents as Array<Record<string, unknown>>;
  if (!rows.every(row => !!row && importUuid(row.id) && nonempty(row.title) && row.program_id === programId
    && (row.readScope === 'document' || row.readScope === 'sections'))) return null;
  if (new Set(rows.map(row => String(row.id).toLowerCase())).size !== rows.length) return null;
  return rows.map(row => ({ id: String(row.id), title: String(row.title), readScope: row.readScope as IntakeInventoryRow['readScope'] }));
}
async function readIntakePath(path: string, request: SourceIntakeRequest): Promise<SourceIntakeReply<unknown>> {
  if (!intakeCurrent(request)) return intakeStale();
  try {
    const response = await apiRequest('GET', path, undefined, request.headers);
    if (!intakeCurrent(request)) return intakeStale();
    const body: unknown = await response.json().catch(() => null);
    if (!intakeCurrent(request)) return intakeStale();
    return response.ok ? { ok: true, data: body } : intakeRefused('The working documents could not be read. Check access in the original project and try the check again.');
  } catch { return intakeCurrent(request) ? intakeRefused('The working documents could not be read. Try the check again in the original project.') : intakeStale(); }
}
function exactIntakeRecovery(attempt: SourceImportInspectionAttempt, request: SourceIntakeRequest, programId: string): AuthoringCreationRecoveryIdentity | null {
  const recovery = attempt.recovery;
  return recovery && importUuid(recovery.documentId) && recovery.organizationId === request.actor.organizationId && recovery.programId === programId
    && (recovery.creationOutcome === 'unconfirmed' || recovery.creationOutcome === 'committed') ? { ...recovery } : null;
}
function recoveredImportBody(detail: unknown, sections: unknown, recovery: AuthoringCreationRecoveryIdentity): unknown {
  const header = record(detail);
  const doc = record(header?.document);
  const rows = record(sections);
  if (header?.success !== true || doc?.id !== recovery.documentId || doc.readScope !== 'document' || doc.sourceMetadataState !== 'available'
    || rows?.success !== true || rows.readScope !== 'document') return null;
  const origin = record(record(doc.provenance)?.importSource);
  return { success: true, data: { doc, sections: rows.sections, origin, warnings: origin?.warnings, reused: true } };
}
function readRecoveredCopy(body: unknown, programId: string, source: AuthoringImportSource, preview: AuthoringSourceImportPreviewData | undefined): SourceImportResult | null {
  return isWorkflowSource(source) ? preview ? readWorkflowImportResult(body, programId, source, preview) : null
    : readSourceImportResult(body, programId, source);
}
async function inspectIdentifiedImport(target: { programId: string; source: AuthoringImportSource; preview?: AuthoringSourceImportPreviewData },
  recovery: AuthoringCreationRecoveryIdentity, request: SourceIntakeRequest, rows: IntakeInventoryRow[]): Promise<SourceIntakeReply<SourceImportResult>> {
  const { programId, source, preview } = target;
  if (!rows.some(row => row.id === recovery.documentId && row.readScope === 'document')) return intakeRefused('The identified document is not currently available as a whole document in this project.');
  const detail = await readIntakePath(authoringCurrentReadPath(recovery.documentId, programId), request);
  if (!detail.ok) return detail;
  const sections = await readIntakePath(authoringCurrentReadPath(recovery.documentId, programId, true), request);
  if (!sections.ok) return sections;
  const data = readRecoveredCopy(recoveredImportBody(detail.data, sections.data, recovery), programId, source, preview);
  return data && capturedCopy(data, request) ? { ok: true, data } : intakeRefused('The identified working copy and its recorded source could not be verified. No document was opened.');
}
/** Read-only inspection never infers a receipt from an inventory title or order. */
export async function inspectSourceImport(programId: string, source: AuthoringImportSource, attempt: SourceImportInspectionAttempt,
  request: SourceIntakeRequest): Promise<SourceImportInspection> {
  const pinned = pinIntakeRequest(request);
  if (!pinned) return intakeStale();
  const selected = pinSource(source);
  if (!importUuid(programId) || !(validWorkflowSource(selected) || validBinarySource(selected))) return intakeRefused('Choose the original saved source and project.');
  const recovery = exactIntakeRecovery(attempt, pinned, programId);
  if ((attempt.identifiedOutcome || attempt.recovery) && !recovery) return { ...intakeUnknown(), identifiedOutcome: true };
  const preview = attempt.preview ? pinPreview(attempt.preview) : undefined;
  const reply = await readIntakePath(`/api/authoring/docs?status=all&programId=${encodeURIComponent(programId)}`, pinned);
  if (!reply.ok) return reply;
  const rows = readIntakeInventory(reply.data, programId);
  if (!rows) return intakeRefused('The working-document inventory could not be verified in the original project. Try the check again.');
  const inventory = rows.map(({ id, title }) => ({ id, title }));
  if (!recovery) return { ok: true, inventory };
  const recovered = await inspectIdentifiedImport({ programId, source: selected, preview }, recovery, pinned, rows);
  if (!recovered.ok) return recovered;
  return { ok: true, inventory, data: recovered.data };
}
