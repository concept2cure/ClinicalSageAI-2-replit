/**
 * Every governed navigation target must land on a real surface view.
 *
 * The registry (shared/navigation NAVIGATION_TARGETS) is what AnA navigates
 * by — `navigate_to` refuses anything else — and the v2 shell resolves a
 * target id through DEEP_LINK_ALIASES to a SURFACE_VIEWS entry. Before this
 * gate existed, 10 of the 30 registry ids ('intelligence', 'authoring',
 * 'submissions', 'tasking', …) silently landed on the KitSurfaceScaffold
 * fallback: AnA would say "taking you to Intelligence" and the person would
 * arrive at a scaffold. A navigation contract whose ids don't reach real
 * screens is exactly the drift shared/navigation/README.md's step 2 warned
 * about, and Live Drive makes it user-visible on every drive — so it is a
 * test, not a note.
 *
 * If this fails: either add the missing DEEP_LINK_ALIASES entry mapping the
 * registry id to a real SURFACE_VIEWS id, or (for a genuinely new screen)
 * add the surface view — never delete the registry target to silence it.
 */
import { describe, expect, it } from 'vitest';

import { NAVIGATION_TARGETS } from '../../../../../shared/navigation/index';
import { LAUNCH_SHELL_SURFACES, LAUNCH_SURFACE_IDS } from '../../../../../shared/constants/launch-scope';
import { UI_SURFACES } from '../../../../../shared/constants/ui-surface-registry';
import { DEEP_LINK_ALIASES } from '../registryModel';
import { SURFACE_VIEWS } from '../surfaceViews';
import { locationForSurface, surfaceIdFromLocation } from '../routing';

describe('navigation-registry ↔ shell reachability', () => {
  it('resolves every NAVIGATION_TARGETS id to a real surface view (never the scaffold)', () => {
    const unreachable: string[] = [];
    for (const target of NAVIGATION_TARGETS) {
      // The exact path a chip click / Live Drive application takes:
      // nav(targetId) → locationForSurface → surfaceIdFromLocation (aliases).
      const resolved = surfaceIdFromLocation(locationForSurface(target.id));
      const hasView = resolved === 'home' || Boolean(SURFACE_VIEWS[resolved]);
      if (!hasView) unreachable.push(`${target.id} → ${resolved}`);
    }
    expect(unreachable, `registry ids with no real surface view: ${unreachable.join(', ')}`).toEqual(
      [],
    );
  });

  /* Slice 0 of .design/client-journey/INFORMATION_ARCHITECTURE.md: an alias must not land on a lock.
     Under the launch scope the server gives every registered surface outside the release a
     'launch-scope' lock (navigation-entitlements.ts, the launch overlay over UI_SURFACES); the shell
     forwards those to AnA as locked screens (V2App AnaLockPublisher), and navigate_to refuses them
     in the conversation instead of moving the person. That holds only for a target whose screen is
     in the release, or is a registered surface the overlay can lock. A target resolving anywhere
     else would reach a screen AnA is never told is closed. */
  it('every target opens in the release, or resolves to a surface the launch scope can lock for AnA', () => {
    const registered = new Set(UI_SURFACES.map((s) => s.id));
    const unlockable: string[] = [];
    for (const target of NAVIGATION_TARGETS) {
      const resolved = surfaceIdFromLocation(locationForSurface(target.id));
      const inRelease = resolved === 'home' || LAUNCH_SURFACE_IDS.has(resolved) || resolved in LAUNCH_SHELL_SURFACES;
      if (!inRelease && !registered.has(resolved)) unlockable.push(`${target.id} → ${resolved}`);
    }
    expect(unlockable).toEqual([]);
  });

  it('"biopharma" opens Projects, where a project is opened and created, not a screen outside the release', () => {
    /* It resolved to program-journey, outside the release: AnA was refused, and a link opened a lock.
       The journey's six steps are each project's own (project-home); the module's entry is Projects. */
    expect(DEEP_LINK_ALIASES.biopharma).toBe('projects');
    expect(LAUNCH_SURFACE_IDS.has(surfaceIdFromLocation(locationForSurface('biopharma')))).toBe(true);
  });

  it('the retained MDX handle and the folded device portfolio\'s handle both reach admitted Projects', () => {
    const target = NAVIGATION_TARGETS.find(t => t.id === 'mdx');
    expect(target?.scope).toBe('global');
    expect(target?.description).toMatch(/Projects/);
    expect(surfaceIdFromLocation(locationForSurface('mdx'))).toBe('projects');
    expect(LAUNCH_SURFACE_IDS.has(surfaceIdFromLocation(locationForSurface('mdx')))).toBe(true);
    /* The device portfolio folded into Projects (D2, fold F6, 2026-10-30): AnA's handle is kept and lands where
       `mdx` does; the screen, its registry row and its view are gone (foldDeviceWorkstream.test.ts). */
    expect(NAVIGATION_TARGETS.some(t => t.id === 'device-workstream')).toBe(true);
    expect(surfaceIdFromLocation(locationForSurface('device-workstream'))).toBe('projects');
    expect(UI_SURFACES.some(s => s.id === 'device-workstream')).toBe(false);
    expect(SURFACE_VIEWS['device-workstream']).toBeUndefined();
  });

  it('aliases only point AT real views — a dangling alias is drift in the other direction', () => {
    for (const [from, to] of Object.entries(DEEP_LINK_ALIASES)) {
      expect(SURFACE_VIEWS[to], `alias ${from} → ${to} points at a missing view`).toBeTruthy();
    }
  });
});
