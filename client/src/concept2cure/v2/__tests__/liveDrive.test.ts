/**
 * AnA Live Drive — client state machine + fail-closed directive validation.
 *
 * The properties under test are the ones that make applied navigation safe on
 * the client end: the screen only ever moves to what the shared registry
 * itself resolves; nothing is applied before an honest drive_state enable,
 * after a take-over, or past the per-turn cap; and the overlay's trail only
 * ever contains moves that actually happened.
 *
 * A move is charged to the budget when it ARRIVES (`reserve`, the shell's
 * arrival gate) and recorded in the trail only when it LANDS (`navigation` /
 * `action`, from the move queue) — navigateAndLand / actAndLand below make
 * both calls, in the order the shell makes them.
 */
import { describe, expect, it } from 'vitest';

import {
  INITIAL_DRIVE_STATE,
  MAX_DRIVE_APPLIES_PER_TURN,
  driveReducer,
  shouldApplyNavigation,
  shouldApplyAction,
  validateDriveDirective,
  whyNotApply,
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

/** A navigation arriving and landing, as the shell and its queue drive it. */
function navigateAndLand(s: LiveDriveState, round?: number): LiveDriveState {
  if (!shouldApplyNavigation(s)) return s;
  s = driveReducer(s, { kind: 'reserve', moveKind: 'navigate' });
  return driveReducer(s, { kind: 'navigation', directive: directive(), round });
}

/** A screen operation arriving and landing. */
function actAndLand(s: LiveDriveState, actionId = 'vault.search', label = 'Search the vault'): LiveDriveState {
  if (!shouldApplyAction(s)) return s;
  s = driveReducer(s, { kind: 'reserve', moveKind: 'act' });
  return driveReducer(s, { kind: 'action', actionId, label });
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

  it('records only landed navigations and enforces the per-turn cap', () => {
    let s = engaged();
    for (let i = 0; i < MAX_DRIVE_APPLIES_PER_TURN + 2; i++) {
      s = navigateAndLand(s, i + 1);
    }
    expect(s.steps).toHaveLength(MAX_DRIVE_APPLIES_PER_TURN);
    expect(shouldApplyNavigation(s)).toBe(false);
    // The reducer's own belt: a reservation past the cap is refused outright.
    expect(driveReducer(s, { kind: 'reserve', moveKind: 'navigate' })).toBe(s);
  });

  it('take over kills application instantly for the rest of the turn', () => {
    let s = navigateAndLand(engaged());
    s = driveReducer(s, { kind: 'take_over' });
    expect(s.active).toBe(false);
    expect(shouldApplyNavigation(s)).toBe(false);
    // A move arriving after take-over is a no-op — same state back.
    expect(driveReducer(s, { kind: 'reserve', moveKind: 'navigate' })).toBe(s);
    expect(driveReducer(s, { kind: 'navigation', directive: directive() })).toBe(s);
  });

  it('turn end releases the drive and resets the per-turn cap, keeping the trail', () => {
    let s = navigateAndLand(engaged());
    s = driveReducer(s, { kind: 'turn_end' });
    expect(s.active).toBe(false);
    expect(s.turnNavigations).toBe(0);
    expect(s.turnLanded).toBe(0);
    expect(s.steps).toHaveLength(1);
    // The next enabled turn re-engages cleanly.
    const next = driveReducer(s, { kind: 'drive_state', enabled: true });
    expect(shouldApplyNavigation(next)).toBe(true);
  });

  it('records landed screen actions on their own budget, tagged as acts in the trail', () => {
    let s = engaged();
    expect(shouldApplyAction(s)).toBe(true);
    s = actAndLand(s);
    expect(s.steps).toEqual([
      { kind: 'act', targetId: 'vault.search', label: 'Search the vault' },
    ]);
    expect(s.turnActions).toBe(1);
    // Navigation budget untouched by an action.
    expect(s.turnNavigations).toBe(0);
  });

  it('enforces the assist action budget and kills actions on take-over', () => {
    let s = engaged();
    for (let i = 0; i < DRIVE_BUDGETS.assist.actions + 2; i++) {
      s = actAndLand(s, 'projects.filter', 'Filter');
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
      s = navigateAndLand(s, i + 1);
    }
    expect(shouldApplyNavigation(s)).toBe(false);
    for (let i = 0; i < DRIVE_BUDGETS.demo.actions; i++) {
      expect(shouldApplyAction(s)).toBe(true);
      s = actAndLand(s, 'vault.search', 'Search');
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
    let s = actAndLand(navigateAndLand(engaged()));
    const before = { nav: s.turnNavigations, act: s.turnActions, landed: s.turnLanded };
    s = driveReducer(s, {
      kind: 'move_failed',
      moveKind: 'act',
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
    expect(s.turnNavigations).toBe(before.nav);
    expect(s.turnActions).toBe(before.act);
    expect(s.turnLanded).toBe(before.landed);
  });

  it('records a failed navigation AS a navigation, so the strip words it as one', () => {
    // Every failure was recorded as `act` — the strip then read a screen that
    // did not open as "Could not cMC / Quality (Module 3)".
    let s = engaged();
    s = driveReducer(s, { kind: 'reserve', moveKind: 'navigate' });
    s = driveReducer(s, {
      kind: 'move_failed',
      moveKind: 'navigate',
      targetId: 'cmc',
      label: 'CMC / Quality (Module 3)',
      reason: 'The CMC / Quality (Module 3) screen did not open.',
    });
    expect(s.steps).toEqual([
      {
        kind: 'navigate',
        targetId: 'cmc',
        label: 'CMC / Quality (Module 3)',
        failed: 'The CMC / Quality (Module 3) screen did not open.',
      },
    ]);
  });

  it('is a no-op outside a live drive — before it engages and after take over', () => {
    const failed = {
      kind: 'move_failed' as const,
      moveKind: 'navigate' as const,
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

describe('driveReducer — a move is charged on arrival and recorded on landing', () => {
  /* THE DEFECT: a navigation's step was recorded — and counted — the moment
     `drive_navigation` ARRIVED, before the move queue had applied it. So the
     strip named a screen as opened while that move was still queued behind
     another, or one that then never opened. The budget gate must stay at
     arrival (a burst must not queue past the cap), so arrival RESERVES and
     landing RECORDS, and the two never double count. */
  it('an arriving navigation is charged to the budget but shows no step', () => {
    const s = driveReducer(engaged(), { kind: 'reserve', moveKind: 'navigate' });
    expect(s.turnNavigations).toBe(1);
    expect(s.steps).toEqual([]);
    expect(s.turnLanded).toBe(0);
  });

  it('the step appears when the navigation lands, without charging it again', () => {
    let s = driveReducer(engaged(), { kind: 'reserve', moveKind: 'navigate' });
    s = driveReducer(s, { kind: 'navigation', directive: directive(), round: 2 });
    expect(s.steps).toEqual([
      { kind: 'navigate', targetId: 'cmc', label: 'CMC / Quality (Module 3)', round: 2 },
    ]);
    expect(s.turnNavigations).toBe(1);
    expect(s.turnLanded).toBe(1);
  });

  it('a move reserved on the last slot still records when it lands', () => {
    // The landing is not a second gate: the move that took the last slot of
    // the budget has already been let through, and it did happen.
    let s = engaged();
    for (let i = 0; i < DRIVE_BUDGETS.assist.navigations; i++) {
      s = driveReducer(s, { kind: 'reserve', moveKind: 'navigate' });
    }
    expect(shouldApplyNavigation(s)).toBe(false);
    s = driveReducer(s, { kind: 'navigation', directive: directive() });
    expect(s.steps).toHaveLength(1);
  });

  it('a burst is capped at arrival, before any of it has landed', () => {
    let s = engaged();
    let admitted = 0;
    for (let i = 0; i < DRIVE_BUDGETS.assist.actions + 3; i++) {
      if (!shouldApplyAction(s)) continue;
      s = driveReducer(s, { kind: 'reserve', moveKind: 'act' });
      admitted += 1;
    }
    expect(admitted).toBe(DRIVE_BUDGETS.assist.actions);
    expect(s.steps).toEqual([]);
  });

  it('a failed move keeps its charge — the server counted it when it sent it', () => {
    let s = driveReducer(engaged(), { kind: 'reserve', moveKind: 'navigate' });
    s = driveReducer(s, {
      kind: 'move_failed',
      moveKind: 'navigate',
      targetId: 'cmc',
      label: 'CMC / Quality (Module 3)',
      reason: 'did not open',
    });
    expect(s.turnNavigations).toBe(1);
    expect(s.turnLanded).toBe(0);
  });
});

describe('whyNotApply — a refused move is reported back with the real reason', () => {
  it('names why, for each gate, and nothing when the move will be made', () => {
    expect(whyNotApply(INITIAL_DRIVE_STATE, 'navigate')).toMatch(/^Live Drive is not on/);
    const live = engaged();
    expect(whyNotApply(live, 'navigate')).toBeNull();
    expect(whyNotApply(live, 'act')).toBeNull();
    expect(whyNotApply(driveReducer(live, { kind: 'take_over' }), 'act')).toMatch(/^The person has taken over/);
    let spent = live;
    for (let i = 0; i < DRIVE_BUDGETS.assist.navigations; i++) {
      spent = driveReducer(spent, { kind: 'reserve', moveKind: 'navigate' });
    }
    expect(whyNotApply(spent, 'navigate')).toMatch(/limit on screen moves was reached/);
    // Budgets are per kind: navigations spent leaves operations open.
    expect(whyNotApply(spent, 'act')).toBeNull();
  });

  it('is the one gate the apply checks read', () => {
    const live = engaged();
    for (const s of [INITIAL_DRIVE_STATE, live, driveReducer(live, { kind: 'take_over' })]) {
      expect(shouldApplyNavigation(s)).toBe(whyNotApply(s, 'navigate') === null);
      expect(shouldApplyAction(s)).toBe(whyNotApply(s, 'act') === null);
    }
  });
});

describe('driveReducer — a mid-turn promotion is a mode change, never an engage', () => {
  /* THE DEFECT: the server promotes a driving turn to a demonstration when
     start_product_demo answers, and says so with a second drive_state. Read as
     a fresh enable, it re-activated a drive the person had just taken over. */
  it('switches a live drive to demo and its budgets, keeping this turn’s counts', () => {
    let s = navigateAndLand(engaged('assist'));
    for (let i = 1; i < DRIVE_BUDGETS.assist.navigations; i++) s = navigateAndLand(s);
    expect(shouldApplyNavigation(s)).toBe(false);

    s = driveReducer(s, { kind: 'mode', mode: 'demo' });
    expect(s.mode).toBe('demo');
    expect(s.active).toBe(true);
    // The moves already made still count — against the demo budget now.
    expect(s.turnNavigations).toBe(DRIVE_BUDGETS.assist.navigations);
    expect(s.turnLanded).toBe(DRIVE_BUDGETS.assist.navigations);
    expect(shouldApplyNavigation(s)).toBe(true);
  });

  it('does nothing to a drive the person took over', () => {
    const taken = driveReducer(engaged('assist'), { kind: 'take_over' });
    expect(driveReducer(taken, { kind: 'mode', mode: 'demo' })).toBe(taken);
  });

  it('does nothing when no drive is running', () => {
    expect(driveReducer(INITIAL_DRIVE_STATE, { kind: 'mode', mode: 'demo' })).toBe(INITIAL_DRIVE_STATE);
    const ended = driveReducer(engaged('assist'), { kind: 'turn_end' });
    expect(driveReducer(ended, { kind: 'mode', mode: 'demo' })).toBe(ended);
  });
});
