/**
 * Unlock intent — what the customer was trying to open when they hit a lock.
 *
 * ── The broken journey this closes ───────────────────────────────────────────
 *
 * A customer clicks a greyed rail entry, reads "PV cockpit — not included in
 * your plan. It is included from the Professional plan upward.", presses
 * "View plans" — and lands on a generic price list that has never heard of PV
 * cockpit. They now have to hold the module name and the required tier in their
 * head and work out for themselves which column to look at. That is the moment
 * an upgrade either happens or does not, and we were spending it making the
 * customer do the join.
 *
 * The rail and ⌘K both already KNOW the answer at the point of the click: the
 * module's real name and the real minimum tier, straight from the server's
 * verdict. This carries those two facts across the navigation so the plans page
 * can say what the customer came to find out.
 *
 * ── Why a module and not a route param ───────────────────────────────────────
 *
 * The obvious alternative is `/concept2cure/licensing?unlock=pv-cockpit`. It was
 * not taken because the shell's router (routing.ts) maps a location to a surface
 * id and nothing else — a query string would have to be threaded through
 * `locationForSurface`, `surfaceIdFromLocation` and every `onNav` call site in
 * the product to reach one banner. This is a single hand-off between two
 * surfaces that are already both mounted in the same shell, so it lives at the
 * same altitude as the hand-off itself.
 *
 * ── Why it is consumed once and cleared ──────────────────────────────────────
 *
 * The intent is a fact about ONE navigation. If it persisted, a customer who
 * visited the plans page later — from the account menu, from billing, from a
 * bookmark — would be told they were trying to unlock something they had long
 * since stopped thinking about, and a stale required-tier claim is exactly the
 * kind of small lie this codebase spends its comments on. `takeUnlockIntent()`
 * reads and clears in one step, so the banner renders on the navigation that set
 * it and never again.
 *
 * It is deliberately NOT persisted to storage for the same reason: a reload is
 * a new visit, and the customer's reason for being there is no longer known.
 */

export interface UnlockIntent {
  /** Module id — the same id space as the catalog and the surface registry. */
  moduleId: string;
  /** The module's real name, as the server reported it. Never invented here. */
  label: string;
  /**
   * The lowest tier that includes it, or null when the lock has no tier remedy
   * (an admin disabled it, or it is outside the workspace's industry mode).
   * Null is meaningful: the banner must not offer a plan that fixes nothing.
   */
  requiredTier: string | null;
}

let pending: UnlockIntent | null = null;

/** Record what the customer was trying to open. Called at the click, by the
 *  surface that already holds the server's verdict. */
export function setUnlockIntent(intent: UnlockIntent): void {
  pending = intent;
}

/**
 * Read the intent and clear it in the same step.
 *
 * One-shot on purpose — see the module note. Returns null when the plans page
 * was reached any other way, which is the common case and must render the
 * ordinary page with no banner at all.
 */
export function takeUnlockIntent(): UnlockIntent | null {
  const held = pending;
  pending = null;
  return held;
}

/** Drop any pending intent without consuming it. Used when a navigation that
 *  set one is abandoned, so it cannot leak onto an unrelated later visit. */
export function clearUnlockIntent(): void {
  pending = null;
}
