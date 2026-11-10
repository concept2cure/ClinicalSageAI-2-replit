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

  /* The first version of this change lowered `font: inherit` with the rest,
     and index.css's legacy `.btn { font-family: -apple-system, … }` (one
     class) then set the font of 289 buttons on Project home alone: a
     different face and up to 12% narrower. Measured: the font family and
     the box it sizes were the only things that changed outside Quality. */
  it('keeps the shell’s font family on every button, over a one-class legacy rule', () => {
    const family = topLevelRules(appCss).filter((r) => /font(-family)?:\s*inherit/.test(r.decls) && r.selectors.some((s) => /(^|\s)button$/.test(s)));
    expect(family.length, 'no button rule inherits the shell’s font family').toBeGreaterThan(0);
    expect(family.some((r) => r.selectors.some((s) => outranks(specificity(s), specificity('.btn')))), family.map((r) => r.selectors.join(', ')).join(' | ')).toBe(true);
  });

  /* C18 (2026-11-10): Quality styles no button of its own, so the carve-out that let its one-class rules set their
     own size (`button:not(:where(.qms-shell *))`) is gone with them. */
  it('keeps the whole font (size, weight, line height) at the old strength on every button, Quality’s included', () => {
    const font = topLevelRules(appCss).filter((r) => /(^|;)\s*font:\s*inherit/.test(r.decls)
      && r.selectors.some((s) => /(^|\s)button$/.test(s) && outranks(specificity(s), specificity('.btn'))));
    expect(font.length, 'no full font reset outranks one class').toBeGreaterThan(0);
    expect(topLevelRules(appCss).some((r) => r.selectors.some((s) => s.includes('.qms-shell'))), 'a Quality carve-out in app-v2.css').toBe(false);
  });

  /* D7-B (2026-11-06) deleted .qms-tab, .qms-tpl-card and .qms-tb-btn with the topbar, the type cards and the icon
     tabs (Quality's tabs are D0's .tabs/.tab now). C13 (2026-11-10) deleted .qms-chip with its last use: the action
     items' moves are D0's .btn ghost small. The button Quality still styles itself is this one (until C18). */
  /* C18 (2026-11-10): the last one, .qms-btn, and .qms-link went with their callers; Quality's buttons are D0's. Its
     root sets no type, colour or background of its own, and no button reset: it is the product's page. */
  it('Quality styles no button of its own, and its root is the product’s', () => {
    const rules = topLevelRules(qualityCss);
    expect(rules.filter((r) => r.selectors.some((s) => /\.qms-(btn|link)\b/.test(s))).map((r) => r.selectors.join(', '))).toEqual([]);
    expect(rules.filter((r) => r.selectors.some((s) => /^\.qms-shell :where\(button\)/.test(s)))).toEqual([]);
    const root = rules.filter((r) => r.selectors.includes('.qms-shell'));
    for (const prop of ['font-size', 'font-family', 'line-height', 'color', 'background', '-webkit-font-smoothing']) {
      expect(root.filter((r) => new RegExp(`(^|;|\\s)${prop}:`).test(r.decls)).length, `.qms-shell sets ${prop}`).toBe(0);
    }
    expect(qualityCss.match(/font-size:\s*[\d.]+px/g) ?? [], 'a type size not on the ramp').toEqual([]);
    // A quiet button Quality keeps (the change log's link count) outranks the shell's font reset, or its size is lost.
    const count = rules.find((r) => r.selectors.some((s) => /\.qcc-linkcount$/.test(s)) && /font-size:/.test(r.decls));
    expect(count && outranks(specificity(count.selectors[0]), specificity('.c2c-v2 button')), 'qcc-linkcount vs the reset').toBe(true);
    const num = rules.find((r) => r.selectors.some((s) => /\.qms-num$/.test(s)) && /font-weight:/.test(r.decls));
    expect(num && outranks(specificity(num.selectors[0]), specificity('.c2c-v2 button')), 'the record number’s weight vs the reset').toBe(true);
  });
});
