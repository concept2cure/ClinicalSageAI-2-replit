/**
 * Whether a PDF leaf's security settings let it ship in an eCTD sequence.
 *
 * One rule, used everywhere a leaf's bytes are judged: the v3.2.2 packager, the
 * v4.0 RPS packager, and the transmit guard that re-reads the signed bundle.
 *
 * ── The rule ────────────────────────────────────────────────────────────────
 * The eCTD PDF specifications prohibit security settings. FDA makes one
 * exception, for its own forms: forms "available from the FDA website may
 * contain security settings that prevent changing the essential elements of
 * the form … these forms should be submitted with their existing security
 * settings" (FDA, Electronic Submission File Formats and Specifications —
 * PDF security; see docs/evidence/W5/2026-09-22/README.md for how that text was
 * sourced).
 *
 * The packager refused every PDF with an /Encrypt entry. The official Form FDA
 * 1571 and 3674 are FDA-secured (AESV2, empty user password), and the platform
 * fills them by incremental update so every byte FDA issued is preserved. So the
 * m1.1 transmittal form of every IND sequence was refused with LEAF-ENCRYPTED:
 * the sequence the launch row D7 needs could not be packaged at all.
 *
 * ── How "an FDA form as issued" is established ──────────────────────────────
 * Deterministically, from bytes, never from a name, a section code or a flag:
 *   1. region is FDA;
 *   2. the leaf BEGINS WITH the exact bytes of a vendored FDA form template
 *      whose sha256 matches its manifest (an incremental update appends; it
 *      never rewrites what came before);
 *   3. everything appended after the template keeps the template's own
 *      encryption: every /Encrypt it carries points at the template's
 *      encryption dictionary, and it does not redefine that object;
 *   4. a reader agrees: pdf.js opens the leaf with no password, with the same
 *      permissions and the same document ID as the FDA template;
 *   5. what a conformant reader starts from agrees too, read from the bytes:
 *      every cross-reference section appended after the template — each
 *      `trailer` dictionary, each /Type /XRef stream dictionary, the one the
 *      final startxref points at and each /Prev back to the template's own —
 *      carries /Encrypt to FDA's dictionary and FDA's /ID[0], and none lists
 *      FDA's encryption dictionary as an object of its own;
 *   6. every file embedded in it is judged by this rule with no exception (an
 *      attachment is never an FDA form as issued).
 * Anything else with an /Encrypt entry is refused, with the reason.
 *
 * Why step 4 (2026-09-22, adversarial review of this module): steps 1-3 read
 * text, and the encryption a reader uses is not text. The dictionary can be
 * redefined as `047 0 obj`, `47 00 obj`, with a comment before `obj`, or
 * inside a compressed object stream through an xref-stream entry; and a new
 * /ID changes the R4 key. Each produced a form that needs a password yet
 * passed as issued. Opening it the way a reader does is the one check that
 * covers every such shape; the text checks stay, for their precise reasons.
 *
 * Why step 5 (2026-09-23, W5/D7, round-2 review): that last claim was wrong.
 * pdf.js is lenient where the spec is not. An appended cross-reference stream
 * with one entry of type 3 (ISO 32000-1 Table 18: a reference to the null
 * object) makes pdf.js throw, index the whole file, and fall back to the first
 * cross-reference stream in file order — FDA's own. It then opened, with FDA's
 * /ID and FDA's encryption dictionary, a form whose appended section carried a
 * new /ID, no /Encrypt, or an entry moving object 47 into an object stream;
 * qpdf and pypdf follow the appended section, as the spec requires, and ask
 * for a password. Step 4 still runs first, so that when both refuse, the
 * reason given is the password prompt a person would meet.
 *
 * Why step 6 (2026-09-23, W5/D7, round-2 review): a file embedded in a filled
 * eSTAR is enciphered with the eSTAR's own key, so its own /Encrypt is not in
 * the raw bytes, and a secured PDF inside an FDA form passed as the form.
 *
 * A sponsor-completed form qualifies when the tool that completed it saved
 * incrementally (Acrobat does for a rights-enabled FDA form). A re-saved,
 * rewritten or different edition does not, and the refusal says so.
 *
 * @module server/services/ectd/leaf-pdf-security
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { isPdfLeaf, pdfNameOffsets } from './pdfa-detect';
import { indFormTemplatesDir } from '../ind-forms/template-locations';
import { listVendoredTemplates, resolveEstarTemplateDir } from '../pathway-engines/estar/estar-template-registry';

export type LeafPdfSecurity =
  /** No /Encrypt entry anywhere in the file. */
  | { verdict: 'unsecured' }
  /** An FDA form carrying the security settings FDA issued it with. */
  | { verdict: 'fda-form-as-issued'; formId: string; edition: string | null }
  /** Secured, and not an exception. The packager and transmit refuse it. */
  | { verdict: 'secured'; reason: string };

