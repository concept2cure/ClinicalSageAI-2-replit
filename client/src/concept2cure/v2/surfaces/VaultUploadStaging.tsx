/**
 * The files about to enter the Vault, one row each, before anything is sent
 * (gap 7.1 of docs/design/VEEVA_GAP_2026-10-22.md; MR-08 Stage 6 steps 1-2).
 *
 * POST /api/vault/ingest already takes, per file, a title, a document type, a
 * version, a classification, a dossier folder, an evidence kind and a CTD
 * section (server/routes/vault-ingest.ts). The uploader sent one type for the
 * whole batch and a title made from the file name. Now each row says what its
 * file is, and the person sees what will be recorded before it is.
 *   - A blank field is not sent; the server's own default applies.
 *   - A folder chosen here is recorded as a person's filing. Without one, the
 *     classifier suggests a folder or leaves the file Unfiled, as before.
 *   - The evidence kind and CTD section are written only with a folder, so
 *     they are offered only once one is chosen.
 *   - A file the Vault does not take, a system file, or one over the upload
 *     cap is listed as not uploaded, with the reason. Nothing is dropped
 *     silently.
 *   - Two files with the same name are flagged: the Vault records a document
 *     by its file name, so only one can be recorded as new.
 *
 * @module client/src/concept2cure/v2/surfaces/VaultUploadStaging
 */
import React, { useId } from 'react';
import { I } from '../icons';
import type { PickedFiles } from '../FileDropZone';
import { VAULT_UPLOAD_EXTENSIONS, VAULT_UPLOAD_MAX_BYTES } from '@shared/constants/document-intake-formats';
import { extensionOf } from '@shared/constants/upload-name-bindings';
import {
  VAULT_CLASSIFICATIONS, VAULT_DOC_KINDS, VAULT_INGEST_DOCUMENT_TYPES, vaultIngestTypeLabel,
  type VaultClassification, type VaultIngestDocumentType,
} from '@shared/constants/domain/vault-taxonomy';
import type { VaultUploadFileFields, VaultUploadFileStatus } from '../useVaultUpload';

export interface StagedFile {
  key: string;
  file: File;
  path: string;
  title: string;
  documentType: VaultIngestDocumentType;
  version: string;
  classification: VaultClassification | '';
  folderId: string;
  evidenceKind: string;
  ctdSection: string;
  status: VaultUploadFileStatus | null;
}

export interface NotStaged { path: string; reason: string }

export interface Staging { rows: StagedFile[]; notStaged: NotStaged[]; unread: number }

const TAKEN = new Set<string>(VAULT_UPLOAD_EXTENSIONS);
const MB = 1024 * 1024;

/** Why a gathered file is not offered for upload, or null. */
export function notStagedReason(path: string, size: number): string | null {
  const base = path.split('/').pop() ?? path;
  if (path.split('/').includes('__MACOSX') || base.startsWith('.')) return 'a system file, not a document';
  const ext = extensionOf(base);
  if (!TAKEN.has(ext)) return `the Vault does not take ${ext || 'files with no extension'}`;
  if (size > VAULT_UPLOAD_MAX_BYTES) return `it is ${Math.ceil(size / MB)} MB, over the ${VAULT_UPLOAD_MAX_BYTES / MB} MB upload limit`;
  return null;
}

/** The gathered files as rows, each with its defaults, and the ones not offered. */
export function stageFiles(picked: PickedFiles, documentType: VaultIngestDocumentType, prior?: Staging): Staging {
  const rows: StagedFile[] = [...(prior?.rows ?? [])];
  const notStaged: NotStaged[] = [...(prior?.notStaged ?? [])];
  for (const { file, path } of picked.files) {
    const reason = notStagedReason(path, file.size);
    if (reason) { notStaged.push({ path, reason }); continue; }
    rows.push({
      key: `${path}:${file.size}:${file.lastModified}:${rows.length}`,
      file, path,
      title: file.name.replace(/\.[^.]+$/, ''),
      documentType,
      version: '', classification: '', folderId: '', evidenceKind: '', ctdSection: '',
      status: null,
    });
  }
  return { rows, notStaged, unread: (prior?.unread ?? 0) + picked.unread };
}

