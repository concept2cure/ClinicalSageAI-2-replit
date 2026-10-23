/**
 * Unit tests for the internal eCTD structural validator.
 *
 * Deterministic in-memory checks only: media type, PDF magic bytes, empty
 * sections, module-1 presence, and the bundle-empty case. This is NOT an agency
 * validator — these tests assert the structural pre-flight contract the assemble
 * route stores and the transmit route hard-gates on.
 */
import { describe, it, expect } from 'vitest';
import { validateEctdLeafs } from '../server/services/submission-gateways/ectd-structural-validator';

const pdf = (s = 'body') => Buffer.concat([Buffer.from('%PDF-1.7\n', 'utf8'), Buffer.from(s, 'utf8')]);

describe('validateEctdLeafs', () => {
  it('reports 0 errors for valid PDF leafs (m1 present)', () => {
    const res = validateEctdLeafs(
      [
        { path: 'm1/us/admin.pdf', mediaType: 'application/pdf', content: pdf() },
        { path: 'm3/cmc.pdf', mediaType: 'application/pdf', content: pdf() },
      ],
      { region: 'FDA' },
    );
    expect(res.errorCount).toBe(0);
    expect(res.findings.some((f) => f.ruleId === 'MODULE-M1-MISSING')).toBe(false);
  });

  it('flags a non-PDF leaf with a LEAF-MEDIATYPE error', () => {
    const res = validateEctdLeafs(
      [
        { path: 'm1/us/admin.pdf', mediaType: 'application/pdf', content: pdf() },
        { path: 'm3/data.xml', mediaType: 'application/xml', content: Buffer.from('<x/>') },
      ],
      { region: 'FDA' },
    );
    const mediatypeErrors = res.findings.filter((f) => f.ruleId === 'LEAF-MEDIATYPE');
    expect(mediatypeErrors).toHaveLength(1);
    expect(mediatypeErrors[0].severity).toBe('error');
    expect(res.errorCount).toBe(1);
  });

  it('flags a PDF leaf whose buffer is not %PDF- with a LEAF-CORRUPT error', () => {
    const res = validateEctdLeafs(
      [
        { path: 'm1/us/admin.pdf', mediaType: 'application/pdf', content: pdf() },
        { path: 'm3/cmc.pdf', mediaType: 'application/pdf', content: Buffer.from('not a pdf', 'utf8') },
      ],
      { region: 'FDA' },
    );
    const corrupt = res.findings.filter((f) => f.ruleId === 'LEAF-CORRUPT');
    expect(corrupt).toHaveLength(1);
    expect(corrupt[0].severity).toBe('error');
    expect(corrupt[0].filePath).toBe('m3/cmc.pdf');
    expect(res.errorCount).toBe(1);
  });

  it('warns on an empty-section leaf (SECTION-EMPTY) via emptyLeafPaths', () => {
    const res = validateEctdLeafs(
      [
        { path: 'm1/us/admin.pdf', mediaType: 'application/pdf', content: pdf() },
        { path: 'm3/cmc.pdf', mediaType: 'application/pdf', content: pdf() },
      ],
      { region: 'FDA', emptyLeafPaths: ['m3/cmc.pdf'] },
    );
    const empty = res.findings.filter((f) => f.ruleId === 'SECTION-EMPTY');
    expect(empty).toHaveLength(1);
    expect(empty[0].severity).toBe('warning');
    expect(empty[0].filePath).toBe('m3/cmc.pdf');
    expect(res.errorCount).toBe(0);
    expect(res.warningCount).toBeGreaterThanOrEqual(1);
  });

  it('warns on an empty-section leaf detected by the [EMPTY SECTION] marker', () => {
    const res = validateEctdLeafs(
      [
        {
          path: 'm1/us/admin.pdf',
          mediaType: 'application/pdf',
          content: Buffer.from('[EMPTY SECTION] admin (module1_admin)\n', 'utf8'),
        },
      ],
      { region: 'FDA' },
    );
    // marker content is not %PDF- so it also yields a LEAF-CORRUPT error, but the
    // SECTION-EMPTY warning must still be present.
    expect(res.findings.some((f) => f.ruleId === 'SECTION-EMPTY' && f.severity === 'warning')).toBe(true);
  });

  it('errors with BUNDLE-EMPTY when there are zero leafs', () => {
    const res = validateEctdLeafs([], { region: 'FDA' });
    expect(res.findings.some((f) => f.ruleId === 'BUNDLE-EMPTY' && f.severity === 'error')).toBe(true);
    expect(res.errorCount).toBe(1);
  });

  it('errors LEAF-FILENAME for a name that breaks the eCTD file-name rule — only when the caller enforces it', () => {
    const tooLong = 'm3/' + 'a'.repeat(61) + '.pdf'; // 65-character basename
    const upper = 'm3/Drug-Substance.pdf';
    const leafs = [
      { path: 'm1/us/cover.pdf', mediaType: 'application/pdf', content: pdf() },
      { path: tooLong, mediaType: 'application/pdf', content: pdf() },
      { path: upper, mediaType: 'application/pdf', content: pdf() },
    ];
    const enforced = validateEctdLeafs(leafs, { region: 'FDA', enforceFileNames: true });
    const names = enforced.findings.filter((f) => f.ruleId === 'LEAF-FILENAME');
    expect(names).toHaveLength(2);
    expect(names.every((f) => f.severity === 'error')).toBe(true);
    expect(names.map((f) => f.filePath)).toEqual([tooLong, upper]);
    expect(enforced.errorCount).toBe(2);
    // A device bundle (eSTAR / EUDAMED) is not made of eCTD leaves; the rule is not applied.
    const device = validateEctdLeafs(leafs, { region: 'FDA' });
    expect(device.findings.some((f) => f.ruleId === 'LEAF-FILENAME')).toBe(false);
    expect(device.errorCount).toBe(0);
  });

  it('warns MODULE-M1-MISSING when no m1 leaf is present', () => {
    const res = validateEctdLeafs(
      [{ path: 'm3/cmc.pdf', mediaType: 'application/pdf', content: pdf() }],
      { region: 'FDA' },
    );
    expect(res.findings.some((f) => f.ruleId === 'MODULE-M1-MISSING' && f.severity === 'warning')).toBe(true);
    expect(res.errorCount).toBe(0);
  });
});

