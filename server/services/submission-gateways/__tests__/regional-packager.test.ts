/**
 * Regional eCTD packager — leaf ID uniqueness + deterministic checksum order.
 *
 * eCTD leaf IDs are XML ID-typed and must be unique within a backbone, and the
 * index-md5 manifest must be byte-identical across environments. These tests
 * lock both contracts.
 */

import { describe, it, expect } from 'vitest';
import {
  createLeafIdAssigner,
  leafIdSlug,
  buildMd5Index,
  leafPackagePath,
  isModule1Section,
  type EctdLeaf,
} from '../regional-packager';

const leaf = (over: Partial<EctdLeaf> & { ctdSection: string; fileName: string }): EctdLeaf => ({
  operation: 'new',
  sourcePath: `/tmp/${over.fileName}`,
  title: over.fileName,
  ...over,
});

const XML_ID = /^[A-Za-z_][\w.-]*$/;

describe('leafIdSlug', () => {
  it('drops the extension, lowercases, and dashes non-alphanumerics', () => {
    expect(leafIdSlug('Study A (final).pdf')).toBe('study-a-final');
    expect(leafIdSlug('cover_letter.PDF')).toBe('cover-letter');
  });
  it('falls back to "file" for an empty slug', () => {
    expect(leafIdSlug('.pdf')).toBe('file');
  });
});

