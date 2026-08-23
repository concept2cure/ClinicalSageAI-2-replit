/**
 * The navigation-params channel — how a validated navigation directive's
 * params (e.g. `intelligenceTab`, `sectionCode`) reach the destination
 * surface, so AnA (or a chip click) opens THE tab or section, not just the
 * screen.
 *
 * ── Why a window channel ─────────────────────────────────────────────────────
 * The shell's established hand-off idiom (window.C2C_CONVO seeds
 * ConversationThread; window.C2C_EDITOR_TARGET deep-links the editor —
 * see editorTarget.ts for the full rationale). The router is wouter on
 * `location.pathname`, so params cannot ride the URL without every surface
 * growing a query-string reader; the channel keeps the contract in one place.
 *
 * ── One module owns both ends ────────────────────────────────────────────────
 * Same rule as editorTarget.ts: the writer (`stashNavParamsForTarget`) and the
 * reader (`consumeNavParams`) live here together, so neither can be deleted
 * without the other going dark in the same diff
 * (tests/ci/no-ghost-globals.contract.test.ts is the repo's enforcement of
 * that hazard).
 *
 * ── Validated upstream, scoped downstream ────────────────────────────────────
 * Params only enter this channel from an ALREADY-VALIDATED NavigationDirective
 * (chip click or Live Drive application — both re-resolved against
 * shared/navigation, which drops undeclared params and enforces enums). The
 * entry is keyed to the RESOLVED surface id, consumed once, and TTL-bounded,
 * so a stale or mismatched hand-off can never ambush a later, unrelated visit.
 *
 * @module client/src/concept2cure/v2/navParams
 */

import { locationForSurface, surfaceIdFromLocation } from './routing';

export interface NavParamsEntry {
  /** The RESOLVED surface id (post DEEP_LINK_ALIASES) the params are for. */
  surfaceId: string;
  params: Record<string, string>;
  /** Epoch ms the entry was written. Entries older than the TTL are dead. */
  setAt: number;
}

/** Same headroom as the editor-target channel: set → navigate → mount is
 *  immediate; a stranded entry must not survive into a separate visit. */
export const NAV_PARAMS_TTL_MS = 2 * 60 * 1000;

declare global {
  interface Window {
    /** Owned by this module — write through stashNavParamsForTarget, read
     *  through consumeNavParams. */
    C2C_NAV_PARAMS?: NavParamsEntry;
  }
}

/** The one canonical target-id → surface-id resolution (aliases applied) —
 *  the exact mapping a nav(id) will take, so writer and destination agree. */
export function resolveSurfaceIdForTarget(targetId: string): string {
  return surfaceIdFromLocation(locationForSurface(targetId));
}

/**
 * Publish a directive's params for the destination surface's next mount.
 * Replaces, never merges. A directive with no params CLEARS the channel, so
 * an older entry cannot ride along with a navigation that named none.
 */
export function stashNavParamsForTarget(
  targetId: string,
  params: Record<string, string> | undefined,
): void {
  if (typeof window === 'undefined') return;
  if (!params || Object.keys(params).length === 0) {
    clearNavParams();
    return;
  }
  window.C2C_NAV_PARAMS = {
    surfaceId: resolveSurfaceIdForTarget(targetId),
    params: { ...params },
    setAt: Date.now(),
  };
}

export function clearNavParams(): void {
  if (typeof window === 'undefined') return;
  try {
    delete window.C2C_NAV_PARAMS;
  } catch {
    window.C2C_NAV_PARAMS = undefined;
  }
}

/**
 * Consume the pending params for `surfaceId` — cleared on read (one shot).
 * Returns null for anything it cannot vouch for: no entry, a different
 * destination's entry (left in place — it is not ours to burn), a malformed
 * shape, or a stale / future-stamped setAt. Never throws.
 */
export function consumeNavParams(
  surfaceId: string,
  now: number = Date.now(),
): Record<string, string> | null {
  if (typeof window === 'undefined') return null;
  const raw = window.C2C_NAV_PARAMS;
  if (!raw || typeof raw !== 'object') return null;
  const e = raw as Partial<NavParamsEntry>;
  if (e.surfaceId !== surfaceId) return null;
  clearNavParams();
  if (!e.params || typeof e.params !== 'object') return null;
  if (typeof e.setAt !== 'number' || !Number.isFinite(e.setAt)) return null;
  if (now - e.setAt > NAV_PARAMS_TTL_MS || e.setAt - now > NAV_PARAMS_TTL_MS) return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(e.params)) {
    if (typeof v === 'string' && v.trim().length > 0) out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}
