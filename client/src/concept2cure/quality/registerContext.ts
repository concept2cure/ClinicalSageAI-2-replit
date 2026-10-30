/**
 * What a quality-record register reads beside its own rows, for the columns and
 * forms that name another record: today the organisation's controlled documents,
 * for a supplier's quality agreement (2026-10-29).
 *
 * Read only when the register's configuration asks for it. Unread and failed
 * are kept apart, so a column never shows "none" over a read that did not land.
 *
 * @module client/src/concept2cure/quality/registerContext
 */
import { useMemo } from 'react';
import { useFetchJson } from '../mdx/hooks/useFetchJson';
import { listOf } from './qmsList';
import { adaptDoc, type ServerDoc } from './qmsDocumentRecord';

export interface ControlledDocPick { id: number; docNumber: string; title: string; status: string }

export interface RegisterContext {
  /** The organisation's controlled documents, or null while unread or after a failed read. */
  documents: ControlledDocPick[] | null;
  documentsFailed: boolean;
}

export function useRegisterContext(needs: { documents?: boolean } | undefined): RegisterContext {
  const read = useFetchJson<unknown>(needs?.documents ? '/api/mdx/qms/documents' : null);
  const documents = useMemo(() => {
    const rows = needs?.documents ? listOf<ServerDoc>(read.data) : null;
    return rows ? rows.map(adaptDoc).map((d) => ({ id: d.id, docNumber: d.docNumber, title: d.title, status: d.status })) : null;
  }, [needs?.documents, read.data]);
  const documentsFailed = !!needs?.documents && !read.loading && (read.error != null || (read.data != null && documents === null));
  // One object per read state: the register's AnA-context effect depends on it.
  return useMemo(() => ({ documents, documentsFailed }), [documents, documentsFailed]);
}

/** How a document id reads in a register: its number when read, never a guess when not. */
export function documentLabel(ctx: RegisterContext, id: number | null | undefined): string {
  if (id == null) return '—';
  const doc = ctx.documents?.find((d) => d.id === id);
  if (doc) return doc.docNumber;
  if (ctx.documents) return `document #${id} (not in the register)`;
  return ctx.documentsFailed ? `document #${id} (register not read)` : '…';
}
