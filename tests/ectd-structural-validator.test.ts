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
