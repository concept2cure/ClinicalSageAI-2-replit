/**
 * D0.md §8, the decisions taken after the D0 review (2026-11-09), pinned in the rules that carry them,
 * because jsdom paints nothing. The evidence, red and green, is in docs/evidence/DESIGN/D0/D0-13-spec-decisions/.
 *
 * - §8.2: a disabled primary is grey, not faded orange.
 * - §8.3: the answer line is quieter than a section heading (500) and does not touch the line above it.
 * - §8.4: the composer's resting edge reaches 3:1 (WCAG 1.4.11): --border-control, not --border.
 * - §8.5: on a coarse pointer the tabs, segmented items, composer send and drawer close reach 44px.
 */
import { describe, expect, it } from 'vitest';
import { APP_V2_CSS, rules } from './_cssRules';

const ALL = rules(APP_V2_CSS);
const flat = ALL.filter((r) => r.media === null);
const coarse = ALL.filter((r) => r.media !== null && /pointer:\s*coarse/.test(r.media));
const decl = (body: string, prop: string) => new RegExp(`(^|;)\\s*${prop}\\s*:\\s*([^;]+)`).exec(body)?.[2]?.trim() ?? null;
/** The last flat rule whose selector names every given token and whose body declares the property. */
function last(rs: typeof ALL, tokens: string[], prop: string): string | null {
  const hit = rs.filter((r) => tokens.every((t) => r.selector.includes(t)) && decl(r.body, prop) !== null);
  return hit.length ? decl(hit[hit.length - 1].body, prop) : null;
}

describe('D0.md §8, in the stylesheet', () => {
  it('§8.2 a disabled primary is grey and fully opaque', () => {
    expect(last(flat, ['.btn.primary', ':disabled'], 'background')).toBe('var(--bg-200)');
    expect(last(flat, ['.btn.primary', ':disabled'], 'color')).toBe('var(--text-400)');
    expect(last(flat, ['.btn.primary', ':disabled'], 'opacity')).toBe('1');
  });

  it('§8.3 the answer line is 500 weight, with room above the lead', () => {
    expect(last(flat, ['.al-h'], 'font-weight')).toBe('500');
    expect(last(flat, ['.al-lead'], 'margin')).toBe('24px 0');
  });

  it('§8.4 the composer rests on --border-control', () => {
    const border = last(flat, ['.landing-composer', '.pj-composer', '.ct-composer'], 'border');
    expect(border).toBe('1px solid var(--border-control)');
  });

  it('§8.5 on a coarse pointer, tabs, segments, send and close reach 44px', () => {
    const tabs = coarse.find((r) => ['.tab', '.seg-b', '.ml-seg-btn'].every((t) => r.selector.includes(t)));
    expect(tabs && decl(tabs.body, 'min-height')).toBe('44px');
    const targets = coarse.find((r) => ['.landing-send', '.pj-comp-send', '.ct-comp-send', '.de-x'].every((t) => r.selector.includes(t)));
    expect(targets && decl(targets.body, 'min-width')).toBe('44px');
    expect(targets && decl(targets.body, 'min-height')).toBe('44px');
  });
});
