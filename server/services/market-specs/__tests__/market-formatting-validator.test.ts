/**
 * Tests for the market formatting validator — proves the per-market formatting
 * datasheet is enforced deterministically against supplied file descriptors.
 */
import { describe, it, expect } from 'vitest';
import { getMarketSpec } from '../market-submission-specs';
import { validateLeavesAgainstMarketSpec, type LeafFileDescriptor } from '../market-formatting-validator';

const usEctd = getMarketSpec('us-ectd')!;
const euEctd = getMarketSpec('eu-ectd')!;

describe('market formatting validator — clean input', () => {
  it('passes well-formed FDA eCTD files with no findings', () => {
    const leaves: LeafFileDescriptor[] = [
      { fileName: 'cover-letter.pdf', filePath: 'm1/us/cover-letter.pdf', fileFormat: 'PDF', fileSizeBytes: 1024 },
      { fileName: 'clinical-overview.pdf', filePath: 'm2/25-clinical-overview/clinical-overview.pdf', fileFormat: 'PDF', fileSizeBytes: 2048 },
    ];
    const r = validateLeavesAgainstMarketSpec(usEctd, leaves);
    expect(r.errors).toBe(0);
    expect(r.warnings).toBe(0);
    expect(r.specId).toBe('us-ectd');
  });
});

describe('market formatting validator — violations', () => {
  it('flags an uppercase / spaced file name against the naming pattern', () => {
    const r = validateLeavesAgainstMarketSpec(usEctd, [{ fileName: 'Cover Letter.PDF' }]);
    expect(r.findings.some((x) => x.rule === 'FILE_NAMING')).toBe(true);
    expect(r.errors).toBeGreaterThanOrEqual(1);
  });

  it('flags an over-length file name', () => {
    const longName = 'a'.repeat(80) + '.pdf';
    const r = validateLeavesAgainstMarketSpec(usEctd, [{ fileName: longName }]);
    expect(r.findings.some((x) => x.rule === 'FILE_NAME_LENGTH')).toBe(true);
  });

  it('flags an over-length path', () => {
    const r = validateLeavesAgainstMarketSpec(usEctd, [
      { fileName: 'ok.pdf', filePath: 'm1/us/' + 'x/'.repeat(130) + 'ok.pdf' },
    ]);
    expect(r.findings.some((x) => x.rule === 'PATH_LENGTH')).toBe(true);
  });

  it('warns on a non-accepted file type', () => {
    const r = validateLeavesAgainstMarketSpec(usEctd, [{ fileName: 'data.xlsx', fileFormat: 'XLSX' }]);
    expect(r.findings.some((x) => x.rule === 'ACCEPTED_FILE_TYPES' && x.severity === 'warning')).toBe(true);
  });

  it('errors on an encrypted file (encryption not allowed)', () => {
    const r = validateLeavesAgainstMarketSpec(usEctd, [{ fileName: 'secure.pdf', encrypted: true }]);
    expect(r.findings.some((x) => x.rule === 'PDF_NO_SECURITY')).toBe(true);
  });

  it('errors when the total exceeds the EU 600 MB submission limit', () => {
    const big: LeafFileDescriptor = { fileName: 'big.pdf', fileSizeBytes: 700 * 1024 * 1024 };
    const r = validateLeavesAgainstMarketSpec(euEctd, [big]);
    expect(r.findings.some((x) => x.rule === 'SUBMISSION_SIZE')).toBe(true);
  });
});

describe('market formatting validator — spec-driven (applies to every market)', () => {
  it('uses the EU pattern (periods allowed) where FDA would also pass', () => {
    // "a.b.pdf" matches EU's lowercase a-z 0-9 . - pattern.
    const r = validateLeavesAgainstMarketSpec(euEctd, [{ fileName: 'study.report.pdf' }]);
    expect(r.findings.some((x) => x.rule === 'FILE_NAMING')).toBe(false);
  });

  it('does not impose a submission size limit where the spec defines none (JP per-file path ok)', () => {
    const jp = getMarketSpec('jp-ectd')!;
    const r = validateLeavesAgainstMarketSpec(jp, [{ fileName: 'doc.pdf', fileSizeBytes: 10 * 1024 * 1024 }]);
    expect(r.findings.some((x) => x.rule === 'FILE_SIZE')).toBe(false);
  });
});
