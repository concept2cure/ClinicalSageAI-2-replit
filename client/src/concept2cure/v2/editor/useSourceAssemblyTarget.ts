import { useEffect, useReducer, useRef } from 'react';
import { apiRequest, redactInternals } from '@/lib/queryClient';
import { authService } from '@/services/portal/authService';
import { capturedActorHeaders } from '@/utils/authToken';
import { NOTICE_UUID } from '@shared/types/notification-navigation';
import { readAssemblySourceSelectors, type AssemblySourceSelector } from '@shared/authoring/assembly-sources';
import { setEditorTarget } from '../editorTarget';
import { ceremonyOpen } from '../ceremony';
import { captureShellProjectGuard, shellProgramId, useShellProject } from '../shellProject';
import { taskActorScope } from '../taskTarget';
import { captureAuthoringSession, useAuthoringReadSession } from './authoringCurrentRead';
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
interface WorkingDocument { id: string; title: string; program_id: string; status: string; locked_at?: unknown; readScope: 'document' | 'sections' }
export const SOURCE_ASSEMBLY_CONTEXT_CHANGED = 'The project, selected sources or signed-in account changed. Close this dialog and select the sources again.';
const READ_FAILED = 'The working documents could not be verified for this project. Retry the document list.';
const CEREMONY = 'Finish or cancel the open governed form, then open this build.';
type LiveProps = { current: SourceAssemblyDialogProps };

/** The source owner outlives intentional Close; only reads require a mounted UI. */
export function captureSourceAssemblyOwner(latest: { current: Pick<SourceAssemblyDialogProps, 'programId' | 'sources' | 'isCurrent'> }) {
  const { programId } = latest.current;
  const sources = readAssemblySourceSelectors(latest.current.sources);
  const snapshot = JSON.stringify(sources);
  const session = captureAuthoringSession();
  const project = captureShellProjectGuard();
  const actor = taskActorScope(authService.getUser());
  let retired = false;
  const headers = () => {
    if (!actor) throw new Error(SOURCE_ASSEMBLY_CONTEXT_CHANGED);
    const captured = capturedActorHeaders({ userId: Number(actor.userId), organizationId: Number(actor.organizationId) });
    if (!authService.captureSessionReadGuard(captured.Authorization.slice('Bearer '.length)).current()) throw new Error(SOURCE_ASSEMBLY_CONTEXT_CHANGED);
    return captured;
  };
  const current = () => {
    if (retired) return false;
    try {
      if (!sources || !session.sameRevision() || !project() || shellProgramId() !== programId
        || latest.current.programId !== programId || latest.current.isCurrent?.() === false
        || JSON.stringify(readAssemblySourceSelectors(latest.current.sources)) !== snapshot) throw new Error(SOURCE_ASSEMBLY_CONTEXT_CHANGED);
      headers(); return true;
    } catch { retired = true; return false; }
  };
  return { programId, sources: sources ?? [], current, headers };
}
type SourceOwner = ReturnType<typeof captureSourceAssemblyOwner>;
function workingDocument(value: unknown, programId: string): value is WorkingDocument {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === 'string' && NOTICE_UUID.test(row.id) && typeof row.title === 'string' && !!row.title.trim()
    && row.program_id === programId && typeof row.status === 'string' && !!row.status.trim()
    && (row.readScope === 'document' || row.readScope === 'sections');
}
async function readDocuments(owner: SourceOwner, current: () => boolean): Promise<WorkingDocument[]> {
  if (!current()) throw new Error(SOURCE_ASSEMBLY_CONTEXT_CHANGED);
  const headers = owner.headers();
  if (!current()) throw new Error(SOURCE_ASSEMBLY_CONTEXT_CHANGED);
  const response = await apiRequest('GET', `/api/authoring/docs?status=all&programId=${encodeURIComponent(owner.programId)}`, undefined, headers);
  if (!current()) throw new Error(SOURCE_ASSEMBLY_CONTEXT_CHANGED);
  const body = await response.json();
  if (!current()) throw new Error(SOURCE_ASSEMBLY_CONTEXT_CHANGED);
  const rows: unknown = body?.documents;
  if (!response.ok || body?.success !== true || !Array.isArray(rows) || !rows.every(row => workingDocument(row, owner.programId))
    || new Set(rows.map(row => row.id.toLowerCase())).size !== rows.length) throw new Error(READ_FAILED);
  return (rows as WorkingDocument[]).filter(row => row.readScope === 'document' && !isSealedStatus(row.status) && row.locked_at == null);
}
interface ChooserState { documents: WorkingDocument[]; loading: boolean; error: string | null; selected: string; opening: boolean }
interface ChooserRuntime {
  owner: SourceOwner; latest: LiveProps; current: () => boolean;
  state: { current: ChooserState }; lane: { current: object | null };
  handoff: { current: { closing: boolean; sent: boolean } };
  update: (patch: Partial<ChooserState>) => void;
}
function targetActions(runtime: ChooserRuntime) {
  const { owner, latest, current, state, lane, handoff, update } = runtime;
  const admit = () => {
    if (current() && !handoff.current.closing && !handoff.current.sent) return true;
    update({}); return false;
  };
  const error = (failure: unknown) => update({ error: redactInternals(failure instanceof Error ? failure.message : '', READ_FAILED) });
  const deliver = (docId: string | null) => {
    if (!admit()) return;
    handoff.current.closing = true;
    try {
      latest.current.onClose();
      if (!owner.current()) { update({}); return; }
      if (ceremonyOpen()) { update({ error: CEREMONY }); return; }
      const selectedSources = { version: 1 as const, sources: owner.sources };
      handoff.current.sent = true;
      setEditorTarget({ docType: null, docId, programId: owner.programId,
        ...(docId ? { assemblySources: selectedSources } : { sourceDocumentStart: selectedSources }) }, owner.current);
      if (owner.current() && !ceremonyOpen()) latest.current.onNav?.('document-authoring');
    } catch (failure) { error(failure); }
    finally { handoff.current.closing = false; }
  };
  const reload = async () => {
    if (!admit() || lane.current) return;
    const attempt = {}; lane.current = attempt;
    update({ loading: true, error: null });
    try {
      const rows = await readDocuments(owner, current);
      if (!current() || lane.current !== attempt) return;
      update({ documents: rows, selected: rows.some(row => row.id === state.current.selected) ? state.current.selected : '' });
    } catch (failure) { if (current()) { update({ documents: [], selected: '' }); error(failure); } }
    finally { if (lane.current === attempt) { lane.current = null; update({ loading: false }); } }
  };
  const choose = (id: string) => {
    if (!admit() || lane.current || (id !== '' && !state.current.documents.some(row => row.id === id))) return;
    update({ selected: id, error: null });
  };
  const open = async () => {
    if (!admit() || lane.current || !state.current.documents.some(row => row.id === state.current.selected)) return;
    if (ceremonyOpen()) { update({ error: CEREMONY }); return; }
    const target = state.current.selected; const attempt = {}; lane.current = attempt;
    update({ opening: true, error: null });
    try {
      const fresh = await readDocuments(owner, current);
      if (!current() || lane.current !== attempt || state.current.selected !== target) return;
      if (ceremonyOpen()) { update({ error: CEREMONY }); return; }
      if (!fresh.some(row => row.id === target)) {
        update({ documents: fresh, selected: '', error: 'That working document is no longer available. Choose a current working document.' }); return;
      }
      deliver(target);
    } catch (failure) { if (current()) error(failure); }
    finally { if (lane.current === attempt) { lane.current = null; update({ opening: false }); } }
  };
  const startDocument = () => {
    if (!admit() || state.current.opening) return;
    if (ceremonyOpen()) { update({ error: 'Finish or cancel the open governed form, then start a document.' }); return; }
    deliver(null);
  };
  return { choose, open, reload, startDocument, close: () => latest.current.onClose() };
}

