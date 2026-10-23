/** Current response ownership for the existing authoring canvas and editor. No write authority is granted here. */
import { useEffect, useReducer, useRef } from 'react';
import { authService, type AuthUser } from '@/services/portal/authService';
import type { SectionRow } from './documentRecordRead';
export type { DocRow as CanvasDocumentRow, SectionRow as CanvasSectionRow } from './documentRecordRead';

/** The codes of sections that are new, or whose stored text changed, between two reads. */
export function changedSectionCodes(before: readonly SectionRow[], next: readonly SectionRow[]): string[] {
  const was = new Map(before.map(x => [x.id, x.content ?? '']));
  return next.filter(x => !was.has(x.id) || was.get(x.id) !== (x.content ?? '')).map(x => x.code);
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
