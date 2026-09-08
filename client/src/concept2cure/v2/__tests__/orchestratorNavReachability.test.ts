/**
 * A registered surface is not a reachable one.
 *
 * ── The defect this pins ─────────────────────────────────────────────────────
 * `submission-orchestrator` shipped registered in three places — the shared UI
 * surface registry, SURFACE_VIEWS, and a working route — and every existing
 * test passed. It was still unreachable by a human:
 *
 *   • it was in none of the four "Submit & file" nav groups, so it appeared in
 *     no menu; and
 *   • it was absent from shared/navigation NAVIGATION_TARGETS, which is the
 *     closed list AnA navigates by — `navigate_to` refuses everything else, so
 *     the assistant could describe the pipeline but could not take you to it.
 *
 * navigationReachability.test.ts did not catch this because it asserts the
 * OTHER direction: every nav target resolves to a real view. Nothing asserted
 * that a real view is reachable FROM anywhere. Both directions are needed —
 * one catches a dangling link, this one catches an orphan screen.
 *
 * ── What this asserts ────────────────────────────────────────────────────────
 * That the orchestrator is reachable by both paths, and — the general half —
 * that no surface carrying a nav-visible group is left out of every menu.
 */
import { describe, expect, it } from 'vitest';

import { NAVIGATION_TARGETS } from '../../../../../shared/navigation/index';
import { SURFACE_VIEWS } from '../surfaceViews';
import { SEGMENT_MODULES, NAV_HIDDEN } from '../registryModel';
import { locationForSurface, surfaceIdFromLocation } from '../routing';
import { getSurface } from '@shared/constants/ui-surface-registry';

const ORCHESTRATOR = 'submission-orchestrator';

/** Every surface id named by any nav menu group, across all client segments. */
function surfacesNamedInMenus(): Set<string> {
  const named = new Set<string>();
  const segments = SEGMENT_MODULES as unknown as Record<string, Array<{ items: readonly string[] }>>;
  for (const groups of Object.values(segments)) {
    for (const group of groups) {
      for (const id of group.items) named.add(id);
    }
  }
  return named;
}

describe('the orchestrator surface is reachable, not merely registered', () => {
  it('is registered in the shared UI surface registry', () => {
    expect(getSurface(ORCHESTRATOR)).toBeTruthy();
  });

  it('has a real surface view (not the scaffold fallback)', () => {
    expect(SURFACE_VIEWS[ORCHESTRATOR]).toBeTruthy();
  });

  it('appears in at least one navigation menu — otherwise no menu opens it', () => {
    expect(surfacesNamedInMenus().has(ORCHESTRATOR)).toBe(true);
  });

  it('is a NAVIGATION_TARGET, so AnA navigate_to does not refuse it', () => {
    const ids = NAVIGATION_TARGETS.map(t => t.id);
    expect(ids).toContain(ORCHESTRATOR);
  });

  it('routes round-trip: nav id → location → surface id', () => {
    expect(surfaceIdFromLocation(locationForSurface(ORCHESTRATOR))).toBe(ORCHESTRATOR);
  });

  it('is not hidden from the rail', () => {
    expect(NAV_HIDDEN.has(ORCHESTRATOR)).toBe(false);
  });
});

describe('the general rule — a submission surface in no menu is an orphan', () => {
  /**
   * Scoped to the submission family rather than every surface: several surfaces
   * are deliberately reachable only by deep link or from inside another screen,
   * and asserting over all of them would encode a rule this codebase does not
   * hold. The submission family is one where being menu-reachable IS the
   * expectation — these are the screens a regulatory user navigates to
   * directly.
   */
  const SUBMISSION_FAMILY = [
    'submission-center',
    'submission-orchestrator',
    'submission-twin',
    'gateway-transmittals',
  ];

  it.each(SUBMISSION_FAMILY)('%s is named in a nav menu', id => {
    if (NAV_HIDDEN.has(id)) return; // deliberately hidden is a different decision
    expect(surfacesNamedInMenus().has(id)).toBe(true);
  });

  it.each(SUBMISSION_FAMILY)('%s has a real surface view', id => {
    expect(SURFACE_VIEWS[id]).toBeTruthy();
  });
});
