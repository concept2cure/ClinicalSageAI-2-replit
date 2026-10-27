/** A saved snapshot is reviewed here; all text changes happen in the existing editor. */
import { useCallback, useEffect, useRef, useState, type SetStateAction } from 'react';
import { ApiRequestError, apiRequest, assertApiResponseOk } from '@/lib/queryClient';
import { useAuthUser } from '@/services/portal/authService';
import { GOVERNED_REASON_MIN } from '@shared/constants/governed-reason';
import { useAuthoringReadSession } from '../editor/authoringCurrentRead';
import { readResponseEditor, type ResponseEditorRead } from './agencyResponseEditorState';

export interface ResponseEditorProps {
  projectId: string; eventId: string; questionId: number; responseRevision: number; questionRef: string;
  onNav?: (id: string) => void; onSaved: () => void; onCancel: () => void;
  onBusy: (busy: boolean) => void; fire: (message: string, tone?: 'ok' | 'error') => void;
  hostCurrent?: () => boolean;
}
const said = (error: unknown) => error instanceof Error ? error.message : 'The current saved response could not be verified.';
function saveFailure(error: unknown): string {
  return error instanceof ApiRequestError ? `${said(error)} Refresh the saved response before another save.`
    : 'The save was not confirmed and may have completed. Refresh the registered response before another save.';
}
/** Mask retained state during render, before a new visit's effects can run. */
function useVisitState<T>(visit: object, empty: T) {
  const [stored, setStored] = useState({ visit, value: empty });
  const setValue = useCallback((next: SetStateAction<T>) => setStored(previous => ({ visit,
    value: typeof next === 'function' ? (next as (value: T) => T)(previous.visit === visit ? previous.value : empty) : next,
  })), [visit, empty]);
  return [stored.visit === visit ? stored.value : empty, setValue] as const;
}

export function useAgencyResponseEditor(props: ResponseEditorProps) {
  const { projectId, eventId, questionId, responseRevision, onBusy, onSaved, fire, questionRef, hostCurrent } = props;
  const session = useAuthoringReadSession(useAuthUser());
  const scope = `${session.actor}:${session.key}:${projectId}:${eventId}:${questionId}`;
  const owner = useRef({ scope, mounted: true });
  if (owner.current.scope !== scope) owner.current = { scope, mounted: true };
  const visit = owner.current;
  const [read, setRead] = useVisitState<ResponseEditorRead | null>(visit, null);
  const [selected, setSelected] = useVisitState(visit, '');
  const [reason, setReason] = useVisitState(visit, '');
  const [busy, setBusy] = useVisitState(visit, false);
  const [notice, setNotice] = useVisitState<string | null>(visit, null);
  const [held, setHeld] = useVisitState(visit, false);
  const latest = useRef({ onSaved, responseRevision });
  latest.current = { onSaved, responseRevision };
  const base = `/api/concept2cure/projects/${encodeURIComponent(projectId)}/agency-communications/${encodeURIComponent(eventId)}/questions/${questionId}`;
  const current = useCallback(() => owner.current === visit && visit.mounted && session.sameRevision()
    && (!hostCurrent || hostCurrent()), [visit, session, hostCurrent]);
  const refresh = useCallback(async () => {
    if (!current()) return;
    setBusy(true); setNotice(null);
    try {
      const response = await apiRequest('GET', `${base}/editor-source`);
      if (!response.ok) await assertApiResponseOk(response);
      const value = readResponseEditor(await response.json(), eventId, questionId);
      if (!current()) return;
      if (!value) throw new Error('The server did not identify this question’s saved editor response. Refresh before continuing.');
      setRead(value); setSelected(previous => value.copies.some(copy => copy.sectionId === previous) ? previous : value.copies[0]?.sectionId ?? '');
      setHeld(false);
      // Refresh the register's separate current-question read as well. This does
      // not change any retained import origin or make an old working copy ready.
      if (value.currentRevision !== latest.current.responseRevision) latest.current.onSaved();
    } catch (error) { if (current()) { setRead(null); setNotice(said(error)); } }
    finally { if (current()) setBusy(false); }
  }, [base, eventId, questionId, current, setBusy, setNotice, setRead, setSelected, setHeld]);
  useEffect(() => {
    visit.mounted = true;
    setRead(null); setSelected(''); setReason(''); setHeld(false); setBusy(false); onBusy(false);
    void refresh();
    return () => { visit.mounted = false; };
  }, [visit, refresh, onBusy, setRead, setSelected, setReason, setHeld, setBusy]);
  const copy = read?.copies.find(value => value.sectionId === selected);
  const stale = read !== null && read.currentRevision !== responseRevision;
  const canSave = !!read && !!copy?.ready && !stale && !held && !busy && current() && reason.trim().length >= GOVERNED_REASON_MIN;
  const save = async () => {
    if (!current() || !canSave || !read || !copy) return;
    setBusy(true); onBusy(true); setNotice(null);
    try {
      const response = await apiRequest('PUT', `${base}/response`, { expectedRevision: read.currentRevision, reason,
        editorSource: { documentId: copy.documentId, sectionId: copy.sectionId, expectedSha256: copy.sha256, expectedUpdatedAt: copy.updatedAt } });
      if (!response.ok) await assertApiResponseOk(response);
      if (!current()) return;
      fire(`Response to ${questionRef} saved from the document editor, with an audit entry.`);
      setHeld(true); setNotice('The registered response changed. For another amendment, preview the current response and create or reopen its current editor copy. Earlier working copies are retained.');
      onSaved();
    } catch (error) {
      if (!current()) return;
      setHeld(true); setNotice(saveFailure(error));
      fire(`Response to ${questionRef} was not confirmed: ${said(error)}`, 'error');
    } finally { if (current()) { setBusy(false); onBusy(false); } }
  };
  return { read, selected, select: setSelected, reason, setReason, busy, notice, stale, copy, canSave, save, refresh,
    current, scope };
}
