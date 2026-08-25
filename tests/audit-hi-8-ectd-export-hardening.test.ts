/**
 * Forensic audit HI-8 — eCTD export correctness/honesty hardening
 *
 * Originally pinned against the legacy `ectdExportService.ts`; that parallel
 * generator was retired in the slice-5b consolidation and these pins were
 * PORTED to the canonical modules that now carry the same guarantees:
 *  - version consistency: the canonical packager's index.xml is v3.2.2
 *    (DOCTYPE util/dtd/ich-ectd-3-2.dtd + dtd-version="3.2") —
 *    submission-gateways/regional-packager.ts.
 *  - region fail-closed: an unsupported core region throws instead of silently
 *    shipping another region's backbone — ectd/core-to-packager.ts
 *    toPackagerRegion (behavioral, not a source grep).
 *  - DTD self-containment: the ZIP structural validator warns when a
 *    DOCTYPE-referenced DTD isn't bundled under util/dtd/ —
 *    submission-gateways/ectd-structural-validator.ts (behavioral).
 *  - DTD vendoring drop-point stays documented (assets/ectd-dtd/README.md).
 *
 * See HI_8_ECTD_SCOPING_BRIEF.md.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';

import { toPackagerRegion } from '../server/services/ectd/core-to-packager';
import { validateEctdPackage } from '../server/services/submission-gateways/ectd-structural-validator';

const packagerSrc = fs.readFileSync(
  path.resolve(__dirname, '../server/services/submission-gateways/regional-packager.ts'),
  'utf8',
);

describe('HI-8 · canonical eCTD index.xml is consistently v3.2.2', () => {
  it('DOCTYPE points at util/dtd and dtd-version is 3.2 (no 4.0 mismatch)', () => {
    expect(packagerSrc).toContain('SYSTEM "util/dtd/ich-ectd-3-2.dtd"');
    expect(packagerSrc).toContain('dtd-version="3.2"');
    // The ICH backbone never claims 4.0 while shipping a 3.2 DTD reference.
    expect(packagerSrc).not.toContain('<!DOCTYPE ectd:ectd SYSTEM "util/dtd/ich-ectd-3-2.dtd">\n<ectd:ectd dtd-version="4.0"');
  });
});

describe('HI-8 · regional generation fails closed on unsupported regions', () => {
  it('maps supported core regions and THROWS on unknown (no silent fallback)', () => {
    expect(toPackagerRegion('fda')).toBe('fda');
    expect(toPackagerRegion('eu')).toBe('ema');
    expect(toPackagerRegion('jp')).toBe('pmda');
    // Health Canada and arbitrary strings must refuse, never mislabel.
    expect(() => toPackagerRegion('hc')).toThrow(/Unsupported region/);
    expect(() => toPackagerRegion('narnia')).toThrow(/Unsupported region/);
  });
});

describe('HI-8 · ZIP validator surfaces missing bundled DTDs', () => {
  async function zipWith(files: Record<string, string>): Promise<Buffer> {
    const zip = new JSZip();
    for (const [name, content] of Object.entries(files)) zip.file(name, content);
    return zip.generateAsync({ type: 'nodebuffer' });
  }

  const BACKBONE_WITH_DTD =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<!DOCTYPE ectd:ectd SYSTEM "util/dtd/ich-ectd-3-2.dtd">\n' +
    '<ectd:ectd xmlns:ectd="http://www.ich.org/ectd" dtd-version="3.2"></ectd:ectd>';

  it('warns when index.xml references a DTD that is not bundled under util/dtd/', async () => {
    const buf = await zipWith({ 'index.xml': BACKBONE_WITH_DTD });
    const result = await validateEctdPackage(buf);
    expect(result.warnings.join(' ')).toMatch(/not self-contained and is not submission-ready/);
  });

  it('does not warn when the referenced DTD IS bundled', async () => {
    const buf = await zipWith({
      'index.xml': BACKBONE_WITH_DTD,
      'util/dtd/ich-ectd-3-2.dtd': '<!ELEMENT ectd:ectd ANY>',
    });
    const result = await validateEctdPackage(buf);
    expect(result.warnings.join(' ')).not.toMatch(/not self-contained/);
  });

  it('re-verifies util/index-md5.txt against the shipped bytes (mismatch = error)', async () => {
    const buf = await zipWith({
      'index.xml': BACKBONE_WITH_DTD,
      'util/index-md5.txt': `${'0'.repeat(32)}  index.xml`,
    });
    const result = await validateEctdPackage(buf);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/checksum mismatch for "index\.xml"/);
  });
});

describe('HI-8 · DTD bundling mechanism + documented drop-point', () => {
  it('the canonical packager bundles vendored DTDs into util/dtd/ (no fabrication)', () => {
    expect(packagerSrc).toContain('listVendoredDtds');
    expect(packagerSrc).toContain('util/dtd/');
  });

  it('ships a documented DTD vendoring point with required-file list + policy', () => {
    const readme = fs.readFileSync(
      path.resolve(__dirname, '../assets/ectd-dtd/README.md'),
      'utf8'
    );
    expect(readme).toContain('ich-ectd-3-2.dtd');
    // The vendoring policy: DTDs are committed once acquired, pinned by the
    // checksum manifest, with the agency license header preserved.
    expect(readme).toContain('Vendoring policy');
    expect(readme).toContain('checksums.txt');
    expect(readme).toContain('license/notice header');
  });
});
