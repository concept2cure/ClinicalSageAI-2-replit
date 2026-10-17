/** The canonical specialist-to-editor writer. Receipts, project visits and
 * signed-in account scope are confirmed before content or navigation proceeds. */
import { useCallback, useEffect, useRef } from 'react';
import { apiRequest, ApiRequestError, redactInternals, serverMessage } from '@/lib/queryClient';
import { authService } from '@/services/portal/authService';
import { unboundNotice } from './governanceNotice';
import { captureShellProjectGuard, shellProgramId } from './shellProject';
import { setEditorTarget } from './editorTarget';

export interface AuthoringHandoff {
  title: string;
  /** The specialist states its own CTD module; the server otherwise defaults to M3. */
  module: string;
  /** A working identifier, never a guessed CTD filing location. */
  code: string;
  content: string;
  subject: string;
}
interface HandoffContext {
  programId: string | null;
  code: string;
  isCurrent: () => boolean;
}
export type AuthoringHandoffResult = HandoffContext & (
  | { ok: true; docId: string; programId: string; bound: boolean | null; message: string }
  | { ok: false; phase: 'refused' | 'unknown' | 'partial' | 'stale'; docId?: string; message: string }
);
type StageResult =
  | { phase: 'confirmed'; body: Record<string, unknown>; row: Record<string, unknown> }
  | { phase: 'refused' | 'unknown' | 'stale'; message?: string };
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
    if (!response.ok) return { phase: response.status >= 400 && response.status < 500 ? 'refused' : 'unknown', message: response.status === 401 ? 'your session isn’t authenticated' : serverMessage(body) ?? undefined };
    return confirmedStage(kind, body, request);
  } catch (error) {
    if (!current()) return { phase: 'stale' };
    return error instanceof ApiRequestError && error.status >= 400 && error.status < 500
      ? { phase: 'refused', message: redactInternals(error.message, 'The server refused this write.') } : { phase: 'unknown' };
  }
}