/** What a row sends: only what was given, the filing details only with a folder. */
export function fieldsOf(row: StagedFile): VaultUploadFileFields {
  return {
    title: row.title,
    documentType: row.documentType,
    ...(row.version.trim() ? { version: row.version.trim() } : {}),
    ...(row.classification ? { classification: row.classification } : {}),
    ...(row.folderId
      ? {
          folderId: row.folderId,
          ...(row.evidenceKind ? { evidenceKind: row.evidenceKind } : {}),
          ...(row.ctdSection.trim() ? { ctdSection: row.ctdSection.trim() } : {}),
        }
      : {}),
  };
}

/** Rows whose file name an earlier row already has. */
function sameNameAsEarlier(rows: StagedFile[]): Set<string> {
  const seen = new Set<string>();
  const repeats = new Set<string>();
  for (const r of rows) {
    const name = r.file.name.toLowerCase();
    if (seen.has(name)) repeats.add(r.key);
    seen.add(name);
  }
  return repeats;
}

function statusText(s: VaultUploadFileStatus | null): string | null {
  if (!s) return null;
  if (s.state === 'uploading') return 'Uploading…';
  if (s.state === 'refused') return `Not recorded: ${s.reason}`;
  if (s.already) return 'Already in the Vault; nothing changed';
  return `Recorded${s.version ? ` as v${s.version}` : ''}${s.folderLabel ? ` · ${s.folderLabel}` : ''}`;
}

