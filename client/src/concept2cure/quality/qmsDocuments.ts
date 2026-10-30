import { apiRequest, serverMessage } from '@/lib/queryClient';
import type { AuthDoc } from '../v2/editor/DocumentWorkbench';
import type { DocType } from './data';
import {adaptDoc,type ServerDoc} from './qmsDocumentRecord';

export interface QmsEditingCopy {
  document: AuthDoc;
  programId: string;
  qmsDocument: { id: number; status: string; doc_number?: string; version?: string };
}
export interface QmsSignedVersion {
  version: string;
  approved_at: string | null;
  record_kind?: 'signed' | 'legacy-registry';
  sections: { id: string; code: string; title: string; content: string; orderIndex: number }[];
}
interface MutationRow { id: number; authoring_document_id: string }

async function payloadOf(response: Response, fallback: string): Promise<unknown> {
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(serverMessage(payload) ?? fallback);
  return payload && typeof payload === 'object' ? (payload as { data?: unknown }).data : null;
}
async function mutate(path: string, body: unknown): Promise<MutationRow> {
  const data = await payloadOf(await apiRequest('POST', path, body), 'The document change could not be confirmed. Reload the register before trying again.');
  if (!data || typeof data !== 'object' || typeof (data as MutationRow).id !== 'number' ||
      typeof (data as MutationRow).authoring_document_id !== 'string') {
    throw new Error('The server did not return the editing copy. Reload the register to see whether the change was recorded.');
  }
  return data as MutationRow;
}
export function createQmsDocument(input: {
  title: string; docType: DocType; programId: string; reason: string; templateKey?: string; docNumber?: string;
  /** YYYY-MM-DD; the periodic review the server schedules and review-due reads. */
  nextReviewDate?: string;
}) { return mutate('/api/mdx/qms/documents', input); }
export function bindQmsDocument(id: number, input: { programId: string; reason: string; templateKey?: string }) {
  return mutate(`/api/mdx/qms/documents/${id}/bind`, input);
}
export function reviseQmsDocument(id: number, reason: string, binding?: { programId: string; templateKey?: string }) {
  return mutate(`/api/mdx/qms/documents/${id}/revise`, { reason, ...(binding ? { programId: binding.programId, templateKey: binding.templateKey } : {}) });
}
export async function readQmsDocument(id:number) {
  const row=await payloadOf(await apiRequest('GET',`/api/mdx/qms/documents/${id}`),'The selected controlled document could not be read. Try again.') as ServerDoc|null;
  if(!row||row.id!==id||typeof row.doc_number!=='string'||typeof row.title!=='string'||typeof row.doc_type!=='string'||typeof row.version!=='string'||
    !['draft','in_review','effective','retired','superseded'].includes(row.status)) throw new Error('The selected controlled document could not be read. Try again.');
  return adaptDoc(row);
}
export async function readQmsEditingCopy(id: number): Promise<QmsEditingCopy> {
  const data = await payloadOf(await apiRequest('GET', `/api/mdx/qms/documents/${id}/editor`), 'The editing copy could not be read. Try again.');
  const row = data as QmsEditingCopy | null;
  if (!row || typeof row.document?.id !== 'string' || typeof row.document.title !== 'string' ||
      typeof row.programId !== 'string' || row.qmsDocument?.id !== id) {
    throw new Error('The editing copy could not be read. Try again.');
  }
  return row;
}
export async function readQmsSignedVersions(id: number): Promise<QmsSignedVersion[]> {
  const data = await payloadOf(await apiRequest('GET', `/api/mdx/qms/documents/${id}/versions`), 'The signed version history could not be read. Try again.');
  if (!Array.isArray(data) || data.some(row => typeof row?.version !== 'string' || (typeof row.approved_at !== 'string' && !(row.record_kind === 'legacy-registry' && row.approved_at === null)) ||
      !Array.isArray(row.sections) || row.sections.some((section: QmsSignedVersion['sections'][number]) =>
        typeof section?.id !== 'string' || typeof section.title !== 'string' || typeof section.content !== 'string'))) {
    throw new Error('The signed version history could not be read. Try again.');
  }
  return data as QmsSignedVersion[];
}

/**
 * The controlled copy of a document's version in force (MR-12 Stage 8): the
 * server renders it with its approval signature and CONTROLLED COPY marking on
 * every page, and records its issue before delivering it. Throws the server's
 * reason when no copy is issued (nothing in force, an approval that does not
 * stand, no permission to read it).
 */
export async function fetchQmsControlledCopy(id: number, format: 'pdf' | 'docx' = 'pdf'): Promise<{ blob: Blob; filename: string }> {
  const res = await apiRequest('GET', `/api/mdx/qms/documents/${id}/controlled-copy?format=${format}`);
  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    throw new Error(serverMessage(payload) ?? 'The controlled copy could not be issued. Nothing was downloaded.');
  }
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `controlled_copy.${format}`;
  return { blob: await res.blob(), filename };
}
