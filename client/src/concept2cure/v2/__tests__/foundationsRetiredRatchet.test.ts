/**
 * The retired-name ratchet (D0 guard 3).
 *
 * WHY THIS EXISTS
 * D0 ships CSS first (.design/claude-convergence/D0.md §4): every retired class
 * is kept as an alias inside the canonical primitive's `:is()` list, so all of
 * the roughly sixty surfaces no design package owns render the canonical look on
 * the day D0 lands, before any markup changes. An alias kept "for now" is how a
 * second design system survives forever, though. This test makes the aliases
 * leave:
 *
 *   1. It counts the uses of each retired name in TSX and fails if any count
 *      RISES above the baseline written below. Nobody adds a new `.reg-cta`, a
 *      new `sp-head` header or a new "What to do now" box (ONE_DESIGN_PLAN §2,
 *      retired patterns).
 *   2. When a count reaches 0, it fails until that name is gone from every v2
 *      stylesheet. So each owner migration (§4.7) ends with D0-6 deleting the
 *      alias and its retired block (§0, step 6).
 *
 * HOW A USE IS COUNTED
 * Every `client/src/**\/*.tsx` outside `__tests__` is parsed with TypeScript.
 * A use is an occurrence of the name in a string literal, a template literal's
 * text or JSX text: where a className and a visible label live. Comments do not
 * count, so a note such as "was `.reg-cta`" never blocks a count from reaching
 * zero. A class name matches as a whole class token (`reg-tab` does not match
 * `reg-tabs`, `cl-toast` does not match `cl-toast-go`). `btn sm` counts the
 * string literals that hold both the `btn` and the `sm` class. The two phrases
 * count their literal text.
 *
 * WHEN YOU MIGRATE A USE
 * Lower that name's baseline to the new count in the same commit, so the next
 * rise is caught at the new level. At 0, delete the alias from the CSS (D0-6).
 *
 * The baselines were re-measured with exactly this rule on concept2cure-v2 on
 * 2026-11-01. The D0 spec's table (§4.6) differs in two places: `sp-head` 18,
 * not 19 (the 19th is a doc comment in CrlLibrary.tsx); `cl-toast` 1, not 5 (the
 * other four are its children `cl-toast-ic`, `cl-toast-t` ×2, `cl-toast-go`).
 *
 * Green at baseline. Its failing run (one extra use added) is filed at
 * docs/evidence/DESIGN/D0/red/foundationsRetiredRatchet-rise.txt.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const CLIENT_SRC = resolve(__dirname, '../../..');
const STYLES = resolve(__dirname, '../styles');

interface Retired {
  /** The retired name as the D0 spec's table writes it. */
  name: string;
  /** Uses at HEAD on 2026-11-01. May only fall. */
  baseline: number;
  /** How a use is counted. */
  kind: 'class' | 'btn-sm' | 'text';
  /** At 0 uses, no v2 stylesheet selector may match this (null: the phrase's CSS is its own class entry). */
  css: RegExp | null;
}

const cls = (name: string, baseline: number): Retired => ({
  name,
  baseline,
  kind: 'class',
  css: new RegExp(`\\.${name}(?![\\w-])`),
});

/* D0 spec §4.6.3, re-measured. */
const RETIRED: Retired[] = [
  cls('sp-head', 18),
  cls('sp-eyebrow', 18), // D6-3: the Vault's eyebrow "Documents · project vault" is gone (D6 §C.4 step 2).
  cls('sp-title', 18),
  cls('sp-state', 23),
  cls('reg-head', 11),
  cls('reg-eyebrow', 9),
  cls('reg-title', 11),
  cls('reg-sub', 10),
  cls('cm-head', 0),
  cls('cm-kicker', 0),
  cls('cm-title', 0),
  cls('surface-head', 5),
  cls('surface-kicker', 2),
  cls('pj-eyebrow', 1),
  cls('reg-cta', 13),
  cls('landing-newproj', 1),
  /* D0 review fix 5 (§4.7's `.sp-primary`): the canonical primary's alias. Measured 2026-11-02 at
     b391bfad2, 50 uses in 24 files (docs/evidence/DESIGN/D0/D0-11-primitives/). D6-2 and D6-3 convert. */
  cls('sp-primary', 50),
  { name: 'btn sm', baseline: 14, kind: 'btn-sm', css: /\.btn\.sm(?![\w-])|\.sm\.btn(?![\w-])/ },
  cls('reg-card', 15),
  cls('reg-tabs', 11),
  cls('reg-tab', 13),
  cls('cm-subtab', 0),
  cls('sc-ws', 1),
  cls('cc-tab', 1),
  cls('pj-seg', 2),
  cls('ml-seg', 4),
  cls('cl-toast', 1),
  cls('tb-detail', 4),
  cls('rbm-modal', 3),
  cls('cm-connect', 0),
  cls('pj-stageband', 0), // D3-1 (2026-11-06): the project page's step band is gone; its guidance is the step's suggestion.
  /* D0 review fix 15: the rest of §4.7's migration table, so no retired name's use rises either.
     Measured 2026-11-09 at 37f520f3be with this file's rule (docs/evidence/DESIGN/D0/D0-12-readme-claims/). */
  /* tabs → `.tabs`/`.tab` */
  cls('rbm-tabs', 1), cls('ml-tab', 1), cls('pd-tab', 1), cls('ra-tab', 1), cls('rl-tab', 0), cls('adm-tab', 1), cls('company-tabs', 1), cls('rpk-tab', 1), cls('cl-tab', 2), cls('qms-tabbar', 1),
  /* segments → `.seg`/`.seg-b` */
  cls('qms-seg', 1), cls('pdev-seg', 3), cls('seg-btn', 7),
  /* cards → `.pj-card` */
  cls('rbm-card', 7), cls('py-card', 5), cls('dj-card', 4), cls('cv-card', 2), cls('lic-card', 2), cls('ph-card', 1),
  /* tiles → quiet figures (`.reg-kpis`) or the lead sentence */
  cls('reg-kpi', 30), cls('metric-card', 40), cls('cv-kpi', 6), cls('ra-kpi', 4), cls('etmf-kpi', 3), cls('ivd-stat', 4), cls('py-stat', 3), cls('rbm-tile', 1),
  /* chips → `.rd-chip` + tone */
  cls('status-pill', 49), cls('sp-tag', 17), cls('reg-pill', 10), cls('ml-chip', 10), cls('pg-badge', 8), cls('rc-chip', 3),
  /* drawers → `.de` */
  cls('tt-panel', 3), cls('pdev-sheet', 4), cls('py-sheet', 1), cls('de-sheet', 5), cls('ana-sheet', 1), cls('adm-drawer', 4), cls('risk-drawer', 1),
  /* composers → the composer chrome */
  cls('ec-composer', 1), cls('rc-composer', 0), cls('rbm-ana-composer', 1),
  /* header meta → `.ph-sub` */
  cls('cm-meta', 84),
  /* The phrases' CSS is `.pj-stageband*` and `.cm-connect*`, ratcheted above. */
  { name: 'What to do now', baseline: 0, kind: 'text', css: null },
  { name: 'This work flows into', baseline: 1, kind: 'text', css: null },
];

