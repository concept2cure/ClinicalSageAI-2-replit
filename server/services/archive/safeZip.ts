/**
 * One bound on every ZIP the server inflates from outside (SEC-17, MR-08
 * Stage 3 step 2, docs/work-orders/MR-08-vault-upload-safety-and-document-control.md).
 *
 * DOCX, XLSX, PPTX, EPUB and eCTD packages are ZIP archives. Every reader in
 * this server (AdmZip, JSZip, mammoth, exceljs) inflates an entry whole into
 * memory, so a few kilobytes that expand a thousand-fold were read at full
 * size: a decompression bomb, from any upload or caller-supplied package.
 *
 * `assertZipWithinLimits` answers before any of them runs, in two steps:
 *
 *  1. **What the archive says.** It reads the central directory, ZIP64
 *     included, without inflating. It refuses on too many entries, too large a
 *     declared total, an entry over 1 MiB that claims more than 100:1, a name
 *     that is absolute or climbs out with `..`, an encrypted entry or an
 *     unknown method, and a directory it cannot read.
 *  2. **What the archive does.** Declared sizes are written by whoever made
 *     the file, so they can lie. Each entry is inflated as a stream that is
 *     counted and thrown away, chunk by chunk, so memory stays at one chunk.
 *     The stream stops the moment an entry passes its declared size or the
 *     total passes the limit. The work is bounded by the limits, not by the
 *     bomb.
 *
 * After both steps, the bytes a reader later inflates are the bytes measured:
 * the buffer is not re-read from anywhere.
 *
 * This takes the place of the work order's bounded per-entry reader. One check
 * before any inflate also covers the third-party readers (mammoth, exceljs) that
 * a bounded reader of our own cannot reach.
 */
import { createInflateRaw } from 'node:zlib';

export interface ZipLimits {
  maxEntries: number;
  maxTotalUncompressedBytes: number;
  /** An entry above this size is held to `maxRatio`. */
  ratioCheckAboveBytes: number;
  maxRatio: number;
}

export const DEFAULT_ZIP_LIMITS: Readonly<ZipLimits> = Object.freeze({
  maxEntries: 10_000,
  maxTotalUncompressedBytes: 512 * 1024 * 1024,
  ratioCheckAboveBytes: 1024 * 1024,
  maxRatio: 100,
});

