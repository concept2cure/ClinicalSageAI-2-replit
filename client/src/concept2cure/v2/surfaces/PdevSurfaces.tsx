/**
 * The pharmaceutical-development kit, bound into the v2 registry — one entry
 * per surface.
 *
 * ── What this replaces ────────────────────────────────────────────────────────
 * `PdevRedirect.tsx`. That was a registered v2 surface whose entire body was
 * `setLocation('/concept2cure/pdev')` — the shell navigating the browser out of
 * itself, unmounting, and handing off to a second application that drew its own
 * Rail, TopBar and AnA dock. Its own doc comment explained the reason: the kit
 * "ships its own Rail / TopBar / AnaDock … to avoid double-rail with the v2
 * shell". Avoiding a double rail by leaving the shell is not avoiding it; it is
 * having two shells and hiding the seam behind a page navigation.
 *
 * The kit now contributes surfaces. `pdev/App.tsx` renders its canvas and its
 * sheets; the shell keeps the rail, the topbar and the one AnA conversation.
 *
 * @module client/src/concept2cure/v2/surfaces/PdevSurfaces
 */

import React from 'react';

import type { SurfaceViewProps } from '../surfaceViews';

/** The kit's destinations, as v2 surface ids. */
export const PDEV_SURFACE_IDS = [
  'pdev',
  'pdev-cmc',
  'pdev-nonclinical',
  'pdev-clinical',
  'pdev-regulatory',
  'pdev-ind-assembly',
  'pdev-contradictions',
  'pdev-fda-interactions',
] as const;

export type PdevSurfaceId = (typeof PDEV_SURFACE_IDS)[number];

/** v2 surface id → the kit's internal nav vocabulary. */
const PDEV_NAV: Record<PdevSurfaceId, string> = {
  pdev: 'overview',
  'pdev-cmc': 'cmc',
  'pdev-nonclinical': 'nonclinical',
  'pdev-clinical': 'clinical',
  'pdev-regulatory': 'regulatory',
  'pdev-ind-assembly': 'ind_assembly',
  'pdev-contradictions': 'contradictions',
  'pdev-fda-interactions': 'fda_interactions',
};

/** id → v2 surface id, for navigating back out of the kit's own vocabulary. */
const SURFACE_OF_NAV: Record<string, PdevSurfaceId> = Object.fromEntries(
  Object.entries(PDEV_NAV).map(([surface, nav]) => [nav, surface as PdevSurfaceId]),
) as Record<string, PdevSurfaceId>;

const Host = React.lazy(() =>
  import('../../pdev/PdevRoute').then((m) => ({ default: m.default })),
);

function PdevFallback() {
  return (
    <div className="scaf-note" style={{ padding: '40px 16px', textAlign: 'center' }} role="status">
      Loading pharmaceutical development…
    </div>
  );
}

function makeSurface(id: PdevSurfaceId) {
  const Surface = ({ onAsk, onNav }: SurfaceViewProps) => (
    <React.Suspense fallback={<PdevFallback />}>
      <Host
        nav={PDEV_NAV[id]}
        // The kit navigates in its own vocabulary ('cmc', 'ind_assembly'). Map
        // back to surface ids so the shell — which owns navigation — receives
        // an id it can route. An unmapped value passes through unchanged rather
        // than being swallowed, so a new kit destination shows up as a missing
        // surface instead of a dead click.
        onNav={(navId: string) => onNav(SURFACE_OF_NAV[navId] ?? navId)}
        onAskAna={(text: string) => onAsk(text)}
      />
    </React.Suspense>
  );
  Surface.displayName = `PdevSurface(${id})`;
  return Surface;
}

export const PdevSurfaces = Object.fromEntries(
  PDEV_SURFACE_IDS.map((id) => [id, makeSurface(id)]),
) as Record<PdevSurfaceId, React.ComponentType<SurfaceViewProps>>;
