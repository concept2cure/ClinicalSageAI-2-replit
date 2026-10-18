import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument, PDFHexString, PDFName, PDFRef } from 'pdf-lib';
import { assessOriginalPdfIntegrity, OriginalPdfIntegrityRefusal, validateOriginalPdfA } from '../original-pdf-integrity';
import { signedPdfFixture } from './support/signed-pdf-fixture';

const temporaryDirectories: string[] = [];
const oldVeraBinary = process.env.VERAPDF_BINARY;
const oldVeraCommand = process.env.VERAPDF_COMMAND;
afterEach(async () => {
  if (oldVeraBinary === undefined) delete process.env.VERAPDF_BINARY;
  else process.env.VERAPDF_BINARY = oldVeraBinary;
  if (oldVeraCommand === undefined) delete process.env.VERAPDF_COMMAND;
  else process.env.VERAPDF_COMMAND = oldVeraCommand;
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
});

async function unsignedPdf(): Promise<Buffer> {
  const document = await PDFDocument.create();
  document.addPage().drawText('Original retained PDF');
  return Buffer.from(await document.save());
}

type PdfDictionaryInput = NonNullable<Parameters<PDFDocument['context']['stream']>[1]>;
async function withSignatureDictionary(value: PdfDictionaryInput, compressed = true): Promise<Buffer> {
  const document = await PDFDocument.create();
  document.addPage();
  const ref = document.context.register(document.context.obj(value));
  document.catalog.set(PDFName.of('CustomSignature'), ref);
  return Buffer.from(await document.save({ useObjectStreams: compressed }));
}

describe('original PDF signature structure', () => {
  it('preserves valid ordinary unsigned bytes and ignores text that merely names signature keys', async () => {
    const document = await PDFDocument.create();
    document.addPage().drawText('/ByteRange /Sig /Contents');
    const bytes = Buffer.from(await document.save());
    const original = Buffer.from(bytes);
    await expect(assessOriginalPdfIntegrity(bytes)).resolves.toEqual({ signed: false });
    expect(bytes.equals(original)).toBe(true);
  });

  it.each([false, true])('detects indirect signature fields with compressed objects=%s without claiming crypto validity', async compressed => {
    const bytes = await signedPdfFixture(compressed);
    const original = Buffer.from(bytes);
    await expect(assessOriginalPdfIntegrity(bytes)).resolves.toEqual({ signed: true });
    expect(bytes.equals(original)).toBe(true);
    if (compressed) expect(bytes.includes(Buffer.from('/FT /Sig'))).toBe(false);
  });

  it('does not classify an unfilled signature field as an embedded signature', async () => {
    const bytes = await withSignatureDictionary({ FT: 'Sig', T: PDFHexString.fromText('Unsigned approval') });
    await expect(assessOriginalPdfIntegrity(bytes)).resolves.toEqual({ signed: false });
  });

  it('refuses a malformed signature hidden entirely inside a compressed object stream', async () => {
    const bytes = await withSignatureDictionary({ Type: 'Sig', Contents: PDFHexString.of('30820100'), ByteRange: [0, 8, 4, 2] });
    expect(bytes.includes(Buffer.from('/ByteRange'))).toBe(false);
    await expect(assessOriginalPdfIntegrity(bytes)).rejects.toBeInstanceOf(OriginalPdfIntegrityRefusal);
  });

  it('does not miss lowercase escaped signature keys that pdf-lib leaves noncanonical', async () => {
    const bytes = await withSignatureDictionary({ Contents: PDFHexString.of('30820100'), ByteRange: [0, 8, 4, 2] }, false);
    const escaped = Buffer.from(bytes.toString('latin1').replace('/Contents', '/C#6fntents').replace('/ByteRange', '/ByteRa#6ege'), 'latin1');
    await expect(assessOriginalPdfIntegrity(escaped)).rejects.toBeInstanceOf(OriginalPdfIntegrityRefusal);
  });

  it.each([
    { Type: 'Sig', ByteRange: [0, 5, 12, 3] },
    { Type: 'Sig', Contents: PDFHexString.of('30820100') },
    { Type: 'Sig', Contents: PDFHexString.of('30820100'), ByteRange: [0, 2, -1, 9] },
    { Type: 'Sig', Contents: PDFHexString.of('30820100'), ByteRange: [0, 2.5, 5, 9] },
    { Type: 'Sig', Contents: PDFHexString.of('30820100'), ByteRange: [0, 2, 5, 99999999] },
    { FT: 'Sig', V: 'UnreadableSignature' },
    { FT: 'Sig', V: PDFRef.of(999999) },
    { Parent: { FT: 'Sig' }, V: {} },
    { SubFilter: 'adbe.pkcs7.detached' },
    { Perms: { DocMDP: 'UnreadableCertification' } },
  ])('refuses malformed signature structure %# with an actionable named error', async dictionary => {
    const bytes = await withSignatureDictionary(dictionary);
    await expect(assessOriginalPdfIntegrity(bytes)).rejects.toMatchObject({
      code: 'ORIGINAL_PDF_INTEGRITY_UNVERIFIABLE', message: expect.stringContaining('Original PDF bytes must remain unchanged'),
    });
  });

  it('refuses ByteRange segments excluding an unrelated token', async () => {
    const bytes = await signedPdfFixture();
    const firstPlaceholder = bytes.indexOf(Buffer.from('/ByteRange ['));
    const malformed = Buffer.from(bytes);
    // Keep numeric ranges in bounds but put the excluded gap over the PDF header.
    const end = malformed.indexOf(']', firstPlaceholder);
    const replacement = '/ByteRange [ 0 0000000001 0000000009 0000000010 ';
    malformed.write(replacement.padEnd(end - firstPlaceholder, ' '), firstPlaceholder, 'ascii');
    await expect(assessOriginalPdfIntegrity(malformed)).rejects.toBeInstanceOf(OriginalPdfIntegrityRefusal);
  });

  it('refuses parser failures rather than treating malformed PDFs as unsigned', async () => {
    await expect(assessOriginalPdfIntegrity(Buffer.from('%PDF-1.7\nnot a valid PDF'))).rejects.toMatchObject({ code: 'ORIGINAL_PDF_INTEGRITY_UNVERIFIABLE' });
  });
});