/** Scoped reads and the deliberate handoff share the original source owner. */
export function useSourceAssemblyTarget(props: SourceAssemblyDialogProps) {
  useShellProject();
  useAuthoringReadSession(authService.getUser());
  const [, redraw] = useReducer((value: number) => value + 1, 0);
  const alive = useRef(true);
  const latest = useRef(props); latest.current = props;
  const owner = useRef<SourceOwner | null>(null);
  owner.current ??= captureSourceAssemblyOwner(latest);
  const captured = owner.current;
  const current = () => alive.current && captured.current();
  const state = useRef<ChooserState>({ documents: [], loading: true, error: null, selected: '', opening: false });
  const lane = useRef<object | null>(null);
  const handoff = useRef({ closing: false, sent: false });
  const update = (patch: Partial<ChooserState>) => {
    if (alive.current) { state.current = { ...state.current, ...patch }; redraw(); }
  };
  const actions = targetActions({ owner: captured, latest, current, state, lane, handoff, update });
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; lane.current = null; };
  }, []);
  const reloadRef = useRef(actions.reload); reloadRef.current = actions.reload;
  useEffect(() => { void reloadRef.current(); }, []);
  const valid = current();
  const visible = state.current;
  return { ...actions, documents: valid ? visible.documents : [], selected: valid ? visible.selected : '',
    loading: valid && visible.loading, opening: valid && visible.opening,
    error: valid ? visible.error : SOURCE_ASSEMBLY_CONTEXT_CHANGED, invalid: !valid };
}
