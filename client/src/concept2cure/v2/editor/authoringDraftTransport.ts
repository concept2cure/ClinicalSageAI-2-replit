/** One transport for individual and orchestrated section drafting. No automatic retries. */
import { apiRequest, ApiRequestError, serverMessage } from '@/lib/queryClient';
import { authService } from '@/services/portal/authService';
import { captureShellProjectGuard, shellProgramId } from '../shellProject';
import { readAnswerCheck, type AnswerCheckView } from '../../components/ana/anaAnswerCheck';
import { readTurnRecord } from '../../components/ana/anaProgress';
import type { AnaTurnRecordStatus } from '../../components/ana/useAnaChat.types';
import { readAssemblySourceManifest, type AssemblySourceManifest } from '@shared/authoring/assembly-sources';

export interface AiDraftMetadata {
  tone?: string; region?: string; generated_at?: string; model?: string | null; provider?: string | null;
  sourcesRetrieved?: number; attributableSources?: number;
  retrievalStatus?: 'ok' | 'empty' | 'failed'; retrievalError?: string | null; source?: string;
}
export interface PendingAiDraft {
  sectionId: string; generated: string; draftId: string | null; metadata: AiDraftMetadata;
  check: AnswerCheckView | null; turnRecord?: AnaTurnRecordStatus;
}
export interface AcceptedAttribution { sourceSpans: number; authorSpans: number; distinctSources: number; coverage: number }
export interface AiDraftReviewState {
  draft: PendingAiDraft | null; body: string; changeReason: string; refusal: string | null;
  /** A lost or malformed acceptance response may follow a committed save. */
  acceptUnknown?: boolean;
  /** A confirmed base conflict keeps the candidate for comparison only. */
  baseChanged?: boolean;
  /** Exact saved text read explicitly after an uncertain acceptance. */
  checkedContent?: string;
}
export interface AiDraftReviewSession {
  state: AiDraftReviewState;
  update: (next: AiDraftReviewState) => void;
  isCurrent: () => boolean;
  sources?: AssemblySourceManifest;
}
export const createEmptyAiDraftReviewState = (): AiDraftReviewState => ({ draft: null, body: '', changeReason: '', refusal: null });
export interface DraftRequest { sectionId: string; tone?: string; region?: string; context?: string; requirements?: string; sources?: AssemblySourceManifest }
export interface DraftAcceptRequest { sectionId: string; draftId: string; content: string; changeReason?: string; docId?: string }
export interface DraftFailure { ok: false; status: number; code: string | null; message: string; unknown: boolean; stale?: true }
export type DraftGenerationResult = { ok: true; draft: PendingAiDraft } | DraftFailure;
export type DraftAcceptResult = { ok: true; section: Record<string, unknown>; attribution: AcceptedAttribution | null } | DraftFailure;
const record = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const text = (value: unknown): value is string => typeof value === 'string' && Boolean(value.trim());
const stale = (unknown = false): DraftFailure => ({ ok: false, status: 0, code: 'CONTEXT_CHANGED', message: 'The document, project or signed-in account changed. No later action was started.', unknown, stale: true });

/** Guard every stage of a request; same-project metadata/token refresh remains valid. */
export function captureEditorDraftGuard(input: { programId?: string | null; docId?: string | null; sectionId?: string | null; isCurrent?: () => boolean } = {}): () => boolean {
  const project = captureShellProjectGuard();
  const session = authService.captureSessionReadGuard();
  const account = authService.getUser();
  const actor = `${account?.organizationId ?? ''}:${account?.id ?? ''}`;
  return () => project() && session.sameRevision() && input.isCurrent?.() !== false
    && (input.programId === undefined || shellProgramId() === input.programId)
    && `${authService.getUser()?.organizationId ?? ''}:${authService.getUser()?.id ?? ''}` === actor;
}
export function failureOf(error: unknown): { status: number; code: string | null; message: string | null } {
  return error instanceof ApiRequestError
    ? { status: error.status, code: error.code ?? null, message: error.message || null }
    : { status: 0, code: null, message: error instanceof Error ? error.message : String(error) };
}
function failure(status: number, code: string | null, message: string | null, acceptance: boolean): DraftFailure {
  return { ok: false, status, code, message: message || (status ? `HTTP ${status}` : 'the request failed'),
    unknown: acceptance && (status === 0 || status >= 500) && code !== 'LINEAGE_REQUIRED' };
}
function responseFailure(status: number, body: unknown, acceptance: boolean): DraftFailure {
  const error = record(record(body)?.error);
  return failure(status, typeof error?.code === 'string' ? error.code : null, serverMessage(body), acceptance);
}
function decodeDraft(sectionId: string, body: Record<string, unknown> | null, status: number): DraftGenerationResult {
  const draft = record(body?.draft);
  if (!text(draft?.content)) return responseFailure(status, body, false);
  return { ok: true, draft: { sectionId, generated: draft.content,
    draftId: body?.success === true && text(draft.draftId) ? draft.draftId : null,
    metadata: (record(draft.metadata) ?? {}) as AiDraftMetadata,
    check: readAnswerCheck(draft.check) ?? null, turnRecord: readTurnRecord(draft.turnRecord) } };
}
function decodeAcceptance(input: DraftAcceptRequest, body: Record<string, unknown> | null, status: number): DraftAcceptResult {
  const section = record(body?.section);
  if (body?.success !== true || section?.id !== input.sectionId || typeof section.content !== 'string'
    || (input.docId !== undefined && section.doc_id !== input.docId)) return {
    ok: false, status, code: 'ACCEPT_UNCONFIRMED', message: 'The server did not confirm the exact saved section.', unknown: true,
  };
  const a = record(body.attribution);
  const attribution = a && ['sourceSpans', 'authorSpans', 'distinctSources', 'coverage'].every(key => typeof a[key] === 'number')
    ? a as unknown as AcceptedAttribution : null;
  return { ok: true, section, attribution };
}

