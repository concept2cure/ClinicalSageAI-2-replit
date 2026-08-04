/**
 * There is one shell.
 *
 * ── What went wrong ───────────────────────────────────────────────────────────
 * The product shipped four shells. v2's was the real one. `quality` was already
 * doing the right thing — a twenty-line adapter rendering inside the v2 canvas
 * with no chrome of its own. The other two were second applications:
 *
 *   mdx  — drew a Rail, TopBar, TabBar, AnA composer and ⌘K palette, and was
 *          mounted BOTH as a top-level route AND inside `.c2c-v2 .shell` (via
 *          `DeviceWorkstream`), so five shipping surfaces stacked two rails,
 *          two topbars and two AnA composers.
 *   pdev — mounted as its own route, and v2's `pdev` surface was a stub whose
 *          only job was to navigate the browser OUT of the v2 shell to reach it.
 *
 * Nine further shells existed as dead code — cmc, risk, biopharma, labeling,
 * submission, tasking, translation, insights, communication — each with its own
 * Rail, none reachable from `main.tsx`. They are deleted.
 *
 * ── What this test holds ──────────────────────────────────────────────────────
 * Not "don't add a second rail" as a style rule. The specific structural facts
 * that made the double shell possible, each of which returns silently: nothing
 * fails, nothing errors, the screen just quietly has two of everything.
 *
 * Source analysis, matching the other tests here. Comments are stripped with
 * the shared helper — this file's own prose contains the strings it greps for.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { stripComments } from './_strip-comments';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = path.join(REPO, 'client/src/concept2cure');

const read = (p: string, isCss = false) =>
  stripComments(fs.readFileSync(path.join(REPO, p), 'utf8'), isCss);

/** Every .tsx under concept2cure, repo-relative. */
function allTsx(dir = SRC, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === '__tests__' || e.name === 'node_modules') continue;
      allTsx(p, out);
    } else if (e.name.endsWith('.tsx')) {
      out.push(path.relative(REPO, p));
    }
  }
  return out;
}

/**
 * The one shell root.
 *
 * `.c2c-v2` is the product shell. Anything else calling itself a shell root and
 * laying out a rail column is a second application; modal and panel roots
 * (`npd-shell`, `pqs-shell`, …) are not, which is why this looks for the grid
 * that reserves a rail rather than for the word "shell".
 */
const SHELL_ROOT = /className=\{?[`"']([a-z0-9-]*\s)?c2c-v2/;

describe('one shell', () => {
  it('no module outside v2 renders a rail', () => {
    // A rail IS a shell — it is the thing that makes a screen an application
    // rather than a surface. The kits contribute surfaces now.
    const offenders: string[] = [];
    for (const file of allTsx()) {
      if (file.includes('/v2/')) continue;
      const src = read(file);
      if (/<(Rail|PdevRail|AnaRail|AnaDock)\b/.test(src)) offenders.push(file);
    }
    expect(offenders, 'these render shell chrome outside the v2 shell').toEqual([]);
  });

  it('no route mounts a second application', () => {
    // Both offenders mounted as top-level routes, which is what let them exist
    // beside the shell rather than inside it.
    const router = read('client/src/concept2cure/router/ZenRouter.tsx');
    for (const gone of ['MdxRoute', 'PdevRoute']) {
      expect(router, `${gone} is mounted as its own route again — kits are surfaces, not routes`)
        .not.toMatch(new RegExp(String.raw`<${gone}\b`));
    }
  });

  it('no surface navigates out of the shell to reach a kit', () => {
    // `PdevRedirect` was a registered v2 surface whose entire body was
    // `setLocation('/concept2cure/pdev')` — the shell tearing itself down to
    // hand off to another application. A surface renders; it does not relocate.
    const views = read('client/src/concept2cure/v2/surfaceViews.ts');
    expect(views, 'a surface is redirecting to a kit route instead of rendering it')
      .not.toMatch(/PdevRedirect|MdxRedirect/);
  });

  it('the v2 shell root is the only one that lays out a rail column', () => {
    const roots = allTsx().filter((f) => SHELL_ROOT.test(read(f)));
    // OnboardingWizard and AuthFlow also carry `.c2c-v2`; the point is that the
    // set is small, known, and inside v2 — not that it is exactly one file.
    expect(roots.every((f) => f.includes('/v2/')), `shell root outside v2: ${roots.join(', ')}`).toBe(true);
    expect(roots.length, 'no shell root found — has V2App been renamed?').toBeGreaterThan(0);
  });

  it('every device surface the kit can render is one the shell can route to', () => {
    // THE HIDING GUARD. The kit's rail reached fifteen destinations; only five
    // were v2 surface ids. The other ten — pma, software, udi, postmarket,
    // engineering, pre-sub, validation among them — were rendered by code no
    // user could navigate to, roughly 1,900 lines against live endpoints. That
    // is the failure this asserts against: not a crash, just work nobody can
    // reach.
    // The id list lives apart from the host so the registry can read it without
    // dragging the kit into the entry chunk; the cases live in the host.
    const ids = read('client/src/concept2cure/mdx/surfaceIds.ts');
    const declared = [...ids.matchAll(/^\s*'(device-[a-z0-9-]+)',$/gm)].map((m) => m[1]);
    expect(declared.length, 'MDX_SURFACE_IDS did not parse').toBeGreaterThan(10);
    const host = read('client/src/concept2cure/mdx/MdxSurfaceHost.tsx');

    const views = read('client/src/concept2cure/v2/surfaceViews.ts');
    const registered = new Set(
      [...views.matchAll(/'(device-[a-z0-9-]+)':\s*\{/g)].map((m) => m[1]),
    );
    expect([...declared].filter((id) => !registered.has(id)),
      'the kit renders these but SURFACE_VIEWS cannot route to them — unreachable UI').toEqual([]);

    const cases = new Set([...host.matchAll(/case '(device-[a-z0-9-]+)':/g)].map((m) => m[1]));
    expect([...registered].filter((id) => !cases.has(id) && id !== 'device-workstream'),
      'the registry routes to these but the kit has no case — they render the not-found card').toEqual([]);
  });
});
