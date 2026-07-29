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
import MdxRoute from '../../mdx/MdxRoute';
import type { SurfaceViewProps } from '../surfaceViews';

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
  return <MdxRoute initialNav={hash} />;
}