interface SecuredFormTemplate {
  formId: string;
  edition: string | null;
  length: number;
  sha256: string;
  head: Buffer;
  /** `N G` of every /Encrypt reference in the template. */
  encryptRefs: Set<string>;
  /** The first /ID string of the section the template's final startxref points at. */
  id0: Buffer;
  /** The offset the template's own final startxref gives: where a first update's /Prev points. */
  startxref: number;
  /** What pdf.js reports for the template opened with no password. */
  reader: { permissions: string; fingerprint: string };
}

/** A file embedded in the document, as a reader lists it; null content when it cannot be read. */
interface EmbeddedFile {
  name: string;
  content: Uint8Array | null;
}

/**
 * Open a PDF the way a reader does — pdf.js, empty user password — and report
 * its permissions and first document-ID fingerprint, or why it would not open.
 * With `withAttachments`, also the files embedded in it (null when the reader
 * cannot list them).
 */
async function openAsReader(
  bytes: Uint8Array,
  withAttachments = false,
): Promise<
  | { ok: true; permissions: string; fingerprint: string; attachments: EmbeddedFile[] | null }
  | { ok: false; reason: string }
> {
  try {
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    // A copy: pdf.js may take ownership of the buffer it is handed.
    const task = getDocument({ data: new Uint8Array(bytes), password: '', verbosity: 0, isEvalSupported: false, disableFontFace: true });
    const doc = await task.promise;
    try {
      const permissions = JSON.stringify((await doc.getPermissions()) ?? null);
      const fingerprint = String((doc as unknown as { fingerprints?: Array<string | null> }).fingerprints?.[0] ?? '');
      let attachments: EmbeddedFile[] | null = [];
      if (withAttachments) {
        try {
          const listed = ((await doc.getAttachments()) ?? {}) as Record<string, { filename?: string; content?: Uint8Array | null }>;
          attachments = Object.entries(listed).map(([key, a]) => ({ name: a?.filename || key, content: a?.content ?? null }));
        } catch {
          attachments = null;
        }
      }
      return { ok: true, permissions, fingerprint, attachments };
    } finally {
      await doc.destroy();
    }
  } catch (err) {
    const e = err as { name?: string; message?: string };
    return {
      ok: false,
      reason: e?.name === 'PasswordException' ? 'a reader asks for a password to open it' : `a reader cannot open it (${e?.message ?? String(err)})`,
    };
  }
}

// ── PDF syntax, read from the bytes ─────────────────────────────────────────
//
// 2026-09-23 (W5/D7, round-2 review): what a conformant reader starts from —
// the dictionary the final startxref points at, each /Prev behind it, and
// every `trailer` and /Type /XRef dictionary a rebuilding reader could fall
// back to — read as PDF syntax (ISO 32000-1 §7.2-7.5), not through pdf.js,
// whose recovery lands on the template's own section. The /Encrypt reference
// reader uses the same tokens (it was a 64-byte regex window).

const PDF_WHITESPACE = new Set([0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20]);
const PDF_DELIMITERS = new Set([0x28, 0x29, 0x3c, 0x3e, 0x5b, 0x5d, 0x7b, 0x7d, 0x2f, 0x25]);
const isRegular = (c: number | undefined) => c !== undefined && !PDF_WHITESPACE.has(c) && !PDF_DELIMITERS.has(c);
/** Nesting deeper than any trailer needs is refused rather than followed. */
const MAX_NESTING = 32;
/** An /ID string is 16 bytes; one far past that is not the template's, and is not read. */
const MAX_ID_STRING = 4096;
const view = (bytes: Uint8Array) => Buffer.from(bytes.buffer, bytes.byteOffset, bytes.length);

interface PdfDictEntry {
  /** The decoded key name, without the slash. */
  key: string;
  /** Offset of the key's `/`. */
  at: number;
  valueStart: number;
  valueEnd: number;
}

/** Past whitespace and comments. */
function skipBlank(b: Buffer, i: number): number {
  while (i < b.length && (PDF_WHITESPACE.has(b[i]) || b[i] === 0x25)) {
    if (b[i] === 0x25) while (i < b.length && b[i] !== 0x0a && b[i] !== 0x0d) i++;
    else i++;
  }
  return i;
}

function hexValue(c: number): number {
  if (c >= 0x30 && c <= 0x39) return c - 0x30;
  if (c >= 0x41 && c <= 0x46) return c - 0x37;
  return c >= 0x61 && c <= 0x66 ? c - 0x57 : -1;
}

