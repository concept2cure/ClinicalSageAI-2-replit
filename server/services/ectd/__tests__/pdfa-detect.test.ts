import { describe, it, expect } from 'vitest';
import { classifyPdfA } from '../pdfa-detect';

const bytes = (s: string): Uint8Array => new Uint8Array([...s].map(c => c.charCodeAt(0)));

describe('classifyPdfA', () => {
  it('rejects a non-PDF buffer', () => {
    const res = classifyPdfA(bytes('not a pdf at all'));
    expect(res.isPdf).toBe(false);
    expect(res.acceptableForEctd).toBe(false);
    expect(res.pdfVersion).toBeNull();
  });

  it('reads the PDF version from the header', () => {
    const res = classifyPdfA(bytes('%PDF-1.7\n%âãÏÓ\n... body ...'));
    expect(res.isPdf).toBe(true);
    expect(res.pdfVersion).toBe('1.7');
  });

  it('detects a declared PDF/A part and conformance from XMP (attribute form)', () => {
    const res = classifyPdfA(bytes('%PDF-1.4\n<rdf:Description pdfaid:part="1" pdfaid:conformance="B"/>\n'));
    expect(res.pdfAClaimed).toBe(true);
    expect(res.pdfAPart).toBe('1');
    expect(res.pdfAConformance).toBe('B');
    expect(res.acceptableForEctd).toBe(true);
  });

  it('detects PDF/A identifiers in element form', () => {
    const res = classifyPdfA(bytes('%PDF-2.0\n<pdfaid:part>3</pdfaid:part><pdfaid:conformance>U</pdfaid:conformance>'));
    expect(res.pdfAPart).toBe('3');
    expect(res.pdfAConformance).toBe('U');
  });

  it('flags an encrypted PDF as unacceptable for eCTD', () => {
    const res = classifyPdfA(bytes('%PDF-1.6\n... /Encrypt 12 0 R ... trailer'));
    expect(res.encrypted).toBe(true);
    expect(res.acceptableForEctd).toBe(false);
    expect(res.reason).toMatch(/encrypted/i);
  });

  it('treats a valid header without PDF/A claim as acceptable but undeclared', () => {
    const res = classifyPdfA(bytes('%PDF-1.5\n... ordinary pdf body ...'));
    expect(res.isPdf).toBe(true);
    expect(res.pdfAClaimed).toBe(false);
    expect(res.acceptableForEctd).toBe(true);
    expect(res.reason).toMatch(/not declared/i);
  });

  it('accepts an ArrayBuffer input', () => {
    const u = bytes('%PDF-1.7\n');
    // Copy into a standalone ArrayBuffer rather than passing `u.buffer`, which
    // is typed ArrayBufferLike (it could be a SharedArrayBuffer). This makes
    // the case actually exercise the ArrayBuffer branch it is named for.
    const ab = new ArrayBuffer(u.byteLength);
    new Uint8Array(ab).set(u);
    const res = classifyPdfA(ab);
    expect(res.isPdf).toBe(true);
    expect(res.pdfVersion).toBe('1.7');
  });
});

/**
 * The encryption check has to look where /Encrypt actually is.
 *
 * `classifyPdfA` built one 512 KB window from the START of the file and tested
 * `/\/Encrypt\b/` against it. In a real PDF the `/Encrypt` entry lives in the
 * TRAILER dictionary, at the END of the file — that is where the spec puts it.
 * So the check found it only in files small enough for the head window to reach
 * the trailer. Every clinical study report, every 2.7 summary, every scanned
 * appendix is larger than 512 KB, and for all of them the gate returned
 * `encrypted: false` and `acceptableForEctd` true on that count: a check that
 * could only pass, reported as a check that passed.
 *
 * The window exists for a good reason — XMP metadata appears early and scanning
 * a 300 MB file as a Latin-1 string is not free — so the fix is a second bounded
 * window at the tail rather than reading the whole file.
 */
describe('classifyPdfA — /Encrypt lives in the trailer, not the header', () => {
  const HEAD = '%PDF-1.7\n';
  const XMP =
    '<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/">' +
    '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description ' +
    'xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/" pdfaid:part="1" pdfaid:conformance="B"/>' +
    '</rdf:RDF></x:xmpmeta><?xpacket end="w"?>';

  /** A PDF whose trailer sits beyond the head window, with or without /Encrypt. */
  function pdfWithTrailer(encrypted: boolean, padKb = 700): Uint8Array {
    const trailer = encrypted
      ? 'trailer\n<< /Size 42 /Root 1 0 R /Encrypt 40 0 R >>\nstartxref\n0\n%%EOF\n'
      : 'trailer\n<< /Size 42 /Root 1 0 R >>\nstartxref\n0\n%%EOF\n';
    const body = ' '.repeat(padKb * 1024);
    const s = HEAD + XMP + body + trailer;
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
    return out;
  }

  it('detects encryption declared in the trailer of a file larger than the head window', () => {
    const r = classifyPdfA(pdfWithTrailer(true));
    expect(r.isPdf).toBe(true);
    expect(r.encrypted, 'a secured PDF was accepted because /Encrypt was past 512 KB').toBe(true);
    expect(r.acceptableForEctd).toBe(false);
    expect(r.reason).toMatch(/encrypted|secured/i);
  });

  it('does not invent encryption for a large unsecured PDF', () => {
    const r = classifyPdfA(pdfWithTrailer(false));
    expect(r.encrypted).toBe(false);
    // PDF/A is still claimed from the XMP at the head, so this stays acceptable.
    expect(r.pdfAClaimed).toBe(true);
    expect(r.acceptableForEctd).toBe(true);
  });

  it('still catches it in a small file, where head and tail overlap', () => {
    const r = classifyPdfA(pdfWithTrailer(true, 0));
    expect(r.encrypted).toBe(true);
  });
});
