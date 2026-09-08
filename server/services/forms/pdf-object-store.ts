/**
 * Reading indirect objects out of a PDF — including the compressed ones.
 *
 * The eSTAR templates keep their catalog as a top-level object, but the thing
 * an attachment must join to — the catalog's `/Names` dictionary — lives inside
 * an `ObjStm`: deflated, and enciphered under the object stream's own key. And
 * that dictionary holds `/JavaScript`, which is where the whole behaviour of
 * the form lives (the reveal guards, the 510(k)-summary rebuilds — see
 * `docs/reports/estar-acrobat-behaviour-2026-09-04.md`).
 *
 * So `/Names /EmbeddedFiles` cannot be added by writing a fresh dictionary over
 * the old one; the existing one has to be read and MERGED. Which is why this
 * module exists: `pdf-lib` cannot traverse the encrypted object streams of
 * these files, and the fill engine only ever needed top-level stream objects
 * (PDF forbids streams inside object streams, so every XFA packet is
 * necessarily top-level — see `fill-official-pdf`'s `indexTopLevelObjects`).
 *
 * SCOPE, stated rather than assumed. It reads cross-reference STREAMS, follows
 * `/Prev` chains, and refuses a classic `xref` table by name instead of
 * guessing at it. Both vendored FDA templates are single-xref-stream files
 * (measured 2026-09-07: nIVD 279 entries, no `/Prev`), so the classic path has
 * never been exercised by anything real and is better refused than approximated.
 *
 * @module server/services/forms/pdf-object-store
 */

import zlib from 'node:zlib';

import { decryptObjectData, startxrefOffset, type PdfSecurity } from './fill-official-pdf';

export interface PdfObjectLocation {
  /** 1 = at a byte offset; 2 = inside an object stream. */
  type: 1 | 2;
  /** type 1: the byte offset. type 2: the containing ObjStm's object number. */
  a: number;
  /** type 1: the generation. type 2: the index within that ObjStm. */
  b: number;
}

/** The raw bytes of the stream whose object header begins at `headerStart`. */
function streamBytesAt(buf: Buffer, headerStart: number): { dict: string; data: Buffer } {
  const raw = buf.toString('latin1', headerStart, Math.min(buf.length, headerStart + 4096));
  const kw = raw.indexOf('stream');
  if (kw < 0) throw new Error(`No stream at offset ${headerStart}`);
  const dict = raw.slice(0, kw);
  const lengthM = /\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(dict);
  if (!lengthM) throw new Error(`Stream at ${headerStart} has no direct /Length`);
  let start = headerStart + kw + 'stream'.length;
  if (buf[start] === 0x0d) start++;
  if (buf[start] === 0x0a) start++;
  return { dict, data: buf.subarray(start, start + parseInt(lengthM[1], 10)) };
}

/**
 * Undo a PNG predictor (`/Predictor` ≥ 10). The FDA templates use Up (filter 2)
 * on 5-byte rows, which is why this is not optional: without it the
 * cross-reference entries are differences, not values, and every offset read
 * from them is wrong in a way that still parses.
 */
function undoPngPredictor(data: Buffer, columns: number): Buffer {
  const out: number[] = [];
  let prev = new Uint8Array(columns);
  let i = 0;
  while (i < data.length) {
    const filter = data[i];
    i += 1;
    const row = new Uint8Array(data.subarray(i, i + columns));
    i += columns;
    if (filter === 2) {
      for (let j = 0; j < columns; j += 1) row[j] = (row[j] + prev[j]) & 0xff;
    } else if (filter === 1) {
      for (let j = 1; j < columns; j += 1) row[j] = (row[j] + row[j - 1]) & 0xff;
    } else if (filter !== 0) {
      throw new Error(`Unsupported PNG predictor filter ${filter} in a cross-reference stream`);
    }
    out.push(...row);
    prev = row;
  }
  return Buffer.from(out);
}

function readField(row: Buffer, offset: number, width: number, fallback: number): number {
  if (width === 0) return fallback;
  let value = 0;
  for (let i = 0; i < width; i += 1) value = value * 256 + row[offset + i];
  return value;
}

/**
 * Every object's location, newest revision winning.
 *
 * Sections are walked newest-first and an object already seen is left alone,
 * which is what makes an incrementally-updated file read correctly: the update
 * appended at the end of the file describes the current revision, and the
 * `/Prev` sections behind it describe what it replaced.
 */