/** End of the regular-character run starting at `i`. */
function tokenEnd(b: Buffer, i: number): number {
  while (i < b.length && isRegular(b[i])) i++;
  return i;
}

/** A name token's characters `from`..`to`, #-escapes decoded as every reader decodes them. */
function decodeName(b: Buffer, from: number, to: number): string {
  let s = '';
  for (let j = from; j < to; j++) {
    const escaped = b[j] === 0x23 && j + 2 < to && hexValue(b[j + 1]) >= 0 && hexValue(b[j + 2]) >= 0;
    s += String.fromCharCode(escaped ? hexValue(b[j + 1]) * 16 + hexValue(b[j + 2]) : b[j]);
    if (escaped) j += 2;
  }
  return s;
}

/** True when the keyword `kw` stands at `i` as a token of its own (not inside a name or a longer word). */
function keywordAt(b: Buffer, i: number, kw: string): boolean {
  if (i < 0 || i + kw.length > b.length || b.toString('latin1', i, i + kw.length) !== kw) return false;
  const before = i > 0 ? b[i - 1] : 0x20;
  return !isRegular(before) && before !== 0x2f && !isRegular(b[i + kw.length]);
}

/** The non-negative integer token at `i`, or null. */
function readUint(b: Buffer, i: number): { value: number; end: number } | null {
  const end = tokenEnd(b, i);
  const text = b.toString('latin1', i, end);
  return /^\d{1,15}$/.test(text) ? { value: Number(text), end } : null;
}

/** The indirect reference `N G R` at `i` (blanks before it allowed) as "N G", and where it ends. */
function readRef(b: Buffer, i: number): { ref: string; end: number } | null {
  const n = readUint(b, skipBlank(b, i));
  const g = n && readUint(b, skipBlank(b, n.end));
  const r = g ? skipBlank(b, g.end) : -1;
  return n && g && keywordAt(b, r, 'R') ? { ref: `${n.value} ${g.value}`, end: r + 1 } : null;
}

/** The indirect reference an /Encrypt name at `offset` points at, or null. */
function encryptRefAt(bytes: Uint8Array, offset: number): string | null {
  const b = view(bytes);
  // Skip the name token itself (it may be #-escaped, so find its end).
  return readRef(b, tokenEnd(b, offset + 1))?.ref ?? null;
}

function literalStringEnd(b: Buffer, i: number): number {
  for (let j = i, depth = 0; j < b.length; j++) {
    if (b[j] === 0x5c) j++;
    else if (b[j] === 0x28) depth++;
    else if (b[j] === 0x29 && --depth === 0) return j + 1;
  }
  return -1;
}

function arrayEnd(b: Buffer, i: number, depth: number): number {
  for (let j = skipBlank(b, i + 1); j >= 0 && j < b.length; j = j < 0 ? j : skipBlank(b, j)) {
    if (b[j] === 0x5d) return j + 1;
    j = valueEnd(b, j, depth);
  }
  return -1;
}

/** End of the direct object starting at `i`, or -1 when none can be read there. */
function valueEnd(b: Buffer, i: number, depth: number): number {
  if (depth > MAX_NESTING || i >= b.length) return -1;
  switch (b[i]) {
    case 0x3c: {
      const close = b.indexOf(0x3e, i + 1);
      return b[i + 1] === 0x3c ? (readDict(b, i, depth + 1)?.end ?? -1) : close < 0 ? -1 : close + 1;
    }
    case 0x28:
      return literalStringEnd(b, i);
    case 0x5b:
      return arrayEnd(b, i, depth + 1);
    case 0x2f:
      return tokenEnd(b, i + 1);
    default:
      return isRegular(b[i]) ? (readRef(b, i)?.end ?? tokenEnd(b, i)) : -1;
  }
}

/** The top-level entries of the dictionary whose `<<` is at `i`, or null when it cannot be read. */
function readDict(b: Buffer, i: number, depth = 0): { entries: PdfDictEntry[]; end: number } | null {
  if (depth > MAX_NESTING || b[i] !== 0x3c || b[i + 1] !== 0x3c) return null;
  const entries: PdfDictEntry[] = [];
  for (let j = skipBlank(b, i + 2); j < b.length; j = skipBlank(b, j)) {
    if (b[j] === 0x3e) return b[j + 1] === 0x3e ? { entries, end: j + 2 } : null;
    const keyEnd = tokenEnd(b, j + 1);
    const valueStart = skipBlank(b, keyEnd);
    const end = b[j] === 0x2f ? valueEnd(b, valueStart, depth) : -1;
    if (end < 0) return null;
    entries.push({ key: decodeName(b, j + 1, keyEnd), at: j, valueStart, valueEnd: end });
    j = end;
  }
  return null;
}

