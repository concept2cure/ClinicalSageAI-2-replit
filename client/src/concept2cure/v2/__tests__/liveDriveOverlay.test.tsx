// @vitest-environment jsdom
/**
 * The Live Drive strip says only what happened, in words that fit the move.
 *
 * THE DEFECTS:
 *   - A failure was recorded without its kind, and the strip worded every
 *     failure as an operation: a screen that did not open read "Could not
 *     cMC / Quality (Module 3): …". A navigation's label is a screen's name;
 *     an operation's is a verb phrase. The wording follows the move.
 *   - The demo stop count read the budget counters, which were charged when a
 *     navigation ARRIVED — so it counted stops still queued, and stops that
 *     then failed. It reads the moves that landed.
 *
 * States are built with the real reducer, from the actions the shell sends.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

import { LiveDriveOverlay } from '../LiveDriveOverlay';
import { INITIAL_DRIVE_STATE, driveReducer, type DriveAction, type LiveDriveState } from '../liveDrive';
import { resolveNavigation } from '@shared/navigation';

afterEach(cleanup);

function stateAfter(mode: 'assist' | 'demo', actions: DriveAction[]): LiveDriveState {
  return actions.reduce(
    driveReducer,
    driveReducer(INITIAL_DRIVE_STATE, { kind: 'drive_state', enabled: true, mode }),
  );
}

function renderStrip(state: LiveDriveState) {
  const { container } = render(
    <LiveDriveOverlay state={state} onTakeOver={vi.fn()} onStop={vi.fn()} />,
  );
  return container;
}

function cmc() {
  const res = resolveNavigation('cmc', {});
  if (!res.ok) throw new Error('fixture target cmc does not resolve');
  return res.directive;
}

describe('LiveDriveOverlay — a failed move is worded by what it was', () => {
  it('a navigation that failed reads as a screen that did not open, its name intact', () => {
    const container = renderStrip(
      stateAfter('assist', [
        { kind: 'reserve', moveKind: 'navigate' },
        {
          kind: 'move_failed',
          moveKind: 'navigate',
          targetId: 'cmc',
          label: 'CMC / Quality (Module 3)',
          reason: 'The CMC / Quality (Module 3) screen did not open.',
        },
      ]),
    );
    const step = container.querySelector('.ana-drive-step.is-failed');
    expect(step?.textContent).toBe(
      'Could not open CMC / Quality (Module 3): The CMC / Quality (Module 3) screen did not open.',
    );
    expect(step?.getAttribute('title')).toBe(step?.textContent);
  });

  it('an operation that failed keeps the operation wording', () => {
    const container = renderStrip(
      stateAfter('assist', [
        { kind: 'reserve', moveKind: 'act' },
        {
          kind: 'move_failed',
          moveKind: 'act',
          targetId: 'vault.search',
          label: 'Search the vault',
          reason: 'The vault screen is not open.',
        },
      ]),
    );
    expect(container.querySelector('.ana-drive-step.is-failed')?.textContent).toBe(
      'Could not search the vault: The vault screen is not open.',
    );
  });
});

describe('LiveDriveOverlay — only moves that landed are shown or counted', () => {
  it('a navigation that has only arrived shows no step and no stop', () => {
    const container = renderStrip(
      stateAfter('demo', [
        { kind: 'reserve', moveKind: 'navigate' },
        { kind: 'reserve', moveKind: 'navigate' },
      ]),
    );
    expect(container.querySelector('.ana-drive-step')).toBeNull();
    expect(container.querySelector('.ana-drive-count')).toBeNull();
  });

  it('the stop count is the moves that landed — not the queued, not the failed', () => {
    const container = renderStrip(
      stateAfter('demo', [
        { kind: 'reserve', moveKind: 'navigate' },
        { kind: 'reserve', moveKind: 'navigate' },
        { kind: 'reserve', moveKind: 'navigate' },
        { kind: 'navigation', directive: cmc() },
        {
          kind: 'move_failed',
          moveKind: 'navigate',
          targetId: 'cmc',
          label: 'CMC / Quality (Module 3)',
          reason: 'did not open',
        },
      ]),
    );
    expect(container.querySelector('.ana-drive-count')?.textContent).toBe('1 stop');
  });
});
