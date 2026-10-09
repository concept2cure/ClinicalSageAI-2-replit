/**
 * AnA Live Drive — the client half of "watch AnA work your screens, live".
 *
 * The server (services/ana-ri/live-drive) emits `drive_state` once per opted-in
 * turn, `drive_navigation` per applied navigation, and `drive_action` per
 * applied screen operation. This module owns what the shell does with them:
 *
 *   - `validateDriveDirective` re-resolves every incoming navigation against
 *     the SAME shared registry the server used (`shared/navigation`); its
 *     action sibling lives in surfaceActions.ts against the surface-action
 *     registry. The screen only ever moves to — or does — what the registry
 *     itself resolves; a malformed or unknown payload is dropped, never
 *     "best-effort" applied. Fail closed on both ends.
 *   - `driveReducer` is the drive session's state machine: engaged by an
 *     honest `drive_state {enabled:true}` (which also fixes the turn's MODE —
 *     assist or demo — and with it the budgets), switched to demo mid-turn
 *     only by a `mode` change the shell applies to a drive still live, locked
 *     by an honest deny (with the real required tier), charged against the
 *     budget as each move ARRIVES (`reserve`), stepped only when a move LANDS
 *     (the queue applied it), released by turn end, and killed instantly by
 *     Take over — after which nothing more is applied this turn, whatever
 *     else arrives.
 *   - Budgets mirror the server's via the SHARED policy table
 *     (shared/navigation/drive-policy) — one source, no hand-mirrored
 *     constants: even a misbehaving stream cannot move or operate the screen
 *     more than the mode's budget allows. A move is counted when it arrives,
 *     the moment the server counted it, so the two counts stay equal.
 *
 * Pure and renderer-free so the state machine unit-tests without a DOM.
 *
 * @module client/src/concept2cure/v2/liveDrive
 */

import {
  resolveNavigation,
  type NavigationDirective,
} from '@shared/navigation';
import {
  driveBudgetFor,
  DRIVE_BUDGETS,
  type DriveMode,
} from '@shared/navigation/drive-policy';

export type { DriveMode };

/** Assist-mode applied-navigation cap (the shared policy's number). */
export const MAX_DRIVE_APPLIES_PER_TURN = DRIVE_BUDGETS.assist.navigations;

/** Trail length shown in the overlay — old steps age out, honestly bounded. */
export const MAX_DRIVE_TRAIL = 24;

export interface DriveStep {
  /**
   * What kind of move this was — a navigation or a screen operation. The same
   * vocabulary as the move queue's (DriveMove.kind), for a failed move too:
   * the strip words "could not open a screen" and "could not do an operation"
   * differently, so a failure has to say which it was.
   */
  kind: 'navigate' | 'act';
  targetId: string;
  label: string;
  round?: number;
  /**
   * Set when the move did NOT land — the screen's own reason. The strip shows
   * it as a failure; it is never counted as a move made.
   */
  failed?: string;
}

export interface DriveLock {
  reason: string;
  requiredTier?: string | null;
}

export interface LiveDriveState {
  /** True while a drive_state{enabled:true} turn is live and not taken over. */
  active: boolean;
  /** The live turn's mode — decides the budgets and the overlay's framing. */
  mode: DriveMode;
  /** Honest deny from the server (entitlement), for the toggle's lock copy. */
  lock: DriveLock | null;
  /** Moves that landed (or failed) this session, most recent last (bounded). */
  steps: DriveStep[];
  /**
   * Navigations charged against the mode's cap this turn — charged when the
   * move ARRIVES (`reserve`), not when it lands, so a burst cannot queue past
   * the budget while the first move is still opening its screen.
   */
  turnNavigations: number;
  /** Screen operations charged against the mode's action cap — same rule. */
  turnActions: number;
  /**
   * Moves that actually LANDED this turn: a screen shown, an operation
   * performed. What the strip's stop count reads — a charge above may belong
   * to a move still queued, or to one that failed.
   */
  turnLanded: number;
  /** True once the person took over this turn — nothing more is applied. */
  takenOver: boolean;
}

