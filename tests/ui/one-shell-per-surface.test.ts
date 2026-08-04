/**
 * A surface renders one rail and one topbar. Not two.
 *
 * ── The defect this closes ────────────────────────────────────────────────────
 * `v2/surfaceViews.ts` maps five surfaces — device-510k, device-cer,
 * device-diagnostics, device-submission, device-workstream — to
 * `v2/surfaces/DeviceWorkstream`, which renders `MdxRoute`. That mount sits
 * INSIDE `.c2c-v2 .shell`, and `V2App.tsx` draws `<Rail>` and `<TopBar>`
 * unconditionally. `MdxRoute` → `mdx/App.tsx` drew its own `<Rail>` and
 * `<TopBar>` unconditionally too, so those five shipping surfaces stacked two
 * rails and two topbars.
 *
 * It was not an unknown hazard. `router/ZenRouter.tsx` names it in the comment
 * on the PDEV route — "the kit owns its own Rail / TopBar / AnaDock, so keep it
 * out of the v2 shell (double-rail…)" — and avoids it there by mounting PDEV
 * outside the shell. The MDX-inside-DeviceWorkstream path never got the same
 * treatment.
 *
 * Scoping mdx/*.css under `.mdx-shell` made it more visible rather than less.
 * Before scoping, `.c2c-v2 .rail` (0,2,0) out-specified the kit's bare `.rail`
 * (0,1,0), so the duplicate rail rendered in the host's clothing and partly
 * blended in. After scoping, `.mdx-shell .rail` ties at (0,2,0) and wins on
 * load order, because the kit's chunk is lazy and arrives second. The doubling
 * did not appear with the scoping; it stopped being camouflaged by it.
 *
 * ── Why a test ────────────────────────────────────────────────────────────────
 * The fix is a single prop. Dropping it — a new mount point written by
 * copy-paste, or the gate removed while refactoring `App.tsx` — restores the
 * double shell with no error, no failing build, and no broken screen. Just two
 * rails, on the surfaces a device client spends its day in.
 *
 * Source analysis rather than a render, matching the other tests in this
 * directory: `mdx/App.tsx` pulls live data, AnA chat and a program fixture, and
 * the mocking needed to mount it would be more fragile than what it verified.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { stripComments } from './_strip-comments';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = 'client/src/concept2cure';

/**
 * Read a file with its comments blanked out.
 *
 * Not optional here. This test's own documentation contains the strings
 * `<Rail>` and `<TopBar>` while explaining the defect, and the first version
 * matched App.tsx's doc comment instead of its JSX — failing on a file that was
 * correct. That is the exact trap `_strip-comments` exists for.
 */
const read = (p: string, isCss = false) =>
  stripComments(fs.readFileSync(path.join(REPO, p), 'utf8'), isCss);

/** Every `<MdxRoute …>` / `<PdevRoute …>` JSX element in a file, with its props. */
function kitMounts(src: string): Array<{ tag: string; props: string }> {
  const out: Array<{ tag: string; props: string }> = [];
  for (const m of src.matchAll(/<(MdxRoute|PdevRoute)\b([^>]*?)\/?>/g)) {
    out.push({ tag: m[1], props: m[2] });
  }
  return out;
}

/** Files that render a kit route from inside the v2 shell tree. */
const EMBEDDED_MOUNTS = [`${SRC}/v2/surfaces/DeviceWorkstream.tsx`];

/** Files that mount a kit route as its own route, OUTSIDE the v2 shell. */
const STANDALONE_MOUNTS = [`${SRC}/router/ZenRouter.tsx`];

describe('a kit mounted inside the v2 shell does not draw its own chrome', () => {
  it.each(EMBEDDED_MOUNTS)('%s passes `embedded`', (file) => {
    const mounts = kitMounts(read(file));
    expect(mounts.length, `${file} renders no kit route — has the mount moved?`).toBeGreaterThan(0);
    for (const m of mounts) {
      expect(m.props, `<${m.tag}> in ${file} renders inside .c2c-v2 .shell and must pass \`embedded\``)
        .toMatch(/\bembedded\b/);
    }
  });

  it('mdx/App.tsx gates BOTH the rail and the topbar on `embedded`', () => {
    const src = read(`${SRC}/mdx/App.tsx`);

    // The prop has to exist and reach the component, or the gates below are
    // dead code that always renders.
    expect(src).toMatch(/embedded\?:\s*boolean/);
    expect(src).toMatch(/export function App\([^)]*\bembedded\b/s);

    for (const tag of ['Rail', 'TopBar']) {
      const at = src.indexOf(`<${tag}`);
      expect(at, `mdx/App.tsx no longer renders <${tag}>`).toBeGreaterThan(-1);
      // The gate is the nearest thing before the element. Comments are already
      // blanked, so 200 chars is generous for `{!embedded && (`.
      const preceding = src.slice(Math.max(0, at - 200), at);
      expect(preceding, `<${tag}> in mdx/App.tsx is not gated on !embedded — the host already draws one`)
        .toMatch(/!embedded\s*&&/);
    }
  });

  it('the embedded grid collapses the rail column and stops claiming the viewport', () => {
    const css = read(`${SRC}/mdx/app.css`, true);
    // Without these the rail column stays reserved and the canvas renders with a
    // blank gutter where the removed rail was, at 100vh inside a host that has
    // already spent height on its own topbar.
    expect(css).toMatch(/\.mdx-shell\[data-embedded="true"\]\s*\{[^}]*grid-template-columns:\s*0\s/);
    expect(css).toMatch(/\.mdx-shell\[data-embedded="true"\]\s*\{[^}]*height:\s*100%/);

    // Order matters: `[data-embedded="true"]` and `[data-collapsed="true"]` are
    // both (0,2,0), so the embedded rule only wins by coming last.
    expect(css.indexOf('.mdx-shell[data-embedded="true"]'))
      .toBeGreaterThan(css.indexOf('.mdx-shell[data-collapsed="true"]'));
  });

  it('the standalone route still gets the full kit shell', () => {
    // THE FALSIFICATION. If `embedded` leaked onto every mount, the kit's rail
    // would exist nowhere — and its 15 destinations are not all reachable from
    // the v2 rail or from the 5-tab TabBar. The standalone route is what keeps
    // vault / software / validation / analytics / clinical-studies reachable.
    for (const file of STANDALONE_MOUNTS) {
      const mounts = kitMounts(read(file));
      // Non-vacuous: a `.not.toMatch` over an empty list passes on a file where
      // the mounts were renamed out from under it and proves nothing.
      expect(mounts.length, `${file} mounts no kit route — has the router changed?`).toBeGreaterThan(0);
      for (const m of mounts) {
        expect(m.props, `<${m.tag}> in ${file} mounts outside the v2 shell and must keep its own chrome`)
          .not.toMatch(/\bembedded\b/);
      }
    }
  });
});
