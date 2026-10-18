/** Current response ownership for the existing authoring canvas and editor. No write authority is granted here. */
import { useEffect, useReducer, useRef } from 'react';
import { apiRequest, ApiRequestError, redactInternals, serverMessage } from '@/lib/queryClient';
import { authService, type AuthUser } from '@/services/portal/authService';
import type { AuthoringReadProjection, AuthoringSourceMetadataState } from '@shared/authoring/read-projection';

/** GET /docs/:id → `document` (the columns this card reads; `created_by` is the author, never offered as its reviewer). */
/* c2c_document_id: the filing this is the editing copy of, or null (F4). */
export interface CanvasDocumentRow {
  created_by?: string | number | null;
  c2c_document_id?: string | null;
  id: string;
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

export interface CanvasSectionRow {
  id: string;
  code: string;
  title: string;
  content: string | null;
  order_index: number | null;
  updated_at?: string | null;
}

/** Keep one account/session owner across ordinary bearer refreshes. */
export function captureAuthoringSession() {
  const account = authService.getUser();
  const guard = authService.captureSessionReadGuard();
  return { sameRevision: () => guard.sameRevision() && authService.getUser() === account };
}

/** Shared by the existing canvas and workbench; session revision survives ordinary bearer refresh. */
export function useAuthoringReadSession(user: AuthUser | null) {
  const [, refresh] = useReducer((value: number) => value + 1, 0);
  const current = useRef<{ actor: string; key: number; sameRevision: () => boolean } | null>(null);
  const actor = `${user?.organizationId ?? ''}:${user?.id ?? ''}`;
  if (!current.current || current.current.actor !== actor || !current.current.sameRevision()) {
    const guard = captureAuthoringSession();
    current.current = { actor, key: (current.current?.key ?? 0) + 1,
      sameRevision: guard.sameRevision };
  }
  useEffect(() => {
    const stop = ['login', 'logout', 'session_expired', 'user_updated', 'token_refresh'].map(event =>
      authService.on(event as 'login' | 'logout' | 'session_expired' | 'user_updated' | 'token_refresh', refresh));
    return () => { stop.forEach(unsubscribe => unsubscribe()); };
  }, []);
  return current.current;
}

export function authoringCurrentReadPath(docId: string, programId: string | null, sections = false): string {
  return `/api/authoring/docs/${encodeURIComponent(docId)}${sections ? '/sections' : ''}` +
    (programId ? `?programId=${encodeURIComponent(programId)}` : '');
}

export function authoringReadRefused(status: number, body: unknown): boolean {
  const value = body && typeof body === 'object' ? body as { error?: unknown; code?: unknown } : null;
  const error = value?.error && typeof value.error === 'object' ? value.error as { code?: unknown } : null;
  const code = error?.code ?? value?.code;
  return [401, 403, 404].includes(status) ||
    (status === 503 && ['AUTHORING_READ_ACCESS_CHANGED', 'AUTHORING_READ_ACCESS_UNAVAILABLE', 'PROJECT_ACCESS_UNAVAILABLE'].includes(String(code)));
}

/** One read of the record: the document row, the caller's access, the sections. */
export type CanvasRecordRead<D, S> =
  | { ok: true; doc: D; access: unknown; sections: S[] }
  | { ok: false; message: string; doc?: D; refused?: boolean };

/**
 * GET /docs/:id and /sections, together. A failure is the sentence to show,
 * never an empty document: a missing row, a row whose sections did not read,
 * or a store that could not be reached each say which.
 */
export async function readCanvasDocumentRecord<D extends { title: string; readScope?: AuthoringReadProjection }, S>(docId: string, programId: string | null, current: () => boolean): Promise<CanvasRecordRead<D, S> | null> {
  try {
    const [d, s] = await Promise.all([
      apiRequest('GET', authoringCurrentReadPath(docId, programId)),
      apiRequest('GET', authoringCurrentReadPath(docId, programId, true)),
    ]);
    if (!current()) return null;
    const dj = (await d.json().catch(() => null)) as { document?: D; access?: unknown } | null;
    const sj = (await s.json().catch(() => null)) as { sections?: S[]; readScope?: AuthoringReadProjection } | null;
    if (!current()) return null;
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
      return { ok: false, doc: dj.document, refused: authoringReadRefused(s.status, sj),
        message: `“${dj.document.title}” exists, but its sections did not load (HTTP ${s.status}).` };
    }
    return { ok: true, doc: { ...dj.document,
      ...(sj.readScope === 'sections' ? { readScope: 'sections' as const } : {}) },
      access: dj.access, sections: Array.isArray(sj.sections) ? sj.sections : [] };
  } catch (e) {
    return { ok: false, refused: e instanceof ApiRequestError && authoringReadRefused(e.status, e.payload),
      message: redactInternals(e instanceof Error ? e.message : '', 'The authoring store could not be reached.') };
  }
}
