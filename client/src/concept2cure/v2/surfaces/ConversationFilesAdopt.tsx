/** The caller's conversation captures use the canonical audited adoption path.
 * A lost acknowledgement keeps addition paused until current scoped readback. */
import React, { useState } from 'react';
import { useLiveData } from '../dataConnect';
import { apiRequest, redactInternals, serverMessage } from '@/lib/queryClient';
import { isApiRequestError } from '../apiCall';
import { authService, useAuthUser } from '@/services/portal/authService';

interface ConversationFile { id: string; name: string | null; mimeType: string | null; fileSize: number | null; uploadedAt: string | null }
interface ConversationFilesRead { projectId: string; files: ConversationFile[]; window?: { shown: number; truncated: boolean } }
type Note = { tone: 'ok' | 'error'; text: string } | null;
type Pending = Record<string, { sourceId: number | null }>;
type AdoptionResult = { state: 'confirmed' | 'refused' | 'unconfirmed'; note: NonNullable<Note>; sourceId: number | null };
interface Props { pid: string; onAdopted: () => void }
const label = (file: ConversationFile) => file.name || 'The file';
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const storageKey = (scope: string) => `c2c:unconfirmed-adoptions:${scope}`;
function pendingFromStorage(scope: string): Pending {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(storageKey(scope)) ?? '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([id, row]) => id && row && typeof row === 'object'
      && ('sourceId' in row) && (row.sourceId === null || positive(row.sourceId))));
  } catch { return {}; }
}
function savePending(scope: string, value: Pending) {
  // Opaque IDs only, scoped to current account, organization and project.
  try { sessionStorage.setItem(storageKey(scope), JSON.stringify(value)); } catch { /* current mounted state still holds the pause */ }
}
function unknownAddition(file: ConversationFile, sourceId: number | null = null): AdoptionResult {
  return { state: 'unconfirmed', sourceId, note: { tone: 'error',
    text: `${label(file)}: the addition could not be confirmed. Check this project’s Data Room before trying again.` } };
}
function adoptionFailure(file: ConversationFile, error: unknown): AdoptionResult {
  if (!isApiRequestError(error) || ![400, 401, 403, 404, 409, 410, 422].includes(error.status)) {
    const sourceId = isApiRequestError(error) && error.payload && typeof error.payload === 'object'
      && 'sourceId' in error.payload && positive(error.payload.sourceId) ? error.payload.sourceId : null;
    return unknownAddition(file, sourceId);
  }
  const message = serverMessage(error.payload) ?? redactInternals(error instanceof Error ? error.message : 'The request was refused.', 'The request was refused.');
  return { state: 'refused', sourceId: null, note: { tone: 'error', text: `${label(file)} was not added — ${message}` } };
}
async function adoptFile(pid: string, file: ConversationFile): Promise<AdoptionResult> {
  try {
    const response = await apiRequest('POST', `/api/c2c/projects/${pid}/adopt`, { fileUploadId: file.id });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) throw Object.assign(new Error(serverMessage(body) ?? 'The request was refused.'), { name: 'ApiRequestError', status: response.status, payload: body });
    if (!body || typeof body !== 'object' || !('adopted' in body) || typeof body.adopted !== 'boolean'
      || !('sourceId' in body) || !positive(body.sourceId)) return unknownAddition(file);
    return { state: 'confirmed', sourceId: body.sourceId, note: { tone: 'ok', text: body.adopted
      ? `${label(file)} is now in this project's Data Room. The addition is recorded.`
      : `${label(file)} is already in this project's Data Room.` } };
  } catch (error) { return adoptionFailure(file, error); }
}
async function readCapturedSource(pid: string, fileId: string, pending: Pending[string]): Promise<boolean> {
  const response = await apiRequest('GET', `/api/c2c/projects/${pid}/sources?limit=200`);
  if (!response.ok) return false;
  const body: unknown = await response.json();
  if (!body || typeof body !== 'object' || !('projectId' in body) || body.projectId !== pid
    || !('sources' in body) || !Array.isArray(body.sources)) return false;
  // A filtered or truncated list cannot establish absence. Only exact present
  // capture identity resolves this pause; no read result automatically reissues.
  return body.sources.some(row => row && typeof row === 'object' && positive(row.id) && row.fileUploadId === fileId
    && (pending.sourceId === null || row.id === pending.sourceId));
}

