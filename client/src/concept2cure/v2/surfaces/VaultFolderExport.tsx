/**
 * Export a Vault folder (MR-08 Stage 6 step 3).
 *
 * A regulatory team hands a folder over: Module 3 to a CMC consultant, the
 * clinical folder to a partner's diligence team. "Export" downloads the
 * current version of every document the folder shows, each verified by the
 * server against its recorded SHA-256, with an index, SHA256SUMS and their
 * audit trail (GET …/folders/:folderId/export). The archive is saved only when
 * it hashes to what the server recorded before sending it. One file that fails
 * its hash refuses the whole export, in the server's words. Anyone the project
 * admits may export, as they may download each file.
 */
import React, { useState } from 'react';
import { ApiRequestError, apiRequest, redactInternals, serverMessage } from '@/lib/queryClient';
import { I } from '../icons';
import { saveVerifiedArchive, type ArchiveOutcome } from './vaultArchiveDownload';

const EXPORT_FAILED = 'The folder was not exported.';

/** The taxonomy folder a cabinet folder of the tree stands for, or null for one that is not a filing folder. */
export function exportableFolderId(treeFolderId: string | null | undefined): string | null {
  if (!treeFolderId || !treeFolderId.startsWith('cab-')) return null;
  const id = treeFolderId.slice(4);
  return id && id !== 'unfiled' && id !== 'other-view' ? id : null;
}

export async function downloadFolderExport(projectId: string, folderId: string): Promise<ArchiveOutcome> {
  let res: Response;
  try {
    res = await apiRequest('GET', `/api/c2c/project-vault/${encodeURIComponent(projectId)}/folders/${encodeURIComponent(folderId)}/export`);
  } catch (e) {
    return { text: redactInternals(e instanceof ApiRequestError ? serverMessage(e.payload) : null, `${EXPORT_FAILED} Nothing was saved.`), saved: false };
  }
  if (!res.ok) {
    const json = await res.json().catch(() => null);
    return { text: redactInternals(serverMessage(json), `${EXPORT_FAILED} (HTTP ${res.status})`), saved: false };
  }
  return saveVerifiedArchive(res, {
    failed: EXPORT_FAILED,
    noun: 'Folder export',
    fallbackName: `vault-${folderId}-export.zip`,
    withheld: (n) => (n === 1
      ? '1 document’s original file was withdrawn under a data disposition and is not in it; the index lists it.'
      : `${n} documents’ original files were withdrawn under a data disposition and are not in it; the index lists them.`),
  });
}

export function FolderExportButton({ projectId, treeFolderId, label, documentCount }: {
  projectId: string;
  /** The tree's folder id, `cab-<folder>`. */
  treeFolderId: string;
  label: string;
  documentCount: number;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<ArchiveOutcome | null>(null);
  const folderId = exportableFolderId(treeFolderId);
  if (!folderId || documentCount === 0) return null;
  const run = async () => {
    setBusy(true);
    setNote(null);
    try {
      setNote(await downloadFolderExport(projectId, folderId));
    } catch (e) {
      setNote({ text: e instanceof Error && e.message ? `${EXPORT_FAILED} ${e.message}` : EXPORT_FAILED, saved: false });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="vd-confirm-acts" data-testid="vault-folder-export">
      <button className="sp-ask" disabled={busy} onClick={() => void run()}
        aria-label={`Export ${label}: the current version of its ${documentCount} document${documentCount === 1 ? '' : 's'}, verified, with an index and their audit trail`}>
        {I.download} {busy ? 'Exporting…' : `Export ${label}`}
      </button>
      {note ? (
        <span className={note.saved ? 'vd-dr-meta' : 'vd-dr-err'} role={note.saved ? 'status' : 'alert'}>{note.text}</span>
      ) : null}
    </div>
  );
}