export const INITIAL_DRIVE_STATE: LiveDriveState = {
  active: false,
  mode: 'assist',
  lock: null,
  steps: [],
  turnNavigations: 0,
  turnActions: 0,
  turnLanded: 0,
  takenOver: false,
};

export type DriveAction =
  | {
      kind: 'drive_state';
      enabled: boolean;
      mode?: DriveMode;
      reason?: string;
      requiredTier?: string | null;
    }
  /**
   * The server switched the LIVE turn to another mode mid-way (a
   * demonstration promoted when start_product_demo answered). A mode change,
   * never an engage — see the reducer.
   */
  | { kind: 'mode'; mode: DriveMode }
  /**
   * A move ARRIVED and passed its gate: charge it to the turn's budget. Records
   * no step — the move may still be queued behind another, or never land.
   */
  | { kind: 'reserve'; moveKind: DriveStep['kind'] }
  /** A navigation LANDED — the queue saw its screen showing. */
  | { kind: 'navigation'; directive: NavigationDirective; round?: number }
  /** A screen operation LANDED — the screen reported it performed. */
  | { kind: 'action'; actionId: string; label: string; round?: number }
  /** A move that could not be made (refused, never ready, screen missing). */
  | {
      kind: 'move_failed';
      moveKind: DriveStep['kind'];
      targetId: string;
      label: string;
      reason: string;
    }
  | { kind: 'take_over' }
  | { kind: 'turn_end' }
  /**
   * Pre-emptive verdict from GET /api/ana-ri/live-drive/state — seeds the
   * toggle's lock copy BEFORE any turn, WITHOUT engaging the drive (only a
   * turn's own drive_state may set `active`). Advisory: the per-turn
   * drive_state remains the enforcement truth and overwrites this.
   */
  | { kind: 'lock_info'; lock: DriveLock | null }
  | { kind: 'reset' };

/**
 * Whether an arriving navigation may be queued right now. Split from the
 * reducer so the caller checks before queueing (the reducer then reserves its
 * place in the budget, and records the step only once it lands).
 */
export function shouldApplyNavigation(state: LiveDriveState): boolean {
  return whyNotApply(state, 'navigate') === null;
}

/** Same gate for screen operations, against the mode's action budget. */
export function shouldApplyAction(state: LiveDriveState): boolean {
  return whyNotApply(state, 'act') === null;
}

/**
 * Why a move that arrived will not be made, in words AnA can pass on — or
 * null when it will be. The one gate behind shouldApplyNavigation and
 * shouldApplyAction: a move refused here is reported back as not made (the
 * server holds her next round for it), so the reason has to be the real one.
 */
export function whyNotApply(state: LiveDriveState, kind: 'navigate' | 'act'): string | null {
  // Taken over first: take-over also ends the drive, and "not on" would
  // misstate why the move was refused.
  if (state.takenOver) return 'The person has taken over the screen, so the move was not made.';
  if (!state.active) return 'Live Drive is not on for this screen, so the move was not made.';
  const budget = driveBudgetFor(state.mode);
  if (kind === 'navigate' ? state.turnNavigations >= budget.navigations : state.turnActions >= budget.actions) {
    return "This turn's limit on screen moves was reached, so the move was not made.";
  }
  return null;
}

/** Append to the trail; the oldest steps age out past MAX_DRIVE_TRAIL. */
function withStep(steps: DriveStep[], step: DriveStep): DriveStep[] {
  return [...steps, step].slice(-MAX_DRIVE_TRAIL);
}

