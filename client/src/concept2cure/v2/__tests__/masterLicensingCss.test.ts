/**
 * The Platform licensing console's layout, pinned in the stylesheet rules that
 * decide it, because jsdom does no layout. Split out of masterLicensing.test.tsx
 * on 2026-11-12 to keep that file under the lint ceiling; each case was measured
 * in the running app first (docs/evidence/F1/2026-11-12-licensing-at-head/).
 */
import { describe, expect, it } from 'vitest';

// jsdom does no layout, so the tab strip's visibility is pinned in the rule that
// decides it. In the running app on 2026-11-12 the strip measured 1px: a scroll
// container's automatic minimum height is 0, and inside `.ml-lic`'s column the
// 95-row packaging table made it shrink to its border, clipping every tab.
describe('the console tab strip stays on the screen', () => {
  it('scrolls sideways and never shrinks to nothing', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const { rules } = await import('./_cssRules');
    const css = readFileSync(resolve(__dirname, '../styles/misc-surfaces-v2.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const decl = (body: string, prop: string) =>
      body.split(';').map((d) => d.split(':')).filter(([k]) => k?.trim() === prop).map(([, ...v]) => v.join(':').trim()).pop();
    const strip = rules(css).filter((r) => !r.media && r.selector.split(',').map((s) => s.trim()).includes('.c2c-v2 .ml-tabs'));
    expect(strip.some((r) => decl(r.body, 'overflow-x') === 'auto'), 'eight tabs must scroll, not push the page').toBe(true);
    expect(strip.some((r) => decl(r.body, 'flex-shrink') === '0'), 'the scrolling strip can shrink to its 1px border').toBe(true);
    // `.page-full` is a row, so the column's automatic minimum was the tables'
    // min-width: 915px wide in a 390px page, everything cut off at the right.
    const column = rules(css).filter((r) => !r.media && r.selector.split(',').map((s) => s.trim()).includes('.c2c-v2 .ml-lic'));
    expect(column.some((r) => decl(r.body, 'min-width') === '0'), 'the column is as wide as its widest table').toBe(true);
    // The visually hidden `.ml-vh` labels are position:absolute; unless the
    // scroll box is their containing block its overflow does not clip them,
    // and the page scrolled sideways to 509-823px at 390px (2026-11-12).
    const box = rules(css).filter((r) => !r.media && r.selector.split(',').map((s) => s.trim()).includes('.c2c-v2 .ml-scroll'));
    expect(box.some((r) => decl(r.body, 'position') === 'relative'), 'hidden labels widen the page').toBe(true);
    // A prospect's multi-line request keeps its lines.
    const enterprise = rules(css).filter((r) => !r.media && r.selector.split(',').map((s) => s.trim()).includes('.c2c-v2 .ml-table-enterprise .ml-sub'));
    expect(enterprise.some((r) => decl(r.body, 'white-space') === 'pre-line'), 'the request reads as one run-on line').toBe(true);
  });

  // With one class the request tables' templates tied the base `.ml-table` and
  // lost to the later stylesheet: five cells on a three-column grid (2026-11-12).
  it("the access-request tables' templates outrank the base table template", async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const { rules } = await import('./_cssRules');
    const css = readFileSync(resolve(__dirname, '../styles/licensing-access-requests.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const selectors = rules(css).filter((r) => /--ml-cols/.test(r.body)).flatMap((r) => r.selector.split(',').map((s) => s.trim()));
    expect(selectors).toEqual(expect.arrayContaining(['.c2c-v2 .ml-table.ml-table-requests', '.c2c-v2 .ml-table.ml-table-requests-all']));
    expect(selectors.filter((s) => /^\.c2c-v2 \.ml-table-requests(-all)?$/.test(s))).toEqual([]);
  });
});