function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    if (n === '__tests__' || n === 'node_modules') continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) tsxFiles(p, out);
    else if (n.endsWith('.tsx')) out.push(p);
  }
  return out;
}

/** The text a person or a className can see: string literals, template text and JSX text. No comments. */
function visibleStrings(file: string): string[] {
  const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, false, ts.ScriptKind.TSX);
  const out: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node) ||
      ts.isJsxText(node)
    ) {
      out.push(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const token = (name: string) => new RegExp(`(?<![\\w-])${escapeRe(name)}(?![\\w-])`, 'g');

function countUses(strings: string[], r: Retired): number {
  if (r.kind === 'btn-sm') {
    const btn = token('btn');
    const sm = token('sm');
    return strings.filter((s) => s.match(btn) && s.match(sm)).length;
  }
  const re = r.kind === 'class' ? token(r.name) : new RegExp(escapeRe(r.name), 'g');
  return strings.reduce((n, s) => n + (s.match(re)?.length ?? 0), 0);
}

/** Every selector prelude in the v2 stylesheets (comments stripped), with its file. */
function selectorPreludes(): { file: string; prelude: string }[] {
  const out: { file: string; prelude: string }[] = [];
  for (const file of readdirSync(STYLES).filter((n) => n.endsWith('.css'))) {
    const css = readFileSync(join(STYLES, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
    for (const m of css.matchAll(/([^{};]+)\{/g)) {
      const prelude = m[1].replace(/\s+/g, ' ').trim();
      if (!prelude.startsWith('@')) out.push({ file, prelude });
    }
  }
  return out;
}

const files = tsxFiles(CLIENT_SRC);
const strings = files.flatMap(visibleStrings);
const preludes = selectorPreludes();

describe('retired-name ratchet (ONE_DESIGN_PLAN §2, D0 guard 3)', () => {
  it('reads the client TSX and the v2 stylesheets', () => {
    expect(files.length).toBeGreaterThan(400);
    expect(files.some((f) => f.includes('__tests__'))).toBe(false);
    expect(preludes.length).toBeGreaterThan(1000);
    /* Comments are not uses; class tokens are whole. */
    const probe = ts.createSourceFile(
      'p.tsx',
      '// reg-cta\nconst a = <b className="reg-tabs btn ghost sm">What to do now</b>;',
      ts.ScriptTarget.Latest,
      false,
      ts.ScriptKind.TSX,
    );
    const texts: string[] = [];
    const v = (n: ts.Node): void => {
      if (ts.isStringLiteral(n) || ts.isJsxText(n)) texts.push(n.text);
      ts.forEachChild(n, v);
    };
    v(probe);
    expect(countUses(texts, cls('reg-cta', 0))).toBe(0);
    expect(countUses(texts, cls('reg-tab', 0))).toBe(0);
    expect(countUses(texts, cls('reg-tabs', 0))).toBe(1);
    expect(countUses(texts, RETIRED.find((r) => r.kind === 'btn-sm')!)).toBe(1);
    expect(countUses(texts, RETIRED.find((r) => r.name === 'What to do now')!)).toBe(1);
  });

  it.each(RETIRED.map((r) => [r.name, r.baseline, r] as const))(
    '`%s`: no more than %i uses, and gone from the CSS at 0',
    (name, baseline, r) => {
      const uses = countUses(strings, r);
      expect(
        uses,
        `\`${name}\` is retired (D0 spec §4.6, §4.7). Use the canonical primitive instead; ` +
          `uses rose from ${baseline} to ${uses}.`,
      ).toBeLessThanOrEqual(baseline);
      if (uses === 0 && r.css) {
        const left = preludes.filter((p) => r.css!.test(p.prelude)).map((p) => `${p.file}: ${p.prelude}`);
        expect(left, `\`${name}\` has no uses left: delete its alias and retired rules (D0-6).`).toEqual([]);
      }
    },
  );
});
