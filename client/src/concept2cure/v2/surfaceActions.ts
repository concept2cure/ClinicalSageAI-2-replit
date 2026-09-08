/**
 * The surface-action bus — how a validated `act_on_screen` directive becomes
 * the screen actually doing the thing, and the ONLY way it can.
 *
 * ── The contract ─────────────────────────────────────────────────────────────
 * A directive arrives from two doors: a `drive_action` SSE event (Live Drive)
 * or a chip the person taps. Either way, nothing is performed unless ALL of:
 *
 *   1. `validateDriveAction` re-resolves it against the SAME shared registry
 *      the server used (shared/navigation/surface-actions) — the performed
 *      directive is the registry's, never the payload's;
 *   2. the surface it operates has REGISTERED a live handler for that action
 *      id — a surface that does not implement an action cannot have it
 *      performed "at" it; the bus reports an honest 'unavailable';
 *   3. the handler itself returns an outcome — 'applied', or a refusal with a
 *      reason (e.g. "no program named X"), which the caller surfaces rather
 *      than pretending success.
 *
 * ── Registration (mirrors surfaceContext) ────────────────────────────────────
 * The performer (a mounted surface) is a descendant of the appliers (V2App /
 * the chip renderer), so registration is a module-level store written from
 * below — the established idiom (see surfaceContext.ts for the full
 * rationale). A surface registers on mount and is cleared on unmount, so a
 * directive can never operate a screen that is no longer showing.
 *
 * ── The mount gap (mirrors navParams) ────────────────────────────────────────
 * Under Live Drive AnA navigates and then acts; the act event can arrive
 * before React has mounted the destination and registered its handlers. The
 * bus stashes such a directive (one slot, TTL-bounded, consumed on the next
 * registration for that surface) — the same one-shot window contract as
 * navParams.ts, and this module owns both ends of it.
 *
 * Pure module state + small functions; renderer-free except the React hook.
 */

import { useEffect, useRef } from 'react';
import {
  resolveSurfaceAction,
  SURFACE_ACTIONS,
  type SurfaceActionDirective,
  type SurfaceActionTarget,
} from '@shared/navigation/surface-actions';
import { resolveSurfaceIdForTarget } from './navParams';

/**
 * A directive's `surfaceId` is a NAVIGATION-TARGET id (the shared registry is
 * UI-agnostic and knows nothing of DEEP_LINK_ALIASES), while a surface
 * registers under its own v2 surface id — e.g. the 'tasking' target resolves
 * to the 'tasks' surface. Every match in this module goes through the SAME
 * resolution nav() uses, so an aliased surface's actions land exactly like an
 * identity-mapped one's.
 */
function resolvedTargetSurface(directive: SurfaceActionDirective): string {
  return resolveSurfaceIdForTarget(directive.surfaceId);
}

/** Registry actions grouped by the RESOLVED v2 surface id (built once). */
let actionsByResolvedSurface: Map<string, SurfaceActionTarget[]> | null = null;

/**
 * The registry actions that operate the given v2 surface (aliases applied) —
 * what AnA COULD do here per the shared contract. The bus still refuses
 * anything the mounted surface has not actually registered; this is the
 * static half, used to advertise the screen's action vocabulary in AnA's
 * per-turn context so she acts without a discovery round-trip.
 */
export function surfaceActionsForResolvedSurface(v2SurfaceId: string): SurfaceActionTarget[] {
  if (!actionsByResolvedSurface) {
    actionsByResolvedSurface = new Map();
    for (const a of SURFACE_ACTIONS) {
      const key = resolveSurfaceIdForTarget(a.surfaceId);
      const list = actionsByResolvedSurface.get(key);
      if (list) list.push(a);
      else actionsByResolvedSurface.set(key, [a]);
    }
  }
  return actionsByResolvedSurface.get(v2SurfaceId) ?? [];
}

/**
 * The screen's action vocabulary shaped for AnA's `module_context` — id,
 * label, and param names with enums (an action she cannot parameterize is one
 * she cannot take). Used by the shell for every railed surface and by owned
 * surfaces' own chat instances, so the fold cannot drift between them.
 * Returns [] when the screen has no registered vocabulary — callers omit the
 * field entirely rather than sending an empty claim.
 */
export function advertisedScreenActions(
  v2SurfaceId: string,
): Array<{
  id: string;
  label: string;
  params?: Array<{ name: string; required: boolean; enum?: string[] }>;
}> {
  return surfaceActionsForResolvedSurface(v2SurfaceId).map((a) => ({
    id: a.id,
    label: a.label,
    ...(a.params && a.params.length > 0
      ? {
          params: a.params.map((p) => ({
            name: p.name,
            required: p.required,
            ...(p.enum ? { enum: p.enum } : {}),
          })),
        }
      : {}),
  }));
}

