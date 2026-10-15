/**
 * A .zip dropped into a project's Data Room is opened in the browser, and
 * each file inside it is uploaded on its own (founder decision 2026-10-15,
 * "Do it all", on the Data Room catalog design doc's §6).
 *
 * Why in the browser: every Data Room upload goes through one server path
 * (POST /api/chat/upload behind assertUploadSafe: name/type binding, byte
 * signature, malware scan, tenancy, then the one processing step). An entry
 * sent as its own upload passes every one of those checks as itself. The
 * server never receives an archive, so it gains no decompressor to bound and
 * no second intake path. The cost is stated in the summary: the archive
 * itself is not kept, only the files that came out of it.
 *
 * What is refused, and said by name, rather than opened:
 *   - an archive over MAX_ARCHIVE_BYTES, with more than MAX_ENTRIES files, or
 *     whose files declare more than MAX_TOTAL_BYTES between them: refused
 *     whole, before anything is inflated, so nothing is half-uploaded;
 *   - an entry whose path climbs out of the archive (`..`), is absolute, or
 *     names a drive; an archive inside the archive; an encrypted archive;
 *   - an entry over the upload cap, or compressed past MAX_RATIO (how archive
 *     bombs are built). Inflation is counted as it streams and stops at the
 *     cap, so a header that lies about its size cannot run past it, and an
 *     entry whose inflated length differs from its header is refused.
 * Folders and operating-system clutter (`__MACOSX/`, `.DS_Store`, hidden
 * files) are skipped and listed as skipped.
 */
import type JSZip from 'jszip';
import { CHAT_UPLOAD_EXTENSIONS, CHAT_UPLOAD_MAX_BYTES } from '@shared/constants/document-intake-formats';
import { declaredTypeFor, extensionOf } from '@shared/constants/upload-name-bindings';

export const ARCHIVE_LIMITS = {
  /** The archive as chosen. It is read into memory to be opened. */
  maxArchiveBytes: 200 * 1024 * 1024,
  maxEntries: 500,
  /** Each file inside: the same cap as any upload. */
  maxEntryBytes: CHAT_UPLOAD_MAX_BYTES,
  maxTotalBytes: 1024 * 1024 * 1024,
  /** Inflated over compressed, for entries over 1 MB. Clinical text compresses well; nothing honest is 1000:1. */
  maxRatio: 1000,
};
export type ArchiveLimits = typeof ARCHIVE_LIMITS;

export interface ArchiveEntryFile {
  /** The entry's path inside the archive, as shown. */
  path: string;
  /** The file to upload: the entry's own name and bytes, typed by its extension. */
  file: File;
}
export interface ArchiveRefusal { path: string; reason: string }

export type ArchiveExpansion =
  | { ok: true; files: ArchiveEntryFile[]; refused: ArchiveRefusal[]; skipped: string[] }
  | { ok: false; reason: string };

const NESTED_ARCHIVE = /\.(zip|7z|rar|tar|gz|tgz|bz2|xz)$/i;
/** What the Data Room takes as a file, an archive aside: the same list its picker offers. */
const TAKEN = new Set(CHAT_UPLOAD_EXTENSIONS.filter((e) => e !== '.zip'));
const MB = 1024 * 1024;
const SIZE_MISMATCH = "its size does not match the archive's record of it";

/** Whether this name is an archive the Data Room opens. */
export function isArchiveName(name: string): boolean {
  return /\.zip$/i.test(name);
}

/** Why an entry path is refused, or null. Judged on the path as written in the archive. */
export function entryPathRefusal(raw: string): string | null {
  if (/[\u0000-\u001f]/.test(raw)) return 'its name contains control characters';
  if (raw.includes('\\')) return 'its path uses backslashes, which can climb out of a folder on Windows';
  if (raw.startsWith('/') || /^[a-zA-Z]:/.test(raw)) return 'its path is absolute';
  if (raw.split('/').includes('..')) return 'its path climbs out of the archive (..)';
  return null;
}

/** Folders and the clutter an operating system adds; skipped, not refused. */
function isClutter(path: string): boolean {
  const base = path.split('/').pop() ?? '';
  return path.startsWith('__MACOSX/') || base === '' || base.startsWith('.');
}

interface Sizes { compressed: number; uncompressed: number }
/** The sizes the archive's directory declares. JSZip keeps them on a private field. */
const sizesOf = (entry: JSZip.JSZipObject): Sizes => {
  const d = (entry as unknown as { _data?: { compressedSize?: number; uncompressedSize?: number } })._data;
  return { compressed: Number(d?.compressedSize ?? 0), uncompressed: Number(d?.uncompressedSize ?? 0) };
};

function sizeRefusal(s: Sizes, limits: ArchiveLimits): string | null {
  if (s.uncompressed > limits.maxEntryBytes) return `it is ${Math.ceil(s.uncompressed / MB)} MB inflated, over the ${limits.maxEntryBytes / MB} MB upload limit`;
  if (s.uncompressed > MB && s.compressed > 0 && s.uncompressed / s.compressed > limits.maxRatio) {
    return `it is compressed more than ${limits.maxRatio}:1, which is how archive bombs are built`;
  }
  return null;
}

