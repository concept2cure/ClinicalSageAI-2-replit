/**
 * Regression test for the loadProjectSources column-shape bug.
 *
 * The SQL aliases columns as snake_case (`document_path`, `page_number`), and the
 * `pg` driver returns row keys verbatim — but `ProjectSource` and every consumer
 * read camelCase (`documentPath`, `pageNumber`). Before the fix those fields were
 * silently `undefined` on every mapped source. `mapProjectSourceRow` normalizes
 * the raw row onto the camelCase shape; this locks that mapping.
 */

import { describe, it, expect } from 'vitest';
import { mapProjectSourceRow } from '../sentenceTraceabilityService';

describe('mapProjectSourceRow — snake_case row → ProjectSource', () => {
  it('maps document_path/page_number onto documentPath/pageNumber', () => {
    const row = {
      id: 42,
      title: 'Protocol v2',
      type: 'evidence',
      excerpt: 'Primary endpoint…',
      document_path: '/docs/protocol.pdf',
      page_number: '12',
    };
    const src = mapProjectSourceRow(row);
    expect(src.documentPath).toBe('/docs/protocol.pdf');
    expect(src.pageNumber).toBe(12);
    expect(src.id).toBe('42'); // coerced to string
    expect(src.title).toBe('Protocol v2');
    expect(src.excerpt).toBe('Primary endpoint…');
  });

  it('takes the leading page from a page range', () => {
    expect(mapProjectSourceRow({ id: 1, page_number: '12-15' }).pageNumber).toBe(12);
  });

  it('leaves pageNumber undefined when absent or non-numeric', () => {
    expect(mapProjectSourceRow({ id: 1 }).pageNumber).toBeUndefined();
    expect(mapProjectSourceRow({ id: 1, page_number: 'n/a' }).pageNumber).toBeUndefined();
  });

  it('leaves documentPath undefined when the column is null/absent', () => {
    expect(mapProjectSourceRow({ id: 1, document_path: null }).documentPath).toBeUndefined();
    expect(mapProjectSourceRow({ id: 1 }).documentPath).toBeUndefined();
  });

  it('defaults a missing excerpt to an empty string (interface is non-optional)', () => {
    expect(mapProjectSourceRow({ id: 1, title: 't', type: 'x' }).excerpt).toBe('');
  });

  it('already-camelCase keys still resolve (defensive)', () => {
    const src = mapProjectSourceRow({ id: 7, documentPath: '/a.pdf', pageNumber: 3 });
    expect(src.documentPath).toBe('/a.pdf');
    expect(src.pageNumber).toBe(3);
  });
});
