/**
 * The one rule for which sections a market's document holds (FILING_SPINE F22).
 */
import { describe, expect, it } from 'vitest';
import { isRegionalSectionKey, marketOutlineView, regionalSubtree } from '../filing-scope';

const PACK = [
  { key: 'M1', parent_key: null, label: 'Module 1 (EU)', mandatory: true },
  { key: '1.0', parent_key: 'M1', label: 'Cover letter', mandatory: true },
  { key: '1.3.1', parent_key: 'M1', label: 'SmPC', mandatory: true },
  { key: 'M2', parent_key: null, label: 'Module 2', mandatory: true },
  { key: '2.5', parent_key: 'M2', label: 'Clinical overview', mandatory: true },
  { key: 'M3', parent_key: null, label: 'Module 3', mandatory: true },
  { key: '3.2.A', parent_key: 'M3', label: 'Appendices', mandatory: true },
  { key: '3.2.R', parent_key: 'M3', label: 'Regional information', mandatory: true },
  { key: '3.2.P', parent_key: 'M3', label: 'Drug product', mandatory: false },
];

describe('filing scope', () => {
  it.each([['M1', true], ['1.3.1', true], ['3.2.R', true], ['3.2.R.1', true], ['M3', false], ['3.2', false], ['2.5', false], ['10.1', false]])(
    '%s is regional: %s', (key, expected) => expect(isRegionalSectionKey(key)).toBe(expected));

  it("a market's subtree is Module 1 and 3.2.R with their ancestors, in the pack's order", () => {
    expect(regionalSubtree<{ key: string }>(PACK).map((s) => s.key)).toEqual(['M1', '1.0', '1.3.1', 'M3', '3.2.R']);
  });

  it("gaps are the pack's mandatory sections outside the market's part that the home filing lacks", () => {
    const { rows, gaps } = marketOutlineView(PACK, new Set(['M1', 'M2', '2.5', 'M3', '3.2.S', '3.2.P']));
    expect(rows).toHaveLength(5);
    expect(gaps).toEqual([{ key: '3.2.A', label: 'Appendices' }]);
  });
});
