/**
 * Tailwind compiles the client, not the repository.
 *
 * ── What was shipping ─────────────────────────────────────────────────────────
 * Tailwind v4 does not read `content` from a JS config. Without an explicit
 * `@config` it ignores `tailwind.config.ts` entirely, and its automatic source
 * detection walks the whole project root minus `.gitignore`. So every file in
 * the repo — markdown under `docs/`, the agent skills under `.claude/`, the CI
 * scripts, the prototype JSX under `ui_kits/` — was a source of class
 * candidates for the stylesheet the browser downloads first.
 *
 * That was not abstract. The shipped entry CSS carried thirty-four rules
 * harvested from this repo's own tooling, including
 *
 *     .\[ci\:no-dev-auth-in-prod\]   .\[ci\:jwt-verify-pinned\]
 *     .\[ci\:password-hygiene\]      .\[ci\:rls-allowlist-sync\]
 *     .\[ci\:tenant-isolation\]      .\[ci\:client-reachability\]
 *
 * — the console prefixes of `scripts/ci/*.mjs`, read as Tailwind arbitrary
 * properties. A named list of the repository's security guardrails, served to
 * every visitor. `.\[ci\:test-imports\]` was in that set within an hour of the
 * script being written, which is the clearest possible statement of the
 * coupling: adding a CI guard changed the production CSS.
 *
 * The same scan produced `.bg-gray-200`, `.text-gray-500` and `.bg-black/20`,
 * none of which any client file asks for. Nearly all of this product's colour
 * comes from `design-system/` custom properties rather than Tailwind's palette
 * — the exception is the four files that render OUTSIDE the v2 shell, pinned by
 * the third test below.
 *
 * Scoping detection to the client removed 200 selectors and 13,991 bytes
 * (10.2%) from the entry stylesheet, and added none. Every one of the 200 was
 * checked against the scanned sources: two looked like hits and both were
 * artefacts of a looser tokeniser than Tailwind's own — `sticky` in a code
 * comment, `blur` inside `backdropFilter: 'blur(12px)'`.
 *
 * ── Why a test and not just a comment ─────────────────────────────────────────
 * The failure is silent in both directions. Nothing breaks when detection is
 * over-broad; the bundle just grows and starts carrying words from files that
 * have nothing to do with the UI. And nothing warns you that the JS config's
 * `content` array stopped being read — it still sits there, still looks
 * authoritative, and has been inert since the v4 upgrade.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ENTRY = 'client/src/index.css';

const read = (p: string) => fs.readFileSync(path.join(REPO, p), 'utf8');

describe('tailwind source scope', () => {
  it('automatic source detection is off', () => {
    const css = read(ENTRY);
    const imports = [...css.matchAll(/@import\s+["']tailwindcss["'][^;]*/g)].map((m) => m[0]);

    expect(imports.length, `no tailwindcss import found in ${ENTRY} — has the entry moved?`)
      .toBe(1);
    expect(
      imports[0],
      'the tailwindcss import must carry `source(none)`. Without it, v4 scans the ' +
        'entire project root and compiles class candidates out of docs, skills, CI ' +
        'scripts and prototype kits into the stylesheet every session downloads.',
    ).toMatch(/source\(none\)/);
  });

  it('every declared source is inside client/', () => {
    const css = read(ENTRY);
    const sources = [...css.matchAll(/@source\s+["']([^"']+)["']/g)].map((m) => m[1]);

    expect(sources.length, 'source(none) with no @source would compile an empty stylesheet')
      .toBeGreaterThan(0);

    // Resolved against client/src/index.css. Anything that escapes `client/` is
    // a file the browser does not load, and its words do not belong in the CSS.
    const entryDir = path.dirname(path.join(REPO, ENTRY));
    const outside = sources.filter((s) => {
      const glob = s.replace(/[*?[{].*$/, '');
      const abs = path.resolve(entryDir, glob);
      return !abs.startsWith(path.join(REPO, 'client'));
    });
    expect(outside, `these @source globs reach outside client/: ${outside.join(', ')}`)
      .toEqual([]);
  });

  it('no NEW client file depends on the palette the dead config would have remapped', () => {
    /*
     * A RATCHET over a live conformance gap.
     *
     * `tailwind.config.ts` remaps fifteen colour families to an "Anthropic
     * warm" palette across 115 hex values, and under v4 that remapping is
     * inert — `.bg-black/20` compiles to `#0003`, Tailwind's stock black, not
     * the config's `#141413`.
     *
     * I first recorded the blast radius as zero. That was wrong, and the way it
     * was wrong is worth keeping: `git grep -E` does not honour `\b` the way I
     * assumed, so the search returned nothing and I wrote "measured, zero
     * occurrences" into two files. A proper walk — this one — finds 31 distinct
     * utilities across four files, and they are exactly the surfaces that render
     * OUTSIDE the v2 shell, so outside the custom properties everything else
     * uses.
     *
     * Most of the gap is invisible: v4's stock `stone`/`slate` are already warm
     * and land within a hair of the config (`stone-50` is oklch(98.5% .001
     * 106.423) against the config's `#faf9f5`). What is visible is blue and
     * green — the config maps blue→Anthropic blue and emerald/green→earthy
     * green, and the signup and login screens render `bg-blue-50`,
     * `text-blue-600`, `bg-green-100`, `bg-emerald-50` and friends in Tailwind's
     * stock cool palette today.
     *
     * Fixing that means adding `@config` and re-QAing every colour, which is its
     * own PR. Until then this holds the line: no NEW file may join the list, and
     * emptying an entry means deleting it from KNOWN.
     */
    const KNOWN = [
      'client/src/components/ui/error-boundary.jsx',
      'client/src/concept2cure/auth/ZenAuthLayout.tsx',
      'client/src/concept2cure/auth/ZenLogin.tsx',
      'client/src/concept2cure/auth/ZenSignup.tsx',
    ];
    const FAMILIES = [
      'slate', 'gray', 'zinc', 'neutral', 'stone',
      'blue', 'indigo', 'violet', 'purple', 'sky', 'cyan',
      'green', 'emerald', 'teal', 'terracotta',
    ];
    const UTILITY = new RegExp(
      String.raw`\b(?:text|bg|border|ring|from|via|to|divide|outline|decoration|fill|stroke|accent|caret|placeholder)-(?:${FAMILIES.join('|')})-\d{2,3}\b`,
    );

    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (e.name === 'node_modules' || e.name === '__tests__') continue;
          walk(p);
        } else if (/\.(tsx?|jsx?)$/.test(e.name)) {
          if (UTILITY.test(fs.readFileSync(p, 'utf8'))) hits.push(path.relative(REPO, p));
        }
      }
    };
    walk(path.join(REPO, 'client/src'));
    hits.sort();

    expect(
      hits.filter((f) => !KNOWN.includes(f)),
      'a NEW client file uses a Tailwind palette utility that tailwind.config.ts ' +
        'remaps — but v4 never reads that config, so it renders in the stock ' +
        'palette. Use a design-system custom property instead, or take the ' +
        '`@config` decision.',
    ).toEqual([]);

    const cleared = KNOWN.filter((f) => !hits.includes(f));
    expect(
      cleared,
      `these no longer use the remapped palette — delete them from KNOWN: ${cleared.join(', ')}`,
    ).toEqual([]);
  });
});
