import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { PDFDocument, PDFRawStream } from 'pdf-lib';
import { normalizeGeneratedPdf } from '../pdf-converter';

const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
function streamIdentities(pdf: PDFDocument) {
  return pdf.context.enumerateIndirectObjects().flatMap(([, value]) => value instanceof PDFRawStream ? [sha(value.contents)] : []).sort();
}
function verifyPlainCrossReferences(bytes: Buffer) {
  const text = bytes.toString('latin1');
  const match = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(text);
  expect(match).not.toBeNull();
  const offset = Number(match![1]);
  expect(text.slice(offset, offset + 4)).toBe('xref');
  const section = text.slice(offset).split('\n');
  const [, countText] = section[1].trim().split(/\s+/);
  const count = Number(countText);
  expect(count).toBeGreaterThan(1);
  for (let id = 1; id < count; id++) {
    const [objectOffset, generation, state] = section[id + 2].trim().split(/\s+/);
    if (state === 'n') expect(text.slice(Number(objectOffset))).toMatch(new RegExp(`^${id} ${Number(generation)} obj`));
  }
}
describe('structural normalization of newly rendered PDFs', () => {
  it('retains content streams and page geometry while rebuilding correct object offsets', async () => {
    const source = await PDFDocument.create();
    source.addPage([842, 595]).drawText('Company correspondence reviewed body and signature manifestation');
    source.addPage([842, 595]).drawText('Additional original content');
    source.setCreationDate(new Date('2026-10-18T00:00:00Z'));
    source.setProducer('A renderer name whose length differs from the normalized producer');
    const input = Buffer.from(await source.save({ useObjectStreams: false }));
    const originalHash = sha(input);
    const before = await PDFDocument.load(input, { updateMetadata: false });
    const output = await normalizeGeneratedPdf(input);
    verifyPlainCrossReferences(output);
    const after = await PDFDocument.load(output, { updateMetadata: false });
    expect(after.getPageCount()).toBe(2);
    expect(after.getPages().map(page => page.getSize())).toEqual([{ width: 842, height: 595 }, { width: 842, height: 595 }]);
    expect(streamIdentities(after)).toEqual(streamIdentities(before));
    expect(after.getProducer()).toBe('Concept2Cure RI canonical');
    expect(after.getCreationDate()).toEqual(new Date(0));
    expect(sha(output)).not.toBe(sha(input));
    expect(sha(input)).toBe(originalHash);
  });
  it('refuses malformed renderer output before it can become a governed artifact', async () => {
    await expect(normalizeGeneratedPdf(Buffer.from('%PDF-1.7\nnot a complete PDF'))).rejects.toThrow();
  });
});
