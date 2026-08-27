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

  it('aliases only point AT real views — a dangling alias is drift in the other direction', () => {
    for (const [from, to] of Object.entries(DEEP_LINK_ALIASES)) {
      expect(SURFACE_VIEWS[to], `alias ${from} → ${to} points at a missing view`).toBeTruthy();
    }
  });
});