function readHexString(b: Buffer, i: number): Buffer | null {
  const end = b.indexOf(0x3e, i + 1);
  const nibbles = end < 0 || end - i > 2 * MAX_ID_STRING ? [-1] : [...b.subarray(i + 1, end)].filter((c) => !PDF_WHITESPACE.has(c)).map(hexValue);
  if (nibbles.some((v) => v < 0)) return null;
  if (nibbles.length % 2 === 1) nibbles.push(0);
  return Buffer.from(nibbles.filter((_, k) => k % 2 === 0).map((hi, k) => hi * 16 + nibbles[2 * k + 1]));
}

const LITERAL_ESCAPES: Record<number, number> = { 0x6e: 0x0a, 0x72: 0x0d, 0x74: 0x09, 0x62: 0x08, 0x66: 0x0c };

/** The escape whose first byte after the backslash is at `j`: the bytes it stands for, and where it ends. */
function literalEscape(b: Buffer, j: number): { out: number[]; end: number } {
  if (b[j] >= 0x30 && b[j] <= 0x37) {
    let end = j + 1;
    while (end < j + 3 && b[end] >= 0x30 && b[end] <= 0x37) end++;
    return { out: [parseInt(b.toString('latin1', j, end), 8) & 0xff], end };
  }
  // A backslash before an end-of-line continues the string on the next line.
  if (b[j] === 0x0d || b[j] === 0x0a) return { out: [], end: b[j] === 0x0d && b[j + 1] === 0x0a ? j + 2 : j + 1 };
  return { out: [LITERAL_ESCAPES[b[j]] ?? b[j]], end: j + 1 };
}

function readLiteralString(b: Buffer, i: number): Buffer | null {
  const out: number[] = [];
  let depth = 1;
  for (let j = i + 1; j < b.length && out.length <= MAX_ID_STRING; ) {
    if (b[j] === 0x5c) {
      const e = literalEscape(b, j + 1);
      out.push(...e.out);
      j = e.end;
      continue;
    }
    depth += b[j] === 0x28 ? 1 : b[j] === 0x29 ? -1 : 0;
    if (depth === 0) return Buffer.from(out);
    // An end-of-line in a literal string reads as a single line feed.
    out.push(b[j] === 0x0d ? 0x0a : b[j]);
    j += b[j] === 0x0d && b[j + 1] === 0x0a ? 2 : 1;
  }
  return null;
}

/** The first string of an /ID value (`[<…><…>]` or `[(…)(…)]`), as bytes, or null. */
function firstIdString(b: Buffer, e: PdfDictEntry): Buffer | null {
  const s = b[e.valueStart] === 0x5b ? skipBlank(b, e.valueStart + 1) : -1;
  if (b[s] === 0x28) return readLiteralString(b, s);
  return b[s] === 0x3c && b[s + 1] !== 0x3c ? readHexString(b, s) : null;
}

/** The integer after the LAST `startxref` in the file, or null. */
function finalStartxref(b: Buffer): number | null {
  const at = b.lastIndexOf('startxref');
  return at < 0 ? null : (readUint(b, skipBlank(b, at + 9))?.value ?? null);
}

/** The value of `key` when the dictionary carries it exactly once as a non-negative integer, else null. */
function uniqueUint(b: Buffer, entries: PdfDictEntry[], key: string): number | null {
  const found = entries.filter((e) => e.key === key);
  return found.length === 1 ? (readUint(b, found[0].valueStart)?.value ?? null) : null;
}

/** A cross-reference section: its dictionary, and the object numbers it lists as [first, count] runs. */
interface XrefSection {
  at: number;
  entries: PdfDictEntry[];
  /** Null when the section does not say which objects it lists. */
  ranges: Array<[number, number]> | null;
}

/** The runs a cross-reference stream lists: /Index, or [0 /Size] without one (§7.5.8.2). */
function streamRanges(b: Buffer, entries: PdfDictEntry[]): Array<[number, number]> | null {
  const index = entries.filter((e) => e.key === 'Index');
  if (index.length === 0) {
    const size = uniqueUint(b, entries, 'Size');
    return size === null ? null : [[0, size]];
  }
  const nums: number[] = [];
  for (let j = index.length === 1 && b[index[0].valueStart] === 0x5b ? skipBlank(b, index[0].valueStart + 1) : -1; j >= 0 && b[j] !== 0x5d; ) {
    const n = readUint(b, j);
    if (!n) return null;
    nums.push(n.value);
    j = skipBlank(b, n.end);
  }
  if (nums.length === 0 || nums.length % 2 === 1) return null;
  return nums.filter((_, k) => k % 2 === 0).map((first, k): [number, number] => [first, nums[2 * k + 1]]);
}

