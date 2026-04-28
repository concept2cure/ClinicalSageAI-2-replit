/**
 * BundleSurfaceFrame — renders a Claude Design bundle surface as an iframe.
 *
 * Source-of-truth path: `design-system/ui_kits/<surface>/` (see
 * design-system/CLAUDE.md). The bundle prototypes are staged at
 * `client/public/design-system/ui_kits/<surface>/` so Vite serves them
 * as static assets, and we mount them via iframe so the user sees the
 * EXACT bundle prototype rendering with terracotta accents, real
 * brand fonts, and the bundle's own state machine — pixel-faithful
 * to the design canvas.
 *
 * This is the interim mounting strategy for Phase 2 MDX (Medical
 * Device + Diagnostics workstream including 510(k), PMA, CER,
 * Precedent Intelligence). The bundle's prototypes are self-contained
 * (load React + Babel from unpkg, render against their own data,
 * include their own CSS via app.css), so an iframe gives 100%
 * visual fidelity without a multi-thousand-line React port.
 *
 * Phase 1 Home does NOT use this component — it's already a real
 * React port at client/src/concept2cure/components/concept2cure-home/.
 *
 * Phase 3 Projects detail is "in design — do not pre-build" per
 * design-system/CLAUDE.md.
 *
 * @module client/src/concept2cure/components/bundle-surface-frame
 */
import React from 'react';

export interface BundleSurfaceFrameProps {
  /**
   * The surface key — one of 'home' | 'mdx' | 'ana_ri' | 'ectd_coauthor'.
   * Resolves to `/design-system/ui_kits/<surface>/index.html`.
   */
  surface: 'home' | 'mdx' | 'ana_ri' | 'ectd_coauthor';
  /**
   * Optional extra hash / query string to append to the iframe URL,
   * e.g. `#/k510` to deep-link into the 510(k) tab of the MDX shell.
   */
  hash?: string;
  /**
   * Accessible title for the iframe — read by screen readers.
   */
  title: string;
}

/**
 * Renders the canonical Claude Design bundle prototype for a given
 * surface as a full-viewport iframe. The bundle's app.css contains
 * its own :root token block, so it renders correctly without inheriting
 * from the host React app.
 */
export const BundleSurfaceFrame: React.FC<BundleSurfaceFrameProps> = ({
  surface,
  hash,
  title,
}) => {
  const src = `/design-system/ui_kits/${surface}/index.html${hash ?? ''}`;
  return (
    <iframe
      src={src}
      title={title}
      style={{
        width: '100%',
        height: '100%',
        border: 'none',
        display: 'block',
        background: 'var(--bg-000, #faf9f5)',
      }}
      // Allow same-origin so the bundle's window.parent.postMessage
      // (used by the canvas Tweaks panel) does not throw cross-origin
      // errors. The bundle's React+Babel setup needs scripts allowed.
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
      data-c2c-surface={surface}
    />
  );
};

export default BundleSurfaceFrame;
