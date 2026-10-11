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
import type { DriveTurnControls } from '../components/ana/useAnaChat';
import type { SurfaceActionOutcome } from './surfaceActions';

/**
 * A move, with the turn that MADE it: its controls, and the shell's number for
 * it (`turn`). The queue reads neither; it hands the move back to
 * onApplied/onFailed as pushed. A move settles late — an operation may wait
 * ACTION_OUTCOME_TIMEOUT_MS for its screen — and by then a newer turn may be
 * driving: a report sent to "whoever is driving now" told that run about a
 * move it never made, and a landing recorded as "now" was claimed for a turn
 * that never made it.
 */
type MoveOrigin = {
  round?: number;
  controls?: DriveTurnControls;
  turn?: number;
  /** The server's id for the move, named when its outcome is reported back. */
  moveId?: string;
};
export type DriveMove =
  | ({ kind: 'navigate'; directive: NavigationDirective } & MoveOrigin)
  | ({ kind: 'act'; directive: SurfaceActionDirective } & MoveOrigin);

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
  /** Remove this directive from the bus if it still waits for a mount/load. */
  cancelPending: (directive: SurfaceActionDirective, reason: string) => void;
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
  /**
   * A move was never attempted: cleared (take over, a newer turn) before its
   * turn came, the person took over while it waited, or the queue itself
   * failed on it. Not a screen outcome, so nothing is shown — but it is still
   * an outcome: the server holds AnA's next round until every move she made is
   * settled, and one that vanished silently held it to the ceiling.
   */
  onDropped?: (move: DriveMove, reason: string) => void;
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
  /**
   * Drop every move not yet started — take over, switch-off, and any point a
   * turn's leftover moves would otherwise play into the next one. Cancel an
   * action still waiting for its screen/data too; it has not been performed.
   * A navigation in flight finishes and reports its own outcome. `reason` is
   * what each dropped move is settled with (onDropped): AnA reads it.
   */
  clear: (reason?: string) => void;
  /** Resolves once every queued move has finished. */
  whenIdle: () => Promise<void>;
  /** Moves queued or in flight. */
  size: () => number;
}

/** What a move dropped by clear() is settled with when no reason is given. */
export const CLEARED_REASON = 'It was cancelled before it could be made.';

type ActionOutcome = SurfaceActionOutcome | { status: 'dropped'; reason: string };

export function createDriveQueue(deps: DriveQueueDeps): DriveQueue {
  let chain: Promise<void> = Promise.resolve();
  let generation = 0;
  let inFlight = 0;
  let cancelStashed: ((reason: string) => void) | null = null;
  /** Why each cleared generation was cleared, for the moves it dropped. */
  const clearedBecause = new Map<number, string>();

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
    const outcome = await new Promise<ActionOutcome>((resolve) => {
      let settled = false;
      const settle = (o: ActionOutcome) => {
        if (settled) return;
        settled = true;
        if (cancelStashed === cancel) cancelStashed = null;
        resolve(o);
      };
      const cancel = (reason: string) => {
        // Settle as a dropped move before the bus reports its cancellation:
        // Stop is not a screen failure, and this move is acknowledged once.
        settle({ status: 'dropped', reason });
        deps.cancelPending(move.directive, reason);
      };
      const immediate = deps.perform(move.directive, settle);
      if (immediate.status !== 'stashed') {
        settle(immediate);
        return;
      }
      // A synchronous mount may already have answered through onDeferred.
      if (settled) return;
      cancelStashed = cancel;
      void deps.sleep(ACTION_OUTCOME_TIMEOUT_MS).then(() =>
        settle({
          status: 'unavailable',
          reason: `The ${move.directive.surfaceId} screen did not become ready in time.`,
        }),
      );
    });
    if (outcome.status === 'applied') {
      // The handler ran, so cancellation is already disarmed by settle().
      // React must commit its new selection before the next move reads it.
      await outcome.committed;
      deps.onApplied(move, outcome.detail);
    } else if (outcome.status === 'failed' || outcome.status === 'unavailable') {
      deps.onFailed(move, outcome.reason);
    } else if (outcome.status === 'dropped') {
      deps.onDropped?.(move, outcome.reason);
    }
  };

  return {
    push(move) {
      const mine = generation;
      inFlight += 1;
      chain = chain
        .then(async () => {
          if (mine !== generation) {
            deps.onDropped?.(move, clearedBecause.get(mine) ?? CLEARED_REASON);
            return;
          }
          if (!deps.canApply()) {
            deps.onDropped?.(move, 'The person took over the screen, so it was not made.');
            return;
          }
          const refused = deps.refuse?.(move) ?? null;
          if (refused) {
            deps.onFailed(move, refused);
            return;
          }
          if (move.kind === 'navigate') await runNavigate(move);
          else await runAct(move);
        })
        .catch(() => {
          /* One move's failure must not stall the ones behind it — and must
             still be settled. The shell settles each move once, so a move
             that already reported its outcome is not reported again. */
          deps.onDropped?.(move, 'The move could not be made.');
        })
        .finally(() => {
          inFlight -= 1;
        });
    },
    clear(reason) {
      const why = reason ?? CLEARED_REASON;
      clearedBecause.set(generation, why);
      generation += 1;
      cancelStashed?.(why);
    },
    whenIdle() {
      return chain.then(() => undefined, () => undefined);
    },
    size() {
      return inFlight;
    },
  };
}
