/**
 * New folder and Rename folder, in a project's Vault (S6, the founder,
 * 2026-11-06: "files, folders … just like Veeva").
 *
 * POSTs to /api/c2c/project-vault/:id/folders and …/folders/:folderId/rename.
 * The server checks the role and the project's write authority, refuses a
 * duplicate name beside it, and records who, when and the reason given in the
 * audit trail, with the change. A refusal leaves the tree as it was and says
 * why; the folder is claimed only once the response says it was recorded.
 */
import React, { useState } from 'react';
import { GOVERNED_REASON_MIN } from '@shared/constants/governed-reason';
import { apiRequest, redactInternals, serverMessage } from '@/lib/queryClient';
import { indentedLabel, type CabinetFolderOption } from './vaultFolders';

export type FolderEditMode =
  | { kind: 'create'; parentId: string }
  | { kind: 'rename'; folderId: string; name: string };

interface Props {
  projectId: string;
  mode: FolderEditMode;
  /** The cabinet's folders, for "In". */
  folders: CabinetFolderOption[];
  /** Called with the folder's id ('uf:12') once the server recorded it. */
  onDone: (folderId: string) => void;
  onCancel: () => void;
}

export function VaultFolderEdit({ projectId, mode, folders, onDone, onCancel }: Props) {
  const creating = mode.kind === 'create';
  const [name, setName] = useState(creating ? '' : mode.name);
  const [parentId, setParentId] = useState(creating ? mode.parentId : '');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = name.trim();
  const canSave = !saving && trimmed.length > 0 && reason.trim().length >= GOVERNED_REASON_MIN
    && (creating || trimmed !== mode.name);

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    const base = `/api/c2c/project-vault/${encodeURIComponent(projectId)}/folders`;
    try {
      const res = creating
        ? await apiRequest('POST', base, { name: trimmed, parentFolderId: parentId || null, reason: reason.trim() })
        : await apiRequest('POST', `${base}/${encodeURIComponent(mode.folderId)}/rename`, { name: trimmed, reason: reason.trim() });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.folder?.folderId) {
        setError(`${creating ? 'The folder was not made' : 'The folder was not renamed'} — ${serverMessage(body) ?? `the Vault refused it (HTTP ${res.status})`}`);
        return;
      }
      onDone(String(body.folder.folderId));
    } catch (e) {
      setError(redactInternals(e instanceof Error ? e.message : String(e), creating ? 'The folder was not made.' : 'The folder was not renamed.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="vd-d-filing" aria-label={creating ? 'New folder' : 'Rename folder'} data-testid="vault-folder-edit">
      <div className="vd-d-seclbl">{creating ? 'New folder' : 'Rename folder'}</div>
      <label className="vd-d-filing-row">
        <span className="k">Name</span>
        <input className="vd-d-filing-reason" value={name} maxLength={120} disabled={saving} autoFocus
          onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void save(); }}
          data-testid="vault-folder-name" />
      </label>
      {creating ? (
        <label className="vd-d-filing-row">
          <span className="k">In</span>
          <select className="vd-d-move-sel" value={parentId} disabled={saving}
            onChange={(e) => setParentId(e.target.value)} data-testid="vault-folder-parent">
            <option value="">Top of the cabinet</option>
            {folders.map((f) => <option key={f.id} value={f.id}>{indentedLabel(f)}</option>)}
          </select>
        </label>
      ) : null}
      <label className="vd-d-filing-row">
        <span className="k">Reason</span>
        <textarea className="vd-d-filing-reason" value={reason} rows={2} disabled={saving}
          placeholder={`Required, at least ${GOVERNED_REASON_MIN} characters. Recorded in the audit trail with who and when.`}
          onChange={(e) => setReason(e.target.value)} data-testid="vault-folder-reason" />
      </label>
      <div className="vd-d-filing-acts">
        <button type="button" className="sp-primary" disabled={!canSave} onClick={() => void save()} data-testid="vault-folder-save">
          {saving ? 'Saving…' : creating ? 'Make folder' : 'Rename'}
        </button>
        <button type="button" className="sp-ask" disabled={saving} onClick={onCancel}>Cancel</button>
      </div>
      {error ? <div className="vd-dr-err" role="alert" data-testid="vault-folder-error">{error}</div> : null}
    </section>
  );
}