/** What actually happened when a directive was handed to the bus. */
export type SurfaceActionOutcome =
  | { status: 'applied'; detail?: string }
  | { status: 'stashed' }
  | { status: 'unavailable'; reason: string }
  | { status: 'failed'; reason: string };

/**
 * A surface's handler for one action id. Returns `{ ok: true }` (optionally
 * with a detail line for the overlay) or an honest refusal with the reason.
 * `retry: true` marks a NOT-READY refusal (the surface's data is still
 * loading): the bus keeps the directive pending (TTL-bounded) and re-attempts
 * when the surface reports ready (`notifySurfaceActionReady`) — the exact gap
 * a drive's navigate→act sequence crosses, where the destination has mounted
 * but its read has not landed yet.
 */
export type SurfaceActionHandler = (
  params: Record<string, string>,
) => { ok: true; detail?: string } | { ok: false; reason: string; retry?: boolean };

interface Registration {
  surfaceId: string;
  handlers: Record<string, SurfaceActionHandler>;
}

let registration: Registration | null = null;

interface PendingEntry {
  directive: SurfaceActionDirective;
  setAt: number;
  /** Reports the eventual outcome to whoever stashed (overlay honesty). */
  onOutcome?: (outcome: SurfaceActionOutcome) => void;
}

/** One-shot pending slot for the navigate→mount gap. Short on purpose: the
 *  destination mounts within the same interaction or the moment has passed. */
export const PENDING_ACTION_TTL_MS = 20 * 1000;

let pending: PendingEntry | null = null;

/** Test hook: wipe all module state. */
export function __resetSurfaceActionBus(): void {
  registration = null;
  pending = null;
}

/** The surface id currently holding registered handlers (null when none). */
export function registeredSurfaceId(): string | null {
  return registration?.surfaceId ?? null;
}

/**
 * Register a mounted surface's handlers. Replaces any previous registration
 * (one surface owns the canvas at a time) and immediately performs a pending
 * directive stashed for this surface, so a drive's navigate→act sequence
 * lands the act the moment the destination is ready. Returns the unregister.
 */
export function registerSurfaceActionHandlers(
  surfaceId: string,
  handlers: Record<string, SurfaceActionHandler>,
): () => void {
  const mine: Registration = { surfaceId, handlers };
  registration = mine;
  if (import.meta.env?.DEV) {
    for (const id of Object.keys(handlers)) {
      const res = resolveSurfaceAction(id, {});
      // Param errors are fine here (we passed none); only an unknown id or a
      // governed verb means the surface registered outside the contract.
      if (!res.ok && (res.code === 'unknown_action' || res.code === 'governed_refused')) {
        console.warn(`[surfaceActions] "${surfaceId}" registered unlisted action "${id}" — add it to shared/navigation/surface-actions.ts or remove the handler.`);
      }
    }
  }
  // Attempt a stashed directive for this surface, if fresh. A not-ready
  // refusal keeps it pending for the surface's ready signal.
  attemptPendingFor(surfaceId);
  return () => {
    if (registration === mine) registration = null;
  };
}

/**
 * A surface's "my data has landed" signal. Re-attempts the pending directive
 * for this surface, if any — the second half of the retry contract for
 * handlers that need loaded data (open a named program, open a named folder).
 * Safe to call on every load-state change; a no-op when nothing is pending.
 */
export function notifySurfaceActionReady(surfaceId: string): void {
  attemptPendingFor(surfaceId);
}

/**
 * React hook — register this surface's action handlers for its mounted
 * lifetime. Handlers read through a ref so the registered closure always sees
 * the surface's latest state without re-registering every render.
 */
export function useSurfaceActionHandlers(
  surfaceId: string | null,
  handlers: Record<string, SurfaceActionHandler>,
): void {
  const latest = useRef(handlers);
  latest.current = handlers;
  useEffect(() => {
    // A null id registers NOTHING, the same escape `usePublishSurfaceContext`
    // gives a publisher. It exists because registration is a single global
    // slot: a component that also mounts INSIDE another surface (the access
    // request queue renders as a master-licensing tab) would otherwise claim
    // the bus while a different screen is on, and that screen's own directives
    // would find a registration for someone else.
    if (!surfaceId) return undefined;
    // Stable proxies delegate to the latest real handler at call time.
    const proxies: Record<string, SurfaceActionHandler> = {};
    for (const id of Object.keys(latest.current)) {
      proxies[id] = (params) => {
        const h = latest.current[id];
        return h ? h(params) : { ok: false, reason: 'handler no longer present' };
      };
    }
    return registerSurfaceActionHandlers(surfaceId, proxies);
  }, [surfaceId]);
}