/** Past `count` entries of a cross-reference table (`offset generation n|f`), or -1. */
function skipXrefEntries(b: Buffer, j: number, count: number): number {
  for (let k = 0; k < count && j >= 0; k++) {
    const off = readUint(b, j);
    const gen = off && readUint(b, skipBlank(b, off.end));
    const kind = gen ? skipBlank(b, gen.end) : -1;
    j = keywordAt(b, kind, 'n') || keywordAt(b, kind, 'f') ? skipBlank(b, kind + 1) : -1;
  }
  return j;
}

/** The `xref` table at `p`, with the trailer after its subsections. */
function readXrefTableAt(b: Buffer, p: number): XrefSection | null {
  const ranges: Array<[number, number]> = [];
  let j = skipBlank(b, p + 4);
  while (j >= 0 && !keywordAt(b, j, 'trailer')) {
    const first = readUint(b, j);
    const count = first && readUint(b, skipBlank(b, first.end));
    if (!first || !count) return null;
    ranges.push([first.value, count.value]);
    j = skipXrefEntries(b, skipBlank(b, count.end), count.value);
  }
  const dict = j >= 0 ? readDict(b, skipBlank(b, j + 7)) : null;
  return dict && { at: j, entries: dict.entries, ranges };
}

/** True when the dictionary carries /Type, and every /Type it carries is /XRef. */
function declaresXRef(b: Buffer, entries: PdfDictEntry[]): boolean {
  const type = entries.filter((e) => e.key === 'Type');
  return type.length > 0 && type.every((e) => b[e.valueStart] === 0x2f && decodeName(b, e.valueStart + 1, e.valueEnd) === 'XRef');
}

/**
 * The cross-reference section at byte `offset` (blanks before it allowed, as
 * readers allow them): an `xref` table with its trailer, or an `N G obj` whose
 * dictionary declares /Type /XRef. Null when neither can be read there.
 */
function sectionAt(b: Buffer, offset: number): XrefSection | null {
  const p = skipBlank(b, offset);
  if (keywordAt(b, p, 'xref')) return readXrefTableAt(b, p);
  const num = readUint(b, p);
  const gen = num && readUint(b, skipBlank(b, num.end));
  const obj = gen ? skipBlank(b, gen.end) : -1;
  const dict = keywordAt(b, obj, 'obj') ? readDict(b, skipBlank(b, obj + 3)) : null;
  return dict && declaresXRef(b, dict.entries) ? { at: p, entries: dict.entries, ranges: streamRanges(b, dict.entries) } : null;
}

/** End of the last `kw` keyword before `at` and at or after `from`, or -1. */
function lastKeywordEnd(b: Buffer, kw: string, at: number, from: number): number {
  for (let i = b.lastIndexOf(kw, at); i >= from; i = i > 0 ? b.lastIndexOf(kw, i - 1) : -1) {
    if (keywordAt(b, i, kw)) return i + kw.length;
  }
  return -1;
}

/**
 * Every `trailer` dictionary and every dictionary declaring /Type /XRef from
 * `from` on: what a reader rebuilding the file falls back to. A string when one
 * cannot be read. A trailer's table is judged where the /Prev chain reaches it.
 */
function fallbackSections(b: Buffer, from: number): XrefSection[] | string {
  const out: XrefSection[] = [];
  for (let i = b.indexOf('trailer', from); i >= 0; i = b.indexOf('trailer', i + 1)) {
    const dict = keywordAt(b, i, 'trailer') ? readDict(b, skipBlank(b, i + 7)) : undefined;
    if (dict === null) return `an appended trailer (byte ${i}) cannot be read`;
    if (dict) out.push({ at: i, entries: dict.entries, ranges: [] });
  }
  for (const rel of pdfNameOffsets(b.subarray(from), 'Type')) {
    const at = from + rel;
    const v = skipBlank(b, tokenEnd(b, at + 1));
    if (b[v] !== 0x2f || decodeName(b, v + 1, tokenEnd(b, v + 1)) !== 'XRef') continue;
    // Its dictionary opens after the nearest `obj` (or `trailer`) keyword before it.
    const opener = Math.max(lastKeywordEnd(b, 'obj', at, from), lastKeywordEnd(b, 'trailer', at, from));
    const dict = opener < 0 ? null : readDict(b, skipBlank(b, opener));
    if (!dict?.entries.some((e) => e.at === at)) return `an appended cross-reference stream dictionary (byte ${at}) cannot be read`;
    out.push({ at, entries: dict.entries, ranges: streamRanges(b, dict.entries) });
  }
  return out;
}

