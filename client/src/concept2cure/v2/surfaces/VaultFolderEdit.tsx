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
  | { kind: 'rename'; folderId: string; name: string }
  | { kind: 'move'; folderId: string; name: string; parentId: string }
  | { kind: 'remove'; folderId: string; name: string };

const TITLE = { create: 'New folder', rename: 'Rename folder', move: 'Move folder', remove: 'Remove folder' } as const;
const SAVE = { create: 'Make folder', rename: 'Rename', move: 'Move', remove: 'Remove folder' } as const;
const FAILED = { create: 'The folder was not made', rename: 'The folder was not renamed', move: 'The folder was not moved', remove: 'The folder was not removed' } as const;

interface Props {
  projectId: string;
  mode: FolderEditMode;
  /** The cabinet's folders, for "In". */
  folders: CabinetFolderOption[];
  /** Called with the folder's id ('uf:12') once the server recorded it. */
  onDone: (folderId: string) => void;
  onCancel: () => void;
}

/** The one request each act makes; the server holds the rules. */
function sendFolderChange(projectId: string, mode: FolderEditMode, v: { name: string; parentId: string; reason: string }) {
  const base = `/api/c2c/project-vault/${encodeURIComponent(projectId)}/folders`;
  if (mode.kind === 'create') return apiRequest('POST', base, { name: v.name, parentFolderId: v.parentId || null, reason: v.reason });
  const body = mode.kind === 'rename' ? { name: v.name } : mode.kind === 'move' ? { parentFolderId: v.parentId || null } : {};
  return apiRequest('POST', `${base}/${encodeURIComponent(mode.folderId)}/${mode.kind}`, { ...body, reason: v.reason });
}

/** Whether the form holds a change worth sending. */
function folderChangeReady(mode: FolderEditMode, v: { name: string; parentId: string; reason: string }): boolean {
  if (v.reason.length < GOVERNED_REASON_MIN) return false;
  if (mode.kind === 'create') return v.name.length > 0;
  if (mode.kind === 'rename') return v.name.length > 0 && v.name !== mode.name;
  return mode.kind === 'move' ? v.parentId !== mode.parentId : true;
}

export function VaultFolderEdit({ projectId, mode, folders, onDone, onCancel }: Props) {
  const creating = mode.kind === 'create';
  const [name, setName] = useState(creating ? '' : mode.name);
  const placing = mode.kind === 'create' || mode.kind === 'move';
  const naming = mode.kind === 'create' || mode.kind === 'rename';
  const [parentId, setParentId] = useState(mode.kind === 'create' || mode.kind === 'move' ? mode.parentId : '');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = name.trim();
  const canSave = !saving && folderChangeReady(mode, { name: trimmed, parentId, reason: reason.trim() });

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const res = await sendFolderChange(projectId, mode, { name: trimmed, parentId, reason: reason.trim() });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.folder?.folderId) {
        setError(`${FAILED[mode.kind]} — ${serverMessage(body) ?? `the Vault refused it (HTTP ${res.status})`}`);
        return;
      }
      onDone(String(body.folder.folderId));
    } catch (e) {
      setError(redactInternals(e instanceof Error ? e.message : String(e), `${FAILED[mode.kind]}.`));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="vd-d-filing" aria-label={TITLE[mode.kind]} data-testid="vault-folder-edit">
      <div className="vd-d-seclbl">{TITLE[mode.kind]}{creating ? '' : ` · ${mode.name}`}</div>
      {mode.kind === 'remove' ? (
        <p className="vd-d-idx">Only an empty folder is removed. Its name and place stay in the audit trail.</p>
      ) : null}
      {naming ? <label className="vd-d-filing-row">
        <span className="k">Name</span>
        <input className="vd-d-filing-reason" value={name} maxLength={120} disabled={saving} autoFocus
          onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void save(); }}
          data-testid="vault-folder-name" />
      </label> : null}
      {placing ? (
        <label className="vd-d-filing-row">
          <span className="k">In</span>
          <select className="vd-d-move-sel" value={parentId} disabled={saving}
            onChange={(e) => setParentId(e.target.value)} data-testid="vault-folder-parent">
            <option value="">Top of the cabinet</option>
            {folders.filter((f) => creating || f.id !== mode.folderId).map((f) => <option key={f.id} value={f.id}>{indentedLabel(f)}</option>)}
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
          {saving ? 'Saving…' : SAVE[mode.kind]}
        </button>
        <button type="button" className="sp-ask" disabled={saving} onClick={onCancel}>Cancel</button>
      </div>
      {error ? <div className="vd-dr-err" role="alert" data-testid="vault-folder-error">{error}</div> : null}
    </section>
  );
}
