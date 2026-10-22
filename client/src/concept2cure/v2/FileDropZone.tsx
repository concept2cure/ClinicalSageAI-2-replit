/**
 * The one drop zone: files chosen, files dropped, or a folder chosen or
 * dropped. Its first two users are the Data Room (ProjectHome.tsx) and the
 * Vault's uploader (VaultUploadStaging.tsx), per MR-08 Stage 6 step 1.
 *
 * It only gathers. What is accepted, skipped or sent is the caller's decision,
 * so the zone never drops a file silently. Each file comes with its path
 * inside the folder it came from ("study-001/ae.xpt"), or its own name.
 *
 * Where folders are offered (`directory`), a folder is read through the
 * browser's entry API (`webkitGetAsEntry`, every current engine) when dropped,
 * and through `webkitdirectory` when chosen. Reading stops at `maxFiles`, and
 * the caller is told how many were not read. Without `directory` a drop gives
 * the dropped files only, as the Data Room always had. While `disabled`, a drop
 * is taken (so the browser does not open the file) and ignored: the controls
 * say why nothing can be added.
 *
 * @module client/src/concept2cure/v2/FileDropZone
 */
import React, { useRef, useState } from 'react';

/** One gathered file and where it sat in what was dropped or chosen. */
export interface PickedFile { file: File; path: string }

/** What one gesture gathered. `unread` counts the files past `maxFiles`. */
export interface PickedFiles { files: PickedFile[]; unread: number }

export interface FileDropZoneControls {
  chooseFiles: () => void;
  chooseFolder: () => void;
}

interface Props {
  accept: string;
  /** Offer folder choice as well as files. */
  directory?: boolean;
  maxFiles?: number;
  disabled?: boolean;
  className?: string;
  /** The zone's accessible name. */
  label: string;
  /** The file input's accessible name; defaults to the zone's, with ": choose files". */
  inputLabel?: string;
  /**
   * 'zone': the whole zone is the button that chooses files (the Data Room).
   * 'controls': the zone is a labelled drop target and its own buttons, from
   * `children`, choose files or a folder, so no control sits inside a button.
   */
  activation?: 'zone' | 'controls';
  onFiles: (picked: PickedFiles) => void;
  children: (controls: FileDropZoneControls) => React.ReactNode;
  /** Set to the zone's controls, for a surface that opens the picker from elsewhere. */
  controlsRef?: React.MutableRefObject<FileDropZoneControls | null>;
  testId?: string;
}

const DEFAULT_MAX_FILES = 500;

/* The entry API as the engines ship it; not in lib.dom for every target. */
interface FsEntry { isFile: boolean; isDirectory: boolean; name: string; fullPath: string }
interface FsFileEntry extends FsEntry { file: (ok: (f: File) => void, fail: (e: unknown) => void) => void }
interface FsDirEntry extends FsEntry { createReader: () => { readEntries: (ok: (es: FsEntry[]) => void, fail: (e: unknown) => void) => void } }

const relative = (fullPath: string) => fullPath.replace(/^\/+/, '');

/** Every file under the dropped entries, depth first, stopping at `max`. */
export async function readDroppedEntries(entries: FsEntry[], max: number): Promise<PickedFiles> {
  const files: PickedFile[] = [];
  let unread = 0;
  const visit = async (entry: FsEntry): Promise<void> => {
    if (entry.isFile) {
      if (files.length >= max) { unread += 1; return; }
      const file = await new Promise<File>((ok, fail) => (entry as FsFileEntry).file(ok, fail));
      files.push({ file, path: relative(entry.fullPath) || file.name });
      return;
    }
    if (!entry.isDirectory) return;
    const reader = (entry as FsDirEntry).createReader();
    // readEntries answers in batches; an empty batch is the end of the folder.
    for (;;) {
      const batch = await new Promise<FsEntry[]>((ok, fail) => reader.readEntries(ok, fail));
      if (!batch.length) break;
      for (const child of batch) await visit(child);
    }
  };
  for (const entry of entries) await visit(entry);
  return { files, unread };
}

/** What a file input chose: its own path inside a chosen folder, or its name. */
export function pickedFromList(list: FileList | File[], max: number): PickedFiles {
  const all = Array.from(list as ArrayLike<File>);
  const files = all.slice(0, max).map((file) => ({
    file,
    path: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
  }));
  return { files, unread: all.length - files.length };
}

export function FileDropZone({ accept, directory = false, maxFiles = DEFAULT_MAX_FILES, disabled = false, className, label, inputLabel, activation = 'zone', onFiles, children, controlsRef, testId }: Props) {
  const [dragging, setDragging] = useState(false);
  const filesRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const controls: FileDropZoneControls = {
    chooseFiles: () => { if (!disabled) filesRef.current?.click(); },
    chooseFolder: () => { if (!disabled) folderRef.current?.click(); },
  };
  if (controlsRef) controlsRef.current = controls;

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    const items = directory ? Array.from(e.dataTransfer?.items ?? []) : [];
    const entries = items
      .map((item) => (item as { webkitGetAsEntry?: () => FsEntry | null }).webkitGetAsEntry?.() ?? null)
      .filter((entry): entry is FsEntry => entry !== null);
    if (entries.length) {
      onFiles(await readDroppedEntries(entries, maxFiles));
      return;
    }
    if (e.dataTransfer?.files?.length) onFiles(pickedFromList(e.dataTransfer.files, maxFiles));
  };

  const fromInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) onFiles(pickedFromList(e.target.files, maxFiles));
    e.target.value = '';
  };

  return (
    <div
      className={className}
      data-dragging={dragging || undefined}
      data-testid={testId}
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => void onDrop(e)}
      aria-label={label}
      {...(activation === 'zone'
        ? {
            role: 'button',
            tabIndex: disabled ? -1 : 0,
            'aria-disabled': disabled || undefined,
            onClick: controls.chooseFiles,
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.target !== e.currentTarget) return;
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); controls.chooseFiles(); }
            },
          }
        : { role: 'group' })}
    >
      {children(controls)}
      <input ref={filesRef} type="file" multiple accept={accept} hidden onChange={fromInput}
        onClick={(e) => e.stopPropagation()} aria-label={inputLabel ?? `${label}: choose files`} data-testid={testId ? `${testId}-files` : undefined} />
      {directory && (
        <input ref={folderRef} type="file" multiple hidden onChange={fromInput}
          onClick={(e) => e.stopPropagation()} aria-label={`${label}: choose a folder`}
          data-testid={testId ? `${testId}-folder` : undefined}
          {...({ webkitdirectory: '', directory: '' } as Record<string, string>)} />
      )}
    </div>
  );
}
