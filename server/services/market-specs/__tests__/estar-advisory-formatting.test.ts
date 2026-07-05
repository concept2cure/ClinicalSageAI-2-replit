/**
 * E1 — the FDA eSTAR advisory formatting check wired into POST /api/510k/estar/build.
 * Confirms the integration point the route relies on: the us-estar market spec
 * resolves, and validating the built package's files against it yields a
 * well-formed FormattingReport. (The validator's rule behavior is covered in
 * market-formatting-validator.test.ts; this pins the eSTAR wiring specifically.)
 */

import { describe, it, expect } from 'vitest';
import { getMarketSpec } from '../market-submission-specs';
import { validateLeavesAgainstMarketSpec, type LeafFileDescriptor } from '../market-formatting-validator';

const ESTAR_PDFS: LeafFileDescriptor[] = [
  { fileName: '01_CoverLetter.pdf', fileFormat: 'PDF', fileSizeBytes: 12_000 },
  { fileName: '02_510kSummary.pdf', fileFormat: 'PDF', fileSizeBytes: 20_000 },
  { fileName: '03_DeviceDescription.pdf', fileFormat: 'PDF', fileSizeBytes: 18_000 },
  { fileName: '04_SE_Discussion.pdf', fileFormat: 'PDF', fileSizeBytes: 22_000 },
  { fileName: '05_PerformanceTesting.pdf', fileFormat: 'PDF', fileSizeBytes: 30_000 },
  { fileName: '06_Labeling.pdf', fileFormat: 'PDF', fileSizeBytes: 15_000 },
];

describe('eSTAR advisory formatting (E1 wiring)', () => {
  it('resolves the us-estar market spec', () => {
    const spec = getMarketSpec('us-estar');
    expect(spec).toBeTruthy();
    expect(spec!.formatting).toBeTruthy();
  });

  it('validates the built eSTAR package into a well-formed report', () => {
    const spec = getMarketSpec('us-estar')!;
    const report = validateLeavesAgainstMarketSpec(spec, ESTAR_PDFS);
    expect(report).toMatchObject({
      specId: 'us-estar',
      errors: expect.any(Number),
      warnings: expect.any(Number),
      findings: expect.any(Array),
    });
    // A clean set of PDFs should not raise format errors.
    expect(report.findings.every((f) => f.rule !== 'file_format')).toBe(true);
  });

  it('flags an encrypted attachment (the case the advisory is meant to catch)', () => {
    const spec = getMarketSpec('us-estar')!;
    const withEncrypted: LeafFileDescriptor[] = [
      ...ESTAR_PDFS,
      { fileName: 'attachments/locked.pdf', fileFormat: 'PDF', fileSizeBytes: 5_000, encrypted: true },
    ];
    const report = validateLeavesAgainstMarketSpec(spec, withEncrypted);
    expect(report.findings.some((f) => /encrypt/i.test(f.rule) || /encrypt/i.test(f.message))).toBe(true);
  });
});
