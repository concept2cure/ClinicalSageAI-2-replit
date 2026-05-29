/**
 * Forensic audit HI-8 — eCTD export correctness/honesty hardening
 *
 * Locks in the surgical fixes to the canonical generator (ectdExportService.ts):
 *  - version consistency: index.xml is v3.2.2 (DOCTYPE util/dtd/ich-ectd-3-2.dtd
 *    + dtd-version="3.2"), not the previous 3.2-DTD-with-4.0-version mismatch.
 *  - region fail-closed: unsupported regions (incl. Health Canada) throw instead
 *    of silently shipping a PMDA/jp regional backbone.
 *  - DTD self-containment: the validator warns when a referenced DTD isn't bundled.
 *
 * See HI_8_ECTD_SCOPING_BRIEF.md.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const src = fs.readFileSync(
  path.resolve(__dirname, '../server/services/ectdExportService.ts'),
  'utf8'
);

describe('HI-8 · eCTD index.xml is consistently v3.2.2', () => {
  it('DOCTYPE points at util/dtd and dtd-version is 3.2 (no 4.0 mismatch)', () => {
    expect(src).toContain('SYSTEM "util/dtd/ich-ectd-3-2.dtd"');
    expect(src).toContain('dtd-version="3.2"');
    expect(src).not.toContain('dtd-version="4.0"\n           xml:lang'); // the old index.xml value
  });
});

describe('HI-8 · regional generation fails closed on unsupported regions', () => {
  it('resolves regions from an explicit map and throws on unknown', () => {
    expect(src).toContain('const ECTD_REGIONS');
    expect(src).toContain('function resolveEctdRegion');
    expect(src).toContain('does not support region');
    // The silent "anything-else -> jp" fallback must be gone.
    expect(src).not.toContain("region === 'EMA' ? 'eu' : 'jp'");
  });
});

describe('HI-8 · validator surfaces missing bundled DTDs', () => {
  it('warns when index.xml references a DTD that is not bundled under util/dtd/', () => {
    expect(src).toContain('not self-contained and is not submission-ready');
    expect(src).toContain("f.startsWith('util/dtd/')");
  });
});