/**
 * Attempt the pending directive for `surfaceId`. Terminal outcomes (applied /
 * hard failure / unavailable-handler) consume the entry and report through
 * its deferred callback; a NOT-READY refusal (`retry: true`) leaves the entry
 * pending until the TTL kills it. An expired entry dies silently — nothing
 * was performed, so nothing is claimed.
 */
function attemptPendingFor(surfaceId: string): void {
  const p = pending;
  if (!p || resolvedTargetSurface(p.directive) !== surfaceId) return;
  if (Date.now() - p.setAt > PENDING_ACTION_TTL_MS) {
    pending = null;
    return;
  }
  const res = performRaw(p.directive);
  if (res.kind === 'retry') return; // still pending — the ready signal re-attempts
  pending = null;
  p.onOutcome?.(res.outcome);
}

/** One raw attempt against the CURRENT registration. */
function performRaw(
  directive: SurfaceActionDirective,
):
  | { kind: 'done'; outcome: SurfaceActionOutcome }
  | { kind: 'retry'; reason: string } {
  const reg = registration;
  if (!reg || reg.surfaceId !== resolvedTargetSurface(directive)) {
    return {
      kind: 'done',
      outcome: {
        status: 'unavailable',
        reason: `The ${directive.surfaceId} screen is not open.`,
      },
    };
  }
  const handler = reg.handlers[directive.actionId];
  if (!handler) {
    return {
      kind: 'done',
      outcome: {
        status: 'unavailable',
        reason: `This screen does not support "${directive.label}" right now.`,
      },
    };
  }
  try {
    const res = handler(directive.params ?? {});
    if (res.ok) {
      return {
        kind: 'done',
        outcome: { status: 'applied', ...(res.detail ? { detail: res.detail } : {}) },
      };
    }
    if (res.retry) return { kind: 'retry', reason: res.reason };
    return { kind: 'done', outcome: { status: 'failed', reason: res.reason } };
  } catch (err) {
    return {
      kind: 'done',
      outcome: {
        status: 'failed',
        reason: err instanceof Error ? err.message : 'The action failed.',
      },
    };
  }
}

/**
 * Re-validate an incoming drive/chip payload against the shared registry.
 * Same fail-closed rule as validateDriveDirective: the returned directive is
 * the registry's own resolution from actionId + params alone; anything
 * unknown, governed, or invalid returns null and nothing is performed.
 */
export function validateDriveAction(raw: unknown): SurfaceActionDirective | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  if (d.actionType !== 'surface_action' || typeof d.actionId !== 'string') return null;
  const params =
    d.params && typeof d.params === 'object' ? (d.params as Record<string, unknown>) : {};
  const res = resolveSurfaceAction(d.actionId, params);
  return res.ok ? res.directive : null;
}

/**
 * Perform a VALIDATED directive, stashing across the two gaps a drive's
 * navigate→act sequence crosses: the surface has not MOUNTED yet (stash +
 * navigate there), or it has mounted but its data has not LOADED yet (the
 * handler answers not-ready with `retry: true` → stash without navigating;
 * the surface's `notifySurfaceActionReady` re-attempts when the read lands).
 *
 * Returns the IMMEDIATE outcome ('applied' / 'failed' / 'unavailable', or
 * 'stashed' when the directive is waiting on a mount or a load). After a
 * stash, the terminal outcome arrives through `onDeferredOutcome` exactly
 * once — or never, if the stash expires unconsumed (the moment passed;
 * nothing was done, so nothing is claimed).
 */
export function applySurfaceAction(
  directive: SurfaceActionDirective,
  navigate: (surfaceId: string) => void,
  onDeferredOutcome?: (outcome: SurfaceActionOutcome) => void,
): SurfaceActionOutcome {
  const reg = registration;
  if (reg && reg.surfaceId === resolvedTargetSurface(directive)) {
    const res = performRaw(directive);
    if (res.kind === 'done') return res.outcome;
    // Mounted but not ready — hold for the surface's ready signal.
    pending = { directive, setAt: Date.now(), onOutcome: onDeferredOutcome };
    return { status: 'stashed' };
  }
  // Not mounted (or another surface is): stash one-shot and head there. A
  // newer stash replaces an older one — the drive moved on, and so must we.
  // nav() applies the same alias resolution, so the nav-target id is correct.
  pending = { directive, setAt: Date.now(), onOutcome: onDeferredOutcome };
  navigate(directive.surfaceId);
  return { status: 'stashed' };
}