/**
 * Why the section does not keep FDA's encryption, or null when it does: it
 * carries /Encrypt to the template's dictionary and an /ID whose first string
 * is the template's (the R4 key is derived from it), and it lists no entry for
 * the encryption dictionary. An incremental save lists only the objects it
 * wrote, and FDA's encryption dictionary is never one of them; an entry for it
 * — to a new object, into an object stream, or to null — is a different
 * dictionary to a reader that follows this section.
 */
function sectionProblem(b: Buffer, s: XrefSection, t: SecuredFormTemplate): string | null {
  const where = `an appended cross-reference section (byte ${s.at})`;
  const refs = s.entries.filter((e) => e.key === 'Encrypt').map((e) => encryptRefAt(b, e.at));
  if (refs.length === 0) return `${where} carries no /Encrypt, so a reader that follows it reads FDA's encrypted content as plain`;
  const foreign = refs.find((r) => r === null || !t.encryptRefs.has(r));
  if (foreign !== undefined) return `${where} carries /Encrypt ${foreign ?? 'that is not an indirect reference'}`;
  const ids = s.entries.filter((e) => e.key === 'ID').map((e) => firstIdString(b, e));
  if (ids.length === 0) return `${where} carries no document ID (/ID), from which a reader derives the key`;
  if (ids.some((id) => id === null || !id.equals(t.id0))) {
    return `${where} carries a different document ID (/ID) from the form FDA issued, so a reader derives a different key and asks for a password`;
  }
  if (s.ranges === null) return `${where} does not say which objects it lists`;
  const listed = [...t.encryptRefs].map((r) => Number(r.split(' ')[0])).find((n) => s.ranges!.some(([first, count]) => n >= first && n < first + count));
  return listed === undefined ? null : `${where} lists object ${listed}, FDA's encryption dictionary, so a reader that follows it reads a different one`;
}

/**
 * Step 5: what a conformant reader starts from, read from the bytes. Every
 * section appended after the template (from `from` on) keeps FDA's encryption
 * (sectionProblem); the final startxref points at one of them; and its /Prev
 * chain, with any /XRefStm, leads back to the template's own section. Null
 * when all of that holds; otherwise why not.
 */
function appendedSectionsProblem(b: Buffer, from: number, t: SecuredFormTemplate): string | null {
  const fallback = fallbackSections(b, from);
  if (typeof fallback === 'string') return fallback;
  for (const s of fallback) {
    const problem = sectionProblem(b, s, t);
    if (problem) return problem;
  }
  // With no startxref appended, a reader starts from FDA's own section, which
  // is sound only while nothing appended claims to be a section of its own.
  if (b.lastIndexOf('startxref') < from) {
    return fallback.length === 0 ? null : 'its appended cross-reference section is not the one a reader starts from (no startxref follows it)';
  }
  // The final startxref names one of the appended sections — pointed back at
  // FDA's own, the appended ones are never read — and each /Prev leads on
  // until FDA's own section.
  let offset = finalStartxref(b);
  if (offset === null || offset < from) return 'its final startxref does not point at a cross-reference section appended after the form FDA issued';
  const seen = new Set<number>();
  let where = 'its final startxref';
  while (offset !== t.startxref) {
    const s = offset !== null && offset >= from && !seen.has(offset) ? sectionAt(b, offset) : null;
    if (!s || offset === null) return `${where} does not point at a cross-reference section appended after the form FDA issued, or at FDA's own`;
    seen.add(offset);
    // A hybrid table's /XRefStm adds a stream's entries to it.
    const stms = s.entries.filter((e) => e.key === 'XRefStm').map((e) => readUint(b, e.valueStart)?.value ?? -1);
    const problem = [s, ...stms.map((o) => (o >= from ? sectionAt(b, o) : null))]
      .map((x) => (x ? sectionProblem(b, x, t) : `the /XRefStm of an appended cross-reference section (byte ${s.at}) cannot be followed`))
      .find((p) => p !== null);
    if (problem) return problem;
    offset = uniqueUint(b, s.entries, 'Prev');
    where = `the /Prev of an appended cross-reference section (byte ${s.at})`;
  }
  return null;
}

/** A template's own first /ID string and final startxref, as a conformant reader reads them; null when unreadable. */
function templateTrailer(bytes: Buffer): { id0: Buffer; startxref: number } | null {
  const startxref = finalStartxref(bytes);
  const own = startxref === null ? null : sectionAt(bytes, startxref);
  const idEntry = own?.entries.find((e) => e.key === 'ID');
  const id0 = idEntry ? firstIdString(bytes, idEntry) : null;
  return startxref !== null && id0 ? { id0, startxref } : null;
}