export function readXrefTable(bytes: Uint8Array | Buffer): Map<number, PdfObjectLocation> {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const table = new Map<number, PdfObjectLocation>();
  const seenSections = new Set<number>();

  let offset: number | null = startxrefOffset(buf);
  while (offset !== null && !seenSections.has(offset)) {
    seenSections.add(offset);
    const head = buf.toString('latin1', offset, Math.min(buf.length, offset + 4096));
    if (/^\s*xref\b/.test(head)) {
      throw new Error(
        'This PDF uses a classic cross-reference table, which this reader does not implement. ' +
          'Both vendored FDA eSTAR templates use cross-reference streams.',
      );
    }

    const { dict, data } = streamBytesAt(buf, offset);
    // A cross-reference stream is never encrypted (PDF 32000-1 7.6.1), so it is
    // inflated directly — decrypting it would produce noise.
    let raw = /\/Filter\s*\/FlateDecode/.test(dict) ? zlib.inflateSync(data) : data;
    const columnsM = /\/Columns\s+(\d+)/.exec(dict);
    const predictorM = /\/Predictor\s+(\d+)/.exec(dict);
    if (predictorM && parseInt(predictorM[1], 10) >= 10) {
      raw = undoPngPredictor(raw, columnsM ? parseInt(columnsM[1], 10) : 1);
    }

    const wM = /\/W\s*\[([^\]]+)\]/.exec(dict);
    if (!wM) throw new Error('Cross-reference stream has no /W');
    const w = wM[1].trim().split(/\s+/).map((n) => parseInt(n, 10));
    const rowLength = w.reduce((a, b) => a + b, 0);

    const sizeM = /\/Size\s+(\d+)/.exec(dict);
    const indexM = /\/Index\s*\[([^\]]+)\]/.exec(dict);
    const index = indexM
      ? indexM[1].trim().split(/\s+/).map((n) => parseInt(n, 10))
      : [0, sizeM ? parseInt(sizeM[1], 10) : Math.floor(raw.length / rowLength)];

    let row = 0;
    for (let s = 0; s + 1 < index.length; s += 2) {
      for (let k = 0; k < index[s + 1]; k += 1, row += 1) {
        const at = row * rowLength;
        if (at + rowLength > raw.length) break;
        const entry = raw.subarray(at, at + rowLength);
        const type = readField(entry, 0, w[0], 1);
        if (type !== 1 && type !== 2) continue; // 0 = free
        const num = index[s] + k;
        if (table.has(num)) continue; // a newer section already described it
        table.set(num, {
          type: type as 1 | 2,
          a: readField(entry, w[0], w[1], 0),
          b: readField(entry, w[0] + w[1], w[2], 0),
        });
      }
    }

    const prevM = /\/Prev\s+(\d+)/.exec(dict);
    offset = prevM ? parseInt(prevM[1], 10) : null;
  }

  return table;
}

/** The `N G obj … endobj` body at a byte offset, without the wrapper. */
function objectBodyAt(buf: Buffer, offset: number): string | null {
  const raw = buf.toString('latin1', offset, buf.length);
  const header = /^\s*(\d+)\s+(\d+)\s+obj/.exec(raw);
  if (!header) return null;
  const start = header[0].length;
  const end = raw.indexOf('endobj', start);
  return raw.slice(start, end < 0 ? undefined : end).trim();
}

/**
 * The text of one indirect object, wherever it lives.
 *
 * Returns null when the file has no such object — a fact, not a failure. A
 * compressed object is decrypted under its CONTAINING stream's key and then
 * inflated; the object's own number never keys anything, which is the detail
 * that makes this different from every other read in the fill engine.
 */
export function readIndirectObjectText(
  bytes: Uint8Array | Buffer,
  sec: PdfSecurity,
  num: number,
  table?: Map<number, PdfObjectLocation>,
): string | null {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const xref = table ?? readXrefTable(buf);
  const loc = xref.get(num);
  if (!loc) return null;

  if (loc.type === 1) return objectBodyAt(buf, loc.a);

  const container = xref.get(loc.a);
  if (!container || container.type !== 1) return null;
  const { dict, data } = streamBytesAt(buf, container.a);
  const decrypted = decryptObjectData(sec, loc.a, 0, data);
  const inflated = /\/Filter\s*\/FlateDecode/.test(dict) ? zlib.inflateSync(decrypted) : decrypted;

  const nM = /\/N\s+(\d+)/.exec(dict);
  const firstM = /\/First\s+(\d+)/.exec(dict);
  if (!nM || !firstM) throw new Error(`Object stream ${loc.a} has no /N or /First`);
  const count = parseInt(nM[1], 10);
  const first = parseInt(firstM[1], 10);

  // The header is `N pairs of (object number, offset-from-/First)`.
  const header = inflated.toString('latin1', 0, first).trim().split(/\s+/).map(Number);
  const offsets: { num: number; at: number }[] = [];
  for (let i = 0; i < count; i += 1) {
    offsets.push({ num: header[i * 2], at: header[i * 2 + 1] });
  }
  const slot = offsets[loc.b];
  if (!slot || slot.num !== num) {
    // The xref pointed at a slot that does not hold this object: the file
    // disagrees with itself, which is worth saying rather than returning
    // whatever happens to be there.
    const found = offsets.find((o) => o.num === num);
    if (!found) return null;
    return sliceObject(inflated, first, offsets, offsets.indexOf(found));
  }
  return sliceObject(inflated, first, offsets, loc.b);
}

function sliceObject(
  inflated: Buffer,
  first: number,
  offsets: { num: number; at: number }[],
  i: number,
): string {
  const start = first + offsets[i].at;
  const end = i + 1 < offsets.length ? first + offsets[i + 1].at : inflated.length;
  return inflated.toString('latin1', start, end).trim();
}
