/**
 * The device & diagnostics kit, bound into the v2 registry — one entry per
 * surface.
 *
 * ── What this replaces ────────────────────────────────────────────────────────
 * `DeviceWorkstream.tsx` mapped five registry ids onto one component that
 * rendered the ENTIRE MDX application — its Rail, its TopBar, its AnA composer —
 * inside `.c2c-v2 .shell`, which draws a Rail and a TopBar of its own. Five
 * shipping surfaces stacked two of each. Worse, the kit's other twelve
 * destinations existed only behind the kit's own rail, so `pma`, `software`,
 * `udi`, `postmarket`, `engineering`, `pre-sub` and `validation` had no v2
 * entry point at all: roughly 1,900 lines of surfaces calling real endpoints,
 * reachable by nothing a user could click.
 *
 * Every destination is now a registry id in its own right. The shell routes to
 * it, the rail can list it, ⌘K can find it, and it renders one canvas.
 *
 * ── Why a lazy map and not seventeen files ────────────────────────────────────
 * The kit's four stylesheets are 4,683 lines and its surfaces pull a large
 * dependency graph. `React.lazy` behind a single dynamic import keeps all of it
 * out of the entry chunk — a pharma user who never opens a device surface
 * should not pay for one — while the per-id wrappers stay thin enough to read.
 * One import specifier means one chunk shared by all seventeen, rather than
 * seventeen chunks that each re-pull the same stylesheets.
 *
 * @module client/src/concept2cure/v2/surfaces/DeviceSurfaces
 */

import React from 'react';

import type { SurfaceViewProps } from '../surfaceViews';
import { MDX_SURFACE_IDS, type MdxSurfaceId } from '../../mdx/surfaceIds';

const Host = React.lazy(() =>
  import('../../mdx/MdxSurfaceHost').then((m) => ({ default: m.MdxSurfaceHost })),
);

/** Shown while the kit chunk arrives. Stated, not a blank canvas. */
function DeviceFallback() {
  return (
    <div className="scaf-note" style={{ padding: '40px 16px', textAlign: 'center' }} role="status">
      Loading device workstream…
    </div>
  );
}

function makeSurface(nav: MdxSurfaceId) {
  const Surface = (props: SurfaceViewProps) => (
    <React.Suspense fallback={<DeviceFallback />}>
      <Host {...props} nav={nav} />
    </React.Suspense>
  );
  Surface.displayName = `DeviceSurface(${nav})`;
  return Surface;
}

/**
 * id → component, built from the kit's own id list.
 *
 * Derived rather than hand-written so the registry and the kit cannot drift:
 * a surface added to `MDX_SURFACE_IDS` without a `SURFACE_VIEWS` entry is
 * unreachable, and an entry here without a case in the host renders the
 * not-found card. Both failure modes are silent, and both have happened.
 */
export const DeviceSurfaces = Object.fromEntries(
  MDX_SURFACE_IDS.map((id) => [id, makeSurface(id)]),
) as Record<MdxSurfaceId, React.ComponentType<SurfaceViewProps>>;
