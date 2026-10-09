/**
 * Files from your conversations, offered to the open project (PF-07).
 *
 * A file attached in chat with no project open is kept as a conversation file:
 * it gets no Data Room source, because every governed record belongs to a
 * project (founder decision, 2026-09-26). Nothing offered it to a project
 * afterwards, so it could reach no Data Room at all. This lists the caller's
 * own conversation files (GET /api/c2c/projects/:id/conversation-files) and
 * brings one in through the one audited path, POST /api/c2c/projects/:id/adopt.
 *
 * Honest by state: nothing to offer renders nothing; a failed read says so; a
 * refused adopt says what the server said and changes nothing on screen.
 */
import React, { useState } from 'react';
import { useLiveData } from '../dataConnect';
import { apiRequest } from '@/lib/queryClient';

interface ConversationFile {
  id: string;
  name: string | null;
  mimeType: string | null;
  fileSize: number | null;
  uploadedAt: string | null;
}
interface ConversationFilesRead {
  projectId: string;
  files: ConversationFile[];
  window?: { shown: number; truncated: boolean };
}
type Note = { tone: 'ok' | 'error'; text: string } | null;

const label = (f: ConversationFile) => f.name || 'The file';

async function adoptFile(pid: string, f: ConversationFile): Promise<Note> {
  try {
    const res = await apiRequest('POST', `/api/c2c/projects/${pid}/adopt`, { fileUploadId: f.id });
    const body = (await res.json().catch(() => null)) as { adopted?: boolean } | null;
    return body?.adopted === false
      ? { tone: 'ok', text: `${label(f)} is already in this project's Data Room.` }
      : { tone: 'ok', text: `${label(f)} is now in this project's Data Room. The addition is recorded.` };
  } catch (e) {
    return { tone: 'error', text: `${label(f)} was not added — ${e instanceof Error ? e.message : String(e)}.` };
  }
}

export function ConversationFilesAdopt({ pid, onAdopted }: { pid: string; onAdopted: () => void }) {
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<Note>(null);
  const state = useLiveData<ConversationFilesRead>(`/api/c2c/projects/${pid}/conversation-files`, [pid, reload]);

  if (state.loading) return null;
  if (state.error) {
    return <div className="scaf-note" role="status">Your conversation files could not be read, so none are offered here.</div>;
  }
  const files = state.data?.files ?? [];
  if (files.length === 0 && !note) return null;

  const adopt = async (f: ConversationFile) => {
    setBusy(f.id);
    setNote(null);
    const result = await adoptFile(pid, f);
    setNote(result);
    setBusy(null);
    if (result?.tone === 'ok') {
      setReload((n) => n + 1);
      onAdopted();
    }
  };

  return (
    <div style={{ marginTop: 12 }} data-conversation-files>
      <div className="pj-sec-h"><h3>From your conversations</h3></div>
      <div className="scaf-note">Files you attached in chat with no project open. Adding one makes it a source of this project.</div>
      <div className="pj-srcs">
        {files.map((f) => (
          <div key={f.id} className="pj-src">
            <span className="sec-sub" style={{ fontSize: 11.5 }}>{label(f)}</span>
            <button
              className="btn ghost"
              style={{ fontSize: 12, padding: '4px 12px' }}
              disabled={busy !== null}
              onClick={() => { void adopt(f); }}
            >
              {busy === f.id ? 'Adding…' : 'Add to this project'}
            </button>
          </div>
        ))}
      </div>
      {state.data?.window?.truncated && <div className="scaf-note">Showing your most recent {files.length}.</div>}
      {note && (
        <div role={note.tone === 'error' ? 'alert' : 'status'} className={note.tone === 'error' ? 'sp-tone-warn' : 'sp-tone-ok'}>
          {note.text}
        </div>
      )}
    </div>
  );
}
