/**
 * What AnA can see of the screen the user is actually on.
 *
 * ── The gap this closes ──────────────────────────────────────────────────────
 * `V2App` already tells AnA WHICH surface is active — `useAnaChat({ screenName:
 * activeId })`. It does not tell her anything about WHAT IS ON IT. So on Mission
 * Control she knew the user was looking at "mission-control" but not which
 * program was open, what its readiness was, or which blockers were on screen;
 * on the biostat workbench she knew the screen's name and not which calculator
 * was selected or what it had just returned.
 *
 * `useAnaChat` has always accepted a `moduleContext` object and forwards it to
 * the orchestrator as `module_context`. Exactly two surfaces out of 119 set it,
 * and both are surfaces that own their own AnA panel — no surface reached
 * through the shell rail could publish anything, because the shell owns the
 * conversation and nothing carried context up to it.
 *
 * This is that missing channel: a surface publishes what it is showing, the
 * shell forwards it with every turn.
 *
 * ── Why a module-level store and not React context ───────────────────────────
 * The publisher (a surface, deep in the tree) is a DESCENDANT of the consumer
 * (`V2App`, which owns the AnA hook). React context flows the other way, so a
 * provider would have to wrap the shell and be written to from below — the same
 * store, with more indirection. `useSyncExternalStore` keeps the read
 * concurrent-safe and re-renders the shell when a surface publishes.
 *
 * ── Staleness is the whole risk, so it is handled first ──────────────────────
 * Context from the PREVIOUS screen is worse than no context: it makes AnA
 * confidently wrong about what the user is looking at, and an assistant that
 * cites the wrong program is more dangerous than one that asks. So:
 *
 *   • publishing is keyed by surface id, and the reader returns nothing unless
 *     the published key matches the active surface;
 *   • the publishing hook clears on unmount, which React runs when the surface
 *     swaps;
 *   • nothing is persisted anywhere — this is live screen state, not a session.
 *
 * ── What a surface should publish ────────────────────────────────────────────
 * The nouns and numbers a user would point at, not the whole response. AnA gets
 * this on every turn, so it is a budget as well as a payload: the identity of
 * what is selected, the handful of figures on screen, and what the user could
 * do next. Never raw API bodies, and never anything the user cannot see — this
 * channel must not become a way to feed the model data the screen is hiding.
 */
import { useEffect, useSyncExternalStore } from 'react';

export interface SurfaceContext {
  /** Surface id this context belongs to. Set by {@link usePublishSurfaceContext}. */
  surfaceId: string;
  /**
   * A one-line description of what the user is looking at, in the words the UI
   * uses. This is what makes a generic question ("what should I do next?")
   * answerable without the user restating their situation.
   */
  summary: string;
  /** Structured facts: ids, counts, scores, selection. Kept small on purpose. */
  facts?: Record<string, unknown>;
  /**
   * What the user can do here, phrased as the actions the surface offers. Gives
   * AnA a vocabulary for "drive the screen" requests rather than guessing at
   * capability names.
   */
  availableActions?: string[];
}

type Listener = () => void;

let current: SurfaceContext | null = null;
const listeners = new Set<Listener>();

function emit(): void {
  for (const l of listeners) l();
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function getSnapshot(): SurfaceContext | null {
  return current;
}

/** Server render has no screen, so it has no context. */
function getServerSnapshot(): SurfaceContext | null {
  return null;
}

/** Replace the published context. Exported for tests; surfaces use the hook. */
export function setSurfaceContext(next: SurfaceContext | null): void {
  if (current === next) return;
  current = next;
  emit();
}

/** Clear only if the caller still owns the slot — avoids a late unmount wiping a newer surface's context. */
export function clearSurfaceContext(surfaceId: string): void {
  if (current?.surfaceId === surfaceId) setSurfaceContext(null);
}

/**
 * Publish what this surface is showing, for AnA.
 *
 * Call it with a memoized object (or accept the re-publish cost — the store
 * compares by reference, so a fresh object each render emits each render).
 * Clears on unmount so the next surface never inherits this one's context.
 */
export function usePublishSurfaceContext(
  surfaceId: string,
  context: Omit<SurfaceContext, 'surfaceId'> | null
): void {
  useEffect(() => {
    if (!context) {
      clearSurfaceContext(surfaceId);
      return;
    }
    setSurfaceContext({ surfaceId, ...context });
    return () => clearSurfaceContext(surfaceId);
  }, [surfaceId, context]);
}

/**
 * The context for `activeSurfaceId`, or null.
 *
 * Returns null when the published context belongs to a different surface. That
 * happens for one render after a navigation — the new surface has not published
 * yet and the old one's cleanup has not run — and returning the stale object in
 * that window is exactly the confidently-wrong failure this guards against.
 */
export function useActiveSurfaceContext(activeSurfaceId: string): SurfaceContext | null {
  const published = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return published && published.surfaceId === activeSurfaceId ? published : null;
}

/**
 * Shape the context for the wire. Returns null rather than an empty object so
 * `useAnaChat` omits `module_context` entirely when there is nothing to say —
 * an empty context object would read to the orchestrator as "the screen is
 * empty", which is a different claim from "the screen did not tell us".
 */
export function toModuleContext(ctx: SurfaceContext | null): Record<string, unknown> | null {
  if (!ctx) return null;
  const out: Record<string, unknown> = { surface: ctx.surfaceId, summary: ctx.summary };
  if (ctx.facts && Object.keys(ctx.facts).length > 0) out.facts = ctx.facts;
  if (ctx.availableActions && ctx.availableActions.length > 0) out.available_actions = ctx.availableActions;
  return out;
}
