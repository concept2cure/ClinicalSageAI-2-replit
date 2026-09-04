/**
 * Generic "fill official PDF AcroForm" utility.
 *
 * A reusable, template-agnostic foundation for filling official fillable PDF
 * forms (e.g. FDA's eSTAR PDF, FDA 1571/1572/3674/…) with pdf-lib. It generalizes
 * the proven IND form-fill path in
 * `server/services/ind-forms/ind-form-fill-service.ts` WITHOUT modifying it:
 *
 *   - You supply an explicit field map (canonical key → official AcroForm field
 *     name + type) plus a flat data object keyed by the canonical keys.
 *   - This module looks up each AcroField by its official name, sets the value
 *     according to its declared type, and records exactly which fields were
 *     filled vs skipped. It NEVER invents fields: if the template has no such
 *     AcroField, or the data has no value for a key, the field is skipped (with a
 *     warning) — or, under `missingFieldPolicy: 'error'`, the call throws.
 *
 * Field lookup, the text/checkbox/dropdown handling, the flatten step and the
 * defensive try/catch around per-field operations all mirror the IND service's
 * conventions (`form.getTextField` / `getCheckBox` / `getDropdown`, then
 * `form.flatten()`), extended here with radio-group support and structured
 * reporting.
 *
 * TypeScript + ESM. Depends only on `pdf-lib` (already installed).
 */

import { PDFDocument } from 'pdf-lib';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Supported AcroForm widget kinds. */
export type OfficialPdfFieldType = 'text' | 'checkbox' | 'dropdown' | 'radio';

/**
 * Maps our canonical (caller-facing) keys to the official AcroForm field names
 * embedded in the template PDF, plus the widget type to drive value handling.
 *
 *   { sponsorName: { acroField: 'form1[0].#subform[0].SponsorName[0]', type: 'text' } }
 */
export interface OfficialPdfFieldSpec {
  /**
   * Exact AcroForm field name as it appears in the template PDF. Required to fill
   * a static AcroForm; absent for fields that exist only in a dynamic XFA template.
   */
  acroField?: string;
  /**
   * XFA SOM path (e.g. `root.PredicatesSE.PredicateReference.ADTextField830`) for
   * dynamic Adobe LiveCycle templates, whose AcroForm `/Fields` array is empty and
   * whose real fields live in the `/XFA` packets. Required by `fillXfaDatasets`.
   */
  xfaSomPath?: string;
  /** The template's OWN caption for this field, carried for provenance. */
  caption?: string;
  type: OfficialPdfFieldType;
}

export interface OfficialPdfFieldMap {
  [canonicalKey: string]: OfficialPdfFieldSpec;
}

export interface FillOptions {
  /**
   * Flatten the form after filling so values are baked into the page content
   * (read-only output). Default: false.
   */
  flatten?: boolean;
  /**
   * What to do when a mapped AcroField is absent from the template (or of the
   * wrong type for the declared `type`):
   *   - 'skip'  : record a warning and continue (default)
   *   - 'error' : throw
   *
   * Note: a canonical key that simply has no value in `data` is always skipped
   * (recorded in `skipped`) regardless of this policy — there is nothing to fill.
   */
  missingFieldPolicy?: 'skip' | 'error';
}

export interface FillResult {
  /** The filled (and optionally flattened) PDF bytes. */
  bytes: Uint8Array;
  /** Canonical keys whose value was written into an AcroField. */
  filled: string[];
  /**
   * Canonical keys that were not written: either no value supplied in `data`,
   * or the AcroField was missing/wrong-type (under `missingFieldPolicy: 'skip'`).
   */
  skipped: string[];
  /** Human-readable diagnostics (missing fields, type mismatches, empties). */
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Value coercion helpers
// ---------------------------------------------------------------------------

/**
 * Whether a value should be treated as "no data supplied" for this key. We treat
 * `undefined`, `null`, and empty/whitespace-only strings as absent. For
 * booleans/numbers we always have data (false / 0 are meaningful).
 */
function hasData(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
}

/** Coerce an arbitrary value to the text that goes into a text/dropdown field. */
function toText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return String(value);
  return String(value);
}

/**
 * Coerce a value to a boolean for checkbox handling. Accepts real booleans and
 * common truthy/falsy string spellings. An UNRECOGNIZED value must NOT check an
 * official-form box: JS truthiness would turn negative-meaning strings like
 * 'None' / 'N/A' into a checked box, silently asserting something on ambiguous
 * data. So only explicit affirmatives check; everything else stays unchecked.
 */
function toBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (['true', 'yes', 'on', '1', 'checked', 'x'].includes(v)) return true;
    if (['false', 'no', 'off', '0', 'unchecked', 'n', 'none', 'n/a', 'na', ''].includes(v)) return false;
  }
  // Unrecognized / non-primitive value: never check an official-form box on it.
  return false;
}

// ---------------------------------------------------------------------------
// Core: fillOfficialPdf
// ---------------------------------------------------------------------------

/**
 * Fill an official fillable PDF (AcroForm) by mapping canonical data keys to the
 * template's official field names.
 *
 * Honest behaviour:
 *  - Only fields that exist in BOTH the field map and the template are filled.
 *  - A canonical key with no data is skipped (warned), never invented.
 *  - A mapped field missing from the template is skipped+warned, or — when
 *    `missingFieldPolicy: 'error'` — throws.
 *
 * @param templateBytes The official template PDF (Uint8Array or Buffer).
 * @param fieldMap      canonical key → { acroField, type }.
 * @param data          canonical key → value.
 * @param opts          flatten / missingFieldPolicy.
 */