/**
 * Step 6: why a file embedded in the form keeps it from qualifying, or null.
 * Each embedded PDF is judged by this rule with no exception; one that cannot
 * be read cannot be judged, and is refused.
 */
async function embeddedFilesProblem(files: EmbeddedFile[] | null): Promise<string | null> {
  if (files === null) return 'a reader cannot list the files embedded in it, so their security settings cannot be established';
  for (const f of files) {
    if (f.content === null) return `its embedded file "${f.name}" cannot be read, so its security settings cannot be established`;
    const inner = isPdfLeaf(f.name, f.content) ? await assessLeafPdfSecurity(f.content, null) : null;
    if (inner?.verdict === 'secured') {
      return `its embedded file "${f.name}" is a secured PDF (${inner.reason}); remove the security settings from that file and attach it again`;
    }
  }
  return null;
}

/** A verified FDA form as a SecuredFormTemplate, or null when it is not secured or cannot be read. */
async function securedTemplate(c: { formId: string; edition: string | null; bytes: Buffer }): Promise<SecuredFormTemplate | null> {
  const refs = pdfNameOffsets(c.bytes, 'Encrypt').map((o) => encryptRefAt(c.bytes, o));
  if (refs.length === 0 || refs.some((r) => r === null)) return null;
  // The document ID the R4 key is derived from, as a conformant reader reads
  // it: from the section the template's own startxref points at (2026-09-23).
  const trailer = templateTrailer(c.bytes);
  const reader = trailer ? await openAsReader(c.bytes) : null;
  if (!trailer || !reader?.ok) return null;
  return {
    formId: c.formId,
    edition: c.edition,
    length: c.bytes.length,
    sha256: createHash('sha256').update(c.bytes).digest('hex'),
    head: c.bytes.subarray(0, 1024),
    encryptRefs: new Set(refs as string[]),
    ...trailer,
    reader: { permissions: reader.permissions, fingerprint: reader.fingerprint },
  };
}

const templateCache = new Map<string, Promise<SecuredFormTemplate[]>>();

/**
 * The vendored FDA form templates that are themselves secured, each verified
 * against its manifest's sha256. A template whose bytes do not match its
 * manifest grants nothing: the exemption rests on knowing exactly what FDA
 * issued.
 */
async function loadSecuredFdaFormTemplates(): Promise<SecuredFormTemplate[]> {
  const dir = indFormTemplatesDir();
  const estarDir = resolveEstarTemplateDir();
  const key = `${dir}|${estarDir}`;
  let cached = templateCache.get(key);
  if (!cached) {
    cached = (async () => {
      // Every FDA-issued form the platform vendors, each verified against its
      // own pin: the IND forms by their manifest's sha256, the eSTAR templates
      // by assets/estar-templates/checksums.txt (2026-09-22: an eSTAR bundle is
      // an FDA ESG transmit too, and the official eSTAR is FDA-secured).
      const candidates: Array<{ formId: string; edition: string | null; bytes: Buffer }> = [];
      let names: string[];
      try {
        names = await fs.readdir(dir);
      } catch {
        names = [];
      }
      for (const name of names.filter((n) => /^FDA_.+\.pdf$/i.test(n)).sort()) {
        try {
          const manifest = JSON.parse(await fs.readFile(path.join(dir, `${name}.manifest.json`), 'utf8'));
          const bytes = await fs.readFile(path.join(dir, name));
          const sha256 = createHash('sha256').update(bytes).digest('hex');
          if (typeof manifest?.sha256 !== 'string' || manifest.sha256.toLowerCase() !== sha256) continue;
          candidates.push({
            formId: typeof manifest.formId === 'string' ? manifest.formId : name.replace(/\.pdf$/i, ''),
            edition: typeof manifest.edition === 'string' ? manifest.edition : null,
            bytes,
          });
        } catch {
          // No manifest, unreadable, or not JSON: not a verified FDA form.
        }
      }
      for (const t of await listVendoredTemplates(estarDir)) {
        if (t.integrity !== 'verified') continue;
        candidates.push({ formId: `eSTAR ${t.fileName.replace(/\.pdf$/i, '')}`, edition: null, bytes: Buffer.from(t.bytes) });
      }

      const out: SecuredFormTemplate[] = [];
      for (const c of candidates) {
        const t = await securedTemplate(c);
        if (t) out.push(t);
      }
      return out;
    })();
    templateCache.set(key, cached);
  }
  return cached;
}

