/**
 * AnA Live Drive — client state machine + fail-closed directive validation.
 *
 * The properties under test are the ones that make applied navigation safe on
 * the client end: the screen only ever moves to what the shared registry
 * itself resolves; nothing is applied before an honest drive_state enable,
 * after a take-over, or past the per-turn cap; and the overlay's trail only
 * ever contains navigations that actually happened.
 */
import { describe, expect, it } from 'vitest';

import {
  INITIAL_DRIVE_STATE,
  MAX_DRIVE_APPLIES_PER_TURN,
  driveReducer,
  shouldApplyNavigation,
  shouldApplyAction,
  validateDriveDirective,
  type LiveDriveState,
} from '../liveDrive';
import { resolveNavigation } from '@shared/navigation';
import { DRIVE_BUDGETS } from '@shared/navigation/drive-policy';

function engaged(mode?: 'assist' | 'demo'): LiveDriveState {
  return driveReducer(INITIAL_DRIVE_STATE, { kind: 'drive_state', enabled: true, mode });
}

function directive(targetId = 'cmc') {
  const res = resolveNavigation(targetId, {});
  if (!res.ok) throw new Error(`fixture target ${targetId} does not resolve`);
  return res.directive;
}

describe('validateDriveDirective', () => {
  it('resolves a well-formed directive through the registry (canonical copy, not the payload)', () => {
    const d = validateDriveDirective({
      actionType: 'navigate',
      targetId: 'cmc',
      label: 'TAMPERED LABEL',
      path: 'somewhere-else',
      scope: 'global',
    });
    expect(d).not.toBeNull();
    // The applied directive is the REGISTRY's resolution — a tampered
    // label/path in the payload never rides through to the screen.
    expect(d!.label).toBe('CMC / Quality (Module 3)');
    expect(d!.path).toBe('cmc');
  });

  it('drops unknown targets — the screen never moves to a target the registry refuses', () => {
    expect(
      validateDriveDirective({ actionType: 'navigate', targetId: 'evil-screen' }),
    ).toBeNull();
  });

  it('drops malformed payloads outright', () => {
    expect(validateDriveDirective(null)).toBeNull();
    expect(validateDriveDirective('cmc')).toBeNull();
    expect(validateDriveDirective({ targetId: 'cmc' })).toBeNull();
    expect(validateDriveDirective({ actionType: 'navigate', targetId: 42 })).toBeNull();
  });

  it('drops a directive whose params fail the registry enum', () => {
    expect(
      validateDriveDirective({
        actionType: 'navigate',
        targetId: 'intelligence',
        params: { intelligenceTab: 'not-a-real-tab' },
      }),
    ).toBeNull();
  });
});