export function driveReducer(state: LiveDriveState, action: DriveAction): LiveDriveState {
  switch (action.kind) {
    case 'drive_state': {
      if (action.enabled) {
        // A new driving turn begins — its mode fixes this turn's budgets. A
        // previous take-over applied to that turn only — the person
        // re-consents per turn by leaving the toggle on.
        return {
          ...state,
          active: true,
          mode: action.mode === 'demo' ? 'demo' : 'assist',
          lock: null,
          turnNavigations: 0,
          turnActions: 0,
          turnLanded: 0,
          takenOver: false,
        };
      }
      return {
        ...state,
        active: false,
        lock: {
          reason: action.reason ?? 'not_enabled',
          requiredTier: action.requiredTier ?? null,
        },
      };
    }
    case 'mode': {
      /* The server promoted the turn to a demonstration mid-way. That changes
         the MODE of a drive already running and nothing else: a drive the
         person took over, or one not running, stays exactly as it is (the
         shell gates this too — this is the belt). Read as a fresh enable, the
         promotion re-armed a drive the person had just taken back. The counts
         carry over, as on the server, which keeps counting and swaps only the
         budget; the budget is read from `mode` at every gate, so changing the
         mode is what changes it. */
      if (!state.active || state.takenOver) return state;
      return { ...state, mode: action.mode };
    }
    case 'reserve': {
      /* The arrival gate. A move is charged the moment it arrives, as the
         server charged it when it sent it — so a burst of moves cannot queue
         past the budget while the first is still opening its screen. The step
         is NOT recorded here: recorded on arrival, the strip said AnA had
         opened a screen that was still queued behind another move, or that
         then failed to open.

         A move that later fails keeps its charge. The server has already
         counted it, and keeping the two counts equal is what makes this cap a
         belt behind the server's; handing the charge back on failure would
         let a misbehaving stream spend one move past its budget per move it
         made fail. */
      if (action.moveKind === 'navigate') {
        if (!shouldApplyNavigation(state)) return state;
        return { ...state, turnNavigations: state.turnNavigations + 1 };
      }
      if (!shouldApplyAction(state)) return state;
      return { ...state, turnActions: state.turnActions + 1 };
    }
    case 'navigation': {
      /* Landed: its screen is the one showing. Recorded, not charged — its
         budget was reserved when it arrived. Outside a live drive (taken over
         while it was opening) there is no strip to report it on. */
      if (!state.active) return state;
      const steps = withStep(state.steps, {
        kind: 'navigate',
        targetId: action.directive.targetId,
        label: action.directive.label,
        ...(action.round !== undefined ? { round: action.round } : {}),
      });
      return { ...state, steps, turnLanded: state.turnLanded + 1 };
    }
    case 'action': {
      /* Landed: the screen reported it performed. Same rule as a navigation. */
      if (!state.active) return state;
      const steps = withStep(state.steps, {
        kind: 'act',
        targetId: action.actionId,
        label: action.label,
        ...(action.round !== undefined ? { round: action.round } : {}),
      });
      return { ...state, steps, turnLanded: state.turnLanded + 1 };
    }
    case 'move_failed': {
      /* Recorded with the kind of move it was: every failure used to be
         recorded as an operation, so a screen that did not open was worded
         "Could not <screen name>". Neither landed nor handed back (see
         'reserve'). */
      if (!state.active) return state;
      const steps = withStep(state.steps, {
        kind: action.moveKind,
        targetId: action.targetId,
        label: action.label,
        failed: action.reason,
      });
      return { ...state, steps };
    }
    case 'take_over':
      return { ...state, active: false, takenOver: true };
    case 'turn_end':
      return {
        ...state,
        active: false,
        turnNavigations: 0,
        turnActions: 0,
        turnLanded: 0,
        takenOver: false,
      };
    case 'lock_info':
      // Never engages/disengages a live turn — lock copy only.
      return { ...state, lock: action.lock };
    case 'reset':
      return { ...INITIAL_DRIVE_STATE };
    default:
      return state;
  }
}

/**
 * Re-validate an incoming drive directive against the shared registry.
 *
 * The server already validated it, but the stream is still an input: the shell
 * navigates only to what `resolveNavigation` itself resolves HERE, from the
 * targetId + params alone — the returned directive is the registry's, not the
 * payload's, so a tampered label/path can never ride through. Anything
 * unknown or invalid returns null and the screen does not move.
 */
export function validateDriveDirective(raw: unknown): NavigationDirective | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  if (d.actionType !== 'navigate' || typeof d.targetId !== 'string') return null;
  const params =
    d.params && typeof d.params === 'object' ? (d.params as Record<string, unknown>) : {};
  const res = resolveNavigation(d.targetId, params);
  return res.ok ? res.directive : null;
}
