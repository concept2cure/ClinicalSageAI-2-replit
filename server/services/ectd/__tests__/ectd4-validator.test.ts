import { describe, it, expect } from 'vitest';
import {
  validateFilename,
  validatePackage,
  computeChecksum,
  quickValidate,
  type ECTDLeaf,
} from '../ectd4-validator';

const MD5 = 'd41d8cd98f00b204e9800998ecf8427e'; // valid 32-hex md5

/* Derived, not transcribed. This was a copied literal that still carried the
   pre-2026-09-21 Module 1 numbering — m1.5/m1.6/m1.7/m1.9, whose comments named
   a table of contents, the general investigational plan, the Investigator's
   Brochure and an environmental assessment, while those FDA codes are
   Application Status, Meetings, (absent) and Pediatric Administrative
   Information. The fixture therefore pinned the defect in place. Reading the
   required set from the validator keeps this suite testing behaviour rather
   than re-asserting a list. */
const IND_REQUIRED = quickValidate([], 'IND').missing;

const leaf = (over: Partial<ECTDLeaf> & { sectionCode: string }): ECTDLeaf => ({
  title: over.title ?? over.sectionCode,
  checksum: over.checksum ?? MD5,
  checksumType: 'md5',
  operation: over.operation ?? 'new',
  filePath: over.filePath ?? `${over.sectionCode}/doc.pdf`,
  mimeType: over.mimeType ?? 'application/pdf',
  fileSize: over.fileSize ?? 1024,
  ...over,
});

describe('validateFilename', () => {
  it('rejects empty, bad extension, over-length, and invalid characters', () => {
    expect(validateFilename('').valid).toBe(false);
    expect(validateFilename('doc.docx').valid).toBe(false); // disallowed ext
    expect(validateFilename('a'.repeat(61) + '.pdf').valid).toBe(false); // > 64
    expect(validateFilename('Cover Letter.pdf').valid).toBe(false); // space + uppercase
    expect(validateFilename('cover_letter.pdf').valid).toBe(false); // underscore not allowed
  });
  it('accepts a spec-compliant lowercase name', () => {
    expect(validateFilename('m1-2-cover.pdf').valid).toBe(true);
    expect(validateFilename('study.xml').valid).toBe(true);
  });
});

describe('computeChecksum', () => {
  it('is the MD5 of the buffer (32 hex, deterministic)', () => {
    expect(computeChecksum(Buffer.from(''))).toBe(MD5);
    const a = computeChecksum(Buffer.from('hello'));
    expect(a).toMatch(/^[a-f0-9]{32}$/);
    expect(a).toBe(computeChecksum(Buffer.from('hello')));
    expect(a).not.toBe(computeChecksum(Buffer.from('world')));
  });
});

describe('quickValidate', () => {
  it('is 0% complete with all required sections missing', () => {
    const r = quickValidate([]);
    expect(r.completeness).toBe(0);
    expect(r.missing).toHaveLength(IND_REQUIRED.length);
  });
  it('is 100% complete when every required section is present', () => {
    const r = quickValidate(IND_REQUIRED);
    expect(r.completeness).toBe(100);
    expect(r.missing).toHaveLength(0);
  });
  it('reports partial completeness and the specific missing sections', () => {
    const r = quickValidate(IND_REQUIRED.slice(0, 10));
    expect(r.completeness).toBeGreaterThan(0);
    expect(r.completeness).toBeLessThan(100);
    expect(r.missing).toEqual(IND_REQUIRED.slice(10));
  });
  it('applies the NDA profile (not IND) to a non-IND submission', () => {
    // Guards the bug where every type was validated against IND_REQUIRED_SECTIONS.
    // An empty NDA is missing its OWN required sections (21 CFR 314.50 / ICH M4),
    // not IND's — so IND-only sections must never be flagged on an NDA.
    const r = quickValidate([], 'NDA');
    /* IND-only Module 1 homes, at their real FDA codes. (1.12.14
       environmental analysis is NOT one of them — 21 CFR 25 applies to an NDA
       too, and the profile requires it of both.) */
    expect(r.missing).not.toContain('m1.20'); // general investigational plan
    expect(r.missing).not.toContain('m1.14.4.1'); // investigator's brochure
    expect(r.missing).not.toContain('m1.14.4.2'); // investigational drug labeling
    // …and the converse: an NDA owes a debarment certification, an IND does not.
    expect(r.missing).toContain('m1.3.3');
    expect(quickValidate([], 'IND').missing).not.toContain('m1.3.3');
    // NDA-specific required sections that are absent are correctly flagged.
    expect(r.missing).toContain('m2.5'); // Clinical Overview
    expect(r.missing).toContain('m1.14'); // Labeling
  });
});

describe('validatePackage — submission type', () => {
  it('does not flag IND-only sections as missing on a non-IND submission', () => {
    const res = validatePackage([leaf({ sectionCode: 'm1.1' })], 'NDA');
    const missing = res.findings
      .filter(f => f.code === 'MISSING_REQUIRED_SECTION')
      .map(f => f.sectionCode);
    // IND-only sections are not part of the NDA profile, so they're never missing…
    expect(missing).not.toContain('m1.20'); // general investigational plan
    expect(missing).not.toContain('m1.14.4.1'); // investigator's brochure
    expect(missing).not.toContain('m1.14.4.2'); // investigational drug labeling
    // …while an absent NDA-specific required section is flagged.
    expect(missing).toContain('m2.5');
  });
  it('still validates IND required sections for an IND submission', () => {
    const res = validatePackage([], 'IND');
    expect(res.findings.filter(f => f.code === 'MISSING_REQUIRED_SECTION')).toHaveLength(
      IND_REQUIRED.length,
    );
  });
});

describe('validatePackage', () => {
  it('flags every missing required section on an empty package', () => {
    const res = validatePackage([]);
    expect(res.valid).toBe(false);
    expect(res.score).toBeLessThan(100);
    const missing = res.findings.filter((f) => f.code === 'MISSING_REQUIRED_SECTION');
    expect(missing).toHaveLength(IND_REQUIRED.length);
    expect(missing.every((f) => f.severity === 'error')).toBe(true);
  });
  it('raises no missing-section errors when all required sections are present with valid checksums', () => {
    const leaves = IND_REQUIRED.map((sectionCode) => leaf({ sectionCode }));
    const res = validatePackage(leaves);
    expect(res.findings.filter((f) => f.code === 'MISSING_REQUIRED_SECTION')).toHaveLength(0);
  });
  it('flags a malformed MD5 checksum', () => {
    const leaves = IND_REQUIRED.map((sectionCode) => leaf({ sectionCode }));
    leaves[0] = leaf({ sectionCode: 'm1.1', checksum: 'not-a-real-md5' });
    const res = validatePackage(leaves);
    expect(res.findings.some((f) => /md5|checksum/i.test(f.message))).toBe(true);
  });
  it('blocks valid on a non-conformant (2-6-2) filename — not merely a warning', () => {
    const leaves = IND_REQUIRED.map((sectionCode) => leaf({ sectionCode }));
    // A real ESG technical-rejection cause: uppercase + space in the filename.
    leaves[0] = leaf({ sectionCode: 'm1.1', filePath: 'm1.1/Cover Letter.pdf' });
    const res = validatePackage(leaves);
    const fn = res.findings.find((f) => f.code === 'INVALID_FILENAME');
    expect(fn).toBeDefined();
    expect(fn!.severity).toBe('error'); // was 'warning' — did not block valid
    expect(res.valid).toBe(false);
  });
});
