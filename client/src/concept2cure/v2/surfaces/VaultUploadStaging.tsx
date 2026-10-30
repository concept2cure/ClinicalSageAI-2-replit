/**
 * The files about to enter the Vault, one row each, before anything is sent
 * (gap 7.1 of docs/design/VEEVA_GAP_2026-10-22.md; MR-08 Stage 6 steps 1-2).
 *
 * POST /api/vault/ingest already takes, per file, a title, a document type, a
 * classification, a dossier folder, an evidence kind and a CTD section
 * (server/routes/vault-ingest.ts). The uploader sent one type for the whole
 * batch and a title made from the file name. Now each row says what its file
 * is, and the person sees what will be recorded before it is.
 *   - A blank field is not sent; the server's own default applies.
 *   - A folder chosen here is recorded as the person's filing. Without one,
 *     the classifier suggests a folder or leaves the file Unfiled, as before,
 *     and each row's result says which happened.
 *   - The evidence kind and CTD section are written only with a folder, so
 *     they are offered only once one is chosen.
 *   - No version is offered: a new document is 1.0, and later versions are
 *     numbered by the Vault when they are added (useVaultUpload.ts).
 *   - A file the Vault does not take, a hidden or system file, an empty file
 *     or one over the upload cap is listed as not uploaded, with the reason.
 *   - Two files with the same name are flagged: the Vault identifies a
 *     document by its file name, so only one can be recorded as new.
 *   - Many files are described at once from a manifest, a CSV the list
 *     downloads and takes back (`vaultUploadManifest.ts`, Veeva gap 7).
 * Accessibility (review 2026-10-22): each row is a group named by its file;
 * one live region says what was added, what is uploading and what became of
 * it; focus goes to the panel when it opens, stays on a control when a row is
 * removed, and moves to Close when the upload settles.
 *
 * @module client/src/concept2cure/v2/surfaces/VaultUploadStaging
 */
import React, { useEffect, useId, useRef } from 'react';
import { I } from '../icons';
import { formatBytes } from '@/lib/utils';
import type { PickedFiles } from '../FileDropZone';
import { VAULT_UPLOAD_EXTENSIONS, VAULT_UPLOAD_MAX_BYTES } from '@shared/constants/document-intake-formats';
import { extensionOf } from '@shared/constants/upload-name-bindings';
import {
  VAULT_CLASSIFICATIONS, VAULT_DOC_KINDS, VAULT_INGEST_DOCUMENT_TYPES, vaultIngestTypeLabel,
  type VaultClassification, type VaultIngestDocumentType,
} from '@shared/constants/domain/vault-taxonomy';
import type { VaultUploadFileFields, VaultUploadFileStatus } from '../useVaultUpload';
import { VaultUploadManifestControls } from './VaultUploadManifestControls';

export interface StagedFile {
  key: string;
  file: File;
  path: string;
  title: string;
  documentType: VaultIngestDocumentType;
  classification: VaultClassification | '';
  folderId: string;
  evidenceKind: string;
  ctdSection: string;
  status: VaultUploadFileStatus | null;
}

export interface NotStaged { path: string; reason: string }

export interface Staging { rows: StagedFile[]; notStaged: NotStaged[]; unread: number; added: number }

const TAKEN = new Set<string>(VAULT_UPLOAD_EXTENSIONS);
const MB = 1024 * 1024;
let rowSerial = 0;

/** Why a gathered file is not offered for upload, or null. */
export function notStagedReason(path: string, size: number): string | null {
  const base = path.split('/').pop() ?? path;
  if (path.split('/').includes('__MACOSX') || base.startsWith('.')) return 'a hidden or system file';
  const ext = extensionOf(base);
  if (!TAKEN.has(ext)) return `the Vault does not take ${ext || 'files with no extension'}`;
  if (size === 0) return 'it is empty';
  if (size > VAULT_UPLOAD_MAX_BYTES) return `it is ${(size / MB).toFixed(1)} MB, over the ${VAULT_UPLOAD_MAX_BYTES / MB} MB upload limit`;
  return null;
}