describe('validateEctdLeafs — the region’s eCTD file rules', () => {
  // 2026-10-08 (sweep VP-3): only the %PDF- magic was read, so PDF 1.0, 1.3 and
  // 2.0 leaves passed; FDA, EMA, PMDA and Health Canada accept PDF 1.4–1.7.
  it('errors LEAF-PDF-VERSION for an eCTD leaf outside the region’s accepted PDF range', () => {
    const at = (v: string) => Buffer.from(`%PDF-${v}\nbody`, 'utf8');
    const leafs = [
      { path: 'm1/us/cover.pdf', mediaType: 'application/pdf', content: at('1.4') },
      { path: 'm2/old.pdf', mediaType: 'application/pdf', content: at('1.3') },
      { path: 'm2/new.pdf', mediaType: 'application/pdf', content: at('2.0') },
      { path: 'm2/none.pdf', mediaType: 'application/pdf', content: Buffer.from('%PDF-x body') },
      { path: 'm3/ok.pdf', mediaType: 'application/pdf', content: at('1.7') },
    ];
    const res = validateEctdLeafs(leafs, { region: 'FDA', enforceFileNames: true });
    const version = res.findings.filter((f) => f.ruleId === 'LEAF-PDF-VERSION');
    expect(version.map((f) => f.filePath)).toEqual(['m2/old.pdf', 'm2/new.pdf', 'm2/none.pdf']);
    expect(version.every((f) => f.severity === 'error')).toBe(true);
    expect(version[0].message).toMatch(/1\.3/);
    expect(version[0].message).toMatch(/1\.4–1\.7/);
    expect(res.errorCount).toBe(3);
    // The range is the region's: the same leaves under EMA's spec read the same.
    expect(validateEctdLeafs(leafs, { region: 'EMA', enforceFileNames: true }).errorCount).toBe(3);
    // A device bundle is not judged against the eCTD range.
    expect(validateEctdLeafs(leafs, { region: 'FDA' }).findings.some((f) => f.ruleId === 'LEAF-PDF-VERSION')).toBe(false);
  });

  // 2026-10-08 (sweep VP-7): only the base name was tested, more loosely than
  // ICH's rule — several dots, no extension, any folder name, any path length.
  it('errors LEAF-FILENAME for a multi-dot or extensionless name and for a folder that breaks the rule; LEAF-PATH-LENGTH over the region cap', () => {
    const folders = (n: number) => Array.from({ length: n }, () => 'a'.repeat(60)).join('/'); // each a legal folder name
    const long = `m3/${folders(4)}/x.pdf`; // 252 characters
    expect(long.length).toBeGreaterThan(230);
    const leafs = [
      { path: 'm1/us/cover.pdf', mediaType: 'application/pdf', content: pdf() },
      { path: 'm2/a.b.c.pdf', mediaType: 'application/pdf', content: pdf() },
      { path: 'm2/noextension', mediaType: 'application/pdf', content: pdf() },
      { path: 'm3/3-2-P-1/desc.pdf', mediaType: 'application/pdf', content: pdf() },
      { path: 'BAD_FOLDER Name/ok.pdf', mediaType: 'application/pdf', content: pdf() },
      { path: long, mediaType: 'application/pdf', content: pdf() },
    ];
    const res = validateEctdLeafs(leafs, { region: 'FDA', enforceFileNames: true });
    const names = res.findings.filter((f) => f.ruleId === 'LEAF-FILENAME');
    expect(names.map((f) => f.filePath)).toEqual(['m2/a.b.c.pdf', 'm2/noextension', 'm3/3-2-P-1/desc.pdf', 'BAD_FOLDER Name/ok.pdf']);
    expect(names[2].message).toMatch(/Folder '3-2-P-1'/);
    const length = res.findings.filter((f) => f.ruleId === 'LEAF-PATH-LENGTH');
    expect(length.map((f) => f.filePath)).toEqual([long]);
    expect(length[0].message).toMatch(/230/);
    expect(res.errorCount).toBe(5);
    // EU's cap is 180: a 191-character path is over it there and inside FDA's 230.
    const mid = { path: `m3/${folders(3)}/x.pdf`, mediaType: 'application/pdf', content: pdf() };
    expect(validateEctdLeafs([mid], { region: 'FDA', enforceFileNames: true }).errorCount).toBe(0);
    const eu = validateEctdLeafs([mid], { region: 'EMA', enforceFileNames: true });
    expect(eu.findings.filter((f) => f.severity === 'error').map((f) => f.ruleId)).toEqual(['LEAF-PATH-LENGTH']);
  });
});