function StagedRow({ row, folders, repeated, busy, onChange, onRemove }: {
  row: StagedFile;
  folders: ReadonlyArray<{ id: string; label: string }>;
  repeated: boolean;
  busy: boolean;
  onChange: (patch: Partial<StagedFile>) => void;
  onRemove: () => void;
}) {
  const id = useId();
  const status = statusText(row.status);
  const locked = busy || row.status?.state === 'stored';
  return (
    <li className="vd-stage-row" data-testid="vault-stage-row">
      <div className="vd-stage-h">
        <span className="vd-stage-path mono" title={row.path}>{row.path}</span>
        {status ? (
          <span className={row.status?.state === 'refused' ? 'vd-dr-err' : 'vd-d-idx'} role={row.status?.state === 'refused' ? 'alert' : 'status'}>
            {status}
          </span>
        ) : (
          <button type="button" className="sp-ask" onClick={onRemove} disabled={busy} aria-label={`Remove ${row.path} from this upload`}>
            {I.close} Remove
          </button>
        )}
      </div>
      {repeated && (
        <p className="vd-d-idx">Another file in this upload has the same name. The Vault records a document by its file name, so this one would be refused or offered as a new version.</p>
      )}
      <div className="vd-stage-fields">
        <label htmlFor={`${id}-title`}>Title</label>
        <input id={`${id}-title`} className="c2c-input" value={row.title} disabled={locked}
          onChange={(e) => onChange({ title: e.target.value })} />
        <label htmlFor={`${id}-type`}>Document type</label>
        <select id={`${id}-type`} className="c2c-input" value={row.documentType} disabled={locked}
          onChange={(e) => onChange({ documentType: e.target.value as VaultIngestDocumentType })}>
          {VAULT_INGEST_DOCUMENT_TYPES.map((t) => <option key={t} value={t}>{vaultIngestTypeLabel(t)}</option>)}
        </select>
        <label htmlFor={`${id}-version`}>Version</label>
        <input id={`${id}-version`} className="c2c-input" value={row.version} placeholder="1.0" disabled={locked}
          onChange={(e) => onChange({ version: e.target.value })} />
        <label htmlFor={`${id}-class`}>Classification</label>
        <select id={`${id}-class`} className="c2c-input" value={row.classification} disabled={locked}
          onChange={(e) => onChange({ classification: e.target.value as VaultClassification | '' })}>
          <option value="">Internal (the Vault's default)</option>
          {VAULT_CLASSIFICATIONS.map((c) => <option key={c} value={c}>{c.charAt(0) + c.slice(1).toLowerCase()}</option>)}
        </select>
        <label htmlFor={`${id}-folder`}>Folder</label>
        <select id={`${id}-folder`} className="c2c-input" value={row.folderId} disabled={locked}
          onChange={(e) => onChange({ folderId: e.target.value, ...(e.target.value ? {} : { evidenceKind: '', ctdSection: '' }) })}>
          <option value="">Let the Vault suggest a folder</option>
          {folders.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
        {row.folderId ? (
          <>
            <label htmlFor={`${id}-kind`}>Evidence kind</label>
            <select id={`${id}-kind`} className="c2c-input" value={row.evidenceKind} disabled={locked}
              onChange={(e) => onChange({ evidenceKind: e.target.value })}>
              <option value="">Not stated</option>
              {VAULT_DOC_KINDS.map((k) => <option key={k.value} value={k.value}>{k.one}</option>)}
            </select>
            <label htmlFor={`${id}-section`}>CTD section</label>
            <input id={`${id}-section`} className="c2c-input" value={row.ctdSection} placeholder="e.g. 3.2.P.8" disabled={locked}
              onChange={(e) => onChange({ ctdSection: e.target.value })} />
          </>
        ) : null}
      </div>
    </li>
  );
}

export function VaultUploadStaging({ staging, folders, uploading, onChange, onRemove, onUpload, onDone }: {
  staging: Staging;
  folders: ReadonlyArray<{ id: string; label: string }>;
  uploading: boolean;
  onChange: (key: string, patch: Partial<StagedFile>) => void;
  onRemove: (key: string) => void;
  onUpload: () => void;
  onDone: () => void;
}) {
  const { rows, notStaged, unread } = staging;
  const repeated = sameNameAsEarlier(rows);
  const pending = rows.filter((r) => !r.status || r.status.state === 'refused');
  const retrying = pending.some((r) => r.status?.state === 'refused');
  const settled = rows.length > 0 && rows.every((r) => r.status?.state === 'stored');
  return (
    <section className="vd-stage" aria-label="Files to upload" data-testid="vault-upload-staging">
      <div className="vd-d-seclbl">Files to upload</div>
      <p className="vd-d-idx">
        Say what each file is before it is recorded. A blank field takes the Vault's default; a folder chosen here is recorded as your filing.
      </p>
      {rows.length > 0 && <ul className="vd-stage-list">
        {rows.map((r) => (
          <StagedRow key={r.key} row={r} folders={folders} repeated={repeated.has(r.key)} busy={uploading}
            onChange={(patch) => onChange(r.key, patch)} onRemove={() => onRemove(r.key)} />
        ))}
      </ul>}
      {(notStaged.length > 0 || unread > 0) && (
        <div className="vd-d-idx" data-testid="vault-stage-skipped">
          <b>Not uploaded:</b>
          <ul>
            {notStaged.map((n) => <li key={n.path}>{n.path}: {n.reason}</li>)}
            {unread > 0 && <li>{unread} more file{unread === 1 ? '' : 's'} in that folder were not read; an upload holds up to 500. Add them separately.</li>}
          </ul>
        </div>
      )}
      <div className="vd-stage-actions">
        {pending.length > 0 ? (
          <button type="button" className="sp-primary" onClick={onUpload} disabled={uploading} data-testid="vault-stage-upload">
            {I.upload} {uploading ? 'Uploading…' : `${retrying ? 'Try again for' : 'Upload'} ${pending.length} file${pending.length === 1 ? '' : 's'}`}
          </button>
        ) : null}
        <button type="button" className="sp-ask" onClick={onDone} disabled={uploading}>
          {settled ? 'Done' : 'Cancel'}
        </button>
      </div>
    </section>
  );
}
