/**
 * Describe many files at once from a spreadsheet (gap 7, "manifest/CSV mapping
 * into Vault"; the rules are in `vaultUploadManifest.ts`).
 *
 * "Download these files' details as CSV" writes one line per file not yet
 * recorded, with the fields its row has now. The person fills it in, in a
 * spreadsheet, and "Apply details from a CSV…" sets each named row's fields.
 * Nothing is sent: the rows show what will be recorded, and Upload sends them
 * as before. What a CSV could not apply is said line by line.
 *
 * The person-facing word is "CSV" and "details", not "manifest": in a
 * regulatory team a manifest is the eCTD's. Two live regions are always
 * present, one polite and one assertive, so a note is announced when it
 * appears; and the note goes when an upload starts, since what it said
 * ("nothing has been uploaded") stops being true.
 */
import React, { useEffect, useRef, useState } from 'react';
import { I } from '../icons';
import { downloadBlob } from '../download';
import { applyManifest, manifestNote, manifestOf, parseManifest } from './vaultUploadManifest';
import type { StagedFile } from './VaultUploadStaging';

const DETAILS_FILE = 'vault-upload-details.csv';

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
  // Read after the file has been read: an upload started meanwhile has already taken the rows' fields.
  const busyNow = useRef(busy);
  busyNow.current = busy;
  useEffect(() => { if (busy) setNote(null); }, [busy]);

  const download = () => {
    if (busy) return;
    const open = rows.filter((r) => r.status?.state !== 'stored').length;
    const saved = downloadBlob(DETAILS_FILE, new Blob([manifestOf(rows, folders)], { type: 'text/csv' }));
    setNote(saved
      ? { text: `Your browser is saving ${DETAILS_FILE}: one line for each of the ${open} file${open === 1 ? '' : 's'} not yet recorded. Fill it in, then apply it here.`, ok: true }
      : { text: 'The browser did not save the file. Allow downloads for this site, then try again.', ok: false });
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
    if (busyNow.current) {
      setNote({ text: `An upload started while ${file.name} was being read, so it was not applied. Nothing in the list changed.`, ok: false });
      return;
    }
    const parsed = parseManifest(text);
    if (!parsed.ok) {
      setNote({ text: `${file.name} was not applied. ${parsed.reason} Nothing in the list changed.`, ok: false });
      return;
    }
    const outcome = applyManifest(rows, parsed.lines, folders);
    for (const [key, patch] of outcome.patches) onChange(key, patch);
    setNote({ text: manifestNote(outcome, file.name), ok: outcome.refused.length === 0 });
  };

  return (
    <div className="vd-stage-actions" data-testid="vault-stage-manifest">
      <button type="button" className="sp-ask" onClick={download} aria-disabled={busy || undefined}>
        {I.download} Download these files&rsquo; details as CSV
      </button>
      <button type="button" className="sp-ask" onClick={() => { if (!busy) picker.current?.click(); }} aria-disabled={busy || undefined}>
        Apply details from a CSV…
      </button>
      <input ref={picker} type="file" accept=".csv,text/csv" hidden aria-label="CSV of file details to apply" data-testid="vault-stage-manifest-file"
        onChange={(e) => { void apply(e.target.files?.[0]); e.target.value = ''; }} />
      <p className="vd-d-idx" role="status">{note?.ok ? note.text : ''}</p>
      <p className="vd-dr-err" role="alert">{note && !note.ok ? note.text : ''}</p>
    </div>
  );
}
