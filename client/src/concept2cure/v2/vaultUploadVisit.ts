/** Local upload lifetime; account/session identity stays with the canonical auth owner. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { authService } from '@/services/portal/authService';
import { getAuthHeaders, getAuthToken } from '@/utils/authToken';
import { useAuthoringReadSession } from './editor/authoringCurrentRead';
import type { VaultUploadState } from './useVaultUpload';

export function useVaultUploadVisit(programId: string | null | undefined, visitKey?: string) {
  const session = useAuthoringReadSession(authService.getUser());
  const mint = () => ({ programId, visitKey, session, active: true, retired: false, headers: getAuthHeaders() });
  const ref = useRef(mint());
  if (ref.current.programId !== programId || ref.current.visitKey !== visitKey || ref.current.session !== session) {
    ref.current.retired = true;
    ref.current = mint();
  }
  const visit = ref.current;
  useEffect(() => {
    visit.active = true;
    return () => { visit.active = false; };
  }, [visit]);
  const batch = useRef<{ visit: typeof visit; ticket: symbol } | null>(null);
  const [state, setState] = useState<{ visit: typeof visit; uploading: boolean; note: VaultUploadState['note'] }>({ visit, uploading: false, note: null });
  const owner = useMemo(() => {
    const current = () => {
      const headers = getAuthHeaders(), bearer = getAuthToken();
      const valid = ref.current === visit && session.sameRevision()
        && headers['x-organization-id'] === visit.headers['x-organization-id']
        && (authService.getUser()
          ? Boolean(bearer && authService.captureSessionReadGuard(bearer).current())
          : headers.Authorization === visit.headers.Authorization);
      if (!valid) visit.retired = true;
      return visit.active && !visit.retired;
    };
    const setNote = (note: VaultUploadState['note']) => {
      if (current()) setState(previous => ({ visit, note, uploading: previous.visit === visit && previous.uploading }));
    };
    const begin = () => {
      if (!current() || batch.current?.visit === visit) return null;
      const ticket = Symbol('vault upload');
      batch.current = { visit, ticket };
      setState({ visit, uploading: true, note: null });
      return {
        current: () => current() && batch.current?.ticket === ticket,
        finish: () => {
          if (batch.current?.ticket !== ticket) return;
          batch.current = null;
          setState(previous => previous.visit === visit ? { ...previous, uploading: false,
            note: current() ? previous.note : null } : previous);
        },
      };
    };
    return { current, begin, setNote, clearNote: () => setNote(null) };
  }, [visit, session]);
  const visible = state.visit === visit && owner.current();
  return { owner, uploading: visible && state.uploading, note: visible ? state.note : null };
}