describe('createLeafIdAssigner', () => {
  it('gives leaves in the SAME section distinct IDs (the duplicate-ID bug)', () => {
    const assign = createLeafIdAssigner();
    const a = assign(leaf({ ctdSection: '5.3.5.1', fileName: 'study-a.pdf' }));
    const b = assign(leaf({ ctdSection: '5.3.5.1', fileName: 'study-b.pdf' }));
    expect(a).toBe('leaf-5-3-5-1-study-a');
    expect(b).toBe('leaf-5-3-5-1-study-b');
    expect(a).not.toBe(b);
  });

  it('dedupes a true collision with a deterministic numeric suffix', () => {
    const assign = createLeafIdAssigner();
    const a = assign(leaf({ ctdSection: '5.3.5.1', fileName: 'study.pdf' }));
    const b = assign(leaf({ ctdSection: '5.3.5.1', fileName: 'study.pdf' }));
    const c = assign(leaf({ ctdSection: '5.3.5.1', fileName: 'study.pdf' }));
    expect([a, b, c]).toEqual(['leaf-5-3-5-1-study', 'leaf-5-3-5-1-study-2', 'leaf-5-3-5-1-study-3']);
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it('always produces a valid XML ID token', () => {
    const assign = createLeafIdAssigner();
    for (const fileName of ['a b.pdf', '3.2.S.1.1 spec!.pdf', '日本語.pdf', '.pdf']) {
      expect(assign(leaf({ ctdSection: '3.2.S.1.1', fileName }))).toMatch(XML_ID);
    }
  });
});

describe('buildMd5Index', () => {
  it('sorts by codepoint, not locale (stable across environments)', () => {
    // '-' (0x2D) precedes 'a' (0x61) in codepoint order; locale collation often
    // ignores the punctuation and would order "aa" before "a-b".
    const out = buildMd5Index([
      { relPath: 'aa', md5: 'h2' },
      { relPath: 'a-b', md5: 'h1' },
    ]);
    expect(out).toBe('h1  a-b\nh2  aa');
  });

  it('emits "md5  relPath" lines', () => {
    expect(buildMd5Index([{ relPath: 'index.xml', md5: 'abc' }])).toBe('abc  index.xml');
  });
});

/* ── Where a leaf's bytes land, and under which backbone ────────────────────
   The packager derived both from the RAW `ctdSection` string:

     if (leaf.ctdSection.startsWith('1')) { …Module 1 regional folder… }
     else relPath = `m${leaf.ctdSection.charAt(0)}/${sectionDashed}/…`;

   `section_code` carries two spellings across this codebase. Module 2–5 write
   `3.2.S.4.2`; every Module 1 filing path writes the `m`-prefixed form —
   `withTransmittalPair` emits `m1.1` and `m1.2` for the transmittal pair on
   EVERY lifecycle sequence, the IND filing routes write `m1.12.4` / `m1.13`,
   and the forms panel places a sponsor's signed form at `m1.1`.

   `'m1.1'.startsWith('1')` is false. So each of those took the Module 2–5
   branch and landed at `mm/m1-1/…` — a top-level folder no eCTD layout defines,
   with the backbone href pointing there. The most-filed documents in the
   product were the ones going to the wrong place.

   Case had the same shape of problem one level down: `3.2.s.4.2` and
   `3.2.S.4.2` are one CTD section and produced two sibling folders — the
   hazard section-to-ctd.ts names in its own comment, under a claim to be "the
   one normalisation point on the transmit path". Nothing on this path called
   it. */
describe('leafPackagePath — the module and folder a leaf resolves to', () => {
  const at = (ctdSection: string, over: Partial<EctdLeaf> = {}) =>
    leafPackagePath(leaf({ ctdSection, fileName: 'doc.pdf', ...over }), 'fda');

  it('files an m-prefixed Module 1 leaf under the regional folder, not "mm/"', () => {
    // What withTransmittalPair, the IND filing routes and the forms panel write.
    expect(at('m1.1')).toEqual({
      relPath: 'm1/us/1-1/doc.pdf',
      href: '1-1/doc.pdf',
      backboneDir: 'm1/us',
    });
    expect(at('m1.1').relPath).not.toMatch(/^mm\//);
  });

  it('spells a Module 1 leaf the same way whichever form the caller stored', () => {
    expect(at('m1.12.4')).toEqual(at('1.12.4'));
    expect(at('m1.12.4').relPath).toBe('m1/us/1-12-4/doc.pdf');
  });

  it('keeps a precise Module 3 section precise — 3.2.S.4.2 is not 3.2.S', () => {
    expect(at('3.2.S.4.2').relPath).toBe('m3/3-2-s-4-2/doc.pdf');
    expect(at('3.2.S.4.2').relPath).not.toBe(at('3.2.S').relPath);
    expect(at('3.2.S.4.2').relPath).not.toBe(at('3.2.S.4').relPath);
  });

  it('gives one CTD section one folder, whatever case it was typed in', () => {
    expect(at('3.2.s.4.2')).toEqual(at('3.2.S.4.2'));
    expect(at('m3.2.S.4.2')).toEqual(at('3.2.S.4.2'));
  });

  it('a Module 2-5 leaf resolves against the root backbone, not a regional one', () => {
    expect(at('2.7.3')).toEqual({ relPath: 'm2/2-7-3/doc.pdf', href: 'm2/2-7-3/doc.pdf', backboneDir: '' });
  });

  it('keeps the per-study subfolder for a study report', () => {
    expect(at('5.3.5.1', { studyId: 'CS-101' }).relPath).toBe('m5/5-3-5-1/cs-101/doc.pdf');
  });

  it('follows the region for Module 1', () => {
    expect(leafPackagePath(leaf({ ctdSection: 'm1.2', fileName: 'cover.pdf' }), 'ema')).toEqual({
      relPath: 'm1/eu/1-2/cover.pdf',
      href: '1-2/cover.pdf',
      backboneDir: 'm1/eu',
    });
  });
});

describe('isModule1Section — which backbone a leaf is written into', () => {
  it('recognises the m-prefixed form every Module 1 filing path writes', () => {
    for (const code of ['m1.1', 'm1.2', 'm1.12.4', 'm1.13', 'M1.1']) {
      expect(isModule1Section(code), code).toBe(true);
    }
  });

  it('recognises the bare form too', () => {
    for (const code of ['1.1', '1.2', '1.14.4.2']) expect(isModule1Section(code), code).toBe(true);
  });

  it('is false for Modules 2-5, so they are not swept into the regional backbone', () => {
    for (const code of ['2.7.3', '3.2.S.4.2', 'm3.2.S.1', '5.3.5.1']) {
      expect(isModule1Section(code), code).toBe(false);
    }
  });

  it('an unparseable section belongs to no module — leafPackagePath refuses it by name', () => {
    expect(isModule1Section('m1/us/1.2')).toBe(false);
    expect(isModule1Section('')).toBe(false);
    expect(() => leafPackagePath(leaf({ ctdSection: 'm1/us/1.2', fileName: 'cover.pdf' }), 'fda'))
      .toThrow(/not a CTD section code/);
  });
});
