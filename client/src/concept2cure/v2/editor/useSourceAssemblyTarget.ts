import { useEffect, useReducer, useRef, useState } from 'react';
import { apiRequest, redactInternals } from '@/lib/queryClient';
import { authService } from '@/services/portal/authService';
import { NOTICE_UUID } from '@shared/types/notification-navigation';
import type { AssemblySourceSelector } from '@shared/authoring/assembly-sources';
import { setEditorTarget } from '../editorTarget';
import { ceremonyOpen } from '../ceremony';
import { useShellProject } from '../shellProject';
import { captureEditorDraftGuard } from './authoringDraftTransport';
import { isSealedStatus } from './DownloadMenu';

export interface SourceAssemblyDialogProps {
  programId: string;
  sources: AssemblySourceSelector[];
  titles?: string[];
  onClose: () => void;
  /** Omit inside the editor: its existing target listener guards navigation. */
  onNav?: (surfaceId: string) => void;
  isCurrent?: () => boolean;
}
interface WorkingDocument { id: string; title: string; program_id: string; status: string; locked_at?: unknown; readScope?: unknown }
const CONTEXT_CHANGED = 'The project, selected sources or signed-in account changed. Close this dialog and select the sources again.';
async function readDocuments(programId: string, current: () => boolean): Promise<WorkingDocument[]> {
  if (!current()) throw new Error(CONTEXT_CHANGED);
  const response = await apiRequest('GET', `/api/authoring/docs?status=all&programId=${encodeURIComponent(programId)}`);
  if (!current()) throw new Error(CONTEXT_CHANGED);
  const body = await response.json();
  if (!current()) throw new Error(CONTEXT_CHANGED);
  const rows: unknown = body?.documents;
  if (!response.ok || body?.success !== true || !Array.isArray(rows) || !rows.every(row => row && typeof row === 'object'
    && typeof row.id === 'string' && NOTICE_UUID.test(row.id) && typeof row.title === 'string'
    && row.program_id === programId && typeof row.status === 'string')
    || new Set(rows.map(row => row.id)).size !== rows.length) throw new Error('The working documents could not be verified for this project. Retry the document list.');
  return (rows as WorkingDocument[]).filter(row => row.readScope !== 'sections' && !isSealedStatus(row.status) && row.locked_at == null);
}

/** A read-only chooser; fresh scope and membership are checked before handoff. */
export function useSourceAssemblyTarget(props: SourceAssemblyDialogProps) {
  useShellProject();
  const [, redraw] = useReducer((value: number) => value + 1, 0);
  const alive = useRef(true);
  const origin = useRef<(() => boolean) | null>(null);
  origin.current ??= captureEditorDraftGuard({ programId: props.programId, isCurrent: () => alive.current && props.isCurrent?.() !== false });
  const current = () => alive.current && origin.current?.() === true;
  const [documents, setDocuments] = useState<WorkingDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState('');
  const selection = useRef({ id: '' });
  const [opening, setOpening] = useState(false);
  const lane = useRef<object | null>(null);
  useEffect(() => {
    alive.current = true;
    const stops = typeof authService.on === 'function'
      ? (['login', 'logout', 'session_expired', 'user_updated'] as const).map(event => authService.on(event, redraw)) : [];
    return () => { alive.current = false; lane.current = null; stops.forEach(stop => stop()); };
  }, []);
  const load = async () => {
    if (!current() || lane.current) return;
    const token = {}; lane.current = token;
    setLoading(true); setError(null);
    try {
      const rows = await readDocuments(props.programId, current);
      if (!current() || lane.current !== token) return;
      setDocuments(rows);
      if (!rows.some(row => row.id === selection.current.id)) { selection.current = { id: '' }; setSelected(''); }
    } catch (failure) {
      if (current()) { setDocuments([]); setError(redactInternals(failure instanceof Error ? failure.message : '', 'The working documents could not be read. Retry the document list.')); }
    } finally { if (alive.current && lane.current === token) { lane.current = null; setLoading(false); } }
  };
  const loadRef = useRef(load); loadRef.current = load;
  useEffect(() => { void loadRef.current(); }, []);
  const choose = (id: string) => { selection.current = { id }; setSelected(id); setError(null); };
  const mayOpen = () => current() && !lane.current && documents.some(row => row.id === selected);
  const open = async () => {
    if (!mayOpen()) return;
    if (ceremonyOpen()) { setError('Finish or cancel the open governed form, then open this build.'); return; }
    const target = selection.current; const token = {}; lane.current = token;
    setOpening(true); setError(null);
    try {
      const fresh = await readDocuments(props.programId, current);
      if (!current() || lane.current !== token || selection.current !== target) return;
      if (ceremonyOpen()) { setError('Finish or cancel the open governed form, then open this build.'); return; }
      if (!fresh.some(row => row.id === target.id)) { setDocuments(fresh); setError('That working document is no longer available. Choose a current working document.'); return; }
      props.onClose();
      setEditorTarget({ docType: null, docId: target.id, programId: props.programId,
        assemblySources: { version: 1, sources: props.sources } });
      props.onNav?.('document-authoring');
    } catch (failure) {
      if (current()) setError(redactInternals(failure instanceof Error ? failure.message : '', 'The working document could not be checked. Retry before opening it.'));
    } finally { if (alive.current && lane.current === token) { lane.current = null; setOpening(false); } }
  };
  return { documents, loading, error: current() ? error : CONTEXT_CHANGED, selected, opening,
    invalid: !current(), choose, open, reload: load };
}
