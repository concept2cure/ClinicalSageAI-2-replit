/**
 * There is no AnA rail, at any width — and no code for one.
 *
 * ── What this file used to pin ───────────────────────────────────────────────
 * The shell grid was `var(--rail) 1fr var(--ana)`. With the AnA rail open on a
 * 390px screen the grid was `56px | 0px | 380px`: no content column at all, and
 * the conversation rail wider than the viewport. A ≤900px rule turned the open
 * rail into a fixed drawer over a scrim, and this file kept that rule from
 * being dropped (docs/reports/ANA_UI_VALIDATION_REPORT_2026-09-06.md).
 *
 * ── What it pins now ─────────────────────────────────────────────────────────
 * The right rail went (docs/design/ONE_ANA_ONE_CANVAS.md, slice 9): AnA is
 * talked to in one place, the conversation (surfaces/ConversationThread.tsx),
 * which is a page like any other at phone width. Slice 9 stopped mounting the
 * rail; its second half deleted the component, its stylesheet and its third
 * grid column. So:
 *   · the shell mounts no rail and no scrim;
 *   · Shell.tsx defines no AnaRail, and nothing under client/src imports one —
 *     an unmounted component a later session can re-mount in one line is how
 *     five editor generations came back (CLAUDE.md, working agreement);
 *   · the shell grid is two tracks, nav | page, and no rule styles a rail
 *     column, its seam, its scrim or its open state;
 *   · the conversation is usable at phone width, 760px and narrower
 *     (docs/design/ONE_ANA_ONE_CANVAS.md §2.2): its column and its side dock
 *     stack instead of sharing a row, the dock spans the screen, the thread
 *     scrolls above a composer that never shrinks out of view, and the
 *     thread's gutters are narrowed. jsdom has no layout, so this pins the
 *     rules that decide it.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const css = read('client/src/concept2cure/v2/styles/app-v2.css');
const authoringCss = read('client/src/concept2cure/v2/styles/authoring-v2.css');
const v2app = read('client/src/concept2cure/v2/V2App.tsx');
const shell = read('client/src/concept2cure/v2/Shell.tsx');

/** Every .ts/.tsx file under client/src, tests included, repo-relative. */
function clientSources(dir = path.join(ROOT, 'client/src'), out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== 'node_modules') clientSources(p, out);
    } else if (/\.tsx?$/.test(e.name)) {
      out.push(path.relative(ROOT, p));
    }
  }
  return out;
}

describe('no AnA rail at any width', () => {
  it('the shell mounts no AnA rail and no scrim at any width', () => {
    expect(v2app).not.toMatch(/<AnaRail\b/);
    expect(v2app).not.toMatch(/className="ana-scrim"/);
  });

  it('Shell.tsx defines no AnaRail, and no file under client/src imports one', () => {
    expect(shell).not.toMatch(/\bfunction AnaRail\b|\bconst AnaRail\b|\bAnaRailLiveDrive\b/);
    const importers = clientSources().filter((f) =>
      /import\s*\{[^}]*\bAnaRail\b[^}]*\}\s*from\s*['"][^'"]*Shell['"]/.test(read(f)),
    );
    expect(importers, 'these still import the deleted rail').toEqual([]);
  });

  it('the shell grid is nav | page: no column, seam, scrim or open state for a rail', () => {
    expect(css).toMatch(/\.c2c-v2\.shell\{display:grid;grid-template-columns:var\(--rail\) 1fr;/);
    expect(css).toMatch(/\.c2c-v2\.shell\[data-collapsed="true"\]\{grid-template-columns:var\(--rail-collapsed\) 1fr;\}/);
    expect(css).not.toMatch(/var\(--ana\)|var\(--ana-seam\)|--ana:|--ana-seam:/);
    expect(css).not.toMatch(/\.ana(-seam|-scrim)?\s*\{|\.ana(-seam|-scrim)?\{/);
    expect(css).not.toMatch(/data-ana-open="true"/);
  });
});

/** The body of every `@media (max-width: 760px)` block in a stylesheet. */
function phoneBlocks(sheet: string): string {
  const out: string[] = [];
  const re = /@media\s*\(max-width:\s*760px\)\s*\{/g;
  while (re.exec(sheet)) {
    let depth = 1;
    let i = re.lastIndex;
    while (depth && i < sheet.length) {
      if (sheet[i] === '{') depth++;
      else if (sheet[i] === '}') depth--;
      i++;
    }
    out.push(sheet.slice(re.lastIndex, i - 1));
  }
  return out.join('\n');
}
/** The declarations of `selector { … }` in a block, whitespace removed. */
function decls(block: string, selector: RegExp): string {
  const m = block.match(new RegExp(`${selector.source}\\s*\\{([^}]*)\\}`));
  return (m?.[1] ?? '').replace(/\s+/g, '');
}

describe('the conversation at phone width (760px and narrower)', () => {
  const phone = phoneBlocks(authoringCss) + phoneBlocks(css);

  it('its column and its side dock stack, and the dock spans the screen', () => {
    // A 384px dock in the same row as the conversation flexed it to 0px wide
    // on a 390px screen.
    expect(decls(phone, /\.ct-main/)).toContain('flex-direction:column');
    expect(decls(phone, /\.ct-side-work,\s*\.ct-artifacts/)).toContain('width:100%');
    expect(decls(phone, /\.ct-side/)).toMatch(/max-height:\d+%/);
  });

  it('the thread scrolls above a composer that never shrinks out of view', () => {
    expect(css).toMatch(/\.c2c-v2 \.ct-wrap\{height:100%;display:flex;flex-direction:column;/);
    expect(css).toMatch(/\.c2c-v2 \.ct-conv\{flex:1;min-width:0;display:flex;flex-direction:column;\}/);
    expect(css).toMatch(/\.c2c-v2 \.ct-scroll\{flex:1;min-height:0;overflow-y:auto;\}/);
    expect(css).toMatch(/\.c2c-v2 \.ct-composer-wrap\{flex-shrink:0;/);
    expect(decls(phone, /\.ct-conv/)).toContain('min-height:0');
  });

  it('the thread\u2019s side gutters are narrowed, and nothing in it is wider than the screen', () => {
    expect(decls(phone, /\.ct-col/)).toMatch(/^padding:\d+px(1[0-6])px/);
    // No fixed width on the conversation's own column or composer.
    expect(css).not.toMatch(/\.c2c-v2 \.ct-(conv|composer|composer-wrap)\{[^}]*(?<![-\w])width:\d{3,}px/);
  });
});