export function ConversationFilesAdopt(props: Props) {
  const user = useAuthUser();
  const scope = `${user?.organizationId ?? ''}:${user?.id ?? ''}:${props.pid}`;
  return <ConversationFilesAdoptScope key={scope} {...props} scope={scope} />;
}

function ConversationFilesAdoptScope({ pid, onAdopted, scope }: Props & { scope: string }) {
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<Note>(null);
  const [pending, setPending] = useState<Pending>(() => pendingFromStorage(scope));
  const alive = React.useRef(true);
  React.useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const state = useLiveData<ConversationFilesRead>(`/api/c2c/projects/${pid}/conversation-files`, [scope, reload]);
  const updatePending = (value: Pending) => { savePending(scope, value); setPending(value); };
  const confirmed = () => { setReload(value => value + 1); onAdopted(); };
  const adopt = async (file: ConversationFile) => {
    if (busy || pending[file.id]) return;
    setBusy(file.id); setNote(null);
    updatePending({ ...pending, [file.id]: { sourceId: null } });
    const revision = authService.captureSessionReadGuard();
    const result = await adoptFile(pid, file);
    if (!alive.current || !revision.sameRevision()) { if (alive.current) setBusy(null); return; }
    const next = { ...pending };
    if (result.state === 'unconfirmed') next[file.id] = { sourceId: result.sourceId };
    else delete next[file.id];
    updatePending(next); setNote(result.note); setBusy(null);
    if (result.state === 'confirmed') confirmed();
  };
  const check = async (file: ConversationFile) => {
    if (busy || !pending[file.id]) return;
    setBusy(file.id);
    const revision = authService.captureSessionReadGuard();
    let found = false;
    try { found = await readCapturedSource(pid, file.id, pending[file.id]); } catch { /* an unavailable read establishes no capture outcome */ }
    if (!alive.current || !revision.sameRevision()) { if (alive.current) setBusy(null); return; }
    setBusy(null);
    if (!found) { setNote({ tone: 'error', text: 'This read did not confirm the capture. The addition remains paused; review the Data Room before trying again.' }); return; }
    const next = { ...pending }; delete next[file.id]; updatePending(next);
    setNote({ tone: 'ok', text: `${label(file)} is recorded in this project's Data Room.` }); confirmed();
  };
  return <ConversationAdoptionView state={state} busy={busy} pending={pending} note={note} onAdd={adopt} onCheck={check} />;
}

function ConversationAdoptionView({ state, busy, pending, note, onAdd, onCheck }: {
  state: ReturnType<typeof useLiveData<ConversationFilesRead>>; busy: string | null; pending: Pending; note: Note;
  onAdd: (file: ConversationFile) => Promise<void>; onCheck: (file: ConversationFile) => Promise<void>;
}) {
  if (state.loading) return null;
  if (state.error && !Object.keys(pending).length) return <div className="scaf-note" role="status">Your conversation files could not be read, so none are offered here.</div>;
  const offered = state.error ? [] : state.data?.files ?? [];
  // A capture may have committed and disappeared from the unbound-file list.
  // Preserve its scoped pending identity so current readback remains available.
  const files = [...offered, ...Object.keys(pending).filter(id => !offered.some(file => file.id === id))
    .map(id => ({ id, name: null, mimeType: null, fileSize: null, uploadedAt: null }))];
  if (!files.length && !note) return null;
  return <div style={{ marginTop: 12 }} data-conversation-files>
    <div className="pj-sec-h"><h3>From your conversations</h3></div>
    <div className="scaf-note">Files you attached in chat with no project open. Adding one makes it a source of this project.</div>
    <div className="pj-srcs">{files.map(file => <div key={file.id} className="pj-src">
      <span className="sec-sub" style={{ fontSize: 11.5 }}>{label(file)}</span>
      <button className="btn ghost" style={{ fontSize: 12, padding: '4px 12px' }} disabled={busy !== null || Boolean(pending[file.id])} onClick={() => { void onAdd(file); }}>
        {busy === file.id ? 'Adding…' : 'Add to this project'}
      </button>
      {pending[file.id] && <button className="btn ghost" disabled={busy !== null} onClick={() => { void onCheck(file); }}>Check Data Room</button>}
    </div>)}</div>
    {state.data?.window?.truncated && <div className="scaf-note">Showing your most recent {files.length}.</div>}
    {note && <div role={note.tone === 'error' ? 'alert' : 'status'} className={note.tone === 'error' ? 'sp-tone-warn' : 'sp-tone-ok'}>{note.text}</div>}
  </div>;
}