/** The gathered files as rows, each with its defaults, and the ones not offered. */
export function stageFiles(picked: PickedFiles, documentType: VaultIngestDocumentType, prior?: Staging): Staging {
  const rows: StagedFile[] = [...(prior?.rows ?? [])];
  const notStaged: NotStaged[] = [...(prior?.notStaged ?? [])];
  let added = 0;
  for (const { file, path } of picked.files) {
    const reason = notStagedReason(path, file.size);
    if (reason) { notStaged.push({ path, reason }); continue; }
    rowSerial += 1;
    added += 1;
    rows.push({
      key: `row-${rowSerial}`,
      file, path,
      title: file.name.replace(/\.[^.]+$/, ''),
      documentType,
      classification: '', folderId: '', evidenceKind: '', ctdSection: '',
      status: null,
    });
  }
  return { rows, notStaged, unread: (prior?.unread ?? 0) + picked.unread, added };
}

/** What a row sends: only what was given, the filing details only with a folder. */
export function fieldsOf(row: StagedFile): VaultUploadFileFields {
  return {
    title: row.title,
    documentType: row.documentType,
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

/** Rows whose file name an earlier row already has. The name is the document's code, verbatim. */
function sameNameAsEarlier(rows: StagedFile[]): Set<string> {
  const seen = new Set<string>();
  const repeats = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.file.name)) repeats.add(r.key);
    seen.add(r.file.name);
  }
  return repeats;
}

const PLACED: Record<'confirmed' | 'suggested', string> = {
  confirmed: 'filed by you',
  suggested: 'suggested, awaiting confirmation',
};

/** How far an uploading file has got: its bytes going out, then the server scanning and storing it. */
function uploadingText(s: { sent?: number; total?: number }): string {
  if (!s.total) return 'Uploading…';
  const sent = s.sent ?? 0;
  if (sent >= s.total) return 'Sent. The server is scanning it and storing it…';
  return `Uploading… ${Math.floor((sent * 100) / s.total)}% of ${formatBytes(s.total, 1)} sent`;
}

/** What became of a row's file, in words. */
export function statusText(s: VaultUploadFileStatus | null): string | null {
  if (!s) return null;
  if (s.state === 'uploading') return uploadingText(s);
  if (s.state === 'refused') return s.unknown
    ? `Not known whether it was recorded: ${s.reason}. Reload the Vault and check before trying again.`
    : `Not recorded: ${s.reason}`;
  if (s.already) {
    if (s.recordUpdated) return 'Already in the Vault with these bytes. Its record was updated; review its history for details.';
    return 'Already in the Vault with these bytes. Nothing was changed, including the details above; change them with Edit details or Move.';
  }
  const where = s.placement === 'unfiled' || !s.folderLabel
    ? 'Unfiled, needs a folder'
    : `${s.folderLabel}, ${PLACED[s.placement]}`;
  const recorded = `Recorded${s.version ? ` as v${s.version}` : ''} · ${where}`;
  return s.readingText ? `${recorded} · Its text is still being read; search finds it once that is done.` : recorded;
}

/** The sentence the panel's live region says, for the state it is in. */
function announcement(staging: Staging, uploading: boolean): string {
  const { rows, notStaged, added } = staging;
  const n = (k: number, one: string) => `${k} ${one}${k === 1 ? '' : 's'}`;
  if (uploading) return `Uploading ${n(rows.filter((r) => r.status?.state === 'uploading' || !r.status).length, 'file')}.`;
  const settled = rows.filter((r) => r.status && r.status.state !== 'uploading');
  if (settled.length) {
    const refused = rows.filter((r) => r.status?.state === 'refused' && !r.status.unknown);
    const unknown = rows.filter((r) => r.status?.state === 'refused' && r.status.unknown);
    const recorded = settled.length - refused.length - unknown.length;
    return `${n(recorded, 'file')}${unknown.length ? ' confirmed' : ''} recorded.`
      + (refused.length ? ` ${refused.length} not recorded: ${refused.map((r) => r.path).join(', ')}.` : '')
      + (unknown.length ? ` It is not known whether ${n(unknown.length, 'file')} ${unknown.length === 1 ? 'was' : 'were'} recorded: ${unknown.map((r) => r.path).join(', ')}. Reload the Vault and check.` : '');
  }
  return `${n(added, 'file')} added to the upload list.` + (notStaged.length ? ` ${n(notStaged.length, 'file')} not uploaded.` : '');
}

