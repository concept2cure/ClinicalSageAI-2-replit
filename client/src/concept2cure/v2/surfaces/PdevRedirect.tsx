/**
 * PdevRedirect — the v2 shell's `pdev` surface entry.
 *
 * The Phase 7 PDEV kit ships its own Rail / TopBar / AnaDock and mounts as a
 * top-level route in {@link module:client/src/concept2cure/router/ZenRouter}
 * to avoid double-rail with the v2 shell. When a user navigates to the `pdev`
 * surface from inside the v2 shell (which registers surfaces in
 * `SURFACE_VIEWS`), this stub bridges the two: it renders nothing but shifts
 * the URL to `/concept2cure/pdev`, at which point the ZenRouter exclusion for
 * `/concept2cure/pdev` unmounts the v2 shell and hands off to `PdevRoute`.
 *
 * The redirect happens in an effect (not synchronously in render) so React
 * gets a stable first paint and wouter's location setter is the only thing
 * driving the navigation.
 *
 * Replaces the ad-hoc `PdevInd` surface that used to render fixtures inside
 * the v2 canvas — the real kit is now the only source of truth for PDEV.
 */
import * as React from 'react';
import { useLocation } from 'wouter';
import type { SurfaceViewProps } from '../surfaceViews';

export function PdevRedirect(_props: SurfaceViewProps) {
  const [, setLocation] = useLocation();
  React.useEffect(() => {
    setLocation('/concept2cure/pdev');
  }, [setLocation]);
  return (
    <div className="pdev-redirect" aria-busy="true" role="status">
      <p>Opening PDEV…</p>
    </div>
  );
}