export async function fillOfficialPdf(
  templateBytes: Uint8Array | Buffer,
  fieldMap: OfficialPdfFieldMap,
  data: Record<string, unknown>,
  opts: FillOptions = {},
): Promise<FillResult> {
  const flatten = opts.flatten ?? false;
  const missingFieldPolicy = opts.missingFieldPolicy ?? 'skip';

  const filled: string[] = [];
  const skipped: string[] = [];
  const warnings: string[] = [];

  // Official FDA form PDFs are permission-encrypted ("secured"); ignoreEncryption
  // lets pdf-lib open them, matching ind-form-fill-service. Without it every real
  // FDA template throws "Input document to `PDFDocument.load` is encrypted".
  const doc = await PDFDocument.load(templateBytes, { ignoreEncryption: true });
  const form = doc.getForm();

  for (const [canonicalKey, spec] of Object.entries(fieldMap)) {
    const { acroField, type } = spec;
    const value = data[canonicalKey];

    // 0) An XFA-only spec has no AcroForm name — this path cannot fill it. Skip
    //    honestly rather than filling the wrong widget.
    if (!acroField) {
      skipped.push(canonicalKey);
      warnings.push(
        `"${canonicalKey}" has no acroField (XFA-only mapping); the AcroForm fill path skipped it. ` +
          `Use fillXfaDatasets for dynamic XFA templates.`,
      );
      continue;
    }

    // 1) No data supplied for this key → skip (never invent values).
    if (!hasData(value)) {
      skipped.push(canonicalKey);
      warnings.push(
        `No data supplied for "${canonicalKey}" (AcroField "${acroField}"); skipped.`,
      );
      continue;
    }

    // 2) Attempt to locate + set the field by its declared type.
    try {
      switch (type) {
        case 'text': {
          form.getTextField(acroField).setText(toText(value));
          break;
        }
        case 'dropdown': {
          const dropdown = form.getDropdown(acroField);
          const text = toText(value);
          const options = dropdown.getOptions();
          if (!options.includes(text)) {
            // Do NOT inject an out-of-range option into an official form: a value
            // the real form does not offer must never be reported as filled.
            // Treat it like a missing/invalid field — the surrounding catch skips
            // and warns (or throws under missingFieldPolicy:'error') — consistent
            // with the radio-group case.
            throw new Error(
              `dropdown value "${text}" not in [${options.join(', ')}]`,
            );
          }
          dropdown.select(text);
          break;
        }
        case 'checkbox': {
          const checkbox = form.getCheckBox(acroField);
          if (toBoolean(value)) checkbox.check();
          else checkbox.uncheck();
          break;
        }
        case 'radio': {
          const radio = form.getRadioGroup(acroField);
          const text = toText(value);
          const options = radio.getOptions();
          if (!options.includes(text)) {
            // Radio groups cannot have options added on the fly; an unknown
            // selection is unfillable. Treat like a missing field.
            throw new Error(
              `radio option "${text}" not in [${options.join(', ')}]`,
            );
          }
          radio.select(text);
          break;
        }
        default: {
          // Exhaustiveness guard — unknown declared type.
          throw new Error(`unsupported field type "${String(type)}"`);
        }
      }
      filled.push(canonicalKey);
    } catch (err) {
      // The template has no such field, the field is a different widget type
      // than declared, or a radio/dropdown selection was invalid.
      const reason = err instanceof Error ? err.message : String(err);
      const msg =
        `Field "${acroField}" (key "${canonicalKey}", type "${type}") could ` +
        `not be filled: ${reason}`;
      if (missingFieldPolicy === 'error') {
        throw new Error(msg);
      }
      skipped.push(canonicalKey);
      warnings.push(msg);
    }
  }

  // Flatten last, so values are baked into page content (read-only output).
  if (flatten) {
    try {
      form.flatten();
    } catch (err) {
      // Some templates have fields that resist flattening; bytes are still
      // valid, so warn rather than fail the whole fill.
      const reason = err instanceof Error ? err.message : String(err);
      warnings.push(`Form flatten failed (output left interactive): ${reason}`);
    }
  }

  const bytes = await doc.save({ useObjectStreams: false });
  return { bytes, filled, skipped, warnings };
}

// ---------------------------------------------------------------------------
// Introspection: listAcroFields
// ---------------------------------------------------------------------------

/**
 * Enumerate the AcroForm fields in a template — their official names and widget
 * types. Useful for building an {@link OfficialPdfFieldMap} against an unfamiliar
 * official PDF.
 *
 * Type strings mirror this module's vocabulary where possible
 * ('text' | 'checkbox' | 'dropdown' | 'radio'), plus 'optionlist' and
 * 'button'/'signature' for field kinds we do not fill, and 'unknown' as a last
 * resort. The pdf-lib constructor name is used so we never misreport a type.
 */
export async function listAcroFields(
  templateBytes: Uint8Array | Buffer,
): Promise<{ name: string; type: string }[]> {
  // Permission-encrypted official templates must still enumerate (see fillOfficialPdf).
  const doc = await PDFDocument.load(templateBytes, { ignoreEncryption: true });
  const form = doc.getForm();
  return form.getFields().map((field) => ({
    name: field.getName(),
    type: classifyFieldType(field.constructor?.name),
  }));
}

/** Map a pdf-lib field class name to a friendly type string. */
function classifyFieldType(ctorName: string | undefined): string {
  switch (ctorName) {
    case 'PDFTextField':
      return 'text';
    case 'PDFCheckBox':
      return 'checkbox';
    case 'PDFDropdown':
      return 'dropdown';
    case 'PDFRadioGroup':
      return 'radio';
    case 'PDFOptionList':
      return 'optionlist';
    case 'PDFButton':
      return 'button';
    case 'PDFSignature':
      return 'signature';
    default:
      return 'unknown';
  }
}