function draftRequestPayload(input: DraftRequest, sources?: AssemblySourceManifest) {
  return { tone: input.tone ?? 'professional', region: input.region ?? 'FDA',
    ...(input.context?.trim() ? { context: input.context.trim() } : {}),
    ...(input.requirements?.trim() ? { requirements: input.requirements.trim() } : {}), ...(sources ? { sources } : {}) };
}
export async function generateAuthoringDraft(input: DraftRequest, isCurrent: () => boolean = () => true): Promise<DraftGenerationResult> {
  if (!isCurrent()) return stale();
  const sources = input.sources === undefined ? undefined : readAssemblySourceManifest(input.sources);
  if (sources === null) return { ok: false, status: 400, code: 'ASSEMBLY_SOURCES_INVALID', message: 'The exact selected-source receipt is invalid. No broader retrieval was requested.', unknown: false };
  try {
    const response = await apiRequest('POST', `/api/authoring/sections/${encodeURIComponent(input.sectionId)}/ai/draft`, draftRequestPayload(input, sources));
    if (!isCurrent()) return stale();
    const body = record(await response.json().catch(() => null));
    if (!isCurrent()) return stale();
    return response.ok ? decodeDraft(input.sectionId, body, response.status) : responseFailure(response.status, body, false);
  } catch (error) {
    if (!isCurrent()) return stale();
    const detail = failureOf(error);
    return failure(detail.status, detail.code, detail.message, false);
  }
}

export async function acceptAuthoringDraft(input: DraftAcceptRequest, isCurrent: () => boolean = () => true): Promise<DraftAcceptResult> {
  if (!isCurrent()) return stale();
  try {
    const response = await apiRequest('POST', `/api/authoring/sections/${encodeURIComponent(input.sectionId)}/ai/draft/accept`, {
      draftId: input.draftId, content: input.content,
      ...(input.changeReason?.trim() ? { changeReason: input.changeReason.trim() } : {}),
    });
    if (!isCurrent()) return stale(true);
    const body = record(await response.json().catch(() => null));
    if (!isCurrent()) return stale(true);
    return response.ok ? decodeAcceptance(input, body, response.status) : responseFailure(response.status, body, true);
  } catch (error) {
    if (!isCurrent()) return stale(true);
    const detail = failureOf(error);
    return failure(detail.status, detail.code, detail.message, true);
  }
}

/** Read-only recovery cannot prove which request wrote matching text. */
export async function checkAuthoringDraftSection(input: { docId: string; sectionId: string; programId?: string | null }, isCurrent: () => boolean): Promise<string | null> {
  const read = async (path: string) => {
    if (!isCurrent()) return null;
    const response = await apiRequest('GET', path);
    if (!isCurrent()) return null;
    const body = record(await response.json());
    return isCurrent() && response.ok && body?.success === true ? body : null;
  };
  try {
    if (input.programId) {
      const inventory = await read(`/api/authoring/docs?status=all&programId=${encodeURIComponent(input.programId)}`);
      if (!Array.isArray(inventory?.documents) || !inventory.documents.every(row => record(row)?.program_id === input.programId)
        || !inventory.documents.some(row => record(row)?.id === input.docId)) return null;
    }
    const body = await read(`/api/authoring/docs/${encodeURIComponent(input.docId)}/sections`);
    if (!Array.isArray(body?.sections) || !body.sections.every(row => record(row)?.doc_id === input.docId)) return null;
    const matching = body.sections.filter(row => record(row)?.id === input.sectionId);
    const section = matching.length === 1 ? record(matching[0]) : null;
    return typeof section?.content === 'string' ? section.content : null;
  } catch { return null; }
}
