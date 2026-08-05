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

  it('only the shell and its named-thread surfaces start a conversation', () => {
    // ONE SHELL, ONE COMPOSER — as a countable fact rather than an intention.
    //
    // `useAnaChat` IS a conversation: each instantiation gets its own thread,
    // its own history and its own module_context. Four rails were easy to see;
    // a fifth `useAnaChat` behind an `if (onAskAna)` was not. `pdev/App.tsx`
    // carried exactly that — inert only because `PdevSurfaces` happens always
    // to pass the prop, and one omission away from re-forking the thread in
    // silence. It is deleted; this is what keeps it deleted.
    //
    // Every entry below is deliberate and owns a NAMED conversation. The last
    // four are the discharge of `ownsConversation`: a surface that takes the
    // AnA rail's column has to answer somewhere, and these answer in their own
    // dock rather than writing into a rail the screen does not draw.
    //
    //   V2App.tsx              the shell's rail — the one conversation every
    //                          surface that KEEPS the rail shares.
    //   ConversationThread.tsx the dedicated thread surface. Also the
    //                          destination for `window.C2C_CONVO` seeds from
    //                          Home, ProjectHome and the shell's own ⌘K.
    //   Rbm.tsx                the RBM co-monitor dock, study-scoped.
    //   DocumentAuthoring.tsx  the editor's right-rail pane, section-scoped via
    //                          authoringContext. The editor cannot give the
    //                          rail's column back (`.ed` has a hard 940px
    //                          minimum with a rail mode open) and its asks are
    //                          about the section under the cursor, so the
    //                          answer has to arrive without leaving the editor.
    //   EctdCoauthor.tsx       the co-author's middle intelligence pane,
    //                          document-scoped. The pane already had a
    //                          composer; it had no answer.
    const ALLOWED = new Set([
      'client/src/concept2cure/v2/V2App.tsx',
      'client/src/concept2cure/v2/surfaces/ConversationThread.tsx',
      'client/src/concept2cure/v2/surfaces/Rbm.tsx',
      'client/src/concept2cure/v2/surfaces/DocumentAuthoring.tsx',
      'client/src/concept2cure/v2/surfaces/EctdCoauthor.tsx',
    ]);

    const sources: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (e.name === '__tests__' || e.name === 'node_modules') continue;
          walk(p);
        } else if (/\.tsx?$/.test(e.name)) {
          sources.push(path.relative(REPO, p));
        }
      }
    };
    walk(SRC);

    // The hook's own module defines and exports it; every other file that
    // writes `useAnaChat(` is opening a conversation.
    const HOOK = 'client/src/concept2cure/components/ana/useAnaChat.ts';
    const callers = sources
      .filter((f) => f !== HOOK)
      .filter((f) => /\buseAnaChat\s*\(/.test(read(f)))
      .sort();

    expect(callers.length, 'no useAnaChat call sites found — has the hook been renamed?')
      .toBeGreaterThan(0);
    expect(
      callers.filter((f) => !ALLOWED.has(f)),
      'a second conversation: this file starts its own AnA thread. Route through the ' +
        "shell's `onAsk`, or add it here with a note saying which named conversation it owns.",
    ).toEqual([]);
  });

  it('no surface takes the AnA rail column and still calls the shell onAsk', () => {
    /*
     * This was a RATCHET with six entries. It is a clean assertion now.
     *
     * `hideAna: true` — since renamed `ownsConversation: true` — collapses the
     * shell's AnA rail. Seven surfaces set it and still handed `onAsk` to their
     * buttons, so pressing "Ask AnA" there sent the question into the one rail
     * that screen never draws. Nothing errored. `ask()` persisted
     * `anaOpen: true` to localStorage, so the answer appeared later, unbidden,
     * on the next surface that did draw a rail — you pressed a button, saw
     * nothing, navigated away, and found your question and its answer already
     * open. Home was fixed first (it seeds `window.C2C_CONVO` and lets the
     * thread surface answer); the six recorded here needed a product decision
     * about what the flag means, and got one:
     *
     *   admin-console    dropped the flag. Its seven asks are governed
     *                    mutations and the §11.50 sign-off is drawn BY the
     *                    rail, so hiding the rail hid the signature gate.
     *   csr-workflow     dropped the flag. A board, not an editor — and its
     *                    file-mate `regulatory-workspace` already does exactly
     *                    this with the identical row phrasing.
     *   protocol-dev     dropped the flag. Two shrinkable tracks, a read-only
     *                    document body, nothing to write an answer into.
     *   document-authoring / ectd-coauthor   kept the flag and grew their own
     *                    docks (see ALLOWED above).
     *   insights         kept the flag; the one offending button is deleted
     *                    rather than pointed at `roAnaReply`, which composes
     *                    text locally and would have made up an answer.
     *
     * Two doors, both now shut in V2App: `ask()` no longer writes into a rail
     * the active surface does not draw (it seeds the conversation surface
     * instead), and ⌘\ no longer persists `anaOpen` from such a surface.
     */
    const views = read('client/src/concept2cure/v2/surfaceViews.ts');

    // Map each rail-claiming surface to the component it renders…
    const hidden = new Map<string, string>();
    for (const m of views.matchAll(/^\s*'?([a-z0-9-]+)'?:\s*\{([^}]*)\},?\s*$/gm)) {
      const [, id, body] = m;
      if (!/\bownsConversation:\s*true\b/.test(body)) continue;
      const comp = /\bcomponent:\s*([A-Za-z0-9_]+)/.exec(body)?.[1];
      if (comp) hidden.set(id, comp);
    }
    expect(hidden.size, 'no ownsConversation surfaces parsed — has SURFACE_VIEWS changed shape?')
      .toBeGreaterThan(0);

    // …and each component to the file that defines it.
    const definedIn = new Map<string, string>();
    for (const file of allTsx()) {
      const src = read(file);
      for (const d of src.matchAll(/export\s+(?:default\s+)?(?:function|const)\s+([A-Za-z0-9_]+)/g)) {
        if (!definedIn.has(d[1])) definedIn.set(d[1], file);
      }
    }

    const offenders = [...hidden.entries()]
      .filter(([, comp]) => {
        const file = definedIn.get(comp);
        // USE, not mention. Several surfaces destructure `onAsk` from
        // SurfaceViewProps and never touch it again — harmless, and counting
        // that would list files with no button to press. `rbm` is exactly that
        // case: it takes the prop, never uses it, and answers through its own
        // study-scoped dock.
        //
        // Three shapes count as use: calling it, aliasing it
        // (`const ask = onAsk` — what EctdCoauthor used to do, and a bare
        // call-site grep misses), and forwarding it into a child as a JSX prop.
        if (!file) return false;
        const src = read(file);
        return /\bonAsk\s*\(/.test(src) || /=\s*onAsk\b/.test(src) || /\{\s*onAsk\s*\}/.test(src);
      })
      .map(([id]) => id)
      .sort();

    expect(
      offenders,
      'this surface takes the AnA rail\'s column and still calls the shell\'s onAsk — the ' +
        'question goes nowhere visible, and `ask()` persists `anaOpen`, so it reappears on ' +
        'the next surface that does draw a rail. Answer it in the surface\'s own dock, seed ' +
        '`window.C2C_CONVO` and navigate to `conversation-thread`, or drop `ownsConversation`.',
    ).toEqual([]);
  });

  it('the unused-onAsk widening is spent only on the three components that predate the guard', () => {
    /*
     * `SurfaceView` is a discriminated union: `ownsConversation: true` narrows
     * `component` to `ComponentType<OwnedSurfaceViewProps>`, which has no
     * `onAsk` — so the mistake above is a compile error at the registration
     * site, the one place where the flag and the component are both visible.
     *
     * Assignability can see what a component DECLARES, not what it uses. Three
     * components declare the full `SurfaceViewProps` and never read `onAsk`,
     * so the union rejects them and they are widened with `as OwnedComponent`.
     * That cast is the only hole in the guard, and it is pinned here: adding a
     * fourth means editing this list, which is the review the guard exists to
     * force. Each is closed by narrowing its own props — see the comment on
     * `OwnedComponent` in surfaceViews.ts for the exact one-line edit.
     */
    const LEGACY = ['client-portal', 'conversation-thread', 'rbm'];

    const views = read('client/src/concept2cure/v2/surfaceViews.ts');
    const widened: string[] = [];
    for (const m of views.matchAll(/^\s*'?([a-z0-9-]+)'?:\s*\{([^}]*)\},?\s*$/gm)) {
      const [, id, body] = m;
      if (/\bas\s+OwnedComponent\b/.test(body)) widened.push(id);
    }

    expect(
      widened.sort(),
      'a surface is bypassing the SurfaceView union with `as OwnedComponent`. Narrow that ' +
        "component's props to OwnedSurfaceViewProps instead, or record it here with the " +
        'reason it cannot be narrowed yet.',
    ).toEqual(LEGACY);
  });
});