// ===========================================================================
// Dynamic XFA (Adobe LiveCycle) support
// ===========================================================================
//
// WHY THIS EXISTS: the official FDA eSTAR templates — and FDA's 1571/3674 — are
// Adobe LiveCycle *dynamic XFA* PDFs. Their AcroForm `/Fields` array is EMPTY and
// `/NeedsRendering true` is set; the real form lives in the `/XFA` packets and is
// rendered by Acrobat. Everything above this line operates on the AcroForm layer,
// which for these templates has nothing in it: `listAcroFields` returns 0 fields
// and no `acroField` name can ever match. Filling such a template means writing
// into the XFA `datasets` packet — the XML data island Acrobat binds the form to.
//
// The templates are also permission-encrypted (AESV2, empty user password), and
// their objects live in encrypted object streams that pdf-lib cannot traverse, so
// this section does its own minimal, read-only PDF work: derive the standard
// security key, locate the top-level XFA packet streams, decrypt/inflate them.
//
// Writes are made as a PDF INCREMENTAL UPDATE: the original bytes are preserved
// byte-for-byte and a new revision of the single `datasets` object is appended,
// with a fresh cross-reference stream. Nothing else in the document is disturbed,
// which is what keeps the output the real FDA form rather than a re-rendered
// lookalike.

import * as zlib from 'zlib';
import * as crypto from 'node:crypto';

/** A field declared by a dynamic XFA template. */
export interface XfaFieldInfo {
  /** Dotted SOM path, e.g. `root.PredicatesSE.PredicateReference.ADTextField830`. */
  somPath: string;
  /** Widget kind, mapped into this module's vocabulary where possible. */
  type: string;
  /** The template's own caption text for the field ('' when it has none). */
  caption: string;
  /** True when the field resolves to a node in the `datasets` skeleton, i.e. it is fillable. */
  inDatasets: boolean;
  /**
   * The path of the field's node in the `datasets` data DOM, which is NOT always
   * the template SOM path — see {@link resolveDataSomPath}. Null when the field
   * does not resolve to a data node (then it is not fillable).
   */
  dataSomPath: string | null;
}

const PDF_PAD = Buffer.from([
  0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41, 0x64, 0x00, 0x4e, 0x56, 0xff, 0xfa, 0x01, 0x08,
  0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80, 0x2f, 0x0c, 0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a,
]);

/** RC4, implemented here so no OpenSSL legacy provider is required. */
function rc4(key: Buffer, data: Buffer): Buffer {
  const s = new Uint8Array(256);
  for (let i = 0; i < 256; i++) s[i] = i;
  for (let i = 0, j = 0; i < 256; i++) {
    j = (j + s[i] + key[i % key.length]) & 0xff;
    [s[i], s[j]] = [s[j], s[i]];
  }
  const out = Buffer.alloc(data.length);
  for (let k = 0, i = 0, j = 0; k < data.length; k++) {
    i = (i + 1) & 0xff;
    j = (j + s[i]) & 0xff;
    [s[i], s[j]] = [s[j], s[i]];
    out[k] = data[k] ^ s[(s[i] + s[j]) & 0xff];
  }
  return out;
}

/** Read a PDF string value — literal `(...)` with escapes, or hex `<...>` — after `key`. */
function readPdfStringAfter(dict: string, key: string): Buffer | null {
  const i = dict.indexOf(key);
  if (i < 0) return null;
  let j = i + key.length;
  while (j < dict.length && /\s/.test(dict[j])) j++;
  if (dict[j] === '<') {
    const end = dict.indexOf('>', j);
    return Buffer.from(dict.slice(j + 1, end).replace(/\s+/g, ''), 'hex');
  }
  if (dict[j] !== '(') return null;
  const out: number[] = [];
  const OCT = /[0-7]/;
  const ESC: Record<string, number> = { n: 10, r: 13, t: 9, b: 8, f: 12, '(': 40, ')': 41, '\\': 92 };
  let depth = 1;
  j++;
  while (j < dict.length && depth > 0) {
    const c = dict[j];
    if (c === '\\') {
      const nx = dict[j + 1];
      if (OCT.test(nx)) {
        let oct = '';
        let k = j + 1;
        while (k < dict.length && oct.length < 3 && OCT.test(dict[k])) { oct += dict[k]; k++; }
        out.push(parseInt(oct, 8) & 0xff);
        j = k;
        continue;
      }
      if (nx in ESC) { out.push(ESC[nx]); j += 2; continue; }
      if (nx === '\n') { j += 2; continue; }
      if (nx === '\r') { j += 2; if (dict[j] === '\n') j++; continue; }
      out.push(nx.charCodeAt(0) & 0xff);
      j += 2;
      continue;
    }
    if (c === '(') { depth++; out.push(40); j++; continue; }
    if (c === ')') { depth--; if (depth === 0) { j++; break; } out.push(41); j++; continue; }
    out.push(c.charCodeAt(0) & 0xff);
    j++;
  }
  return Buffer.from(out);
}

interface PdfSecurity {
  encrypted: boolean;
  key: Buffer;
  aes: boolean;
}

/** Byte offset of the last cross-reference section, from the trailing `startxref`. */
function startxrefOffset(buf: Buffer): number {
  const tail = buf.subarray(Math.max(0, buf.length - 4096)).toString('latin1');
  const m = /startxref\s+(\d+)/.exec(tail);
  if (!m) throw new Error('Malformed PDF: no startxref');
  return parseInt(m[1], 10);
}

