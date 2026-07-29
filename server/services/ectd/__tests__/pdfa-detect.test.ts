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
    const res = classifyPdfA(u.buffer);
    expect(res.isPdf).toBe(true);
    expect(res.pdfVersion).toBe('1.7');
  });
});
