/**
 * The shell's button reset yields to any class.
 *
 * `.c2c-v2 button` zeroed every button's padding, border and background, and
 * one class and one element outrank one class. So a button styled by a single
 * class rendered as bare text inside the shell:
 *
 * - Quality's tabs, its "New controlled document" and "Ask AnA" buttons, its
 *   filter chips and its library cards (UI walk, 2026-10-31). The tab icons sat
 *   against the previous tab's label, the cards had no border, and the shell's
 *   `font: inherit` overrode their size and weight. Quality's own reset is
 *   scoped with `:where()` precisely so that its classes win.
 * - The signing dialog's buttons, fixed on 2026-10-30 by raising their own
 *   selectors (reviewRoutePhoneWidth.test.ts).
 *
 * The reset is now `:where(.c2c-v2) button`: it still resets every button in
 * the shell, and any class rule wins as written. Measured in Chromium on 13
 * launch surfaces (about 940 buttons): only Quality's 25 buttons changed.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const V2 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file: string) => fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const appCss = read(path.join(V2, 'styles', 'app-v2.css'));
const qualityCss = read(path.resolve(V2, '..', 'quality', 'app.css'));

/** [ids, classes/attributes/pseudo-classes, types]; `:where()` counts nothing, as in CSS. */
function specificity(selector: string): [number, number, number] {
  const s = selector.replace(/:where\((?:[^()]|\([^()]*\))*\)/g, ' ').replace(/::[\w-]+/g, ' ');
  return [
    (s.match(/#[\w-]+/g) ?? []).length,
    (s.match(/\.[\w-]+|\[[^\]]+\]|:[\w-]+/g) ?? []).length,
    (s.replace(/\[[^\]]+\]|[.#:][\w-]+/g, ' ').match(/(^|[\s>+~])[a-z][\w-]*/gi) ?? []).length,
  ];
}
const outranks = (a: [number, number, number], b: [number, number, number]) =>
  a[0] !== b[0] ? a[0] > b[0] : a[1] !== b[1] ? a[1] > b[1] : a[2] > b[2];

/** Top-level rules (outside any at-rule) of a stylesheet: selector list and declarations. */
function topLevelRules(css: string): Array<{ selectors: string[]; decls: string }> {
  const out: Array<{ selectors: string[]; decls: string }> = [];
  let depth = 0;
  let start = 0;
  let atRule = false;
  for (let i = 0; i < css.length; i++) {
    if (css[i] === '{') {
      if (depth === 0) atRule = css.slice(start, i).trim().startsWith('@');
      depth += 1;
      if (depth === 1 && !atRule) {
        const end = css.indexOf('}', i);
        out.push({ selectors: css.slice(start, i).split(',').map((x) => x.trim().replace(/\s+/g, ' ')), decls: css.slice(i + 1, end) });
        i = end;
        depth = 0;
        start = i + 1;
      }
    } else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) start = i + 1;
    }
  }
  return out;
}

const reset = topLevelRules(appCss).find((r) => r.selectors.some((s) => /(^|\s)button$/.test(s)) && /padding:\s*0\s*;/.test(r.decls) && /background:\s*none/.test(r.decls));

describe('the shell’s button reset', () => {
  it('still resets every button in the shell', () => {
    expect(reset, 'no top-level button reset in app-v2.css').toBeDefined();
    expect(reset!.selectors.some((s) => s.includes('.c2c-v2'))).toBe(true);
    for (const prop of ['font', 'background', 'border', 'padding', 'margin']) expect(reset!.decls).toMatch(new RegExp(`${prop}:`));
  });

  it('is outranked by a single class', () => {
    expect(outranks(specificity('.any-class'), specificity(reset!.selectors[0])), reset!.selectors[0]).toBe(true);
  });

  it.each(['.qms-tab', '.qms-btn', '.qms-chip', '.qms-tpl-card', '.qms-tb-btn'])('Quality’s %s keeps the box its own rule gives it', (cls) => {
    const own = topLevelRules(qualityCss).filter((r) => r.selectors.includes(cls) && /padding:/.test(r.decls));
    expect(own.length, `${cls} has no padding rule in quality/app.css`).toBeGreaterThan(0);
    expect(outranks(specificity(cls), specificity(reset!.selectors[0])), `${cls} vs ${reset!.selectors[0]}`).toBe(true);
  });
});