/** The trailer (or cross-reference stream) dictionary text. */
function trailerDictText(buf: Buffer): string {
  return buf.subarray(startxrefOffset(buf), startxrefOffset(buf) + 4096).toString('latin1');
}

/** First capture group of `re` in `text` as an integer, or `fallback`. */
function matchInt(text: string, re: RegExp, fallback: number): number {
  const m = re.exec(text);
  return m ? parseInt(m[1], 10) : fallback;
}

/**
 * Derive the standard-security file key for an empty user password (PDF 32000-1
 * Algorithm 2). Supports V1/V2/V4 with RC4 or AESV2. AESV3 (V5/R5/R6) is reported
 * as unsupported rather than silently mis-decrypted.
 */
function readSecurity(buf: Buffer, raw: string): PdfSecurity {
  const trailer = trailerDictText(buf);
  const encM = /\/Encrypt\s+(\d+)\s+(\d+)\s+R/.exec(trailer);
  if (!encM) return { encrypted: false, key: Buffer.alloc(0), aes: false };

  const idM = /\/ID\s*\[\s*<([0-9A-Fa-f\s]+)>/.exec(trailer);
  const id0 = idM ? Buffer.from(idM[1].replace(/\s+/g, ''), 'hex') : Buffer.alloc(0);

  const encNum = parseInt(encM[1], 10);
  const objRe = new RegExp(`(?:^|[^0-9])${encNum}\\s+0\\s+obj([\\s\\S]{0,2000}?)endobj`);
  const om = objRe.exec(raw);
  if (!om) throw new Error(`Encrypted PDF: /Encrypt object ${encNum} not found`);
  const d = om[1];

  const V = matchInt(d, /\/V\s+(\d+)/, 1);
  const R = matchInt(d, /\/R\s+(\d+)/, 2);
  if (V >= 5 || R >= 5) {
    throw new Error(
      `Encrypted PDF uses AESV3/V${V} R${R}, which this reader does not implement. ` +
        `Supply a decrypted template.`,
    );
  }
  const aes = /\/AESV2/.test(d);
  // /Length appears twice: top-level (BITS) and inside /CF /StdCF (BYTES). Strip
  // the crypt-filter sub-dictionary before reading the top-level value.
  const topLevel = d.replace(/\/CF\s*<<[\s\S]*?>>\s*>>/, '');
  const lenBits = matchInt(topLevel, /\/Length\s+(\d+)/, 40);
  const n = Math.max(5, Math.min(16, Math.floor(lenBits / 8)));
  const P = matchInt(d, /\/P\s+(-?\d+)/, 0);
  const O = readPdfStringAfter(d, '/O') ?? Buffer.alloc(32);
  const encryptMetadataFalse = /\/EncryptMetadata\s+false/.test(d);

  const p4 = Buffer.alloc(4);
  p4.writeInt32LE(P | 0, 0);
  const parts: Buffer[] = [PDF_PAD, O.subarray(0, 32), p4, id0];
  if (R >= 4 && encryptMetadataFalse) parts.push(Buffer.from([0xff, 0xff, 0xff, 0xff]));
  let key = crypto.createHash('md5').update(Buffer.concat(parts)).digest();
  if (R >= 3) for (let i = 0; i < 50; i++) key = crypto.createHash('md5').update(key.subarray(0, n)).digest();
  return { encrypted: true, key: key.subarray(0, n), aes };
}

/** Algorithm 1: the per-object key (AES adds the `sAlT` suffix). */
function objectKey(sec: PdfSecurity, num: number, gen: number): Buffer {
  const ext = Buffer.from([num & 0xff, (num >> 8) & 0xff, (num >> 16) & 0xff, gen & 0xff, (gen >> 8) & 0xff]);
  const parts = [sec.key, ext];
  if (sec.aes) parts.push(Buffer.from([0x73, 0x41, 0x6c, 0x54]));
  return crypto
    .createHash('md5')
    .update(Buffer.concat(parts))
    .digest()
    .subarray(0, Math.min(sec.key.length + 5, 16));
}

function decryptObjectData(sec: PdfSecurity, num: number, gen: number, data: Buffer): Buffer {
  if (!sec.encrypted) return data;
  const k = objectKey(sec, num, gen);
  if (!sec.aes) return rc4(k, data);
  if (data.length <= 16) return Buffer.alloc(0);
  const dec = crypto.createDecipheriv('aes-128-cbc', k, data.subarray(0, 16));
  dec.setAutoPadding(false);
  const out = Buffer.concat([dec.update(data.subarray(16)), dec.final()]);
  const pad = out.length ? out[out.length - 1] : 0;
  return pad >= 1 && pad <= 16 && pad <= out.length ? out.subarray(0, out.length - pad) : out;
}

function encryptObjectData(sec: PdfSecurity, num: number, gen: number, data: Buffer): Buffer {
  if (!sec.encrypted) return data;
  const k = objectKey(sec, num, gen);
  if (!sec.aes) return rc4(k, data);
  const iv = crypto.randomBytes(16);
  const c = crypto.createCipheriv('aes-128-cbc', k, iv);
  return Buffer.concat([iv, c.update(data), c.final()]);
}

interface TopLevelObject { num: number; gen: number; headerStart: number; }

/**
 * Index every top-level `N G obj` header. Objects inside object streams are not
 * listed — and do not need to be: PDF forbids streams inside object streams, so
 * every XFA packet is necessarily a top-level object.
 */
function indexTopLevelObjects(raw: string): TopLevelObject[] {
  const out: TopLevelObject[] = [];
  const re = /(?:^|[\r\n>\s])(\d+)\s+(\d+)\s+obj\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    out.push({ num: parseInt(m[1], 10), gen: parseInt(m[2], 10), headerStart: m.index + m[0].indexOf(m[1]) });
  }
  return out;
}