/** A row's words: its file's outcome, or, while the batch runs, that it waits for the files before it. */
function rowStatusText(row: StagedFile, busy: boolean): string | null {
  if (busy && !row.status) return 'Waiting: files are sent one at a time.';
  return statusText(row.status);
}

/** The share of a row's file sent so far, while its bytes are going out. */
function SendingBar({ row }: { row: StagedFile }) {
  const s = row.status;
  if (s?.state !== 'uploading' || !s.total) return null;
  return <progress className="vd-stage-progress" max={s.total} value={s.sent ?? 0} aria-label={`Sending ${row.path}`} />;
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
  const status = rowStatusText(row, busy);
  const stored = row.status?.state === 'stored';
  const locked = busy || stored;
  const refused = row.status?.state === 'refused';
  return (
    <li className="vd-stage-row" data-testid="vault-stage-row" data-row-key={row.key}>
      <div role="group" aria-labelledby={`${id}-path`} aria-describedby={status ? `${id}-status` : undefined}>
        <div className="vd-stage-h">
          <span className="vd-stage-path mono" id={`${id}-path`}>{row.path}</span>
          {!stored && (
            <button type="button" className="sp-ask" data-remove onClick={onRemove} aria-disabled={busy || undefined}
              aria-label={`Remove ${row.path} from this upload`}>
              {I.close} Remove
            </button>
          )}
        </div>
        {status && <p id={`${id}-status`} className={refused ? 'vd-dr-err' : 'vd-d-idx'}>{status}</p>}
        <SendingBar row={row} />
        {row.path !== row.file.name && <p className="vd-d-idx">Recorded in the Vault as {row.file.name}; the folder it came from is not kept.</p>}
        {repeated && (
          <p className="vd-d-idx">
            Another file in this upload has this name. The Vault identifies a document by its file name, so only one of them can be recorded as a new document. This one is reported as already recorded if its content is the same, and refused if it differs.
          </p>
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
          <label htmlFor={`${id}-class`}>Classification</label>
          <select id={`${id}-class`} className="c2c-input" value={row.classification} disabled={locked}
            onChange={(e) => onChange({ classification: e.target.value as VaultClassification | '' })}>
            <option value="">Internal (default)</option>
            {VAULT_CLASSIFICATIONS.filter((c) => c !== 'INTERNAL').map((c) => <option key={c} value={c}>{c.charAt(0) + c.slice(1).toLowerCase()}</option>)}
          </select>
          <label htmlFor={`${id}-folder`}>Folder</label>
          <select id={`${id}-folder`} className="c2c-input" value={row.folderId} disabled={locked}
            onChange={(e) => onChange({ folderId: e.target.value, ...(e.target.value ? {} : { evidenceKind: '', ctdSection: '' }) })}>
            <option value="">No folder chosen: the Vault suggests one, or leaves it Unfiled</option>
            {folders.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
          {row.folderId ? (
            <>
              <span />
              <span className="vd-d-idx">Recorded as filed by you.</span>
              <label htmlFor={`${id}-kind`}>Evidence kind (optional)</label>
              <select id={`${id}-kind`} className="c2c-input" value={row.evidenceKind} disabled={locked}
                onChange={(e) => onChange({ evidenceKind: e.target.value })}>
                <option value="">Not stated</option>
                {VAULT_DOC_KINDS.map((k) => <option key={k.value} value={k.value}>{k.one}</option>)}
              </select>
              <label htmlFor={`${id}-section`}>CTD section (optional)</label>
              <input id={`${id}-section`} className="c2c-input" value={row.ctdSection} placeholder="e.g. 3.2.P.8" disabled={locked}
                onChange={(e) => onChange({ ctdSection: e.target.value })} />
            </>
          ) : null}
        </div>
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
  const headingId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const panel = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const focusAfterRemove = useRef<string | null>(null);
  const wasUploading = useRef(uploading);
  const repeated = sameNameAsEarlier(rows);
  const pending = rows.filter((r) => !r.status || r.status.state === 'refused');
  const retrying = pending.some((r) => r.status?.state === 'refused');
  const anyStored = rows.some((r) => r.status?.state === 'stored');

  // Opening moves focus to the panel, so the person is told what was added.
  useEffect(() => {
    heading.current?.focus();
    heading.current?.scrollIntoView?.({ block: 'nearest' });
  }, []);
  // A removed row's focus goes to the next row's Remove, the previous one's, or the heading.
  useEffect(() => {
    const key = focusAfterRemove.current;
    if (key === null) return;
    focusAfterRemove.current = null;
    const target = key ? panel.current?.querySelector<HTMLButtonElement>(`[data-row-key="${key}"] [data-remove]`) : null;
    (target ?? heading.current)?.focus();
  }, [rows]);
  // When an upload settles, focus goes to Close: the button that held it may be gone.
  useEffect(() => {
    if (wasUploading.current && !uploading) closeButton.current?.focus();
    wasUploading.current = uploading;
  }, [uploading]);

  const remove = (key: string) => {
    if (uploading) return;
    const at = rows.findIndex((r) => r.key === key);
    const next = rows.slice(at + 1).find((r) => r.status?.state !== 'stored') ?? rows.slice(0, at).reverse().find((r) => r.status?.state !== 'stored');
    focusAfterRemove.current = next?.key ?? '';
    onRemove(key);
  };

  return (
    <section className="vd-stage" aria-labelledby={headingId} data-testid="vault-upload-staging" ref={panel}>
      <h3 className="vd-d-seclbl" id={headingId} ref={heading} tabIndex={-1}>Files to upload</h3>
      <div className="sr-only" role="status" aria-live="polite" data-testid="vault-stage-live">{announcement(staging, uploading)}</div>
      <p className="vd-d-idx">
        Say what each file is before it is recorded. A blank field takes the Vault&rsquo;s default. A folder chosen here is recorded as filed by you; without one, the Vault suggests a folder for you to confirm, or leaves the file Unfiled.
      </p>
      {rows.length > 0 && <VaultUploadManifestControls rows={rows} folders={folders} busy={uploading} onChange={onChange} />}
      {rows.length > 0 && <ul className="vd-stage-list" role="list">
        {rows.map((r) => (
          <StagedRow key={r.key} row={r} folders={folders} repeated={repeated.has(r.key)} busy={uploading}
            onChange={(patch) => onChange(r.key, patch)} onRemove={() => remove(r.key)} />
        ))}
      </ul>}
      {(notStaged.length > 0 || unread > 0) && (
        <div className="vd-d-idx" data-testid="vault-stage-skipped">
          <b>Not uploaded:</b>
          <ul role="list">
            {notStaged.map((n) => <li key={n.path}>{n.path}: {n.reason}</li>)}
            {unread > 0 && <li>{unread === 1 ? '1 more file was' : `${unread} more files were`} not read. One drop or selection reads up to 500; add the rest in another.</li>}
          </ul>
        </div>
      )}
      <div className="vd-stage-actions">
        {pending.length > 0 || uploading ? (
          <button type="button" className="sp-primary" onClick={() => { if (!uploading) onUpload(); }} aria-disabled={uploading || undefined}
            data-testid="vault-stage-upload">
            {I.upload} {uploading ? 'Uploading…' : `${retrying ? 'Try again for' : 'Upload'} ${pending.length} file${pending.length === 1 ? '' : 's'}`}
          </button>
        ) : null}
        <button type="button" className="sp-ask" ref={closeButton} onClick={() => { if (!uploading) onDone(); }} aria-disabled={uploading || undefined}>
          {anyStored ? 'Close' : 'Cancel'}
        </button>
      </div>
    </section>
  );
}
