/**
 * The Live Drive move queue — AnA's moves reach the screen one at a time, in
 * the order she made them, each one landing before the next begins.
 *
 * ── Why a queue ──────────────────────────────────────────────────────────────
 * The server emits a round's `drive_navigation` / `drive_action` events back to
 * back, and a model that plans ahead batches several moves into one round. The
 * shell applied each on arrival: a navigation began, the next one replaced it
 * before the first screen had rendered, and an action stashed for a screen
 * that never mounted was replaced by the next stash — so a demonstration
 * skipped stops and dropped its operations, and the person saw a blur.
 *
 * Here a navigation waits until its screen is the one showing (then a short
 * settle so the person sees it), and an action waits for its terminal outcome
 * — applied, refused with a reason, or never able to run — before the next
 * move starts. Every outcome is reported, so an operation that did not happen
 * is never recorded as one that did.
 *
 * Pure orchestration over injected deps: no React, no DOM, no globals — the
 * shell (V2App) supplies navigation, the surface-action bus and the clock.
 *
 * @module client/src/concept2cure/v2/driveQueue
 */

import type { NavigationDirective } from '@shared/navigation';
import type { SurfaceActionDirective } from '@shared/navigation/surface-actions';
import type { SurfaceActionOutcome } from './surfaceActions';

export type DriveMove =
  | { kind: 'navigate'; directive: NavigationDirective; round?: number }
  | { kind: 'act'; directive: SurfaceActionDirective; round?: number };

export interface DriveQueueDeps {
  /** Start the navigation (stash params, open a program, move the shell). */
  navigate: (directive: NavigationDirective) => void;
  /** True once the navigation target's screen is the one showing. */
  isShowing: (directive: NavigationDirective) => boolean;
  /** Hand an action to the surface-action bus; deferred outcomes arrive once. */
  perform: (
    directive: SurfaceActionDirective,
    onDeferred: (outcome: SurfaceActionOutcome) => void,
  ) => SurfaceActionOutcome;
  /** False once the person has taken over — nothing further is applied. */
  canApply: () => boolean;
  /**
   * The reason a move must not be made at all (its screen is closed to this
   * person), or null. The belt behind the server's own refusal.
   */
  refuse?: (move: DriveMove) => string | null;
  /** A move landed. */
  onApplied: (move: DriveMove, detail?: string) => void;
  /** A move could not be made — the reason is the screen's own. */
  onFailed: (move: DriveMove, reason: string) => void;
  sleep: (ms: number) => Promise<void>;
}

/** How long a navigation may take to show its screen before we move on. */
export const NAV_SHOW_TIMEOUT_MS = 2500;
/** Poll interval while waiting for a screen to show. */
export const NAV_POLL_MS = 50;
/** Pause after a screen shows, so a person watching can register it. */
export const NAV_SETTLE_MS = 300;
/**
 * Upper bound on waiting for a stashed action's outcome. The bus's own
 * pending-slot TTL reports expiry before this; this is the belt for a
 * surface that never answers at all.
 */
export const ACTION_OUTCOME_TIMEOUT_MS = 22_000;

export interface DriveQueue {
  push: (move: DriveMove) => void;
  /** Drop every move not yet started (take over). */
  clear: () => void;
  /** Resolves once every queued move has finished. */
  whenIdle: () => Promise<void>;
  /** Moves queued or in flight. */
  size: () => number;
}

export function createDriveQueue(deps: DriveQueueDeps): DriveQueue {
  let chain: Promise<void> = Promise.resolve();
  let generation = 0;
  let inFlight = 0;

  const runNavigate = async (move: Extract<DriveMove, { kind: 'navigate' }>) => {
    deps.navigate(move.directive);
    let waited = 0;
    while (!deps.isShowing(move.directive) && waited < NAV_SHOW_TIMEOUT_MS) {
      await deps.sleep(NAV_POLL_MS);
      waited += NAV_POLL_MS;
    }
    if (!deps.isShowing(move.directive)) {
      deps.onFailed(move, `The ${move.directive.label} screen did not open.`);
      return;
    }
    await deps.sleep(NAV_SETTLE_MS);
    deps.onApplied(move);
  };

  const runAct = async (move: Extract<DriveMove, { kind: 'act' }>) => {
    const outcome = await new Promise<SurfaceActionOutcome>((resolve) => {
      let settled = false;
      const settle = (o: SurfaceActionOutcome) => {
        if (settled) return;
        settled = true;
        resolve(o);
      };
      const immediate = deps.perform(move.directive, settle);
      if (immediate.status !== 'stashed') {
        settle(immediate);
        return;
      }
      void deps.sleep(ACTION_OUTCOME_TIMEOUT_MS).then(() =>
        settle({
          status: 'unavailable',
          reason: `The ${move.directive.surfaceId} screen did not become ready in time.`,
        }),
      );
    });
    if (outcome.status === 'applied') {
      deps.onApplied(move, outcome.detail);
    } else if (outcome.status === 'failed' || outcome.status === 'unavailable') {
      deps.onFailed(move, outcome.reason);
    }
  };

  return {
    push(move) {
      const mine = generation;
      inFlight += 1;
      chain = chain
        .then(async () => {
          if (mine !== generation || !deps.canApply()) return;
          const refused = deps.refuse?.(move) ?? null;
          if (refused) {
            deps.onFailed(move, refused);
            return;
          }
          if (move.kind === 'navigate') await runNavigate(move);
          else await runAct(move);
        })
        .catch(() => {
          /* one move's failure must not stall the ones behind it */
        })
        .finally(() => {
          inFlight -= 1;
        });
    },
    clear() {
      generation += 1;
    },
    whenIdle() {
      return chain.then(
        () => undefined,
        () => undefined,
      );
    },
    size() {
      return inFlight;
    },
  };
}
