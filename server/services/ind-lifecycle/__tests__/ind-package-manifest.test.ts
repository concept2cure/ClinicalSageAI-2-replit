/**
 * IND submission package manifest — deterministic grouping + checksum QC flag.
 */

import { describe, it, expect } from 'vitest';
import { buildPackageManifest, moduleOf } from '../ind-package-manifest';

describe('moduleOf', () => {
  it('derives the CTD module from a section code (m-prefixed or not)', () => {
    expect(moduleOf('m1.12.4')).toBe('M1');
    expect(moduleOf('2.5')).toBe('M2');
    expect(moduleOf('m5.3.5')).toBe('M5');
    expect(moduleOf('util/foo')).toBe('OTHER');
  });
});

describe('buildPackageManifest', () => {
  const leaves = [
    { sectionCode: 'm5.3.5', title: 'Clinical protocol', lifecycleOp: 'new', checksum: 'aaa' },
    { sectionCode: 'm1.2', title: 'Cover letter', lifecycleOp: 'new', checksum: 'bbb' },
    { sectionCode: 'm1.1', title: 'Form 1571', lifecycleOp: 'new', checksum: null },
    { sectionCode: 'm3.2.s.1', title: 'Drug substance', lifecycleOp: 'replace', checksum: 'ccc' },
  ];

  it('groups by module in canonical M1→M5 order', () => {
    const m = buildPackageManifest({ sequenceNumber: '0001', leaves });
    expect(m.modules.map((x) => x.module)).toEqual(['M1', 'M3', 'M5']);
  });

  it('sorts leaves within a module by section code', () => {
    const m = buildPackageManifest({ sequenceNumber: '0001', leaves });
    const m1 = m.modules.find((x) => x.module === 'M1')!;
    expect(m1.leaves.map((l) => l.sectionCode)).toEqual(['m1.1', 'm1.2']);
  });

  it('counts leaves missing a checksum as a QC flag', () => {
    const m = buildPackageManifest({ sequenceNumber: '0001', leaves });
    expect(m.totalLeaves).toBe(4);
    expect(m.missingChecksums).toBe(1);
  });

  it('carries application/submission metadata and defaults a missing lifecycleOp to new', () => {
    const m = buildPackageManifest({
      sequenceNumber: '0002',
      applicationNumber: 'IND123456',
      submissionType: 'amendment',
      leaves: [{ sectionCode: 'm1.2', title: 'Cover letter' }],
    });
    expect(m.applicationNumber).toBe('IND123456');
    expect(m.submissionType).toBe('amendment');
    expect(m.modules[0].leaves[0].lifecycleOp).toBe('new');
    expect(m.modules[0].leaves[0].checksum).toBeNull();
  });
});
