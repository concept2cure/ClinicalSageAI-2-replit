/**
 * Schedule of assessments — the visit-header controls meet the 24px target.
 *
 * ── The defect (periodic review 2026-09-28, editor family, A-C-8) ────────────
 * Each visit column header carries two icon buttons, rename and remove, the
 * only controls on the surface that do either. `padding:2px 4px` around a 12px
 * icon with a 1px border made each 22 × 18px, and with a 1px gap their 24px
 * circles overlapped, so the spacing exception did not apply either
 * (WCAG 2.2 SC 2.5.8, AA).
 *
 * jsdom does no layout, so this computes the box the way the browser does from
 * the rules that reach the button: the icon size the component renders, the
 * padding of the most specific rule, and the base border. It also holds the
 * pair inside the visit column's minimum width, so the fix cannot buy its
 * size by widening a grid that is read across.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const V2 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const editingCss = fs.readFileSync(path.join(V2, 'styles/protocol-dev-editing.css'), 'utf8');
const researchCss = fs.readFileSync(path.join(V2, 'styles/research-v2.css'), 'utf8');
const soa = fs.readFileSync(path.join(V2, 'surfaces/ProtocolDevSoa.tsx'), 'utf8');

const MIN_TARGET = 24;

/** Every `selector{declarations}` pair in a sheet, in source order (nesting flattened by the rule text itself). */
function rules(css: string): Array<{ selectors: string[]; body: string }> {
  const out: Array<{ selectors: string[]; body: string }> = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (let m = re.exec(stripped); m; m = re.exec(stripped)) {
    out.push({ selectors: m[1].split(',').map((s) => s.trim().replace(/\s+/g, ' ')), body: m[2] });
  }
  return out;
}

/** The last value a rule for `selector` gives `prop`, or null. */
function lastDecl(css: string, selector: string, prop: string): string | null {
  let found: string | null = null;
  for (const r of rules(css)) {
    if (!r.selectors.includes(selector)) continue;
    const m = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`).exec(r.body);
    if (m) found = m[1].trim();
  }
  return found;
}

/** A padding shorthand as [top, right, bottom, left] in px. */
function paddingPx(value: string): [number, number, number, number] {
  const v = value.split(/\s+/).map((p) => parseFloat(p));
  if (v.length === 1) return [v[0], v[0], v[0], v[0]];
  if (v.length === 2) return [v[0], v[1], v[0], v[1]];
  if (v.length === 3) return [v[0], v[1], v[2], v[1]];
  return [v[0], v[1], v[2], v[3]];
}

/** The icon sizes the visit header renders inside its two buttons. */
function visitHeadIconSizes(): number[] {
  const fn = /function SoaVisitHead\([\s\S]*?\n\}\n/.exec(soa);
  expect(fn, 'SoaVisitHead is found').not.toBeNull();
  return [...fn![0].matchAll(/<PG\.Ic n="[^"]+" s=\{(\d+)\} \/>/g)].map((m) => Number(m[1]));
}

function visitButtonBox(): { width: number; height: number } {
  const icons = visitHeadIconSizes();
  expect(icons).toHaveLength(2);
  const icon = Math.max(...icons);
  // `.pde-soa-vh .pde-rowbtn` outranks `.pde-rowbtn`, so its padding is the one applied.
  const pad = paddingPx(lastDecl(editingCss, '.pde-soa-vh .pde-rowbtn', 'padding') ?? lastDecl(editingCss, '.pde-rowbtn', 'padding')!);
  const border = parseFloat(/^(\d+(?:\.\d+)?)px/.exec(lastDecl(editingCss, '.pde-rowbtn', 'border') ?? '0px')![1]);
  return { width: icon + pad[1] + pad[3] + 2 * border, height: icon + pad[0] + pad[2] + 2 * border };
}

describe('the visit-header rename and remove buttons (A-C-8)', () => {
  it('are each at least 24 × 24px', () => {
    const box = visitButtonBox();
    expect(box.width).toBeGreaterThanOrEqual(MIN_TARGET);
    expect(box.height).toBeGreaterThanOrEqual(MIN_TARGET);
  });

  it('fit side by side inside the visit column, so the grid does not widen', () => {
    const box = visitButtonBox();
    const gap = parseFloat(lastDecl(editingCss, '.pde-soa-vh', 'gap') ?? '0');
    const minWidth = parseFloat(lastDecl(researchCss, '.pd-soa-vh', 'min-width')!);
    const colPad = paddingPx(lastDecl(researchCss, '.pd-soa-vh', 'padding')!);
    expect(2 * box.width + gap).toBeLessThanOrEqual(minWidth - colPad[1] - colPad[3]);
  });
});
