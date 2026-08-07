/**
 * Every routable surface has a registry entry, or is on an explicit allowlist.
 *
 * ── What went wrong ───────────────────────────────────────────────────────────
 * `SURFACE_VIEWS` (client/src/concept2cure/v2/surfaceViews.ts) is the renderer
 * map: an id in it is a route segment the shell will mount. The registry
 * (shared/constants/ui-surface-registry.ts + .ui-v2.ts) is what the shell reads
 * to know what that segment *is*. Nothing forced the two to agree, and they
 * drifted by ten ids.
 *
 * The failure is silent and specific. `V2App.tsx` resolves the active id with
 * `getSurface(activeId)`; when that returns undefined it falls back to a
 * hard-coded literal whose `label` is 'Home'. `TopBar` renders
 * `Concept2Cure.RI › {tier} › {surface.label}`. So every unregistered surface —
 * the external client portal, all seven PDEV destinations — rendered its real
 * canvas under a breadcrumb that read "Home". No error, no warning, no blank
 * screen: just a page that misnames itself.
 *
 * It is worse than a cosmetic bug in two directions:
 *   - ⌘K ranks off `UI_SURFACES` (Shell.tsx CmdK). An unregistered id is not
 *     merely mislabelled, it is *unreachable* by search — three of the PDEV
 *     surfaces had no in-app entry point at all once the kit's own rail was
 *     removed in the one-shell convergence.
 *   - The registry also carries `readiness`, `apiPrefixes` and `compliance`.
 *     A surface with no entry silently inherits the fallback's claims:
 *     `readiness: 'routes-ready'` and `apiPrefixes: ['/api/projects']`, neither
 *     of which is true of the surface actually on screen.
 *
 * ── What this test holds ──────────────────────────────────────────────────────
 * Not "the two files have the same length" — that would fail on every honest
 * addition. The invariant is directional and one-sided:
 *
 *     every id in SURFACE_VIEWS is either registered, or listed below with a
 *     reason.
 *
 * The reverse direction (a registry id with no component) is already held by
 * client/src/concept2cure/v2/__tests__/surfaceRender.test.tsx, which renders
 * every registry entry. This file closes the other half.
 *
 * ── Why source parsing rather than importing SURFACE_VIEWS ────────────────────
 * Importing surfaceViews.ts pulls the entire v2 component tree into the module
 * graph — ~100 surfaces, several of which touch `window` at module scope
 * (ProtocolDev.tsx:846 assigns `window.PDEV_nextMajor` on import). A registry
 * bookkeeping guard should not need jsdom, a React renderer, or a working
 * `window` to run, and should not go red because an unrelated surface's import
 * side effect changed. The ids are a flat literal keyed by string; reading them
 * out of the source is exact and cheap.
 *
 * Comments are stripped with the shared helper before the keys are read. Without
 * that, the commented-out and prose-mentioned ids in surfaceViews.ts (and this
 * file's own doc comment) parse as entries — the exact mistake `_strip-comments`
 * exists to prevent.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { UI_SURFACES } from '@shared/constants/ui-surface-registry';
import { stripComments } from './_strip-comments';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SURFACE_VIEWS_PATH = 'client/src/concept2cure/v2/surfaceViews.ts';

/**
 * Ids that are in SURFACE_VIEWS on purpose and must NOT be registered.
 *
 * This is not a to-do list. Every entry here is an id that the shell can never
 * hand to `getSurface`, because `surfaceIdFromLocation` (v2/routing.ts) rewrites
 * it through `DEEP_LINK_ALIASES` (v2/registryModel.ts) *before* V2App computes
 * `activeId`. Registering one would put a second ⌘K row in front of the user
 * that opens a screen whose breadcrumb then shows the *other* entry's label —
 * two names for one surface, which is the defect the one-shell convergence
 * removed elsewhere. It would also break
 * `v2/__tests__/surfaceRouting.test.ts`, which asserts every registry id round-
 * trips to itself through the URL.
 *
 * To retire an entry here, delete its DEEP_LINK_ALIASES row first; then it
 * becomes a real id and this test will require a registry entry for it.
 */
const ALIAS_ONLY_IDS: Record<string, string> = {
  // DEEP_LINK_ALIASES['task-board'] === 'tasks'. Old bookmarks and
  // ProjectHome's "Open task board" button both route here; both land on the
  // registered `tasks` surface (label "Tasks & collaboration"). The
  // SURFACE_VIEWS row is a legacy no-op — `tasks` maps to the same TaskBoard
  // component — and is kept only so the alias table and the view map cannot
  // disagree about what the id renders.
  'task-board': "DEEP_LINK_ALIASES → 'tasks'; never reaches getSurface",
  // DEEP_LINK_ALIASES['ind-lifecycle'] === 'ind-checklist', whose registered
  // label is already "IND lifecycle". Same component either way (IndLifecycle).
  'ind-lifecycle': "DEEP_LINK_ALIASES → 'ind-checklist'; never reaches getSurface",
};

