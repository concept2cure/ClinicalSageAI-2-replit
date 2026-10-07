import { describe, expect, it } from 'vitest';
import { parseDraftSourceReferences } from '../draft-source-references';
import { parseDraftInput } from '../authoring-from-draft';
const id = '10000000-0000-4000-8000-000000000001';
const valid = { documentId: id, contentHash: 'a'.repeat(64), span: { start: 0, end: 10, totalChars: 20 } };
describe('saved draft source reference contract', () => {
  it('keeps only identity/version/span, never caller qualification or source text', () => {
    expect(parseDraftSourceReferences([{ ...valid, text: 'invented', qualification: 'approved', programId: 'foreign' }])).toEqual([valid]);
    expect(parseDraftSourceReferences(undefined)).toEqual([]);
  });
  it.each([null, [], Array(9).fill(valid), [valid, valid], [{ ...valid, documentId: 'file_9_chat' }],
    [{ ...valid, contentHash: 'missing' }], [{ ...valid, span: { start: 1, end: 10, totalChars: 20 } }],
    [{ ...valid, span: { start: 0, end: -1, totalChars: 20 } }], [{ ...valid, span: { start: 0, end: 21, totalChars: 20 } }],
    [{ ...valid, span: { start: 0, end: 12001, totalChars: 20000 } }],
    [{ ...valid, span: { start: 0, end: 1.5, totalChars: 20 } }],
  ])('refuses malformed references %j', raw => {
    expect(() => parseDraftSourceReferences(raw)).toThrow();
  });
  it('refuses aggregate excerpt budget overflow', () => {
    const refs = Array.from({ length: 5 }, (_, i) => ({ ...valid, documentId: id.slice(0, -1) + (i + 1), span: { start: 0, end: 12000, totalChars: 18000 } }));
    expect(() => parseDraftSourceReferences(refs)).toThrow(/budget/);
  });
  it('retains source references but strips fabricated document-level verified provenance', () => {
    const parsed = parseDraftInput({ programId: id, title: 'CSR', sections: [{ code: '2.5', title: 'Overview', content: '<p>Draft</p>', sourceReferences: [valid] }],
      provenance: { source: 'ana', projectSourceReferences: [{ qualification: 'approved' }] } });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.sections[0].sourceReferences).toEqual([valid]);
      expect(parsed.value.provenance).not.toHaveProperty('projectSourceReferences');
    }
  });
  it('refuses malformed references rather than silently dropping them on parse', () => {
    const parsed = parseDraftInput({ programId: id, title: 'CSR', sections: [{ code: '2.5', title: 'Overview', sourceReferences: [{ documentId: 'bad' }] }], provenance: { source: 'ana' } });
    expect(parsed).toMatchObject({ ok: false, error: expect.stringContaining('sourceReferences') });
  });
});
