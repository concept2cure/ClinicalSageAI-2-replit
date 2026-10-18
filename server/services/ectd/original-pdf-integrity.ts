/** Preserve original bytes. Signature detection here establishes structure, never cryptographic trust. */
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import {
  PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNull, PDFNumber,
  PDFObject, PDFObjectParser, PDFRef, PDFStream, PDFString,
} from 'pdf-lib';
import { parseStringPromise } from 'xml2js';

const execFileAsync = promisify(execFile);
const MAX_OBJECTS = 100_000;
export interface OriginalPdfIntegrityAssessment { signed: boolean }
export interface OriginalPdfAValidation { valid: boolean; reason: string }

export class OriginalPdfIntegrityRefusal extends Error {
  readonly name = 'OriginalPdfIntegrityRefusal';
  readonly code = 'ORIGINAL_PDF_INTEGRITY_UNVERIFIABLE';
  constructor(detail: string) {
    super(`${detail} Original PDF bytes must remain unchanged. Inspect the original signature structure or provide a reviewed replacement PDF before packaging.`);
  }
}

function refuse(detail: string): never { throw new OriginalPdfIntegrityRefusal(detail); }
// pdf-lib leaves lowercase hexadecimal escapes in some names undecoded.
// Conservatively treating those aliases as signature keys prevents a parser
// difference from authorizing conversion. Ambiguous duplicate aliases refuse.
const nameText = (name: PDFName) => name.decodeText().replace(/#([\da-f]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
const named = (object: PDFObject | undefined, name: string) => object instanceof PDFName && nameText(object) === name;

function entry(dict: PDFDict, key: string): PDFObject | undefined {
  const matches = dict.entries().filter(([name]) => nameText(name) === key);
  if (matches.length > 1) refuse(`The PDF contains ambiguous ${key} dictionary entries.`);
  return matches[0]?.[1];
}

function resolve(dict: PDFDict, key: string): PDFObject | undefined {
  const raw = entry(dict, key);
  const value = raw instanceof PDFRef ? dict.context.lookup(raw) : raw;
  if (raw instanceof PDFRef && !value) refuse(`The PDF contains an unresolved ${key} reference.`);
  return value;
}

function signatureContents(dict: PDFDict): PDFHexString | PDFString {
  const contents = resolve(dict, 'Contents');
  if (!(contents instanceof PDFHexString || contents instanceof PDFString)) refuse('An embedded PDF signature has no readable Contents string.');
  if (contents instanceof PDFHexString && !/^[\da-f\s]+$/i.test(contents.asString())) refuse('An embedded PDF signature has malformed hexadecimal Contents.');
  if (!contents.asBytes().length) refuse('An embedded PDF signature has empty Contents.');
  return contents;
}

function signatureRanges(dict: PDFDict, byteLength: number): number[] {
  const ranges = resolve(dict, 'ByteRange');
  if (!(ranges instanceof PDFArray) || ranges.size() !== 4) refuse('An embedded PDF signature needs an unambiguous four-number ByteRange.');
  const values = ranges.asArray().map(value => {
    const number = value instanceof PDFRef ? dict.context.lookup(value) : value;
    if (!(number instanceof PDFNumber) || !Number.isSafeInteger(number.asNumber()) || number.asNumber() < 0) {
      refuse('An embedded PDF signature has an invalid ByteRange offset or length.');
    }
    return number.asNumber();
  });
  const [start, firstLength, secondStart, secondLength] = values;
  if (start !== 0 || firstLength === 0 || secondStart <= firstLength || secondLength === 0 || secondStart + secondLength > byteLength) {
    refuse('An embedded PDF signature has overlapping, empty or out-of-file ByteRange segments.');
  }
  return values;
}

function assertSignature(dict: PDFDict, bytes: Buffer): void {
  const contents = signatureContents(dict);
  const [, firstLength, secondStart] = signatureRanges(dict, bytes.length);
  const excluded = bytes.subarray(firstLength, secondStart);
  const parsed = PDFObjectParser.forBytes(excluded, dict.context).parseObject();
  if (!(parsed instanceof PDFHexString || parsed instanceof PDFString) || parsed.sizeInBytes() !== excluded.length
    || !Buffer.from(parsed.asBytes()).equals(Buffer.from(contents.asBytes()))) {
    refuse('An embedded PDF signature ByteRange does not exclude exactly its Contents string.');
  }
}

function isSignatureField(dict: PDFDict): boolean {
  let current: PDFDict | undefined = dict;
  const seen = new Set<PDFDict>();
  while (current && !seen.has(current)) {
    seen.add(current);
    if (seen.size > 256) refuse('The PDF field hierarchy is too complex to inspect its signature structure safely.');
    const fieldType = resolve(current, 'FT');
    if (fieldType) return named(fieldType, 'Sig');
    const parent = resolve(current, 'Parent');
    current = parent instanceof PDFDict ? parent : undefined;
  }
  return false;
}

function inspectDictionary(dict: PDFDict, bytes: Buffer): boolean {
  const type = resolve(dict, 'Type');
  let signed = named(type, 'Sig') || named(type, 'DocTimeStamp') || Boolean(entry(dict, 'ByteRange'))
    || Boolean(entry(dict, 'SubFilter'));
  if (signed) assertSignature(dict, bytes);
  if (entry(dict, 'V') && isSignatureField(dict)) {
    const value = resolve(dict, 'V');
    if (value && value !== PDFNull) {
      if (!(value instanceof PDFDict)) refuse('A PDF signature field points to an unreadable signature dictionary.');
      assertSignature(value, bytes);
      signed = true;
    }
  }
  return inspectCertification(dict, bytes) || signed;
}

function inspectCertification(dict: PDFDict, bytes: Buffer): boolean {
  const permissions = resolve(dict, 'Perms');
  if (!permissions || permissions === PDFNull) return false;
  if (!(permissions instanceof PDFDict)) refuse('PDF certification permissions are malformed.');
  let signed = false;
  for (const key of ['DocMDP', 'UR', 'UR3']) {
    if (!entry(permissions, key)) continue;
    const value = resolve(permissions, key);
    if (!(value instanceof PDFDict)) refuse('A PDF certification permission has no readable signature dictionary.');
    assertSignature(value, bytes);
    signed = true;
  }
  return signed;
}

async function loadOriginal(bytes: Buffer): Promise<PDFDocument> {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) refuse('The original PDF is empty or unavailable.');
  const document = await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: true });
  if (!(document.catalog instanceof PDFDict) || document.getPageCount() < 1) refuse('The original PDF has no readable catalog and page tree.');
  return document;
}

