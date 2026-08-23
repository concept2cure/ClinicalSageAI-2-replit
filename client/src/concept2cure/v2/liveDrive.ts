/**
 * AnA Live Drive — the client half of "watch AnA work your screens, live".
 *
 * The server (services/ana-ri/live-drive) emits `drive_state` once per opted-in
 * turn and `drive_navigation` per applied directive. This module owns what the
 * shell does with them:
 *
 *   - `validateDriveDirective` re-resolves every incoming directive against the
 *     SAME shared registry the server used (`shared/navigation`). The screen
 *     only ever moves to a target the registry itself resolves — a malformed or
 *     unknown payload is dropped, never "best-effort" applied. Fail closed on
 *     both ends.
 *   - `driveReducer` is the drive session's state machine: engaged by an
 *     honest `drive_state {enabled:true}`, locked by an honest deny (with the
 *     real required tier), stepped by each applied navigation, released by
 *     turn end, and killed instantly by Take over — after which nothing more
 *     is applied this turn, whatever else arrives.
 *   - `MAX_DRIVE_APPLIES_PER_TURN` mirrors the server's cap as a client-side
 *     belt: even a misbehaving stream cannot move the person more than the
 *     chip budget would have offered.
 *
 * Pure and renderer-free so the state machine unit-tests without a DOM.
 *
 * @module client/src/concept2cure/v2/liveDrive
 */

import {
  resolveNavigation,
  type NavigationDirective,
} from '@shared/navigation';

/** Client-side applied-navigation cap per turn (mirrors the server budget). */
export const MAX_DRIVE_APPLIES_PER_TURN = 3;

/** Trail length shown in the overlay — old steps age out, honestly bounded. */
export const MAX_DRIVE_TRAIL = 12;

export interface DriveStep {
  targetId: string;
  label: string;
  round?: number;
}

export interface DriveLock {
  reason: string;
  requiredTier?: string | null;
}

export interface LiveDriveState {
  /** True while a drive_state{enabled:true} turn is live and not taken over. */
  active: boolean;
  /** Honest deny from the server (entitlement), for the toggle's lock copy. */
  lock: DriveLock | null;
  /** Navigations applied this session, most recent last (bounded). */
  steps: DriveStep[];
  /** Applied count for the CURRENT turn — enforces the per-turn cap. */
  turnApplied: number;
  /** True once the person took over this turn — nothing more is applied. */
  takenOver: boolean;
}

export const INITIAL_DRIVE_STATE: LiveDriveState = {
  active: false,
  lock: null,
  steps: [],
  turnApplied: 0,
  takenOver: false,
};

export type DriveAction =
  | { kind: 'drive_state'; enabled: boolean; reason?: string; requiredTier?: string | null }
  | { kind: 'navigation'; directive: NavigationDirective; round?: number }
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
 * Whether a validated navigation should be APPLIED right now. Split from the
 * reducer so the caller checks before navigating (the reducer records after).
 */
export function shouldApplyNavigation(state: LiveDriveState): boolean {
  return state.active && !state.takenOver && state.turnApplied < MAX_DRIVE_APPLIES_PER_TURN;
}

export function driveReducer(state: LiveDriveState, action: DriveAction): LiveDriveState {
  switch (action.kind) {
    case 'drive_state': {
      if (action.enabled) {
        // A new driving turn begins. A previous take-over applied to that
        // turn only — the person re-consents per turn by leaving the toggle on.
        return { ...state, active: true, lock: null, turnApplied: 0, takenOver: false };
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
    case 'navigation': {
      if (!shouldApplyNavigation(state)) return state;
      const steps = [
        ...state.steps,
        {
          targetId: action.directive.targetId,
          label: action.directive.label,
          ...(action.round !== undefined ? { round: action.round } : {}),
        },
      ].slice(-MAX_DRIVE_TRAIL);
      return { ...state, steps, turnApplied: state.turnApplied + 1 };
    }
    case 'take_over':
      return { ...state, active: false, takenOver: true };
    case 'turn_end':
      return { ...state, active: false, turnApplied: 0, takenOver: false };
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
