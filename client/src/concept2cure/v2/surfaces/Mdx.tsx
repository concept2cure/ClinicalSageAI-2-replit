/**
 * MDX workstream frame -- kit app/Mdx.jsx `MdxFrame` ported.
 *
 * The Medical Device & IVD client's full workbench, brought into the shell.
 * The device surfaces (510(k), CER, device & diagnostics portfolio) open the
 * mature MDX kit (mdx/index.html) -- the Programs portfolio, 510(k) pathway +
 * predicate intelligence, CER workbench, eSTAR editor, validation center,
 * filings pipeline -- rather than the generic document editor. Each surface
 * deep-links the embedded workstream to its matching pane via a URL hash;
 * the kit re-routes on hashchange. Rendered full-bleed (the host AnA column
 * is suppressed -- the kit carries its own AnA rail).
 *
 * Registry ids: `device-workstream`, `device-510k`, `device-cer`,
 * `device-diagnostics` (all full: true, hideAna: true).
 */
import React from 'react';
import type { SurfaceViewProps } from '../surfaceViews';

/* Host surface id -> MDX workstream surface (hash). */
const MDX_SURFACE_OF: Record<string, string> = {
  'device-workstream': 'overview',
  'device-510k': 'k510',
  'device-cer': 'cer',
  'device-diagnostics': 'ivd',
};

export function MdxFrame({ surface }: SurfaceViewProps) {
  const nav = (surface && MDX_SURFACE_OF[surface.id]) || 'overview';
  return (
    <iframe
      key={nav}
      src={`../mdx/index.html#${nav}`}
      title="Medical Device & IVD workstream"
      style={{ width: '100%', height: '100%', border: 0, display: 'block', background: 'var(--bg-000)' }}
    />
  );
}