/** Strict parsed-object inspection includes compressed and indirectly referenced signature dictionaries. */
export async function assessOriginalPdfIntegrity(bytes: Buffer): Promise<OriginalPdfIntegrityAssessment> {
  try {
    const document = await loadOriginal(bytes);
    const pending: PDFObject[] = [document.catalog, ...document.context.enumerateIndirectObjects().map(([, object]) => object)];
    const seen = new Set<PDFObject>();
    let signed = false;
    while (pending.length) {
      const object = pending.pop()!;
      if (seen.has(object)) continue;
      seen.add(object);
      if (seen.size > MAX_OBJECTS) refuse('The PDF is too complex to inspect its signature structure safely.');
      if (object instanceof PDFRef) {
        const target = document.context.lookup(object);
        if (!target) refuse('The PDF has an unresolved indirect object.');
        pending.push(target);
      } else if (object instanceof PDFDict) {
        signed = inspectDictionary(object, bytes) || signed;
        pending.push(...object.values());
      } else if (object instanceof PDFArray) pending.push(...object.asArray());
      else if (object instanceof PDFStream) pending.push(object.dict);
    }
    return { signed };
  } catch (error) {
    if (error instanceof OriginalPdfIntegrityRefusal) throw error;
    refuse('The PDF could not be parsed safely to establish its embedded signature structure.');
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function oneRecord(value: unknown): Record<string, unknown> | undefined {
  return Array.isArray(value) && value.length === 1 ? asRecord(value[0]) : undefined;
}

function readValidationVerdict(report: unknown): OriginalPdfAValidation {
  const group = oneRecord(asRecord(asRecord(report)?.report)?.jobs);
  const job = oneRecord(group?.job);
  const validation = oneRecord(job?.validationReport);
  if (!validation) {
    return { valid: false, reason: 'veraPDF returned no unambiguous validation report for the original PDF.' };
  }
  const result = asRecord(validation.$);
  if (!/PDF\/A-1B/i.test(String(result?.profileName)) || result?.isCompliant !== 'true') {
    return { valid: false, reason: 'The unchanged original PDF did not validate as PDF/A-1b. Provide a reviewed compliant original; conversion would alter its bytes.' };
  }
  return { valid: true, reason: 'veraPDF validated the unchanged original as PDF/A-1b; this is not cryptographic signature or trust validation.' };
}

/** Validate one byte-for-byte temporary copy with veraPDF. No converter or PDF save operation is invoked. */
export async function validateOriginalPdfA(bytes: Buffer): Promise<OriginalPdfAValidation> {
  let directory: string | undefined;
  try {
    if (!Buffer.isBuffer(bytes) || !bytes.length) return { valid: false, reason: 'The original PDF is empty or unavailable.' };
    directory = await mkdtemp(join(tmpdir(), 'ectd-original-pdfa-'));
    const input = join(directory, 'original.pdf');
    await writeFile(input, bytes, { mode: 0o600 });
    const { stdout } = await execFileAsync(process.env.VERAPDF_BINARY || process.env.VERAPDF_COMMAND || 'verapdf',
      ['--flavour', '1b', '--format', 'xml', input], { timeout: 60_000, maxBuffer: 16 * 1024 * 1024 });
    if (!(await readFile(input)).equals(bytes)) return { valid: false, reason: 'The validation tool changed the temporary original PDF; original-byte PDF/A validation cannot be established.' };
    if (/<!DOCTYPE/i.test(stdout)) return { valid: false, reason: 'veraPDF returned an unsupported validation report.' };
    return readValidationVerdict(await parseStringPromise(stdout, { explicitArray: true, strict: true }));
  } catch {
    return { valid: false, reason: 'Original-byte PDF/A-1b validation is unavailable or failed. Configure veraPDF and retry; the original must not be converted.' };
  } finally {
    if (directory) await rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
}