describe('driveReducer', () => {
  it('nothing applies before an honest drive_state enable', () => {
    expect(shouldApplyNavigation(INITIAL_DRIVE_STATE)).toBe(false);
    const s = driveReducer(INITIAL_DRIVE_STATE, { kind: 'navigation', directive: directive() });
    expect(s.steps).toEqual([]);
  });

  it('an enabled drive_state engages the turn and clears any previous lock', () => {
    const locked = driveReducer(INITIAL_DRIVE_STATE, {
      kind: 'drive_state',
      enabled: false,
      reason: 'not_entitled',
      requiredTier: 'professional',
    });
    expect(locked.active).toBe(false);
    expect(locked.lock).toEqual({ reason: 'not_entitled', requiredTier: 'professional' });

    const s = driveReducer(locked, { kind: 'drive_state', enabled: true });
    expect(s.active).toBe(true);
    expect(s.lock).toBeNull();
    expect(shouldApplyNavigation(s)).toBe(true);
  });

  it('records only applied navigations and enforces the per-turn cap', () => {
    let s = engaged();
    for (let i = 0; i < MAX_DRIVE_APPLIES_PER_TURN + 2; i++) {
      if (shouldApplyNavigation(s)) {
        s = driveReducer(s, { kind: 'navigation', directive: directive(), round: i + 1 });
      }
    }
    expect(s.steps).toHaveLength(MAX_DRIVE_APPLIES_PER_TURN);
    expect(shouldApplyNavigation(s)).toBe(false);
  });

  it('take over kills application instantly for the rest of the turn', () => {
    let s = engaged();
    s = driveReducer(s, { kind: 'navigation', directive: directive() });
    s = driveReducer(s, { kind: 'take_over' });
    expect(s.active).toBe(false);
    expect(shouldApplyNavigation(s)).toBe(false);
    // A navigation arriving after take-over is a no-op — same state back.
    expect(driveReducer(s, { kind: 'navigation', directive: directive() })).toBe(s);
  });

  it('turn end releases the drive and resets the per-turn cap, keeping the trail', () => {
    let s = engaged();
    s = driveReducer(s, { kind: 'navigation', directive: directive() });
    s = driveReducer(s, { kind: 'turn_end' });
    expect(s.active).toBe(false);
    expect(s.turnApplied).toBe(0);
    expect(s.steps).toHaveLength(1);
    // The next enabled turn re-engages cleanly.
    const next = driveReducer(s, { kind: 'drive_state', enabled: true });
    expect(shouldApplyNavigation(next)).toBe(true);
  });

  it('records applied screen actions on their own budget, tagged as acts in the trail', () => {
    let s = engaged();
    expect(shouldApplyAction(s)).toBe(true);
    s = driveReducer(s, { kind: 'action', actionId: 'vault.search', label: 'Search the vault' });
    expect(s.steps).toEqual([
      { kind: 'act', targetId: 'vault.search', label: 'Search the vault' },
    ]);
    expect(s.turnActionsApplied).toBe(1);
    // Navigation budget untouched by an action.
    expect(s.turnApplied).toBe(0);
  });

  it('enforces the assist action budget and kills actions on take-over', () => {
    let s = engaged();
    for (let i = 0; i < DRIVE_BUDGETS.assist.actions + 2; i++) {
      if (shouldApplyAction(s)) {
        s = driveReducer(s, { kind: 'action', actionId: `projects.filter`, label: 'Filter' });
      }
    }
    expect(s.steps.filter((st) => st.kind === 'act')).toHaveLength(DRIVE_BUDGETS.assist.actions);
    expect(shouldApplyAction(s)).toBe(false);
    s = driveReducer(s, { kind: 'take_over' });
    expect(shouldApplyAction(s)).toBe(false);
  });

  it('a demo turn carries the larger shared budgets for both kinds of move', () => {
    let s = engaged('demo');
    expect(s.mode).toBe('demo');
    for (let i = 0; i < DRIVE_BUDGETS.demo.navigations; i++) {
      expect(shouldApplyNavigation(s)).toBe(true);
      s = driveReducer(s, { kind: 'navigation', directive: directive(), round: i + 1 });
    }
    expect(shouldApplyNavigation(s)).toBe(false);
    for (let i = 0; i < DRIVE_BUDGETS.demo.actions; i++) {
      expect(shouldApplyAction(s)).toBe(true);
      s = driveReducer(s, { kind: 'action', actionId: 'vault.search', label: 'Search' });
    }
    expect(shouldApplyAction(s)).toBe(false);
    // turn end resets both budgets; the next assist turn is back to assist caps.
    s = driveReducer(s, { kind: 'turn_end' });
    const next = driveReducer(s, { kind: 'drive_state', enabled: true });
    expect(next.mode).toBe('assist');
  });
});

describe('driveReducer — moves that did not land', () => {
  /* The move queue reports a navigation whose screen never showed, or an
     operation the screen refused, as `move_failed`. The trail must say so —
     with the screen's own reason — and must never count it as a move made:
     the budgets are for moves that happened, and the overlay used to show a
     tick for an operation stashed for a screen that never mounted. */
  it('records the failure with its reason, without touching either budget', () => {
    let s = engaged();
    s = driveReducer(s, { kind: 'navigation', directive: directive() });
    s = driveReducer(s, { kind: 'action', actionId: 'vault.search', label: 'Search the vault' });
    const before = { nav: s.turnApplied, act: s.turnActionsApplied };
    s = driveReducer(s, {
      kind: 'move_failed',
      targetId: 'vault.search',
      label: 'Search the vault',
      reason: 'The vault screen is not open.',
    });
    expect(s.steps[s.steps.length - 1]).toEqual({
      kind: 'act',
      targetId: 'vault.search',
      label: 'Search the vault',
      failed: 'The vault screen is not open.',
    });
    expect(s.turnApplied).toBe(before.nav);
    expect(s.turnActionsApplied).toBe(before.act);
  });

  it('is a no-op outside a live drive — before it engages and after take over', () => {
    const failed = {
      kind: 'move_failed' as const,
      targetId: 'cmc',
      label: 'CMC',
      reason: 'did not open',
    };
    expect(driveReducer(INITIAL_DRIVE_STATE, failed)).toBe(INITIAL_DRIVE_STATE);
    const taken = driveReducer(engaged(), { kind: 'take_over' });
    expect(driveReducer(taken, failed)).toBe(taken);
  });

  it('take over marks the turn as taken over, not merely inactive', () => {
    // `takenOver` is what the move queue's canApply reads between moves; a
    // take-over that only cleared `active` would let the queue keep going.
    const s = driveReducer(engaged(), { kind: 'take_over' });
    expect(s.takenOver).toBe(true);
    expect(s.active).toBe(false);
  });
});
