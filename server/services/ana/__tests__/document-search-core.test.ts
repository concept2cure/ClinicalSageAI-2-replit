/**
 * In-document search core — pure functions, no I/O, no mocks.
 */
import { describe, it, expect } from 'vitest';
import { searchWithinText, extractHeadingOutline } from '../document-search-core';

const doc = [
  '1. Introduction',
  'This protocol evaluates the primary endpoint of overall response rate (ORR).',
  '',
  '10.3 Statistical Methods',
  'The primary endpoint is analyzed using a stratified Cochran-Mantel-Haenszel test.',
  'Sample size was derived assuming 90% power at a two-sided alpha of 0.05.',
  '',
  'SAFETY SUMMARY',
  'No safety signal was observed beyond the known class effects.',
].join('\n');

describe('searchWithinText', () => {
  it('returns relevant windows with offsets and a match count', () => {
    const [res] = searchWithinText(doc, ['primary endpoint']);
    expect(res.query).toBe('primary endpoint');
    expect(res.matchCount).toBe(2);
    expect(res.windows.length).toBeGreaterThan(0);
    expect(res.windows[0].excerpt).toContain('primary endpoint');
    expect(res.windows[0].charStart).toBeGreaterThanOrEqual(0);
    expect(res.windows[0].charEnd).toBeGreaterThan(res.windows[0].charStart);
  });

  it('reports zero matches honestly', () => {
    const [res] = searchWithinText(doc, ['pharmacokinetics']);
    expect(res.matchCount).toBe(0);
    expect(res.windows).toHaveLength(0);
  });

  it('merges nearby matches into one coherent window', () => {
    const dense = 'alpha alpha alpha alpha alpha';
    const [res] = searchWithinText(dense, ['alpha'], { windowChars: 400 });
    expect(res.matchCount).toBe(5);
    // All five fall inside one merged window.
    expect(res.windows).toHaveLength(1);
    expect(res.windows[0].matchCount).toBe(5);
  });

  it('respects the per-query window cap', () => {
    const spread = Array.from({ length: 10 }, (_, i) => `term${' '.repeat(200)}`).join('');
    const [res] = searchWithinText(spread, ['term'], { windowChars: 20, maxWindowsPerQuery: 3 });
    expect(res.windows.length).toBeLessThanOrEqual(3);
  });

  it('handles multiple queries independently', () => {
    const results = searchWithinText(doc, ['ORR', 'safety signal']);
    expect(results).toHaveLength(2);
    expect(results[0].matchCount).toBeGreaterThan(0);
    expect(results[1].matchCount).toBeGreaterThan(0);
  });
});

describe('extractHeadingOutline', () => {
  it('detects numbered, all-caps, and markdown headings', () => {
    const outline = extractHeadingOutline(doc);
    expect(outline).toContain('1. Introduction');
    expect(outline).toContain('10.3 Statistical Methods');
    expect(outline).toContain('SAFETY SUMMARY');
  });

  it('ignores ordinary prose lines', () => {
    const outline = extractHeadingOutline(doc);
    expect(outline.some(h => h.startsWith('This protocol evaluates'))).toBe(false);
  });
});
