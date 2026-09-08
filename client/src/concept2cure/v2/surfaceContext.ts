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
import { useEffect, useRef, useSyncExternalStore } from 'react';

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

/**
 * Is this the same context we are already publishing?
 *
 * Reference equality is not enough, and that is not a micro-optimisation — it
 * is what stops this store from driving an unbounded render loop.
 *
 * A surface publishes a context object built during render. `emit()` re-renders
 * the SHELL (it reads through `useSyncExternalStore`), which re-renders the
 * surface, which builds a NEW object with the SAME contents. Under reference
 * equality that object is "different", so the publish effect re-runs and emits
 * again — and each turn manufactures the input for the next, so the loop has no
 * fixed point. React stops it with "Maximum update depth exceeded", which is
 * how it presented on the task board (TaskBoard.tsx `list` was an unmemoized
 * `.filter()`, so every memo downstream of it was fresh every render).
 *
 * The board's own memoization is fixed, but a store whose safety depends on all
 * 119 surfaces memoizing correctly is a store that WILL be broken again by the
 * next surface someone writes. Comparing by value makes a re-publish of
 * identical content a no-op no matter how the caller built the object, so the
 * loop cannot start here at all.
 *
 * Serialization is the comparison because that is exactly the equality that
 * matters: this value's only consumer is `toModuleContext`, which serializes it
 * onto the wire. Two contexts that serialize the same ARE the same to every
 * reader of this store. Key order is insertion order and the object literal is
 * built by the same code each render, so a content-equal republish compares
 * equal. `JSON.stringify` can throw on a cyclic `facts` — a surface publishing
 * one is a bug, but not one worth taking the screen down for, so it is caught
 * and treated as "not equal" (the old reference behaviour, which is safe
 * because it only ever emits more, never less).
 */
function contentKey(ctx: object | null): string {
  if (!ctx) return '';
  try {
    return JSON.stringify(ctx);
  } catch {
    // Cyclic or otherwise unserializable `facts`. Treated as "never equal to
    // anything", which reproduces the old reference behaviour: it can only
    // cause extra publishes, never a missed one.
    // `\u0000` as an escape, not a literal NUL. A literal one makes the whole
    // file binary to grep(1) — `grep -n` prints nothing from it, so any
    // search-driven read of this module silently returns no match, which is
    // precisely how a defect stays hidden. Same byte, same behaviour,
    // greppable file. (Ledger L51 records two other files in this state.)
    return `\u0000unserializable:${Math.random()}`;
  }
}

function sameContext(a: SurfaceContext | null, b: SurfaceContext | null): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (a.surfaceId !== b.surfaceId) return false;
  return contentKey(a) === contentKey(b);
}

/** Replace the published context. Exported for tests; surfaces use the hook. */
export function setSurfaceContext(next: SurfaceContext | null): void {
  if (sameContext(current, next)) return;
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
 * Clears on unmount so the next surface never inherits this one's context.
 *
 * ── Why the effect is keyed on CONTENT and not on the object ─────────────────
 * This used to be `[surfaceId, context]`, which made a caller passing an
 * unmemoized object re-run the effect every render. That is not merely
 * wasteful, because the effect has a CLEANUP: React runs the previous
 * `clearSurfaceContext(surfaceId)` before the new `setSurfaceContext(...)`, so
 * each render emitted TWICE — once for the intervening null, once for the value
 * — and each emit re-rendered the shell, which re-rendered the surface, which
 * built another object. That is the `setSurfaceContext() → emit() →
 * clearSurfaceContext()` cycle in the task-board crash (MDX UAT A3), and it is
 * why comparing values inside the store is not on its own sufficient: the
 * intermediate null really IS a different value.
 *
 * Keying on the serialized content means a re-render with identical content
 * does not re-run the effect at all, so there is no clear/set churn to emit.
 * The caller no longer has to memoize correctly for the shell to stay stable —
 * which matters because "every one of 119 surfaces memoizes correctly" is not a
 * property anyone can hold true over time.
 */
export function usePublishSurfaceContext(
  surfaceId: string,
  context: Omit<SurfaceContext, 'surfaceId'> | null
): void {
  const key = contentKey(context ?? null);
  /* The effect reads the latest object through a ref rather than closing over
     it, so `key` can be the only content dependency. Values are identical
     whenever the key is, so this never publishes stale content. */
  const latest = useRef(context);
  latest.current = context;

  useEffect(() => {
    const ctx = latest.current;
    if (!ctx) {
      clearSurfaceContext(surfaceId);
      return;
    }
    setSurfaceContext({ surfaceId, ...ctx });
    return () => clearSurfaceContext(surfaceId);
  }, [surfaceId, key]);
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
 * Shape the context for the wire. With no published state, an optional registry
 * fallback can still state which surface is open. It must be a real route label
 * rather than invented screen data; richer published state always wins.
 */
export function toModuleContext(
  ctx: SurfaceContext | null,
  fallback?: Pick<SurfaceContext, 'surfaceId' | 'summary'>
): Record<string, unknown> | null {
  const source = ctx ?? fallback;
  if (!source) return null;
  const out: Record<string, unknown> = { surface: source.surfaceId, summary: source.summary };
  if (ctx?.facts && Object.keys(ctx.facts).length > 0) out.facts = ctx.facts;
  if (ctx?.availableActions && ctx.availableActions.length > 0) {
    out.available_actions = ctx.availableActions;
  }
  return out;
}