interface StreamObject { dict: string; data: Buffer; }

function readStreamObject(
  raw: string,
  buf: Buffer,
  o: TopLevelObject,
  resolveLength: (n: number) => number | null,
): StreamObject | null {
  const kw = raw.indexOf('stream', o.headerStart);
  if (kw < 0) return null;
  const dict = raw.slice(o.headerStart, kw);
  if (!/<</.test(dict)) return null;
  let start = kw + 'stream'.length;
  if (raw[start] === '\r') start++;
  if (raw[start] === '\n') start++;
  let len: number | null = null;
  const direct = /\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(dict);
  const indirect = /\/Length\s+(\d+)\s+(\d+)\s+R/.exec(dict);
  if (direct) len = parseInt(direct[1], 10);
  else if (indirect) len = resolveLength(parseInt(indirect[1], 10));
  if (len === null || len < 0) {
    const end = raw.indexOf('endstream', start);
    if (end < 0) return null;
    len = end - start;
  }
  return { dict, data: buf.subarray(start, start + len) };
}

interface XfaPacket { name: string; num: number; gen: number; xml: Buffer; }

/**
 * Locate and decode the XFA packets. Packets are identified by their decoded
 * content rather than by the `/XFA` name array, because that array lives in an
 * encrypted object stream this reader deliberately does not traverse.
 */
function extractXfaPackets(buf: Buffer): { packets: XfaPacket[]; sec: PdfSecurity } {
  const raw = buf.toString('latin1');
  const sec = readSecurity(buf, raw);
  // A PDF may carry several revisions of the same object number when it has been
  // updated incrementally (which is exactly how fillXfaDatasets writes). The
  // CURRENT revision is the last one in the file, so index by object number
  // keeping the highest offset — otherwise a filled document would still read
  // back its original, empty datasets packet.
  const latest = new Map<number, TopLevelObject>();
  for (const o of indexTopLevelObjects(raw)) {
    const seen = latest.get(o.num);
    if (!seen || o.headerStart > seen.headerStart) latest.set(o.num, o);
  }
  const objects = [...latest.values()].sort((a, b) => a.num - b.num);
  const byNum = latest;
  const resolveLength = (n: number): number | null => {
    const o = byNum.get(n);
    if (!o) return null;
    const m = /obj\s+(\d+)/.exec(raw.slice(o.headerStart, o.headerStart + 80));
    return m ? parseInt(m[1], 10) : null;
  };

  const SNIFF: [RegExp, string][] = [
    [/^\s*<xfa:datasets\b/, 'datasets'],
    [/^\s*<template\b/, 'template'],
    [/^\s*<config\b/, 'config'],
    [/^\s*<localeSet\b/, 'localeSet'],
    [/^\s*<\?xml[^>]*\?>\s*<xdp:xdp\b/, 'xdp:xdp'],
    [/^\s*<form\b/, 'form'],
  ];

  const packets: XfaPacket[] = [];
  for (const o of objects) {
    const st = readStreamObject(raw, buf, o, resolveLength);
    if (!st || st.data.length === 0 || !/\/Length/.test(st.dict)) continue;
    let decoded: Buffer;
    try {
      decoded = decryptObjectData(sec, o.num, o.gen, Buffer.from(st.data));
    } catch { continue; }
    if (/\/FlateDecode/.test(st.dict)) {
      try { decoded = zlib.inflateSync(decoded); } catch { continue; }
    }
    const head = decoded.subarray(0, 80).toString('latin1');
    const hit = SNIFF.find(([re]) => re.test(head));
    if (hit) packets.push({ name: hit[1], num: o.num, gen: o.gen, xml: decoded });
  }
  return { packets, sec };
}

/** True when the PDF is a dynamic XFA form whose AcroForm layer cannot be filled. */
export function isDynamicXfaPdf(templateBytes: Uint8Array | Buffer): boolean {
  const buf = Buffer.from(templateBytes);
  if (buf.includes('/NeedsRendering true')) return true;
  const raw = buf.subarray(0, Math.min(buf.length, 4_000_000)).toString('latin1');
  return /\/XFA\s*[[\d]/.test(raw);
}

// --- minimal XML scanning -------------------------------------------------
// The XFA packets are machine-generated, well-formed XML. A tiny event scanner
// keeps this module dependency-free (the project ships no typed SAX parser) and
// streams the ~10 MB template packet without building a DOM.

const XML_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
};

function decodeXmlText(s: string): string {
  return s.replace(/&(#x?[0-9A-Fa-f]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return XML_ENTITIES[body] ?? whole;
  });
}

interface XmlHandlers {
  open: (tag: string, attrs: Record<string, string>, selfClosing: boolean, tagStart: number, tagEnd: number) => void;
  close: (tag: string, tagStart: number, tagEnd: number) => void;
  text: (t: string) => void;
}

