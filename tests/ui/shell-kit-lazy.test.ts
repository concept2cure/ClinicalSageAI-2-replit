/**
 * The kit shells must stay out of the entry graph.
 *
 * ── What this protects ────────────────────────────────────────────────────────
 * `mdx/MdxRoute.tsx` statically imports four stylesheets — app.css,
 * pathway-tabs.css, files-tree.css, drafter.css, 4,683 lines. app.css is
 * unscoped: global `*`, `html, body, #root`, `body`, `button`,
 * `input, textarea` and `svg` resets, a `:root` token block, and 264 class
 * names shared with the v2 shell.
 *
 * Both of its mount points used to import it statically —
 * `router/ZenRouter.tsx` and, via `v2/surfaceViews.ts`,
 * `v2/surfaces/DeviceWorkstream.tsx`. surfaceViews is imported at module scope
 * by V2App, so that CSS landed in the ENTRY chunk and applied to every session
 * for every client type. A pharma user who never opened a device surface still
 * got the MDX kit's body font, box-sizing and colliding utility classes.
 *
 * Making both mounts lazy moved 139.3 KB out of the entry graph: the emitted
 * ZenRouter stylesheet went 149.0 KB → 9.7 KB and the initial HTML now links
 * exactly one stylesheet.
 *
 * ── Why a test and not a comment ──────────────────────────────────────────────
 * Reverting this is one keystroke — `import MdxRoute from '../../mdx/MdxRoute'`
 * is what an editor's auto-import writes, and nothing would fail. The cost would
 * be invisible: no error, no broken screen, just every session paying for a kit
 * it never opens and inheriting resets that quietly change the shell.
 *
 * The same reasoning covers pdev, which is already lazy and must stay that way.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p: string) => fs.readFileSync(path.join(REPO, p), 'utf8');

/** A static default/named import of `spec` — the thing that must not reappear. */
function hasStaticImport(src: string, spec: string): boolean {
  // `import X from '…spec'` / `import { X } from '…spec'` / `import '…spec'`,
  // but NOT `import('…spec')`, which is the dynamic form we want.
  const re = new RegExp(
    String.raw`^\s*import\s+(?:[^'"()]*?\s+from\s+)?['"][^'"]*${spec}['"]`,
    'm',
  );
  return re.test(src);
}

const MOUNTS: Array<{ file: string; kit: string; why: string }> = [
  {
    file: 'client/src/concept2cure/router/ZenRouter.tsx',
    kit: 'mdx/MdxRoute',
    why: 'the standalone /concept2cure/mdx route',
  },
  {
    file: 'client/src/concept2cure/v2/surfaces/DeviceWorkstream.tsx',
    kit: 'mdx/MdxRoute',
    why: 'the five device-* surfaces, reached from surfaceViews at V2App module scope',
  },
  {
    file: 'client/src/concept2cure/router/ZenRouter.tsx',
    kit: 'pdev/PdevRoute',
    why: 'the /concept2cure/pdev route',
  },
];

describe('kit shells stay lazy', () => {
  for (const { file, kit, why } of MOUNTS) {
    it(`${file.split('/').pop()} loads ${kit.split('/').pop()} dynamically — ${why}`, () => {
      const src = read(file);
      expect(
        hasStaticImport(src, kit),
        `${file} statically imports ${kit}. That pulls the kit's stylesheets into the ` +
          'entry graph, where they apply to every session whether or not the kit is ' +
          'opened — and mdx/app.css is unscoped, with global element resets. Use ' +
          'lazy(() => import(...)) with a Suspense boundary, as the other mounts do.',
      ).toBe(false);

      expect(
        new RegExp(String.raw`import\(\s*['"][^'"]*${kit}['"]\s*\)`).test(src),
        `${file} no longer references ${kit} by dynamic import either — if the mount ` +
          'was removed, delete this expectation; if it was renamed, update it.',
      ).toBe(true);
    });
  }

  it('a Suspense boundary exists wherever a kit is mounted lazily', () => {
    for (const file of new Set(MOUNTS.map((m) => m.file))) {
      const src = read(file);
      // lazy() without Suspense throws at render, so this is the paired half of
      // the rule rather than a style preference.
      expect(/\bSuspense\b/.test(src), `${file} mounts a lazy kit with no Suspense`).toBe(true);
    }
  });
});
