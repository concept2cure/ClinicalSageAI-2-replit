import { PDFDocument, PDFHexString, PDFName, PDFRef } from 'pdf-lib';

/** A real PDF with deterministic metadata, for packaging/hash regression fixtures. */
export async function plainPdfFixture(label: string): Promise<Buffer> {
  const document = await PDFDocument.create();
  document.setCreationDate(new Date('2000-01-01T00:00:00Z'));
  document.setModificationDate(new Date('2000-01-01T00:00:00Z'));
  document.addPage().drawText(label);
  return Buffer.from(await document.save());
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
