/**
 * A dialog's buttons hold still under a resting pointer (2026-10-22).
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * `.de-btn.primary:hover` lifted the button with translateY(-1px). The lift
 * moved the button off its own bottom row, so a pointer resting there unhovered
 * it; it dropped back under the pointer and was hovered again, every frame. The
 * submit button of "Place into submission" jittered by 1px and never settled,
 * and the IND reference lane's driver could not click it ("element is not
 * stable"). A <button> clips its own content, so no pseudo-element inside it
 * can keep that row: the lift had to go, and the design system gives the lift
 * to cards, not buttons (design-system/README.md, "Animation & motion").
 *
 * jsdom does no layout or hover, so this holds the cause: a hover rule for a
 * dialog button changes how it is painted, never where its box is. The browser
 * run that showed the jitter, and the fix, is in
 * docs/evidence/W5/2026-10-22-demo-path-followups/.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const C2C = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Paint only: none of these moves or resizes the box under the pointer. A
 *  custom property is a colour token here (surface-text-ramp.css's ramps). */
const PAINT = /^(--[\w-]+|background(-color|-image)?|color|box-shadow|border(-(top|right|bottom|left))?-color|outline(-color|-offset|-style|-width)?|text-decoration(-\w+)*|cursor|opacity|filter|fill|stroke)$/;

function sheets(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' || e.name === '__tests__' ? [] : sheets(p);
    return e.name.endsWith('.css') ? [p] : [];
  });
}

/** Each hover rule for a `.de-btn`, with the properties it declares. */
function deBtnHoverRules(): Array<{ file: string; selector: string; props: string[] }> {
  const out: Array<{ file: string; selector: string; props: string[] }> = [];
  for (const file of sheets(C2C)) {
    const css = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const re = /([^{}]+)\{([^{}]*)\}/g;
    for (let m = re.exec(css); m; m = re.exec(css)) {
      const selector = m[1].trim().replace(/\s+/g, ' ');
      if (!selector.split(',').some((s) => s.includes('.de-btn') && s.includes(':hover'))) continue;
      const props = m[2].split(';').map((d) => d.split(':')[0].trim().toLowerCase()).filter(Boolean);
      out.push({ file: path.relative(C2C, file), selector, props });
    }
  }
  return out;
}

describe('dialog buttons hold still under a resting pointer', () => {
  it('finds the hover rules it holds, so an empty scan is not a pass', () => {
    const found = deBtnHoverRules().map((r) => r.selector);
    expect(found).toContain('.c2c-v2 .de-btn.primary:hover');
    expect(found).toContain('.c2c-v2 .de-btn.ghost:hover');
  });

  it('a hover rule for a dialog button changes paint only, never the box', () => {
    const moving = deBtnHoverRules().flatMap((r) =>
      r.props.filter((p) => !PAINT.test(p)).map((p) => `${r.file}: ${r.selector} { ${p} }`));
    expect(moving).toEqual([]);
  });
});
