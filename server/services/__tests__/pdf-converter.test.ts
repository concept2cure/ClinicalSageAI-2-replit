import { describe, it, expect } from 'vitest';
import { makeDeterministic, looksLikePdf } from '../pdf-converter';

// Synthetic PDF fragment containing every metadata field we strip. We don't
// need a valid PDF for these tests — just bytes that match the regexes.
function buildSyntheticPdf({
  creation,
  mod,
  producer,
  creator,
  id1,
  id2,
}: {
  creation: string;
  mod: string;
  producer: string;
  creator: string;
  id1: string;
  id2: string;
}): Buffer {
  return Buffer.from(
    [
      '%PDF-1.7',
      `<< /CreationDate (D:${creation}) /ModDate (D:${mod})`,
      `   /Producer (${producer}) /Creator (${creator}) >>`,
      'trailer',
      `<< /Size 8 /Root 1 0 R /ID [<${id1}> <${id2}>] >>`,
      '%%EOF',
    ].join('\n'),
    'binary'
  );
}

describe('makeDeterministic', () => {
  it('produces byte-identical output for two PDFs that differ only in metadata', () => {
    const a = buildSyntheticPdf({
      creation: '20260101120000Z',
      mod: '20260101120000Z',
      producer: 'LibreOffice 7.5.1.2 (Linux build-1234)',
      creator: 'Writer',
      id1: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      id2: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    });
    const b = buildSyntheticPdf({
      creation: '20260507093000Z',
      mod: '20260507093000Z',
      producer: 'LibreOffice 7.6.4.0 (Linux build-9999)',
      creator: 'Writer (different build)',
      id1: '11111111111111111111111111111111',
      id2: '22222222222222222222222222222222',
    });

    expect(makeDeterministic(a).equals(makeDeterministic(b))).toBe(true);
  });

  it('replaces CreationDate / ModDate with the normalized epoch', () => {
    const input = buildSyntheticPdf({
      creation: '20260507093000Z',
      mod: '20260507093000Z',
      producer: 'p',
      creator: 'c',
      id1: '0'.repeat(32),
      id2: '0'.repeat(32),
    });
    const out = makeDeterministic(input).toString('binary');
    expect(out).toContain('/CreationDate (D:19700101000000Z)');
    expect(out).toContain('/ModDate (D:19700101000000Z)');
  });

  it('replaces Producer and Creator with canonical strings', () => {
    const input = buildSyntheticPdf({
      creation: '20260101120000Z',
      mod: '20260101120000Z',
      producer: 'LibreOffice 7.5.1.2',
      creator: 'Writer',
      id1: '0'.repeat(32),
      id2: '0'.repeat(32),
    });
    const out = makeDeterministic(input).toString('binary');
    expect(out).toContain('/Producer (Concept2Cure RI canonical)');
    expect(out).toContain('/Creator (Concept2Cure RI canonical)');
  });

  it('zeroes the trailer /ID pair regardless of original values', () => {
    const input = buildSyntheticPdf({
      creation: '20260101120000Z',
      mod: '20260101120000Z',
      producer: 'p',
      creator: 'c',
      id1: 'deadbeefdeadbeefdeadbeefdeadbeef',
      id2: 'cafebabecafebabecafebabecafebabe',
    });
    const out = makeDeterministic(input).toString('binary');
    expect(out).toContain(
      '/ID [<00000000000000000000000000000000> <00000000000000000000000000000000>]'
    );
    expect(out).not.toContain('deadbeef');
    expect(out).not.toContain('cafebabe');
  });

  it('leaves non-metadata content untouched', () => {
    const input = Buffer.concat([
      Buffer.from('%PDF-1.7\n', 'binary'),
      Buffer.from('STREAM_CONTENT_DO_NOT_TOUCH', 'binary'),
      Buffer.from('\n/CreationDate (D:20260101120000Z)\n', 'binary'),
      Buffer.from('MORE_STREAM_CONTENT', 'binary'),
      Buffer.from('\n%%EOF\n', 'binary'),
    ]);
    const out = makeDeterministic(input).toString('binary');
    expect(out).toContain('STREAM_CONTENT_DO_NOT_TOUCH');
    expect(out).toContain('MORE_STREAM_CONTENT');
    expect(out).toContain('/CreationDate (D:19700101000000Z)');
  });
});

describe('looksLikePdf', () => {
  it('accepts a PDF header', () => {
    expect(looksLikePdf(Buffer.from('%PDF-1.7\n…', 'binary'))).toBe(true);
  });

  it('rejects non-PDF buffers', () => {
    expect(looksLikePdf(Buffer.from('not a pdf'))).toBe(false);
    expect(looksLikePdf(Buffer.alloc(0))).toBe(false);
    expect(looksLikePdf(Buffer.from('PK\x03\x04docx'))).toBe(false);
  });
});
