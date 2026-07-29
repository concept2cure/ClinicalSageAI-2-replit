/**
 * Tests for the five extension capabilities on the eCTD 4.0 validator:
 *   1. CHECKSUM_MISMATCH (buffer vs declared MD5)
 *   2. MISSING_STUDY_ID  (M5 clinical leaves)
 *   3. detectSequenceGapsFromArray (4-digit sequence numbering, sync array variant)
 *   4. INVALID_LIFECYCLE_TARGET (replace/append/delete must reference prior leaf id)
 *   5. Regional rule packs and validatePackage integration. Per the
 *      reconciliation move that retired server/services/ectd/regional-rules.ts,
 *      the canonical regional rule pack is validateRegionalPackage from
 *      ectd-regional-rules.ts (12-region union: US, EU, JP, CA, CN, KR, UK,
 *      AU, CH, BR, IN, SG). validatePackage still accepts the legacy
 *      'FDA' | 'EMA' | 'PMDA' agency tokens (translated internally to US/EU/JP)
 *      so the historical MISSING_REGIONAL_* finding codes remain stable for
 *      HTTP-route consumers (server/routes/ectd-export.ts and its tests).
 *
 * These cover only the new surface added to ectd4-validator.ts. No DB. Synchronous.
 */

import { describe, it, expect } from 'vitest';
import {
  validatePackage,
  detectSequenceGapsFromArray,
  computeChecksum,
  type ECTDLeaf,
} from '../../server/services/ectd/ectd4-validator';
import { validateRegionalPackage } from '../../server/services/ectd/ectd-regional-rules';

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

// ─── 3. detectSequenceGapsFromArray ───────────────────────────────────────────

describe('detectSequenceGapsFromArray', () => {
  it('returns [] for an empty list', () => {
    expect(detectSequenceGapsFromArray([])).toEqual([]);
  });

  it("returns [] for ['0000'] (single, no gap)", () => {
    expect(detectSequenceGapsFromArray(['0000'])).toEqual([]);
  });

  it("returns ['0001'] for ['0000', '0002'] (single interior gap)", () => {
    expect(detectSequenceGapsFromArray(['0000', '0002'])).toEqual(['0001']);
  });

  it("returns ['0000', '0001'] for ['0002', '0003'] (missing start)", () => {
    expect(detectSequenceGapsFromArray(['0002', '0003'])).toEqual(['0000', '0001']);
  });

  it("returns [] for ['0000', '0001', '0002'] (contiguous)", () => {
    expect(detectSequenceGapsFromArray(['0000', '0001', '0002'])).toEqual([]);
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
//
// validateRegionalPackage (the canonical export from ectd-regional-rules.ts)
// is materially stricter than the retired applyRegionalRules: it requires the
// specific regional-backbone XML file (e.g., m1/us/us-regional.xml), not just
// any leaf under m1/us/. Its finding shape is { ruleId, region, severity,
// message, fix, scope, leafPath? } rather than ValidationFinding, and the
// rule IDs are FDA-ESG-004 / EMA-CESP-001 / PMDA-001 rather than the legacy
// MISSING_REGIONAL_* codes.

describe('validateRegionalPackage (canonical, strict backbone check)', () => {
  const baseContext = {
    applicationNumber: 'IND123456',
    sequenceNumber: '0000',
    submissionType: 'IND',
  };

  it('US: fires FDA-ESG-004 when us-regional.xml is missing', () => {
    const leaf = {
      sectionCode: 'm3.2.S',
      filePath: 'm3/32-body-01.pdf',
      mimeType: 'application/pdf',
      fileSize: 1024,
    };
    const findings = validateRegionalPackage(
      { ...baseContext, region: 'US' as const },
      [leaf],
    );
    expect(findings.some(f => f.ruleId === 'FDA-ESG-004')).toBe(true);
  });

  it('US: no FDA-ESG-004 finding when us-regional.xml backbone is present', () => {
    const leaves = [
      {
        sectionCode: 'm1.1',
        filePath: 'm1/us/us-regional.xml',
        mimeType: 'application/xml',
        fileSize: 512,
      },
    ];
    const findings = validateRegionalPackage(
      { ...baseContext, region: 'US' as const },
      leaves,
    );
    expect(findings.some(f => f.ruleId === 'FDA-ESG-004')).toBe(false);
  });

  it('EU: fires EMA-CESP-001 on an empty leaf set', () => {
    const findings = validateRegionalPackage(
      { ...baseContext, region: 'EU' as const, applicationNumber: 'EMEA/H/C/005012' },
      [],
    );
    expect(findings.some(f => f.ruleId === 'EMA-CESP-001')).toBe(true);
  });

  it('JP: fires PMDA-001 on an empty leaf set', () => {
    const findings = validateRegionalPackage(
      { ...baseContext, region: 'JP' as const, applicationNumber: '12345678' },
      [],
    );
    expect(findings.some(f => f.ruleId === 'PMDA-001')).toBe(true);
  });
});

// ─── 6. validatePackage integrates regional findings (legacy adapter) ─────────
//
// The validatePackage adapter (server/services/ectd/ectd4-validator.ts)
// preserves the historical loose presence check and the legacy
// MISSING_REGIONAL_FDA / MISSING_REGIONAL_EMA / MISSING_REGIONAL_PMDA finding
// codes that the HTTP /api/ectd/export/:id/validate route contract asserts on.
// It accepts both the legacy agency tokens (FDA/EMA/PMDA) and the canonical
// RegulatoryRegion codes (US/EU/JP/CA/...). Agency tokens are translated to
// the matching region internally.

describe('validatePackage with options.region (legacy-loose adapter)', () => {
  it('FDA: fires MISSING_REGIONAL_FDA when no m1.1 section and no m1/us/ path', () => {
    const leaf = makeLeaf({
      sectionCode: 'm3.2.S',
      filePath: 'm3/32-body-01.pdf',
    });
    const result = validatePackage([leaf], 'IND', { region: 'FDA' });
    expect(hasCode(result.findings, 'MISSING_REGIONAL_FDA')).toBe(true);
  });

  it('FDA: no MISSING_REGIONAL_FDA when a leaf has sectionCode m1.1', () => {
    const leaf = makeLeaf({
      sectionCode: 'm1.1',
      filePath: 'm1/11-form-01.pdf',
    });
    const result = validatePackage([leaf], 'IND', { region: 'FDA' });
    expect(hasCode(result.findings, 'MISSING_REGIONAL_FDA')).toBe(false);
  });

  it('FDA: no MISSING_REGIONAL_FDA when a leaf has filePath under m1/us/', () => {
    const leaf = makeLeaf({
      sectionCode: 'm3.2.S',
      filePath: 'm1/us/x.xml',
      mimeType: 'application/xml',
    });
    const result = validatePackage([leaf], 'IND', { region: 'FDA' });
    expect(hasCode(result.findings, 'MISSING_REGIONAL_FDA')).toBe(false);
  });

  it('EMA: fires MISSING_REGIONAL_EMA on an empty leaf set', () => {
    const result = validatePackage([], 'IND', { region: 'EMA' });
    expect(hasCode(result.findings, 'MISSING_REGIONAL_EMA')).toBe(true);
  });

  it('accepts the canonical RegulatoryRegion code US (equivalent to FDA)', () => {
    const leaf = makeLeaf({
      sectionCode: 'm3.2.S',
      filePath: 'm3/32-body-01.pdf',
    });
    const result = validatePackage([leaf], 'IND', { region: 'US' });
    expect(hasCode(result.findings, 'MISSING_REGIONAL_FDA')).toBe(true);
  });
});
