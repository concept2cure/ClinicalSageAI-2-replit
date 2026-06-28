/**
 * Tests for the five extension capabilities on the eCTD 4.0 validator:
 *   1. CHECKSUM_MISMATCH (buffer vs declared MD5)
 *   2. MISSING_STUDY_ID  (M5 clinical leaves)
 *   3. detectSequenceGaps (4-digit sequence numbering)
 *   4. INVALID_LIFECYCLE_TARGET (replace/append/delete must reference prior leaf id)
 *   5. Regional rule packs (FDA/EMA/PMDA) and validatePackage integration
 *
 * These cover only the new surface added to ectd4-validator.ts and the
 * companion regional-rules.ts. No DB. Synchronous.
 */

import { describe, it, expect } from 'vitest';
import {
  validatePackage,
  detectSequenceGaps,
  computeChecksum,
  type ECTDLeaf,
} from '../../server/services/ectd/ectd4-validator';
import { applyRegionalRules } from '../../server/services/ectd/regional-rules';

// ─── Fixture helpers ──────────────────────────────────────────────────────────

/**
 * Build a minimal valid leaf. Every required field defaults to something that
 * will NOT trigger any other validation finding, so per-test failures are
 * isolated to the rule under test.
 *
 * Default checksum is the MD5 of "test" (lowercase hex), filename is a valid
 * eCTD 2-6-2 name, mime is PDF, size is well under the 100 MB warning, and
 * operation is "new".
 */
function makeLeaf(overrides: Partial<ECTDLeaf> = {}): ECTDLeaf {
  return {
    sectionCode: 'm3.2.S',
    title: 'Test document',
    checksum: '098f6bcd4621d373cade4e832627b4f6', // md5("test")
    checksumType: 'md5',
    operation: 'new',
    filePath: 'm3/32-body-01.pdf',
    mimeType: 'application/pdf',
    fileSize: 1024,
    ...overrides,
  };
}

function hasCode(findings: { code: string }[], code: string): boolean {
  return findings.some(f => f.code === code);
}

// ─── 1. CHECKSUM_MISMATCH ─────────────────────────────────────────────────────

describe('CHECKSUM_MISMATCH (buffer vs declared MD5)', () => {
  it('fires when buffer MD5 differs from declared checksum', () => {
    const buffer = Buffer.from('hello world');
    const wrongChecksum = '00000000000000000000000000000000';
    const leaf = makeLeaf({ buffer, checksum: wrongChecksum });

    const result = validatePackage([leaf], 'IND');

    expect(hasCode(result.findings, 'CHECKSUM_MISMATCH')).toBe(true);
  });

  it('does not fire when buffer MD5 matches declared checksum', () => {
    const buffer = Buffer.from('hello world');
    const correct = computeChecksum(buffer);
    const leaf = makeLeaf({ buffer, checksum: correct });

    const result = validatePackage([leaf], 'IND');

    expect(hasCode(result.findings, 'CHECKSUM_MISMATCH')).toBe(false);
  });
});

// ─── 2. MISSING_STUDY_ID ──────────────────────────────────────────────────────

describe('MISSING_STUDY_ID (M5 clinical leaves)', () => {
  it('fires on an m5.3.5 leaf with no studyId', () => {
    const leaf = makeLeaf({
      sectionCode: 'm5.3.5',
      filePath: 'm5/53-csr-01.pdf',
      // no studyId
    });
    const result = validatePackage([leaf], 'IND');
    expect(hasCode(result.findings, 'MISSING_STUDY_ID')).toBe(true);
  });

  it('does NOT fire on m5.3 (parent, no sub-section, no study)', () => {
    const leaf = makeLeaf({
      sectionCode: 'm5.3',
      filePath: 'm5/53-toc-01.pdf',
      // no studyId
    });
    const result = validatePackage([leaf], 'IND');
    expect(hasCode(result.findings, 'MISSING_STUDY_ID')).toBe(false);
  });

  it('does NOT fire on m3.2.S leaf with no studyId', () => {
    const leaf = makeLeaf({
      sectionCode: 'm3.2.S',
      filePath: 'm3/32-sub-01.pdf',
      // no studyId
    });
    const result = validatePackage([leaf], 'IND');
    expect(hasCode(result.findings, 'MISSING_STUDY_ID')).toBe(false);
  });
});

