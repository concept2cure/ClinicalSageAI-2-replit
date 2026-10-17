/** The canvas's single metadata/sections reader, for normal and verified recovery refresh. */
import { apiRequest, redactInternals, serverMessage } from '@/lib/queryClient';
import type { AuthDoc } from './DocumentWorkbench';

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
type SectionReply = { success?: boolean; sections?: SectionRow[] };

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
  | { ok: false; message: string; doc?: DocRow };

/**
 * GET /docs/:id and /sections, together. A failure is the sentence to show,
 * never an empty document: a missing row, a row whose sections did not read,
 * or a store that could not be reached each say which.
 */
export async function readDocumentRecord(docId: string, recovery = false, programId: string | null = null): Promise<RecordRead> {
  try {
    const [d, s] = await Promise.all([
      apiRequest('GET', `/api/authoring/docs/${encodeURIComponent(docId)}`),
      apiRequest('GET', `/api/authoring/docs/${encodeURIComponent(docId)}/sections`),
    ]);
    const dj = (await d.json().catch(() => null)) as DocumentReply | null;
    const sj = (await s.json().catch(() => null)) as SectionReply | null;
    if (!d.ok || !dj?.document) {
      return {
        ok: false,
        message: serverMessage(dj) ?? (d.status === 404 ? 'This document is not in your organization’s authoring records.' : `The document did not load (HTTP ${d.status}).`),
      };
    }
    if (!s.ok || !sj) {
      /* The document row is real; its sections did not read. Say that,
         rather than rendering a document with no sections. */
      return { ok: false, doc: dj.document, message: `“${dj.document.title}” exists, but its sections did not load (HTTP ${s.status}).` };
    }
    if (recovery && !verifiedRecordReply(dj, sj, docId, programId)) {
      return { ok: false, message: 'The current document and section recovery read could not be verified.' };
    }
    return { ok: true, doc: dj.document, access: dj.access, sections: Array.isArray(sj.sections) ? sj.sections : [] };
  } catch (e) {
    return { ok: false, message: redactInternals(e instanceof Error ? e.message : '', 'The authoring store could not be reached.') };
  }
}

