import { PDFDocument, PDFHexString, PDFName, PDFRef } from 'pdf-lib';

/** A real PDF with deterministic metadata, for packaging/hash regression fixtures. */
export async function plainPdfFixture(label: string): Promise<Buffer> {
  const document = await PDFDocument.create();
  document.setCreationDate(new Date('2000-01-01T00:00:00Z'));
  document.setModificationDate(new Date('2000-01-01T00:00:00Z'));
  document.addPage().drawText(label);
  return Buffer.from(await document.save());
}

/**
 * A real one-page PDF, built synchronously with a correct cross-reference
 * table, for fixtures that build leaves inline. Since 5ebfcfd2c the packager
 * parses every original PDF's catalog and page tree before it packages
 * (original-pdf-integrity.ts), so a `%PDF-` header over free text is refused.
 * `label` is the page's text, so each one's bytes and digest differ.
 */
export function minimalPdf(label: string): Buffer {
  const content = `BT /F1 12 Tf 72 720 Td (${label.replace(/[\\()]/g, (c) => `\\${c}`)}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets = objects.map((body, i) => {
    const at = Buffer.byteLength(out, 'latin1');
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return at;
  });
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((at) => `${String(at).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

/** Valid PDF signature structure with deliberately non-cryptographic Contents. Never use as trust evidence. */
export async function signedPdfFixture(compressed = false): Promise<Buffer> {
  const document = await PDFDocument.create();
  document.addPage();
  const contents = PDFHexString.of('30820100' + '12'.repeat(64));
  const signature = document.context.obj({ Type: 'Sig', Filter: 'Adobe.PPKLite', SubFilter: 'adbe.pkcs7.detached',
    ByteRange: [0, 1111111111, 2222222222, 3333333333], Contents: contents });
  // Generation 1 keeps Contents in its original standalone object while the
  // signature field and AcroForm may be in compressed object streams.
  const ref = PDFRef.of(document.context.nextRef().objectNumber, 1);
  document.context.assign(ref, signature);
  const field = document.context.register(document.context.obj({ FT: 'Sig', T: PDFHexString.fromText('Approval'), V: ref }));
  document.catalog.set(PDFName.of('AcroForm'), document.context.register(document.context.obj({ Fields: [field] })));
  const bytes = Buffer.from(await document.save({ useObjectStreams: compressed }));
  const contentStart = bytes.indexOf(Buffer.from(contents.toString()));
  const secondStart = contentStart + contents.sizeInBytes();
  const values = [contentStart, secondStart, bytes.length - secondStart];
  ['1111111111', '2222222222', '3333333333'].forEach((placeholder, index) => {
    bytes.write(String(values[index]).padStart(10, '0'), bytes.indexOf(placeholder), 'ascii');
  });
  return bytes;
}
