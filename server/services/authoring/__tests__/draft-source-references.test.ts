import { describe, expect, it } from 'vitest';
import { parseDraftSourceReferences } from '../draft-source-references';
import { parseDraftInput } from '../authoring-from-draft';
const id = '10000000-0000-4000-8000-000000000001';
const valid = { version: 2, documentId: id, contentHash: 'a'.repeat(64), extractedTextSha256: 'b'.repeat(64),
  spanSha256: 'c'.repeat(64), span: { start: 0, end: 10, totalChars: 20 } };
describe('saved draft source reference contract', () => {
  it('keeps only identity/version/span, never caller qualification or source text', () => {
    expect(parseDraftSourceReferences([{ ...valid, text: 'invented', qualification: 'approved', programId: 'foreign' }])).toEqual([valid]);
    expect(parseDraftSourceReferences(undefined)).toEqual([]);
  });
  it.each([null, [], Array(9).fill(valid), [valid, valid], [{ ...valid, documentId: 'file_9_chat' }],
    [{ ...valid, contentHash: 'missing' }], [{ ...valid, span: { start: -1, end: 10, totalChars: 20 } }],
    [{ ...valid, span: { start: 10, end: 10, totalChars: 20 } }], [{ ...valid, span: { start: 5, end: 12006, totalChars: 20000 } }],
    [{ ...valid, span: { start: 0, end: -1, totalChars: 20 } }], [{ ...valid, span: { start: 0, end: 21, totalChars: 20 } }],
    [{ ...valid, span: { start: 0, end: 12001, totalChars: 20000 } }],
    [{ ...valid, span: { start: 0, end: 1.5, totalChars: 20 } }],
  ])('refuses malformed references %j', raw => {
    expect(() => parseDraftSourceReferences(raw)).toThrow();
  });
  it('keeps an excerpt that starts inside the document, the stretch a section needs (S5d)', () => {
    const inside = { ...valid, span: { start: 6000, end: 18000, totalChars: 20000 } };
    expect(parseDraftSourceReferences([inside])).toEqual([inside]);
    // New writes cannot invoke the saved-only implicit historical opening.
    expect(() => parseDraftSourceReferences([{ ...valid, span: { end: 10, totalChars: 20 } }])).toThrow();
  });
  it('counts the budget by excerpt length, wherever the excerpts start', () => {
    const ids = (i: number) => id.slice(0, -1) + (i + 1);
    const late = Array.from({ length: 5 }, (_, i) => ({ ...valid, documentId: ids(i), span: { start: 10000, end: 19000, totalChars: 20000 } }));
    expect(parseDraftSourceReferences(late)).toHaveLength(5); // 5 x 9,000 = 45,000
    const over = Array.from({ length: 5 }, (_, i) => ({ ...valid, documentId: ids(i), span: { start: 8000, end: 18000, totalChars: 20000 } }));
    expect(() => parseDraftSourceReferences(over)).toThrow(/budget/); // 5 x 10,000 = 50,000
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
  it.each(['version', 'extractedTextSha256', 'spanSha256'])('refuses a stripped %s without a legacy fallback', key => {
    const partial: Record<string, unknown> = { ...valid }; delete partial[key];
    expect(() => parseDraftSourceReferences([partial])).toThrow();
  });
  it.each([1, 3, '2', null])('refuses unknown or coerced version %j', version => {
    expect(() => parseDraftSourceReferences([{ ...valid, version }])).toThrow();
  });
  it.each(['start', 'end', 'totalChars'])('refuses a numeric-string %s', key => {
    expect(() => parseDraftSourceReferences([{ ...valid, span: { ...valid.span, [key]: String(valid.span[key as keyof typeof valid.span]) } }])).toThrow();
  });
  it('normalizes valid IDs and digests while privately copying coordinates', () => {
    const raw = { ...valid, contentHash: valid.contentHash.toUpperCase(), extractedTextSha256: valid.extractedTextSha256.toUpperCase(),
      spanSha256: valid.spanSha256.toUpperCase(), span: { ...valid.span } };
    const parsed = parseDraftSourceReferences([raw]); raw.span.start = 5;
    expect(parsed).toEqual([valid]); expect(Object.isFrozen(parsed[0].span)).toBe(true);
  });
  it('does not evaluate source identity accessors or accept sparse selections', () => {
    const getter = { ...valid }; let observed = false;
    Object.defineProperty(getter, 'extractedTextSha256', { enumerable: true, get: () => { observed = true; return valid.extractedTextSha256; } });
    expect(() => parseDraftSourceReferences([getter])).toThrow(); expect(observed).toBe(false);
    expect(() => parseDraftSourceReferences(Array(1))).toThrow();
  });
});
