/** The canvas's single metadata/sections reader, for normal and verified recovery refresh. */
import { apiRequest, ApiRequestError, redactInternals, serverMessage } from '@/lib/queryClient';
import { authService } from '@/services/portal/authService';
import { capturedActorHeaders, getAuthToken } from '@/utils/authToken';
import { taskActorScope } from '../taskTarget';
import type { AuthDoc } from './DocumentWorkbench';
import { authoringCurrentReadPath, authoringReadRefused } from './authoringCurrentRead';
import type { AuthoringReadProjection, AuthoringSourceMetadataState } from '@shared/authoring/read-projection';

/** Authority of this exact read, not of a later same-account token refresh. */
export function captureDocumentRecordReadOwner() {
  const session = authService.captureSessionReadGuard();
  const actor = taskActorScope(authService.getUser());
  if (!actor) return null;
  try {
    const headers = capturedActorHeaders({ userId: Number(actor.userId), organizationId: Number(actor.organizationId) });
    const current = () => {
      const currentActor = taskActorScope(authService.getUser());
      return session.current() && headers.Authorization === `Bearer ${getAuthToken()}`
        && currentActor?.userId === actor.userId && currentActor?.organizationId === actor.organizationId;
    };
    return current() ? { headers, current } : null;
  } catch { return null; }
}

/** Normal reads retain the host's session guard; recovery additionally pins the exact bearer. */
export function captureDocumentRefreshOwner(recovery: boolean) {
  return recovery ? captureDocumentRecordReadOwner() : { headers: undefined, current: () => true };
}

/** GET /docs/:id → `document` (the columns this card reads; `created_by` is the author, never offered as its reviewer). */
/* c2c_document_id: the filing this is the editing copy of, or null (F4). */
export interface DocRow extends Pick<AuthDoc, 'created_by' | 'c2c_document_id'> {
  id: string;
  client_program_id?: string | null;
  title: string;
  module: string | null;
  product_code: string | null;
  status: string;
  updated_at: string | null;
  section_count: number | string | null;
  provenance?: unknown;
  readScope?: AuthoringReadProjection;
  sourceMetadataState?: AuthoringSourceMetadataState;
}

export interface SectionRow {
  id: string;
  doc_id?: string;
  code: string;
  title: string;
  content: string | null;
  order_index: number | null;
  updated_at?: string | null;
}

type DocumentReply = { success?: boolean; document?: DocRow; access?: unknown };
type SectionReply = { success?: boolean; sections?: SectionRow[]; readScope?: AuthoringReadProjection };

function nullableText(value: unknown): boolean {
  return value === null || typeof value === 'string';
}

function sectionCount(value: unknown): boolean {
  if (value === null) return true;
  const count = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  return typeof count === 'number' && Number.isSafeInteger(count) && count >= 0;
}

function verifiedMetadata(document: DocRow): boolean {
  return nullableText(document.module) && nullableText(document.product_code)
    && typeof document.status === 'string' && nullableText(document.updated_at) && sectionCount(document.section_count)
    && (document.c2c_document_id === undefined || nullableText(document.c2c_document_id))
    && (document.created_by === undefined || nullableText(document.created_by)
      || (typeof document.created_by === 'number' && Number.isFinite(document.created_by)));
}

function verifiedRecordReply(document: DocumentReply, sections: SectionReply, docId: string, programId: string | null): boolean {
  return programId !== null && document.success === true && document.document?.id === docId
    && document.document.client_program_id === programId && typeof document.document.title === 'string'
    && verifiedMetadata(document.document)
    && sections.success === true && Array.isArray(sections.sections) && sections.sections.every(row =>
      row && typeof row.id === 'string' && row.id.trim() && row.doc_id === docId && typeof row.code === 'string'
      && typeof row.title === 'string' && (row.content === null || typeof row.content === 'string'));
}

/** One read of the record: the document row, the caller's access, the sections. */
type RecordRead =
  | { ok: true; doc: DocRow; access: unknown; sections: SectionRow[] }
  | { ok: false; message: string; doc?: DocRow; refused?: boolean };

/** Interpret the same scoped responses, keeping refusals distinct from incomplete reads. */
function decodeDocumentRecord(responses: { document: Response; sections: Response },
  bodies: { document: DocumentReply | null; sections: SectionReply | null },
  context: { docId: string; programId: string | null; recovery: boolean }): RecordRead {
  const { document: d, sections: s } = responses;
  const { document: dj, sections: sj } = bodies;
  const { docId, programId, recovery } = context;
    if (!d.ok || !dj?.document) {
      return {
        ok: false,
        refused: authoringReadRefused(d.status, dj),
        message: serverMessage(dj) ?? (d.status === 404 ? 'This document is not in your organization’s authoring records.' : `The document did not load (HTTP ${d.status}).`),
      };
    }
    if (!s.ok || !sj) {
      /* The document row is real; its sections did not read. Say that,
         rather than rendering a document with no sections. */
      return { ok: false, doc: dj.document, refused: authoringReadRefused(s.status, sj), message: `“${dj.document.title}” exists, but its sections did not load (HTTP ${s.status}).` };
    }
    if (recovery && !verifiedRecordReply(dj, sj, docId, programId)) {
      return { ok: false, message: 'The current document and section recovery read could not be verified.' };
    }
    return { ok: true, doc: { ...dj.document, ...(sj.readScope === 'sections' ? { readScope: 'sections' as const } : {}) }, access: dj.access, sections: Array.isArray(sj.sections) ? sj.sections : [] };
}

/**
 * GET /docs/:id and /sections, together. A failure is the sentence to show,
 * never an empty document: a missing row, a row whose sections did not read,
 * or a store that could not be reached each say which.
 */
export async function readDocumentRecord(docId: string, recovery = false, programId: string | null = null,
  options: { headers?: Record<string, string>; current?: () => boolean } = {}): Promise<RecordRead | null> {
  const { headers, current = () => true } = options;
  try {
    const read = (path: string) => headers ? apiRequest('GET', path, undefined, headers) : apiRequest('GET', path);
    const [d, s] = await Promise.all([
      read(authoringCurrentReadPath(docId, programId)),
      read(authoringCurrentReadPath(docId, programId, true)),
    ]);
    if (!current()) return null;
    const dj = (await d.json().catch(() => null)) as DocumentReply | null;
    const sj = (await s.json().catch(() => null)) as SectionReply | null;
    if (!current()) return null;
    return decodeDocumentRecord({ document: d, sections: s }, { document: dj, sections: sj }, { docId, programId, recovery });
  } catch (e) {
    return { ok: false, refused: e instanceof ApiRequestError && authoringReadRefused(e.status, e.payload), message: redactInternals(e instanceof Error ? e.message : '', 'The authoring store could not be reached.') };
  }
}