/** Inflate one entry, counting as it streams; stops at the cap. */
function inflate(entry: JSZip.JSZipObject, cap: number): Promise<Uint8Array | 'over' | Error> {
  type Stream = { on(e: string, f: (x: never) => void): Stream; resume(): Stream; pause(): Stream };
  const stream = (entry as unknown as { internalStream(t: 'uint8array'): Stream }).internalStream('uint8array');
  return new Promise((resolve) => {
    const chunks: Uint8Array[] = [];
    let total = 0;
    stream
      .on('data', (chunk: Uint8Array) => {
        total += chunk.length;
        if (total > cap) { stream.pause(); resolve('over'); return; }
        chunks.push(chunk);
      })
      .on('error', (e: Error) => resolve(e))
      .on('end', () => {
        const out = new Uint8Array(total);
        let at = 0;
        for (const c of chunks) { out.set(c, at); at += c.length; }
        resolve(out);
      })
      .resume();
  });
}

/** What the archive's directory lists, sorted into files to open, refusals and skips. Nothing is inflated. */
function triage(zip: JSZip, limits: ArchiveLimits) {
  const open: Array<{ path: string; entry: JSZip.JSZipObject; sizes: Sizes }> = [];
  const refused: ArchiveRefusal[] = [];
  const skipped: string[] = [];
  zip.forEach((_, entry) => {
    const raw = entry.unsafeOriginalName ?? entry.name;
    if (entry.dir) return;
    const pathRefusal = entryPathRefusal(raw);
    if (pathRefusal) return void refused.push({ path: raw, reason: pathRefusal });
    if (isClutter(raw)) return void skipped.push(raw);
    if (NESTED_ARCHIVE.test(raw)) return void refused.push({ path: raw, reason: 'an archive inside an archive is not opened; upload it on its own' });
    const ext = extensionOf(raw);
    if (!TAKEN.has(ext)) return void refused.push({ path: raw, reason: `the Data Room does not take ${ext || 'files with no extension'}` });
    const sizes = sizesOf(entry);
    const tooBig = sizeRefusal(sizes, limits);
    if (tooBig) return void refused.push({ path: raw, reason: tooBig });
    open.push({ path: raw, entry, sizes });
  });
  return { open, refused, skipped };
}

async function load(file: File): Promise<JSZip | string> {
  const { default: JSZipCtor } = await import('jszip');
  try {
    return await JSZipCtor.loadAsync(await file.arrayBuffer());
  } catch (e) {
    const message = e instanceof Error ? e.message : '';
    return /encrypt/i.test(message)
      ? 'it is encrypted. Remove the password and upload it again.'
      : 'it could not be read as a .zip archive.';
  }
}

/** Open an archive and return the files to upload, or why it was refused whole. */
export async function expandArchive(file: File, limits: ArchiveLimits = ARCHIVE_LIMITS): Promise<ArchiveExpansion> {
  if (file.size > limits.maxArchiveBytes) {
    return { ok: false, reason: `it is ${Math.ceil(file.size / MB)} MB; archives up to ${limits.maxArchiveBytes / MB} MB are opened. Split it, or upload its files directly.` };
  }
  const zip = await load(file);
  if (typeof zip === 'string') return { ok: false, reason: zip };
  const { open, refused, skipped } = triage(zip, limits);
  if (open.length > limits.maxEntries) {
    return { ok: false, reason: `it holds ${open.length} files; up to ${limits.maxEntries} are opened from one archive. Split it.` };
  }
  const declared = open.reduce((n, o) => n + o.sizes.uncompressed, 0);
  if (declared > limits.maxTotalBytes) {
    return { ok: false, reason: `its files come to ${Math.ceil(declared / MB)} MB; up to ${limits.maxTotalBytes / MB} MB are opened from one archive. Split it.` };
  }
  const files: ArchiveEntryFile[] = [];
  for (const o of open) {
    const bytes = await inflate(o.entry, limits.maxEntryBytes);
    const name = o.path.split('/').pop() as string;
    if (bytes === 'over') refused.push({ path: o.path, reason: `it inflates past the ${limits.maxEntryBytes / MB} MB upload limit, more than its header says` });
    else if (bytes instanceof Error ? /size mismatch/i.test(bytes.message) : bytes.length !== o.sizes.uncompressed) refused.push({ path: o.path, reason: SIZE_MISMATCH });
    else if (bytes instanceof Error) refused.push({ path: o.path, reason: 'it could not be read from the archive' });
    else files.push({ path: o.path, file: new File([bytes], name, { type: declaredTypeFor(name) }) });
  }
  return { ok: true, files, refused, skipped };
}

/** The one sentence said once an archive has been opened. */
export function archiveSummary(name: string, x: Extract<ArchiveExpansion, { ok: true }>): string {
  const parts = [`${name}: ${x.files.length} file${x.files.length === 1 ? '' : 's'} sent as separate uploads`];
  if (x.refused.length) parts.push(`${x.refused.length} not opened`);
  if (x.skipped.length) parts.push(`${x.skipped.length} skipped (folders and system files)`);
  return `${parts.join(', ')}. The archive itself is not kept.`;
}
