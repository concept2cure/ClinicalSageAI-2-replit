/**
 * Describe many files at once from a spreadsheet (gap 7, "manifest/CSV mapping
 * into Vault"; the rules are in `vaultUploadManifest.ts`).
 *
 * "Download this list as a manifest" writes one line per file in the upload
 * list with the fields its row has now. The person fills it in, in a
 * spreadsheet, and "Apply a manifest…" sets each named row's fields. Nothing
 * is sent: the rows show what will be recorded, and Upload sends them as
 * before. What a manifest could not apply is said line by line.
 */
import React, { useRef, useState } from 'react';
import { I } from '../icons';
import { downloadBlob } from '../download';
import { applyManifest, manifestNote, manifestOf, parseManifest } from './vaultUploadManifest';
import type { StagedFile } from './VaultUploadStaging';

/** A chosen file's text, read the way every browser can. */
function readText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('it could not be read'));
    reader.readAsText(file);
  });
}

export function VaultUploadManifestControls({ rows, folders, busy, onChange }: {
  rows: StagedFile[];
  folders: ReadonlyArray<{ id: string; label: string }>;
  busy: boolean;
  onChange: (key: string, patch: Partial<StagedFile>) => void;
}) {
  const [note, setNote] = useState<{ text: string; ok: boolean } | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  const download = () => {
    if (busy) return;
    const saved = downloadBlob('vault-upload-manifest.csv', new Blob([manifestOf(rows, folders)], { type: 'text/csv' }));
    setNote(saved
      ? { text: 'Manifest downloaded, one line per file in this list. Fill it in, then apply it here.', ok: true }
      : { text: 'The browser refused to save the manifest.', ok: false });
  };

  const apply = async (file: File | undefined) => {
    if (!file || busy) return;
    let text: string;
    try {
      text = await readText(file);
    } catch {
      setNote({ text: `${file.name} could not be read. Nothing in the list changed.`, ok: false });
      return;
    }
    const parsed = parseManifest(text);
    if (!parsed.ok) {
      setNote({ text: `${file.name} was not applied. ${parsed.reason} Nothing in the list changed.`, ok: false });
      return;
    }
    const outcome = applyManifest(rows, parsed.lines, folders);
    for (const [key, patch] of outcome.patches) onChange(key, patch);
    setNote({ text: manifestNote(outcome), ok: outcome.refused.length === 0 });
  };

  return (
    <div className="vd-stage-actions" data-testid="vault-stage-manifest">
      <button type="button" className="sp-ask" onClick={download} aria-disabled={busy || undefined}>
        {I.download} Download this list as a manifest
      </button>
      <button type="button" className="sp-ask" onClick={() => { if (!busy) picker.current?.click(); }} aria-disabled={busy || undefined}>
        Apply a manifest…
      </button>
      <input ref={picker} type="file" accept=".csv,text/csv" hidden aria-label="Manifest to apply" data-testid="vault-stage-manifest-file"
        onChange={(e) => { void apply(e.target.files?.[0]); e.target.value = ''; }} />
      {note ? <p className={note.ok ? 'vd-d-idx' : 'vd-dr-err'} role={note.ok ? 'status' : 'alert'}>{note.text}</p> : null}
    </div>
  );
}