const TAG_RE = /<(!--[\s\S]*?--|!\[CDATA\[[\s\S]*?\]\]|\?[\s\S]*?\?|\/?[A-Za-z_][\w.:-]*(?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
const ATTR_RE = /([\w.:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

function scanXml(xml: string, h: XmlHandlers): void {
  let last = 0;
  let m: RegExpExecArray | null;
  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(xml))) {
    if (m.index > last) {
      const t = xml.slice(last, m.index);
      if (t) h.text(decodeXmlText(t));
    }
    last = TAG_RE.lastIndex;
    const body = m[1];
    if (body.startsWith('!') || body.startsWith('?')) continue; // comment / CDATA / PI
    if (body.startsWith('/')) {
      h.close(body.slice(1).trim().replace(/^.*:/, ''), m.index, TAG_RE.lastIndex);
      continue;
    }
    const selfClosing = body.endsWith('/');
    const inner = selfClosing ? body.slice(0, -1) : body;
    const nameEnd = inner.search(/[\s/]/);
    const rawName = (nameEnd === -1 ? inner : inner.slice(0, nameEnd)).trim();
    const tag = rawName.replace(/^.*:/, '');
    const attrs: Record<string, string> = {};
    if (nameEnd !== -1) {
      const attrText = inner.slice(nameEnd);
      let a: RegExpExecArray | null;
      ATTR_RE.lastIndex = 0;
      while ((a = ATTR_RE.exec(attrText))) attrs[a[1]] = decodeXmlText(a[2] ?? a[3] ?? '');
    }
    h.open(tag, attrs, selfClosing, m.index, TAG_RE.lastIndex);
    if (selfClosing) h.close(tag, m.index, TAG_RE.lastIndex);
  }
}

/** Every dotted path present in the `datasets` skeleton (beneath `xfa:data`). */
function datasetsPathSet(datasetsXml: Buffer | undefined): Set<string> {
  const set = new Set<string>();
  if (!datasetsXml) return set;
  const path: string[] = [];
  let depth = 0;
  scanXml(datasetsXml.toString('utf8'), {
    open: (tag) => {
      depth++;
      if (depth <= 2) return; // xfa:datasets > xfa:data are wrappers
      path.push(tag);
      set.add(path.join('.'));
    },
    close: () => {
      if (depth > 2) path.pop();
      depth--;
    },
    text: () => {},
  });
  return set;
}

/**
 * Resolve a template SOM path onto the path its node actually has in the
 * `datasets` data DOM.
 *
 * These are not always the same string. XFA binds a field to a data node by
 * NAME, and a subform that does not itself bind a data group is transparent to
 * that walk — its name appears in the template SOM path but not in the data
 * path. The two vendored form families in this repo show both shapes:
 *
 *   FDA eSTAR      template `root.AdministrativeDocumentation.PMNSummary.SSTextField220`
 *                  data     `root.AdministrativeDocumentation.PMNSummary.SSTextField220`  (identical)
 *   FDA Form 1571  template `topmostSubform.Page1.db_sponsor_name`
 *                  data     `topmostSubform.db_sponsor_name`                              (Page1 is transparent)
 *
 * Comparing the template path against the data DOM directly therefore reported
 * every field of FDA 1571 and 3674 as absent, and the platform concluded those
 * forms were unfillable and fell back to a drawn reconstruction. They are not:
 * 1571 has 246 fillable nodes and 3674 has 156.
 *
 * The match stays deliberately narrow, because a wrong locator writes a value
 * into the wrong box of a form a sponsor signs: the exact path wins, and
 * otherwise a candidate must share BOTH the root data group and the leaf field
 * name. If more than one candidate does, the field is reported unresolved
 * rather than guessed.
 */
export function resolveDataSomPath(templateSom: string, dataPaths: Set<string>): string | null {
  if (dataPaths.has(templateSom)) return templateSom;
  const segs = templateSom.split('.');
  if (segs.length < 3) return null;
  const root = segs[0];
  const leaf = segs[segs.length - 1];
  let hit: string | null = null;
  for (const candidate of dataPaths) {
    const c = candidate.split('.');
    if (c.length < 2 || c[0] !== root || c[c.length - 1] !== leaf) continue;
    if (hit) return null; // ambiguous — never guess which box to write
    hit = candidate;
  }
  return hit;
}

/**
 * Enumerate the fields a dynamic XFA template declares — the XFA counterpart to
 * {@link listAcroFields}, which returns nothing for these templates. Each field
 * carries its SOM path, widget type, the template's OWN caption, and whether the
 * path exists in the `datasets` skeleton. Only `inDatasets` fields are fillable.
 */
export async function listXfaFields(templateBytes: Uint8Array | Buffer): Promise<XfaFieldInfo[]> {
  const { packets } = extractXfaPackets(Buffer.from(templateBytes));
  const template = packets.find((p) => p.name === 'template');
  if (!template) return [];
  const datasetPaths = datasetsPathSet(packets.find((p) => p.name === 'datasets')?.xml);

  const UI: Record<string, string> = {
    textEdit: 'text', checkButton: 'checkbox', choiceList: 'dropdown',
    dateTimeEdit: 'text', numericEdit: 'text', button: 'button', signature: 'signature',
  };
  const CONTAINERS = new Set(['subform', 'area', 'exclGroup', 'field']);

  interface Frame { tag: string; pushedName: boolean; field?: { som: string; type: string; caption: string } }
  const stack: Frame[] = [];
  const path: string[] = [];
  const out: XfaFieldInfo[] = [];
  let captionDepth = 0;
  const nearestField = () => {
    for (let i = stack.length - 1; i >= 0; i--) if (stack[i].field) return stack[i].field!;
    return undefined;
  };

  scanXml(template.xml.toString('utf8'), {
    open: (tag, attrs) => {
      const name = attrs.name;
      const isContainer = CONTAINERS.has(tag);
      const pushedName = isContainer && !!name;
      if (pushedName) path.push(name);
      const frame: Frame = { tag, pushedName };
      if (isContainer && (tag === 'field' || tag === 'exclGroup') && name) {
        frame.field = { som: path.join('.'), type: 'unknown', caption: '' };
      }
      stack.push(frame);
      const f = nearestField();
      if (f) {
        if (UI[tag] && f.type === 'unknown') f.type = UI[tag];
        if (tag === 'caption') captionDepth++;
      }
    },
    text: (t) => {
      if (captionDepth > 0) {
        const f = nearestField();
        if (f) f.caption += t;
      }
    },
    close: () => {
      const frame = stack.pop();
      if (!frame) return;
      if (frame.tag === 'caption' && captionDepth > 0) captionDepth--;
      if (frame.field) {
        const dataSomPath = resolveDataSomPath(frame.field.som, datasetPaths);
        out.push({
          somPath: frame.field.som,
          type: frame.field.type,
          caption: frame.field.caption.replace(/\s+/g, ' ').trim(),
          inDatasets: dataSomPath !== null,
          dataSomPath,
        });
      }
      if (frame.pushedName) path.pop();
    },
  });
  return out;
}

/** Escape a value for XML character data. */
function escapeXmlText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

interface DatasetsEdit { somPath: string; value: string }

/**
 * Write values into the XFA `datasets` XML by SOM path. Only paths that already
 * exist in the skeleton are written — a path the form does not declare is
 * reported as missing, never created, because inventing a data node would bind
 * to nothing and silently drop the value.
 */
function setDatasetsValues(
  xml: string,
  edits: DatasetsEdit[],
): { xml: string; written: string[]; missing: string[] } {
  const wanted = new Map(edits.map((e) => [e.somPath, e.value]));
  type Splice = { start: number; end: number; text: string; som: string };
  const splices: Splice[] = [];
  const path: string[] = [];
  let depth = 0;
  const open: { som: string; contentStart: number; tagStart: number; selfClosing: boolean }[] = [];

  scanXml(xml, {
    open: (tag, _attrs, selfClosing, tagStart, tagEnd) => {
      depth++;
      if (depth <= 2) return; // xfa:datasets > xfa:data wrappers
      path.push(tag);
      const som = path.join('.');
      if (selfClosing) {
        if (wanted.has(som)) {
          splices.push({ start: tagStart, end: tagEnd, som, text: `<${tag}>${escapeXmlText(wanted.get(som)!)}</${tag}>` });
        }
      } else {
        open.push({ som, contentStart: tagEnd, tagStart, selfClosing });
      }
    },
    close: (_tag, tagStart) => {
      if (depth > 2) {
        const frame = open.length && open[open.length - 1].som === path.join('.') ? open.pop() : undefined;
        if (frame && wanted.has(frame.som)) {
          splices.push({ start: frame.contentStart, end: tagStart, som: frame.som, text: escapeXmlText(wanted.get(frame.som)!) });
        }
        path.pop();
      }
      depth--;
    },
    text: () => {},
  });

  const written = new Set(splices.map((s) => s.som));
  let out = xml;
  for (const s of splices.sort((a, b) => b.start - a.start)) {
    out = out.slice(0, s.start) + s.text + out.slice(s.end);
  }
  return {
    xml: out,
    written: [...written],
    missing: edits.map((e) => e.somPath).filter((p) => !written.has(p)),
  };
}

/**
 * Append a PDF incremental update that replaces one object. The original bytes
 * are preserved verbatim and a new cross-reference stream points at the new
 * revision — the standard way to fill a form without re-rendering the document.
 */
function appendIncrementalUpdate(
  original: Buffer,
  replaced: { num: number; gen: number; dict: string; data: Buffer },
): Buffer {
  const trailer = trailerDictText(original);
  const prev = startxrefOffset(original);
  const rootM = /\/Root\s+(\d+)\s+(\d+)\s+R/.exec(trailer);
  const encM = /\/Encrypt\s+(\d+)\s+(\d+)\s+R/.exec(trailer);
  const idM = /\/ID\s*\[\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/.exec(trailer);
  const sizeM = /\/Size\s+(\d+)/.exec(trailer);
  if (!rootM || !sizeM) throw new Error('Malformed PDF trailer: missing /Root or /Size');

  const oldSize = parseInt(sizeM[1], 10);
  const xrefNum = oldSize; // next free object number
  const newSize = xrefNum + 1;

  const chunks: Buffer[] = [];
  let offset = original.length;
  const push = (b: Buffer) => { chunks.push(b); offset += b.length; };

  const lead = Buffer.from('\n', 'latin1');
  push(lead);

  const objOffset = offset;
  push(Buffer.from(`${replaced.num} ${replaced.gen} obj\n${replaced.dict}\nstream\n`, 'latin1'));
  push(replaced.data);
  push(Buffer.from('\nendstream\nendobj\n', 'latin1'));

  // Cross-reference stream: W [1 4 2]; two one-entry subsections, ascending.
  const entry = (type: number, off: number, gen: number) => {
    const b = Buffer.alloc(7);
    b.writeUInt8(type, 0);
    b.writeUInt32BE(off, 1);
    b.writeUInt16BE(gen, 5);
    return b;
  };
  const xrefOffset = offset;
  const first = Math.min(replaced.num, xrefNum);
  const second = Math.max(replaced.num, xrefNum);
  const entries = first === replaced.num
    ? [entry(1, objOffset, replaced.gen), entry(1, xrefOffset, 0)]
    : [entry(1, xrefOffset, 0), entry(1, objOffset, replaced.gen)];
  const xrefData = Buffer.concat(entries);

  const idPart = idM ? `/ID[<${idM[1]}><${idM[2]}>]` : '';
  const encPart = encM ? `/Encrypt ${encM[1]} ${encM[2]} R` : '';
  const xrefDict =
    `<</Type/XRef/Size ${newSize}/Index[${first} 1 ${second} 1]/W[1 4 2]` +
    `/Root ${rootM[1]} ${rootM[2]} R${encPart}${idPart}/Prev ${prev}/Length ${xrefData.length}>>`;
  push(Buffer.from(`${xrefNum} 0 obj\n${xrefDict}\nstream\n`, 'latin1'));
  push(xrefData);
  push(Buffer.from('\nendstream\nendobj\n', 'latin1'));
  push(Buffer.from(`startxref\n${xrefOffset}\n%%EOF\n`, 'latin1'));

  return Buffer.concat([original, ...chunks]);
}

/**
 * Fill a dynamic XFA template by writing the mapped values into its `datasets`
 * packet, returning the original PDF plus an incremental update.
 *
 * Honest behaviour, matching {@link fillOfficialPdf}: a key with no value is
 * skipped; a mapped SOM path the template does not declare is skipped+warned (or
 * throws under `missingFieldPolicy: 'error'`); nothing is ever invented.
 *
 * `flatten` is NOT supported here and is reported as a warning when requested —
 * flattening a dynamic XFA form would discard the very layer Acrobat renders.
 */
export async function fillXfaDatasets(
  templateBytes: Uint8Array | Buffer,
  fieldMap: OfficialPdfFieldMap,
  data: Record<string, unknown>,
  opts: FillOptions = {},
): Promise<FillResult> {
  const missingFieldPolicy = opts.missingFieldPolicy ?? 'skip';
  const buf = Buffer.from(templateBytes);
  const filled: string[] = [];
  const skipped: string[] = [];
  const warnings: string[] = [];

  const { packets, sec } = extractXfaPackets(buf);
  const datasets = packets.find((p) => p.name === 'datasets');
  if (!datasets) {
    throw new Error('Template has no XFA `datasets` packet; it is not a fillable dynamic XFA form.');
  }
  if (opts.flatten) {
    warnings.push('flatten is not supported for dynamic XFA templates (it would discard the XFA layer); ignored.');
  }

  // The data DOM does not always mirror the template's SOM paths — a subform
  // that binds no data group is transparent to the binding walk (FDA 1571's
  // `Page1` is), so each mapped path is resolved onto the node it actually has.
  const dataPaths = datasetsPathSet(datasets.xml);
  const edits: DatasetsEdit[] = [];
  const keyBySom = new Map<string, string>();
  for (const [canonicalKey, spec] of Object.entries(fieldMap)) {
    const value = data[canonicalKey];
    if (!hasData(value)) {
      skipped.push(canonicalKey);
      warnings.push(`No data supplied for "${canonicalKey}" (XFA "${spec.xfaSomPath ?? '?'}"); skipped.`);
      continue;
    }
    if (!spec.xfaSomPath) {
      skipped.push(canonicalKey);
      const msg = `"${canonicalKey}" has no xfaSomPath; a dynamic XFA template cannot be filled by AcroForm name.`;
      if (missingFieldPolicy === 'error') throw new Error(msg);
      warnings.push(msg);
      continue;
    }
    const dataSom = resolveDataSomPath(spec.xfaSomPath, dataPaths);
    if (!dataSom) {
      const msg = `XFA path "${spec.xfaSomPath}" (key "${canonicalKey}") does not resolve to a node in the template's datasets skeleton; skipped.`;
      if (missingFieldPolicy === 'error') throw new Error(msg);
      skipped.push(canonicalKey);
      warnings.push(msg);
      continue;
    }
    const text = spec.type === 'checkbox' ? (toBoolean(value) ? '1' : '0') : toText(value);
    edits.push({ somPath: dataSom, value: text });
    keyBySom.set(dataSom, canonicalKey);
  }

  const result = setDatasetsValues(datasets.xml.toString('utf8'), edits);
  for (const som of result.written) filled.push(keyBySom.get(som)!);
  for (const som of result.missing) {
    const key = keyBySom.get(som)!;
    const msg = `XFA path "${som}" (key "${key}") is not declared in the template's datasets skeleton; skipped.`;
    if (missingFieldPolicy === 'error') throw new Error(msg);
    skipped.push(key);
    warnings.push(msg);
  }

  const deflated = zlib.deflateSync(Buffer.from(result.xml, 'utf8'));
  const encrypted = encryptObjectData(sec, datasets.num, datasets.gen, deflated);
  const bytes = appendIncrementalUpdate(buf, {
    num: datasets.num,
    gen: datasets.gen,
    dict: `<</Length ${encrypted.length}/Filter/FlateDecode>>`,
    data: encrypted,
  });

  return { bytes: new Uint8Array(bytes), filled, skipped, warnings };
}

/** Read back the `datasets` values of a filled XFA PDF, for verification. */
export async function readXfaDatasetsValues(
  pdfBytes: Uint8Array | Buffer,
  somPaths: string[],
): Promise<Record<string, string | null>> {
  const { packets } = extractXfaPackets(Buffer.from(pdfBytes));
  const datasets = packets.find((p) => p.name === 'datasets');
  const out: Record<string, string | null> = {};
  for (const p of somPaths) out[p] = null;
  if (!datasets) return out;

  const want = new Set(somPaths);
  const path: string[] = [];
  let depth = 0;
  let capture: string | null = null;
  scanXml(datasets.xml.toString('utf8'), {
    open: (tag, _a, selfClosing) => {
      depth++;
      if (depth <= 2) return;
      path.push(tag);
      const som = path.join('.');
      if (want.has(som)) { if (selfClosing) out[som] = ''; else { capture = som; out[som] = ''; } }
    },
    text: (t) => { if (capture) out[capture] = (out[capture] ?? '') + t; },
    close: () => {
      if (depth > 2) {
        if (capture === path.join('.')) capture = null;
        path.pop();
      }
      depth--;
    },
  });
  return out;
}
