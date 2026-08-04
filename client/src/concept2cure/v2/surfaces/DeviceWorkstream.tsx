/**
 * Medical Device & IVD workstream (kit app/device-workstream.jsx).
 *
 * The kit mounted the standalone MDX application (mdx/index.html) — Overview
 * · 510(k) predicate + SE workbench · PMA · CER · IVD performance · FDA forms
 * · Precedent intelligence · Post-market vigilance · Pre-Sub/Q-Sub ·
 * Validation center · Submissions · Templates · Tasks · Vault · Project home
 * — via an iframe, deep-linked by #<surface> hash.
 *
 * That iframe wrapper has since been retired: the MDX app is now a
 * first-class React route ported into this tree at
 * client/src/concept2cure/mdx (see ZenApp.tsx, "the prior iframe wrapper
 * was retired in Phase 2 (commit 4e5f63d4)"), mounted directly via
 * MdxRoute with an `initialNav` prop instead of a `#hash` deep link. This
 * port renders that same entry point in place of the retired iframe, using
 * the identical hash-to-nav vocabulary the kit defined.
 */
import React from 'react';
import type { SurfaceViewProps } from '../surfaceViews';

/**
 * Lazy on purpose. MdxRoute statically imports four stylesheets — app.css,
 * pathway-tabs.css, files-tree.css, drafter.css, 4,683 lines — and app.css is
 * unscoped: global `*`, `html, body, #root`, `body`, `button`,
 * `input, textarea` and `svg` resets, a `:root` token block, and 264 class
 * names it shares with the v2 shell.
 *
 * Because this module is reached statically from surfaceViews.ts, which V2App
 * imports at module scope, that CSS landed in the entry graph and applied to
 * EVERY session for EVERY client type — a pharma user who never opens a device
 * surface was still getting the MDX kit's body font and box-sizing. Deferring
 * the import confines it to the chunk that actually needs it, which is also
 * what PdevRoute already does.
 *
 * This does not fix the collisions while a device surface is open; scoping
 * app.css to `.mdx-shell` is the fix for that. It removes the blast radius from
 * every other surface in the product.
 */
const MdxRoute = React.lazy(() => import('../../mdx/MdxRoute'));

/** Device surface id → the MDX app's initialNav (kit's MDX_SURFACE_HASH). */
export const MDX_SURFACE_HASH: Record<string, string> = {
  'device-workstream': 'overview',
  'device-510k': 'k510',
  'device-cer': 'cer',
  'device-diagnostics': 'device-diagnostics-workbench',
  'device-submission': 'submissions',
};

export function resolveDeviceWorkstreamSurface(surfaceId?: string): string {
  if (!surfaceId) return 'overview';
  return MDX_SURFACE_HASH[surfaceId] ?? surfaceId;
}

export function DeviceWorkstream({ surface }: SurfaceViewProps) {
  const hash = resolveDeviceWorkstreamSurface(surface?.id);
  return (
    <React.Suspense
      fallback={
        <div className="scaf-note" style={{ padding: '40px 16px', textAlign: 'center' }}>
          Loading device workstream…
        </div>
      }
    >
      <MdxRoute initialNav={hash} />
    </React.Suspense>
  );
}
