import { describe, it, expect } from 'vitest';
import { mergeMultiQueryResults, locatorOf } from '../../services/ana/knowledge-search-merge';

describe('mergeMultiQueryResults', () => {
  it('de-duplicates by document identity, keeps best score, tracks matched queries', () => {
    const merged = mergeMultiQueryResults(
      [
        { query: 'endpoint', docs: [{ documentId: 'A', title: 'Protocol', finalScore: 0.6, content: 'a' }] },
        {
          query: 'safety',
          docs: [
            { documentId: 'A', title: 'Protocol', finalScore: 0.9, content: 'a' }, // dup of A, higher score
            { documentId: 'B', title: 'CSR', finalScore: 0.7, content: 'b' },
          ],
        },
      ],
      12
    );

    expect(merged).toHaveLength(2);
    // A wins the top rank with the higher (0.9) score and both queries recorded.
    expect(merged[0].title).toBe('Protocol');
    expect(merged[0].relevance).toBe(0.9);
    expect(merged[0].matched_queries.sort()).toEqual(['endpoint', 'safety']);
    expect(merged[1].title).toBe('CSR');
    expect(merged[1].matched_queries).toEqual(['safety']);
  });

  it('falls back to title|locator when no id is present', () => {
    const merged = mergeMultiQueryResults(
      [
        { query: 'q1', docs: [{ title: 'Doc', pageNumber: 3, finalScore: 0.5, content: 'x' }] },
        { query: 'q2', docs: [{ title: 'Doc', pageNumber: 3, finalScore: 0.8, content: 'x' }] },
      ],
      12
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].relevance).toBe(0.8);
    expect(merged[0].locator).toBe('p.3');
    expect(merged[0].matched_queries.sort()).toEqual(['q1', 'q2']);
  });

  it('ranks by score and respects the merged cap', () => {
    const merged = mergeMultiQueryResults(
      [
        {
          query: 'q',
          docs: [
            { documentId: '1', title: 'Low', finalScore: 0.1, content: '' },
            { documentId: '2', title: 'High', finalScore: 0.9, content: '' },
            { documentId: '3', title: 'Mid', finalScore: 0.5, content: '' },
          ],
        },
      ],
      2
    );
    expect(merged.map(m => m.title)).toEqual(['High', 'Mid']);
  });

  it('truncates passage text to the cap', () => {
    const merged = mergeMultiQueryResults(
      [{ query: 'q', docs: [{ documentId: '1', title: 'T', finalScore: 0.5, content: 'x'.repeat(2000) }] }],
      12,
      50
    );
    expect(merged[0].text).toHaveLength(50);
  });

  it('locatorOf prefers explicit locator, then section, then page', () => {
    expect(locatorOf({ locator: 'L', sectionTitle: 'S', pageNumber: 1 })).toBe('L');
    expect(locatorOf({ sectionTitle: 'S', pageNumber: 1 })).toBe('S');
    expect(locatorOf({ pageNumber: 7 })).toBe('p.7');
    expect(locatorOf({})).toBeNull();
  });
});
