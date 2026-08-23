/**
 * §11.10(e) export manifest canonicalization — ledger L55.
 *
 * Two things have to hold at once, and they pull against each other: the
 * signature must now cover the whole manifest, and every export signed before
 * that change must still verify. The version marker is what lets both be true,
 * so these tests assert both halves — a fix that quietly orphaned existing
 * signatures would be a worse outcome than the defect.
 */
import { describe, expect, it } from 'vitest';

import { canonicalizeManifest, type ExportManifest } from '../signedAuditExport';

function manifest(over: Partial<ExportManifest> = {}): ExportManifest {
  return {
    exportId: 'AUDIT-EXPORT-1-aa',
    exportedAt: '2026-08-14T00:00:00.000Z',
    exportedBy: 'u1',
    exportedByRole: 'admin',
    exportSource: 'Concept2Cure / Concept2Cure Platform',
    queryFilters: { organizationId: 7, startDate: '2026-01-01', endDate: '2026-01-31' },
    format: 'json',
    rowCount: 10,
    truncated: false,
    dataHash: 'deadbeef',
    hashAlgorithm: 'SHA-256',
    manifestVersion: 2,
    chainIntegrity: {
      status: 'intact',
      totalEntries: 10,
      brokenLinks: 0,
      verifiedAt: '2026-08-14T00:00:00.000Z',
    },
    compliance: {
      standard: '21 CFR Part 11',
      section: '§11.10(e)',
      description: 'Tamper-evident audit trail export with cryptographic integrity verification',
    },
    ...over,
  };
}

describe('version 2 — the signature covers the manifest', () => {
  it('includes the nested fields that version 1 signed as {}', () => {
    const out = canonicalizeManifest(manifest());
    expect(out).toContain('2026-01-01');       // queryFilters.startDate
    expect(out).toContain('"status":"intact"'); // chainIntegrity.status
    expect(out).toContain('21 CFR Part 11');    // compliance.standard
    expect(out).not.toContain('"queryFilters":{}');
    expect(out).not.toContain('"chainIntegrity":{}');
  });

  it('distinguishes a broken chain from an intact one', () => {
    // The defect that made this row severe: under v1 these signed identically,
    // so a failed chain check could be presented as a passing one.
    const intact = canonicalizeManifest(manifest());
    const broken = canonicalizeManifest(
      manifest({
        chainIntegrity: {
          status: 'broken',
          totalEntries: 10,
          brokenLinks: 4,
          verifiedAt: '2026-08-14T00:00:00.000Z',
        },
      }),
    );
    expect(intact).not.toBe(broken);
  });

  it('distinguishes exports covering different date ranges', () => {
    const jan = canonicalizeManifest(manifest());
    const all = canonicalizeManifest(
      manifest({ queryFilters: { organizationId: 7, startDate: '2020-01-01', endDate: '2026-12-31' } }),
    );
    expect(jan).not.toBe(all);
  });

  it('is insensitive to key order, which is the point of canonicalizing', () => {
    const a = canonicalizeManifest(manifest());
    const b = canonicalizeManifest(
      manifest({ queryFilters: { endDate: '2026-01-31', startDate: '2026-01-01', organizationId: 7 } }),
    );
    expect(a).toBe(b);
  });

  it('emits valid JSON', () => {
    expect(() => JSON.parse(canonicalizeManifest(manifest()))).not.toThrow();
  });
});

describe('version 1 — exports already issued still verify', () => {
  const legacy = manifest({ manifestVersion: undefined });

  it('reproduces the original expression byte for byte', () => {
    // An export signed before the fix carries no marker. Its signature was
    // taken over exactly this string, so this must not change — ever.
    const asOriginallySigned = JSON.stringify(legacy, Object.keys(legacy).sort());
    expect(canonicalizeManifest(legacy)).toBe(asOriginallySigned);
  });

  it('still carries the defect, deliberately, because the signature did', () => {
    // Not a bug in this test. Version 1 exists to reproduce what was signed,
    // and what was signed had empty nested objects. Fixing it here would
    // orphan every signature it was meant to preserve.
    const out = canonicalizeManifest(legacy);
    expect(out).toContain('"queryFilters":{}');
    expect(out).toContain('"chainIntegrity":{}');
  });

  it('routes by the manifest\'s own declaration, not by a global switch', () => {
    // The same content, one marked and one not, canonicalizes differently —
    // which is what lets old and new exports coexist.
    expect(canonicalizeManifest(manifest())).not.toBe(canonicalizeManifest(legacy));
  });
});
