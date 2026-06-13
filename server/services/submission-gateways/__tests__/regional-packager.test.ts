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