export interface ZipEntryInfo {
  name: string;
  method: number;
  encrypted: boolean;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

/** A ZIP this server will not open, and why, in words a person can act on. */
export class ArchiveLimitError extends Error {
  readonly code = 'ARCHIVE_LIMITS_EXCEEDED' as const;
  constructor(readonly reason: string) {
    super(`This file is a compressed archive the server will not open: ${reason}. Nothing in it was read.`);
    this.name = 'ArchiveLimitError';
  }
}

const EOCD = 0x06054b50;
const ZIP64_LOCATOR = 0x07064b50;
const ZIP64_EOCD = 0x06064b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;
const MAX_COMMENT = 0xffff;
const STORED = 0;
const DEFLATED = 8;

const unreadable = () => new ArchiveLimitError('its directory could not be read');

/** A 64-bit little-endian size, refused when it cannot be a safe integer. */
function u64(buf: Buffer, at: number): number {
  const v = buf.readBigUInt64LE(at);
  if (v > BigInt(Number.MAX_SAFE_INTEGER)) throw unreadable();
  return Number(v);
}

function need(buf: Buffer, at: number, length: number): void {
  if (at < 0 || length < 0 || at + length > buf.length) throw unreadable();
}

function findEocd(buf: Buffer): number {
  const floor = Math.max(0, buf.length - 22 - MAX_COMMENT);
  for (let at = buf.length - 22; at >= floor; at--) {
    if (buf.readUInt32LE(at) === EOCD) return at;
  }
  throw unreadable();
}

/** Where the central directory is and how many entries it says it holds. */
function directoryOf(buf: Buffer): { entries: number; offset: number; size: number } {
  if (buf.length < 22) throw unreadable();
  const eocd = findEocd(buf);
  let entries = buf.readUInt16LE(eocd + 10);
  let size = buf.readUInt32LE(eocd + 12);
  let offset = buf.readUInt32LE(eocd + 16);
  if (buf.readUInt16LE(eocd + 4) !== 0 || buf.readUInt16LE(eocd + 6) !== 0) throw new ArchiveLimitError('it spans more than one disk');
  if (entries === 0xffff || size === 0xffffffff || offset === 0xffffffff) {
    const locator = eocd - 20;
    need(buf, locator, 20);
    if (buf.readUInt32LE(locator) !== ZIP64_LOCATOR) throw unreadable();
    const at = u64(buf, locator + 8);
    need(buf, at, 56);
    if (buf.readUInt32LE(at) !== ZIP64_EOCD) throw unreadable();
    entries = u64(buf, at + 32);
    size = u64(buf, at + 40);
    offset = u64(buf, at + 48);
  }
  need(buf, offset, size);
  return { entries, offset, size };
}

/** The ZIP64 extra field's sizes and offset, for the fields the entry marks as 0xFFFFFFFF. */
function zip64Extra(buf: Buffer, at: number, length: number, entry: ZipEntryInfo, raw: { comp: number; uncomp: number; local: number }): void {
  const end = at + length;
  let p = at;
  while (p + 4 <= end) {
    const id = buf.readUInt16LE(p);
    const size = buf.readUInt16LE(p + 2);
    if (id === 0x0001) {
      let q = p + 4;
      const take = () => { need(buf, q, 8); const v = u64(buf, q); q += 8; return v; };
      if (raw.uncomp === 0xffffffff) entry.uncompressedSize = take();
      if (raw.comp === 0xffffffff) entry.compressedSize = take();
      if (raw.local === 0xffffffff) entry.localHeaderOffset = take();
      return;
    }
    p += 4 + size;
  }
}

/** Every entry the central directory names, read without inflating anything. */
export function inspectZip(buf: Buffer, limits: ZipLimits = DEFAULT_ZIP_LIMITS): ZipEntryInfo[] {
  const dir = directoryOf(buf);
  if (dir.entries > limits.maxEntries) throw new ArchiveLimitError(`it holds ${dir.entries} files, more than ${limits.maxEntries}`);
  const entries: ZipEntryInfo[] = [];
  let p = dir.offset;
  for (let i = 0; i < dir.entries; i++) {
    need(buf, p, 46);
    if (buf.readUInt32LE(p) !== CENTRAL) throw unreadable();
    const flags = buf.readUInt16LE(p + 8);
    const raw = { comp: buf.readUInt32LE(p + 20), uncomp: buf.readUInt32LE(p + 24), local: buf.readUInt32LE(p + 42) };
    const nameLength = buf.readUInt16LE(p + 28);
    const extraLength = buf.readUInt16LE(p + 30);
    const commentLength = buf.readUInt16LE(p + 32);
    need(buf, p + 46, nameLength + extraLength + commentLength);
    const entry: ZipEntryInfo = {
      name: buf.toString(flags & 0x800 ? 'utf8' : 'latin1', p + 46, p + 46 + nameLength),
      method: buf.readUInt16LE(p + 10),
      encrypted: (flags & 0x1) !== 0,
      compressedSize: raw.comp,
      uncompressedSize: raw.uncomp,
      localHeaderOffset: raw.local,
    };
    zip64Extra(buf, p + 46 + nameLength, extraLength, entry, raw);
    entries.push(entry);
    p += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/** A name that is absolute, names a drive, holds a NUL or climbs with `..`. */
function unsafeName(name: string): boolean {
  if (/^[/\\]/.test(name) || /^[A-Za-z]:/.test(name) || name.includes('\0')) return true;
  return name.split(/[/\\]/).some((segment) => segment === '..');
}

/** Step 1: what the directory declares, against the limits. */
function assertDeclared(entries: ZipEntryInfo[], limits: ZipLimits): void {
  let total = 0;
  for (const e of entries) {
    if (unsafeName(e.name)) throw new ArchiveLimitError(`it names a file outside itself (${JSON.stringify(e.name.slice(0, 120))})`);
    if (e.encrypted) throw new ArchiveLimitError(`${e.name} is encrypted, so it cannot be checked`);
    if (e.method !== STORED && e.method !== DEFLATED) throw new ArchiveLimitError(`${e.name} uses compression method ${e.method}, which this server does not read`);
    total += e.uncompressedSize;
    if (total > limits.maxTotalUncompressedBytes) {
      throw new ArchiveLimitError(`it expands to more than ${limits.maxTotalUncompressedBytes} bytes`);
    }
    if (e.uncompressedSize > limits.ratioCheckAboveBytes && e.uncompressedSize > e.compressedSize * limits.maxRatio) {
      throw new ArchiveLimitError(`${e.name} expands more than ${limits.maxRatio} times its compressed size`);
    }
  }
}

/** Inflate one entry as a counted stream, stopping once it passes `cap` bytes. */
function inflatedLength(data: Buffer, cap: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const inflater = createInflateRaw();
    let length = 0;
    let settled = false;
    const finish = (fn: () => void) => { if (!settled) { settled = true; fn(); } };
    inflater.on('data', (chunk: Buffer) => {
      length += chunk.length;
      if (length > cap) finish(() => { inflater.destroy(); resolve(length); });
    });
    inflater.on('end', () => finish(() => resolve(length)));
    inflater.on('error', () => finish(() => reject(unreadable())));
    inflater.end(data);
  });
}

/** Where an entry's compressed bytes are, from its local header. */
function dataOf(buf: Buffer, e: ZipEntryInfo): Buffer {
  need(buf, e.localHeaderOffset, 30);
  if (buf.readUInt32LE(e.localHeaderOffset) !== LOCAL) throw unreadable();
  const start = e.localHeaderOffset + 30 + buf.readUInt16LE(e.localHeaderOffset + 26) + buf.readUInt16LE(e.localHeaderOffset + 28);
  need(buf, start, e.compressedSize);
  return buf.subarray(start, start + e.compressedSize);
}

/** Step 2: what each entry actually expands to. An entry that passes its declared size is lying. */
async function assertMeasured(buf: Buffer, entries: ZipEntryInfo[], limits: ZipLimits): Promise<void> {
  let total = 0;
  for (const e of entries) {
    const data = dataOf(buf, e);
    const actual = e.method === STORED ? data.length : await inflatedLength(data, e.uncompressedSize);
    if (actual > e.uncompressedSize) throw new ArchiveLimitError(`${e.name} expands to more than the size it declares`);
    total += actual;
    if (total > limits.maxTotalUncompressedBytes) {
      throw new ArchiveLimitError(`it expands to more than ${limits.maxTotalUncompressedBytes} bytes`);
    }
  }
}

/**
 * Refuse a ZIP that is too large, too many-fold compressed, names a path
 * outside itself, or cannot be read, before anything inflates it. Resolves to
 * its entries; throws ArchiveLimitError.
 */
export async function assertZipWithinLimits(buf: Buffer, limits: Partial<ZipLimits> = {}): Promise<ZipEntryInfo[]> {
  const bound: ZipLimits = { ...DEFAULT_ZIP_LIMITS, ...limits };
  const entries = inspectZip(buf, bound);
  assertDeclared(entries, bound);
  await assertMeasured(buf, entries, bound);
  return entries;
}
