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
  validateDriveDirective,
  type LiveDriveState,
} from '../liveDrive';
import { resolveNavigation } from '@shared/navigation';

function engaged(): LiveDriveState {
  return driveReducer(INITIAL_DRIVE_STATE, { kind: 'drive_state', enabled: true });
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
});