function failedHandoff(context: HandoffContext, result: Exclude<StageResult, { phase: 'confirmed' }>, subject: string, docId?: string): AuthoringHandoffResult {
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

/** Mount ownership only; the existing writer owns all requests and receipts. */
export function useAuthoringHandoff() {
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  return useCallback((input: AuthoringHandoff) => saveToAuthoring(input, () => alive.current), []);
}

/** Use the existing exact-target channel; a stale receipt never changes it. */
export function openSavedAuthoring(result: AuthoringHandoffResult, onNav: (id: string) => void): boolean {
  if (!result.ok || !result.isCurrent()) return false;
  setEditorTarget({ docType: null, docId: result.docId, programId: result.programId, code: result.code });
  onNav('document-authoring');
  return true;
}

export type { WorkflowImportSource } from '@shared/authoring/source-import';
import type { AuthoringSourceImportData, AuthoringSourceImportPreviewData, WorkflowImportOrigin, WorkflowImportSource } from '@shared/authoring/source-import';

export function isWorkflowSource(source: unknown): source is WorkflowImportSource {
  if (!source || typeof source !== 'object') return false;
  const kind = (source as { kind?: unknown }).kind;
  return kind === 'protocol' || kind === 'csr';
}

/** Stable selection identity; ordering does not change a CSR selection. */
export function workflowSourceKey(source: WorkflowImportSource): string {
  if (source.kind === 'protocol') return `protocol:${source.documentId}`;
  if (source.sectionNumbers !== undefined && (!Array.isArray(source.sectionNumbers) || !source.sectionNumbers.every(s => typeof s === 'string'))) return 'invalid-selection';
  return `csr:${source.jobId}:${[...new Set(source.sectionNumbers?.map(s => s.trim()) ?? [])].sort().join(',')}`;
}
const importHash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
const stringList = (value: unknown): value is string[] => Array.isArray(value) && value.every(s => typeof s === 'string');
function validSectionOrigin(section: WorkflowImportOrigin['sectionOrigins'][number]): boolean {
  return !!section && typeof section.code === 'string' && importHash(section.contentSha256)
    && typeof section.sourceRowId === 'string' && ['machine', 'template', 'unknown'].includes(section.originalAuthorship)
    && ['unrecorded', 'recorded-name-only'].includes(section.modelEvidence) && (section.model === null || typeof section.model === 'string');
}
function validWorkflowMetadata(origin: WorkflowImportOrigin): boolean {
  return (origin.version === null || typeof origin.version === 'string')
    && !!origin.sourceScope && ['organization', 'program', 'project'].includes(origin.sourceScope.level)
    && !!origin.association && ['recorded', 'explicit'].includes(origin.association.mode)
    && (origin.association.reason === null || typeof origin.association.reason === 'string');
}
function matchingWorkflowTarget(origin: WorkflowImportOrigin, programId: string, source: WorkflowImportSource): boolean {
  return origin.kind === source.kind && origin.programId === programId && importHash(origin.fingerprint);
}
export function workflowOriginMatches(origin: WorkflowImportOrigin | undefined, programId: string, source: WorkflowImportSource | undefined): boolean {
  if (!origin || !isWorkflowSource(source) || !matchingWorkflowTarget(origin, programId, source)) return false;
  const id = source.kind === 'protocol' ? source.documentId : source.jobId;
  if (String(origin.id) !== String(id) || !isWorkflowSource(origin.selection) || origin.selection.kind !== source.kind) return false;
  if (workflowSourceKey(origin.selection) !== workflowSourceKey(source)) return false;
  return typeof origin.title === 'string' && Array.isArray(origin.sectionOrigins) && origin.sectionOrigins.length > 0
    && origin.sectionOrigins.every(validSectionOrigin) && stringList(origin.gaps) && validWorkflowMetadata(origin);
}
function validPreviewSections(sections: AuthoringSourceImportPreviewData['sections']): boolean {
  return Array.isArray(sections) && sections.length > 0 && sections.every(s => !!s && typeof s.code === 'string'
    && !!s.code.trim() && typeof s.title === 'string' && importHash(s.contentSha256));
}
function matchingPreviewScope(data: AuthoringSourceImportPreviewData, programId: string): boolean {
  return data.fingerprint === data.origin.fingerprint && data.target?.programId === programId
    && data.association?.targetProgramId === programId && typeof data.association.required === 'boolean';
}
export function readWorkflowPreview(body: unknown, programId: string, source: WorkflowImportSource): AuthoringSourceImportPreviewData | null {
  const envelope = body as { success?: boolean; data?: AuthoringSourceImportPreviewData } | null;
  const data = envelope?.data;
  if (envelope?.success !== true || !data || data.preview !== true || !workflowOriginMatches(data.origin, programId, source)) return null;
  if (!matchingPreviewScope(data, programId) || !validPreviewSections(data.sections) || !stringList(data.gaps) || !stringList(data.warnings)) return null;
  return data;
}
function validSavedCopy(data: AuthoringSourceImportData | undefined, programId: string): data is AuthoringSourceImportData {
  if (!data || typeof data.doc?.id !== 'string' || !data.doc.id.trim() || typeof data.doc.title !== 'string') return false;
  if (data.doc.client_program_id !== undefined && data.doc.client_program_id !== programId) return false;
  return typeof data.reused === 'boolean' && stringList(data.warnings) && Array.isArray(data.sections) && data.sections.length > 0;
}
function savedSectionsMatch(data: AuthoringSourceImportData, preview: AuthoringSourceImportPreviewData): boolean {
  const codes = new Set(preview.sections.map(s => s.code));
  const savedCodes = new Set(data.sections.map(s => s?.code));
  return savedCodes.size === codes.size && data.sections.every(s => !!s && typeof s.id === 'string' && typeof s.code === 'string' && codes.has(s.code));
}

function validSavedSectionKeys(sections: AuthoringSourceImportData['sections']): boolean {
  if (!sections.every(s => !!s && typeof s.id === 'string' && !!s.id.trim() && typeof s.code === 'string' && !!s.code.trim())) return false;
  const ids = new Set(sections.map(s => String(s.id).trim()));
  const codes = new Set(sections.map(s => String(s.code).trim().toUpperCase()));
  return ids.size === sections.length && codes.size === sections.length;
}

function actualSavedSection(section: Record<string, unknown>, doc: AuthoringSourceImportData['doc']): boolean {
  return section.doc_id === doc.id && section.tenant_id === doc.tenant_id && typeof section.title === 'string'
    && (typeof section.content === 'string' || section.content === null);
}

/** Reuse is a fresh server verification of an existing edited document, not a
 * promise that its current section structure still equals the original source.
 * Keep the retained source/version and actual saved row ownership authoritative. */
function reusedWorkflowCopyMatches(data: AuthoringSourceImportData, programId: string, source: WorkflowImportSource): boolean {
  const doc = data.doc;
  if (doc.client_program_id !== programId || !Number.isSafeInteger(doc.tenant_id) || Number(doc.tenant_id) <= 0) return false;
  const provenance = doc.provenance as { source?: unknown; importSource?: WorkflowImportOrigin } | undefined;
  if (provenance?.source !== 'import' || !workflowOriginMatches(provenance.importSource, programId, source)) return false;
  if (provenance.importSource?.fingerprint !== (data.origin as WorkflowImportOrigin).fingerprint) return false;
  return data.sections.every(section => actualSavedSection(section, doc));
}

export function readWorkflowImportResult(body: unknown, programId: string, source: WorkflowImportSource, preview: AuthoringSourceImportPreviewData): AuthoringSourceImportData | null {
  const envelope = body as { success?: boolean; data?: AuthoringSourceImportData } | null;
  const data = envelope?.data;
  if (envelope?.success !== true || !validSavedCopy(data, programId) || !isWorkflowSource(data.origin)) return null;
  if (!workflowOriginMatches(data.origin as WorkflowImportOrigin, programId, source)) return null;
  if ((data.origin as WorkflowImportOrigin).fingerprint !== preview.fingerprint || !validSavedSectionKeys(data.sections)) return null;
  if (data.reused ? !reusedWorkflowCopyMatches(data, programId, source) : !savedSectionsMatch(data, preview)) return null;
  return data;
}

type IntakeReply<T> = { ok: true; data: T } | { ok: false; message: string };
async function requestWorkflowIntake<T>(payload: Record<string, unknown>, read: (body: unknown) => T | null): Promise<IntakeReply<T>> {
  try {
    const res = await apiRequest('POST', '/api/authoring/import/source', payload);
    const body = await res.json().catch(() => null);
    const data = res.ok ? read(body) : null;
    return data ? { ok: true, data } : { ok: false, message: serverMessage(body) ?? 'The server did not confirm this source and target. Reload the preview before retrying.' };
  } catch (e) {
    return { ok: false, message: redactInternals(e instanceof Error ? e.message : '', 'The source intake could not be reached. Nothing was opened.') };
  }
}
export function previewWorkflowImport(programId: string, source: WorkflowImportSource) {
  return requestWorkflowIntake({ programId, source, previewOnly: true }, body => readWorkflowPreview(body, programId, source));
}
export function createWorkflowImport(programId: string, source: WorkflowImportSource, preview: AuthoringSourceImportPreviewData, reason: string, associationReason?: string) {
  return requestWorkflowIntake({ programId, source, expectedFingerprint: preview.fingerprint, reason,
    ...(associationReason ? { associationReason } : {}) }, body => readWorkflowImportResult(body, programId, source, preview));
}
