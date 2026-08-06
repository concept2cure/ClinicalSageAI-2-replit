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
 * — the exception is the four files that render OUTSIDE the v2 shell, which is
 * what the third test below is about.
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

  it('the theme is loaded, so the palette is the one the config declares', () => {
    /*
     * `@config` is REQUIRED, and its absence is silent.
     *
     * Tailwind v4 does not read a JS config without it — not the `content`
     * array and not the THEME. `tailwind.config.ts` remaps fifteen colour
     * families to an "Anthropic warm" palette across 115 hex values, and for
     * the whole life of the v4 upgrade none of it applied: `.bg-black/20`
     * compiled to `#0003`, Tailwind's stock black, against the config's
     * `#141413`.
     *
     * That was not harmless. Four files render OUTSIDE the v2 shell and use
     * ZERO design-system custom properties — `ZenLogin`, `ZenSignup`,
     * `ZenAuthLayout` and the error boundary are styled entirely in Tailwind
     * utilities, saturated with `stone-*`, which only makes sense against the
     * warm remap. They were authored for this palette and were silently
     * rendering in another one. The signup screen's `bg-blue-50` /
     * `bg-green-100` were stock cool blue and stock emerald instead of the
     * brand's blue and earthy green.
     *
     * The failure mode is that nothing anywhere errors when `@config` goes
     * missing. The colours just quietly become someone else's.
     */
    const css = read(ENTRY);
    const config = /@config\s+["']([^"']+)["']/.exec(css);

    expect(
      config,
      'client/src/index.css has no `@config`. Without it Tailwind v4 ignores ' +
        'tailwind.config.ts entirely — the theme silently reverts to stock, and ' +
        'the auth screens render in a palette nobody chose.',
    ).toBeTruthy();

    const target = path.resolve(path.dirname(path.join(REPO, ENTRY)), config![1]);
    expect(fs.existsSync(target), `@config points at a file that does not exist: ${config![1]}`)
      .toBe(true);

    // …and the config it points at still carries a theme worth loading. A
    // config emptied to `{}` would satisfy the directive and mean nothing.
    const theme = fs.readFileSync(target, 'utf8');
    expect(
      (theme.match(/#[0-9a-fA-F]{6}/g) ?? []).length,
      'the loaded config declares almost no colours — has the theme been ' +
        'emptied? If the palette moved to design-system custom properties, ' +
        'delete the config and this test together rather than leaving both inert.',
    ).toBeGreaterThan(50);
  });

});