// ─── 3. detectSequenceGaps ────────────────────────────────────────────────────

describe('detectSequenceGaps', () => {
  it('returns [] for an empty list', () => {
    expect(detectSequenceGaps([])).toEqual([]);
  });

  it("returns [] for ['0000'] (single, no gap)", () => {
    expect(detectSequenceGaps(['0000'])).toEqual([]);
  });

  it("returns ['0001'] for ['0000', '0002'] (single interior gap)", () => {
    expect(detectSequenceGaps(['0000', '0002'])).toEqual(['0001']);
  });

  it("returns ['0000', '0001'] for ['0002', '0003'] (missing start)", () => {
    expect(detectSequenceGaps(['0002', '0003'])).toEqual(['0000', '0001']);
  });

  it("returns [] for ['0000', '0001', '0002'] (contiguous)", () => {
    expect(detectSequenceGaps(['0000', '0001', '0002'])).toEqual([]);
  });
});

// ─── 4. INVALID_LIFECYCLE_TARGET ──────────────────────────────────────────────

describe('INVALID_LIFECYCLE_TARGET (lifecycle ops must reference prior leaf)', () => {
  it("fires on operation='replace' with a lifecycleTarget not in priorLeafIds", () => {
    const leaf = makeLeaf({
      operation: 'replace',
      lifecycleTarget: 'leaf-does-not-exist',
    });
    const priorLeafIds = new Set(['leaf-1', 'leaf-2']);

    const result = validatePackage([leaf], 'IND', { priorLeafIds });

    expect(hasCode(result.findings, 'INVALID_LIFECYCLE_TARGET')).toBe(true);
  });

  it("does NOT fire on operation='new' (no target required)", () => {
    const leaf = makeLeaf({
      operation: 'new',
      // no lifecycleTarget
    });
    const priorLeafIds = new Set(['leaf-1', 'leaf-2']);

    const result = validatePackage([leaf], 'IND', { priorLeafIds });

    expect(hasCode(result.findings, 'INVALID_LIFECYCLE_TARGET')).toBe(false);
  });
});

// ─── 5. Regional rule packs ───────────────────────────────────────────────────

describe('applyRegionalRules', () => {
  it('FDA: fires MISSING_REGIONAL_FDA when no m1.1 section and no m1/us/ path', () => {
    const leaf = makeLeaf({
      sectionCode: 'm3.2.S',
      filePath: 'm3/32-body-01.pdf',
    });
    const findings = applyRegionalRules([leaf], 'FDA');
    expect(hasCode(findings, 'MISSING_REGIONAL_FDA')).toBe(true);
  });

  it('FDA: no finding when a leaf has sectionCode m1.1', () => {
    const leaf = makeLeaf({
      sectionCode: 'm1.1',
      filePath: 'm1/11-form-01.pdf',
    });
    const findings = applyRegionalRules([leaf], 'FDA');
    expect(hasCode(findings, 'MISSING_REGIONAL_FDA')).toBe(false);
  });

  it('FDA: no finding when a leaf has filePath under m1/us/', () => {
    const leaf = makeLeaf({
      sectionCode: 'm3.2.S',
      filePath: 'm1/us/x.xml',
      mimeType: 'application/xml',
    });
    const findings = applyRegionalRules([leaf], 'FDA');
    expect(hasCode(findings, 'MISSING_REGIONAL_FDA')).toBe(false);
  });

  it('EMA: fires MISSING_REGIONAL_EMA on an empty leaf set', () => {
    const findings = applyRegionalRules([], 'EMA');
    expect(hasCode(findings, 'MISSING_REGIONAL_EMA')).toBe(true);
  });
});

// ─── 6. validatePackage integrates regional findings ──────────────────────────

describe('validatePackage with options.region', () => {
  it('includes regional findings (FDA) in its overall result', () => {
    // m3 leaf only — no FDA regional content. With region=FDA the regional
    // rule pack should append MISSING_REGIONAL_FDA to the structural findings.
    const leaf = makeLeaf({
      sectionCode: 'm3.2.S',
      filePath: 'm3/32-body-01.pdf',
    });
    const result = validatePackage([leaf], 'IND', { region: 'FDA' });

    expect(hasCode(result.findings, 'MISSING_REGIONAL_FDA')).toBe(true);
  });
});
