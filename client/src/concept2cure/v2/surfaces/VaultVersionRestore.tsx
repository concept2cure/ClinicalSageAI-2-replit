/**
 * Restore an earlier version as the next version (MR-08 Stage 5).
 *
 * A version is never rewritten. Restoring version 1 after version 2 adds
 * version 3, holding version 1's exact bytes, through the one ingest, with a
 * written reason recorded in its history
 * (server/services/vault/vault-version-restore.ts). The new version has not
 * been reviewed: an approval never travels with bytes. Offered on an earlier
 * version, to the roles the route admits. Nothing reads as restored until the
 * server says so, and a refusal is the server's own words.
 */
import React, { useState } from 'react';
import { GOVERNED_REASON_MIN } from '@shared/constants/governed-reason';
import { ApiRequestError, apiRequest, redactInternals, serverMessage } from '@/lib/queryClient';
import { useVaultCanWrite } from './VaultViewOnly';

const NOT_RESTORED = 'Nothing was restored.';
const UNKNOWN_OUTCOME =
  'The connection dropped, so it is not known whether the version was restored. Reload the versions and check before trying again.';

/** POST the restore; the new version's number, or an error carrying what the person should read. */
export async function postRestore(projectId: string, documentId: string, versionId: string, reason: string): Promise<{ version: string }> {
  let res: Response;
  try {
    res = await apiRequest('POST',
      `/api/c2c/project-vault/${encodeURIComponent(projectId)}/documents/${encodeURIComponent(documentId)}/versions/${encodeURIComponent(versionId)}/restore`,
      { reason });
  } catch (e) {
    // apiRequest throws on every refusal but a 401; only a thrown non-API error is a dropped connection.
    if (e instanceof ApiRequestError) {
      throw new Error(`${NOT_RESTORED} ${redactInternals(serverMessage(e.payload), e.message)}`, { cause: e });
    }
    throw new Error(UNKNOWN_OUTCOME, { cause: e });
  }
  const json = (await res.json().catch(() => null)) as { data?: { document?: { version?: unknown } } } | null;
  if (!res.ok) throw new Error(`${NOT_RESTORED} ${redactInternals(serverMessage(json), `The Vault refused it (HTTP ${res.status}).`)}`);
  const version = json?.data?.document?.version;
  if (typeof version !== 'string') throw new Error(UNKNOWN_OUTCOME);
  return { version };
}

export function RestoreVersionButton({ projectId, documentId, versionId, versionLabel, onRestored }: {
  projectId: string;
  /** Any version of the document; the server finds its current one. */
  documentId: string;
  versionId: string;
  /** "v1.0", as the row shows it. */
  versionLabel: string;
  onRestored?: () => void;
}) {
  const canWrite = useVaultCanWrite();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  if (!canWrite) return null;
  const short = reason.trim().length < GOVERNED_REASON_MIN;
  const restore = async () => {
    setBusy(true);
    setNote(null);
    try {
      const { version } = await postRestore(projectId, documentId, versionId, reason.trim());
      setNote({ tone: 'ok', text: `${versionLabel} was restored as v${version}. It has not been reviewed yet. Your reason is in its history.` });
      setOpen(false);
      setReason('');
      onRestored?.();
    } catch (e) {
      setNote({ tone: 'error', text: e instanceof Error ? e.message : UNKNOWN_OUTCOME });
    } finally {
      setBusy(false);
    }
  };
  const result = note ? (
    <div className={note.tone === 'error' ? 'vd-dr-err' : 'vd-d-idx'} role={note.tone === 'error' ? 'alert' : 'status'}>{note.text}</div>
  ) : null;
  if (!open) {
    return (
      <>
        <button className="sp-ask" onClick={() => setOpen(true)} disabled={busy}>Restore {versionLabel} as a new version</button>
        {result}
      </>
    );
  }
  return (
    <div className="vd-confirm-form" data-testid={`vault-version-restore-${versionId}`}>
      <label className="vd-dr-meta" htmlFor={`restore-reason-${versionId}`}>
        Reason for restoring {versionLabel}. Its file becomes the next version, and the reason is recorded in its history.
      </label>
      <textarea
        id={`restore-reason-${versionId}`}
        className="vd-d-filing-reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder={`At least ${GOVERNED_REASON_MIN} characters`}
        rows={2}
        disabled={busy}
      />
      <div className="vd-confirm-acts">
        <button className="sp-ask" disabled={busy || short} onClick={() => void restore()}>
          {busy ? 'Restoring…' : `Restore ${versionLabel}`}
        </button>
        <button className="vd-dr-toggle" onClick={() => setOpen(false)} disabled={busy}>Cancel</button>
      </div>
      {result}
    </div>
  );
}