const validReport = (compliant: string) => `<?xml version="1.0"?><report><jobs><job><validationReport profileName="PDF/A-1B validation profile" isCompliant="${compliant}"/></job></jobs></report>`;

async function stubValidator(report: string, exitCode = 0, mutate = false): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'original-pdf-test-'));
  temporaryDirectories.push(directory);
  const binary = join(directory, 'verapdf');
  const capture = join(directory, 'received.pdf');
  const args = join(directory, 'args.json');
  const script = `#!${process.execPath}\nconst fs = require('node:fs');\nconst args = process.argv.slice(2);\nconst input = args[args.length-1];\nfs.copyFileSync(input, ${JSON.stringify(capture)});\nfs.writeFileSync(${JSON.stringify(args)}, JSON.stringify(args));\n${mutate ? 'fs.appendFileSync(input, "changed");' : ''}\nprocess.stdout.write(${JSON.stringify(report)});\nprocess.exit(${exitCode});\n`;
  await writeFile(binary, script, { mode: 0o700 });
  process.env.VERAPDF_BINARY = binary;
  return directory;
}

describe('original-byte PDF/A validation', () => {
  it('requires an explicit veraPDF compliance result for a byte-identical temporary original', async () => {
    const bytes = await unsignedPdf();
    const original = Buffer.from(bytes);
    const directory = await stubValidator(validReport('true'));
    const verdict = await validateOriginalPdfA(bytes);
    expect(verdict).toMatchObject({ valid: true, reason: expect.stringContaining('not cryptographic') });
    expect(await readFile(join(directory, 'received.pdf'))).toEqual(original);
    expect(bytes).toEqual(original);
    const args = JSON.parse(await readFile(join(directory, 'args.json'), 'utf8'));
    expect(args.slice(0, 4)).toEqual(['--flavour', '1b', '--format', 'xml']);
    await expect(readFile(args[4])).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it.each([validReport('false'), '', 'PASS', '<report/>', validReport('true').replace('PDF/A-1B', 'PDF/A-2B'),
    '<report><jobs><job><validationReport isCompliant="true"/></job></jobs></report>'])('refuses absent, wrong-profile or noncompliant validation evidence %#', async report => {
    await stubValidator(report);
    await expect(validateOriginalPdfA(await unsignedPdf())).resolves.toMatchObject({ valid: false });
  });

  it('refuses a failed validator even when its stdout contains a passing report', async () => {
    await stubValidator(validReport('true'), 1);
    await expect(validateOriginalPdfA(await unsignedPdf())).resolves.toMatchObject({ valid: false });
  });

  it('refuses a validator that changed the temporary file and keeps caller bytes intact', async () => {
    const bytes = await unsignedPdf();
    const original = Buffer.from(bytes);
    await stubValidator(validReport('true'), 0, true);
    await expect(validateOriginalPdfA(bytes)).resolves.toMatchObject({ valid: false, reason: expect.stringContaining('changed') });
    expect(bytes).toEqual(original);
  });

  it('refuses when veraPDF is unavailable', async () => {
    process.env.VERAPDF_BINARY = '/definitely-absent-original-pdf-verapdf';
    await expect(validateOriginalPdfA(await unsignedPdf())).resolves.toMatchObject({ valid: false, reason: expect.stringContaining('Configure veraPDF') });
  });
});