/** The literal keys of `export const SURFACE_VIEWS = { … }`, comments stripped. */
function surfaceViewIds(): string[] {
  const src = stripComments(fs.readFileSync(path.join(REPO, SURFACE_VIEWS_PATH), 'utf8'));
  const start = src.indexOf('export const SURFACE_VIEWS');
  expect(start, `SURFACE_VIEWS declaration not found in ${SURFACE_VIEWS_PATH}`).toBeGreaterThan(-1);
  const open = src.indexOf('{', start);
  const body = src.slice(open + 1, src.indexOf('\n};', open));
  // Only top-level `key: {` rows. Values are object literals on one line, so a
  // key is any quoted-or-bare identifier at two-space indent followed by `: {`.
  return [...body.matchAll(/^ {2}(?:'([^']+)'|"([^"]+)"|([A-Za-z][\w-]*))\s*:\s*\{/gm)].map(
    (m) => m[1] ?? m[2] ?? m[3],
  );
}

const VIEW_IDS = surfaceViewIds();
const REGISTERED = new Set(UI_SURFACES.map((s) => s.id));

describe('SURFACE_VIEWS ↔ ui-surface-registry coverage', () => {
  it('parses a plausible number of ids out of surfaceViews.ts', () => {
    // Guards the parser itself. If the file's shape changes and the regex stops
    // matching, the coverage assertion below would pass vacuously on an empty
    // list — a green test proving nothing, which is the worst outcome here.
    expect(VIEW_IDS.length).toBeGreaterThan(80);
    expect(new Set(VIEW_IDS).size, 'duplicate keys in SURFACE_VIEWS').toBe(VIEW_IDS.length);
    for (const id of ['vault', 'projects', 'pdev', 'client-portal']) {
      expect(VIEW_IDS, `expected ${id} among the parsed ids`).toContain(id);
    }
  });

  it('every SURFACE_VIEWS id is registered or explicitly allowlisted', () => {
    const unregistered = VIEW_IDS.filter((id) => !REGISTERED.has(id) && !(id in ALIAS_ONLY_IDS));
    expect(
      unregistered,
      unregistered.length === 0
        ? ''
        : `These ids render a surface but have no ui-surface-registry entry, so V2App ` +
          `falls back to the literal labelled "Home" and the breadcrumb misnames the ` +
          `page: ${unregistered.join(', ')}. Add a truthful entry to ` +
          `shared/constants/ui-surface-registry.ui-v2.ts (label/tier/readiness must ` +
          `describe what the surface actually is and can actually do), or — only if ` +
          `the id is a DEEP_LINK_ALIASES target that never reaches getSurface — add it ` +
          `to ALIAS_ONLY_IDS above with the reason.`,
    ).toEqual([]);
  });

  it('every allowlisted id is genuinely alias-only, not just unregistered', () => {
    // Stops the allowlist becoming a place to park real gaps. An id may only sit
    // here while DEEP_LINK_ALIASES actually rewrites it — and its alias target
    // must itself be registered, or the id resolves to nothing at all.
    for (const [id, reason] of Object.entries(ALIAS_ONLY_IDS)) {
      expect(reason.length, `allowlist entry ${id} needs a reason`).toBeGreaterThan(10);
      expect(VIEW_IDS, `allowlisted ${id} is no longer in SURFACE_VIEWS — drop it`).toContain(id);
      expect(REGISTERED.has(id), `${id} is registered now — remove it from ALIAS_ONLY_IDS`).toBe(
        false,
      );
    }
  });

  it('no registry id is shadowed by a deep-link alias', () => {
    // The converse hazard: registering an id that DEEP_LINK_ALIASES rewrites
    // produces a ⌘K row whose destination shows a different surface's name.
    // Read from source so this file does not import the v2 client module graph.
    const model = stripComments(
      fs.readFileSync(path.join(REPO, 'client/src/concept2cure/v2/registryModel.ts'), 'utf8'),
    );
    const aliasBlock = model.slice(model.indexOf('DEEP_LINK_ALIASES'));
    const aliases = [...aliasBlock.slice(0, aliasBlock.indexOf('};')).matchAll(
      /^\s*(?:'([^']+)'|([A-Za-z][\w-]*))\s*:\s*'([^']+)'/gm,
    )].map((m) => ({ from: m[1] ?? m[2], to: m[3] }));

    expect(aliases.length, 'DEEP_LINK_ALIASES parsed empty — check the parser').toBeGreaterThan(0);
    for (const { from, to } of aliases) {
      expect(
        REGISTERED.has(from),
        `${from} is both a registry id and a deep-link alias → /concept2cure/${from} ` +
          `resolves to "${to}", so its breadcrumb and ⌘K row would disagree`,
      ).toBe(false);
      expect(REGISTERED.has(to), `alias ${from} → ${to}, but ${to} is not registered`).toBe(true);
    }
  });
});