/** Test seam: forget loaded templates (tests install a synthetic edition). */
export function clearLeafSecurityTemplateCache(): void {
  templateCache.clear();
}

const SPEC_REASON = 'the eCTD PDF specification prohibits security settings';

/**
 * Judge a PDF leaf's security settings for an eCTD sequence to `region`.
 * `region` is the packager/gateway region key ('fda', 'ema', 'pmda', …); pass
 * null when the destination is not known, which grants no exception.
 */
export async function assessLeafPdfSecurity(
  bytes: Uint8Array,
  region: string | null,
): Promise<LeafPdfSecurity> {
  const offsets = pdfNameOffsets(bytes, 'Encrypt');
  if (offsets.length === 0) return { verdict: 'unsecured' };

  if (region !== 'fda') {
    return { verdict: 'secured', reason: `it carries an /Encrypt entry; ${SPEC_REASON}` };
  }

  for (const t of await loadSecuredFdaFormTemplates()) {
    if (bytes.length < t.length) continue;
    if (!Buffer.from(bytes.buffer, bytes.byteOffset, t.head.length).equals(t.head)) continue;
    const prefix = Buffer.from(bytes.buffer, bytes.byteOffset, t.length);
    if (createHash('sha256').update(prefix).digest('hex') !== t.sha256) continue;

    // The FDA-issued bytes are intact. Everything after them must keep FDA's
    // own encryption: a new or re-pointed /Encrypt, or a redefinition of the
    // encryption dictionary, is security the sponsor side added.
    const suffix = Buffer.from(bytes.buffer, bytes.byteOffset + t.length, bytes.length - t.length);
    for (const o of pdfNameOffsets(suffix, 'Encrypt')) {
      const ref = encryptRefAt(suffix, o);
      if (ref === null || !t.encryptRefs.has(ref)) {
        return {
          verdict: 'secured',
          reason:
            `it is Form ${t.formId} but its security was changed after FDA issued it ` +
            `(an appended /Encrypt ${ref ?? 'that is not an indirect reference'}); submit the form with FDA's own security settings`,
        };
      }
    }
    const suffixText = suffix.toString('latin1');
    // Whitespace or comments between the tokens, and leading zeros on either
    // number, all spell the same object header to a reader.
    const sep = '(?:[\\x00\\t\\n\\f\\r ]|%[^\\r\\n]*[\\r\\n])+';
    for (const ref of t.encryptRefs) {
      const [num, gen] = ref.split(' ');
      if (new RegExp(`(?:^|[^0-9])0*${num}${sep}0*${gen}${sep}obj(?![A-Za-z0-9])`).test(suffixText)) {
        return {
          verdict: 'secured',
          reason: `it is Form ${t.formId} but its encryption dictionary (object ${ref}) was redefined after FDA issued it; submit the form with FDA's own security settings`,
        };
      }
    }
    // A reader must agree it carries FDA's own security: it opens with no
    // password, with the template's permissions and document ID.
    const reader = await openAsReader(bytes, true);
    if (!reader.ok) {
      return { verdict: 'secured', reason: `it is Form ${t.formId} but ${reader.reason}; submit the form with FDA's own security settings` };
    }
    if (reader.permissions !== t.reader.permissions || reader.fingerprint !== t.reader.fingerprint) {
      return {
        verdict: 'secured',
        reason:
          `it is Form ${t.formId} but a reader sees different security from the form FDA issued ` +
          `(${reader.permissions !== t.reader.permissions ? 'permissions' : 'document ID'} changed); submit the form with FDA's own security settings`,
      };
    }
    // Steps 5 and 6 (2026-09-23, W5/D7, round-2 review): pdf.js recovers to
    // FDA's own section when it cannot parse the appended one, so what a
    // conformant reader starts from is read from the bytes; and a file embedded
    // in the form is enciphered with the form's key, so it is judged on its own.
    const sections = appendedSectionsProblem(view(bytes), t.length, t);
    const problem = sections === null ? await embeddedFilesProblem(reader.attachments) : `${sections}; submit the form with FDA's own security settings`;
    if (problem !== null) return { verdict: 'secured', reason: `it is Form ${t.formId} but ${problem}` };
    return { verdict: 'fda-form-as-issued', formId: t.formId, edition: t.edition };
  }

  return {
    verdict: 'secured',
    reason:
      `it carries an /Encrypt entry and is not an FDA form as FDA issued it; ${SPEC_REASON}. ` +
      'FDA forms are the only exception, and only when the file begins with the exact FDA-issued form ' +
      '(completed by incremental save) — a re-saved, printed-to-PDF or different-edition form does not qualify',
  };
}

export default { assessLeafPdfSecurity, clearLeafSecurityTemplateCache };
