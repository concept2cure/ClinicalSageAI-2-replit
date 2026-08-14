/**
 * Live surface context for AnA — what the screen actually knows, right now.
 *
 * ── The gap this closes ───────────────────────────────────────────────────────
 * `getAnaContext(surfaceId, segment)` (registryModel.ts) is reference config
 * keyed on the SURFACE ID alone. That is correct as a floor and wrong as a
 * ceiling: a module with twelve sub-tabs hands AnA the same sentence on all
 * twelve, and she is told nothing about the state in front of the user — which
 * sections are blocked, how many results await review, whether the export gate
 * would pass. The rail is attached to the module, not to the work.
 *
 * `getAnaContext` also deliberately omits `program / stage / readiness /
 * evidence / activity`, with an explicit instruction in its own comment:
 *
 *     "A per-surface co-author endpoint that could supply the real values does
 *      not exist ... If that endpoint is built, populate them HERE from its
 *      response; do not reintroduce a constant."
 *
 * This module is the channel for exactly that. A surface that has ALREADY
 * fetched real state publishes it; the rail merges it over the static config.
 * Nothing here invents a value: a surface that knows nothing publishes nothing,
 * and the rail falls back to the reference config unchanged.
 *
 * ── The honesty rule ──────────────────────────────────────────────────────────
 * Only publish what has been MEASURED from a resolved response. A readiness
 * percentage assembled from a loading or errored fetch is the fabrication the
 * original comment refused, wearing a live-looking hat. Publish `undefined` and
 * let the rail say less.
 */

import React from 'react';
import type { AnaContext } from './registryModel';

/**
 * What a surface may contribute. Every field is optional and every field
 * overrides the static config only when present.
 *
 * `surfaceId` scopes the patch: the rail applies it only while that surface is
 * open, so a stale patch from a surface the user has left can never describe
 * the screen they are now looking at.
 */
export interface AnaSurfacePatch extends Partial<Omit<AnaContext, 'module' | 'icon'>> {
  /** The surface this patch describes. Required — an unscoped patch is dropped. */
  surfaceId: string;
  /**
   * Screens within the surface AnA may switch to on the user's behalf, each
   * with the id its own router understands. This is what lets her act on
   * "take me to the build board" rather than only describing it.
   */
  screens?: { id: string; label: string }[];
  /** Switch to one of `screens`. Provided by the surface that owns the router. */
  goToScreen?: (id: string) => void;
}

type Listener = (patch: AnaSurfacePatch | null) => void;

let current: AnaSurfacePatch | null = null;
const listeners = new Set<Listener>();

function emit(): void {
  for (const l of listeners) l(current);
}

/** Publish (or replace) the live context for a surface. */
export function publishAnaSurfaceContext(patch: AnaSurfacePatch): void {
  current = patch;
  emit();
}

/** Withdraw the context for a surface — only if it is still the published one. */
export function clearAnaSurfaceContext(surfaceId: string): void {
  if (current?.surfaceId === surfaceId) {
    current = null;
    emit();
  }
}

/** The published patch, or null. Exported for tests and non-React readers. */
export function readAnaSurfaceContext(): AnaSurfacePatch | null {
  return current;
}

/** Subscribe to context changes. Returns an unsubscribe function. */
export function subscribeAnaSurfaceContext(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Publish live context from a surface, keeping it current as the surface's own
 * state changes and withdrawing it on unmount.
 *
 * `deps` is what the patch is derived from, so a surface passes the same values
 * it renders — the rail and the screen cannot disagree.
 */
export function useAnaSurfaceContext(
  build: () => AnaSurfacePatch,
  deps: React.DependencyList,
): void {
  const buildRef = React.useRef(build);
  buildRef.current = build;
  React.useEffect(() => {
    const patch = buildRef.current();
    publishAnaSurfaceContext(patch);
    return () => clearAnaSurfaceContext(patch.surfaceId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/**
 * Keys a patch may never write.
 *
 * `surfaceId / screens / goToScreen` are routing metadata, not rail content.
 * `module / icon` are the surface's IDENTITY: the type already omits them, but
 * the merge is a runtime loop over `Object.entries`, and a type is not a guard —
 * a patch built from an `any`, or from JSON, would otherwise be able to relabel
 * the module the user is looking at. That is the one thing on the rail that must
 * always be true.
 */
const NOT_MERGEABLE = new Set(['surfaceId', 'screens', 'goToScreen', 'module', 'icon']);

/**
 * The rail's read: the static reference config with the live patch merged over
 * it, but ONLY when the patch describes the surface actually open.
 *
 * Merging is field-wise and skips `undefined`, so a surface that knows its
 * readiness but not its stage contributes the one it knows without blanking the
 * other.
 */
export function mergeAnaContext(
  base: AnaContext,
  surfaceId: string,
  patch: AnaSurfacePatch | null,
): AnaContext {
  if (!patch || patch.surfaceId !== surfaceId) return base;
  const merged: AnaContext = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (NOT_MERGEABLE.has(key)) continue;
    if (value === undefined) continue;
    (merged as unknown as Record<string, unknown>)[key] = value;
  }
  return merged;
}
