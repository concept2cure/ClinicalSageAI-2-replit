/**
 * The Live Drive move queue — one move at a time, each one landing first.
 *
 * The defect this queue ends: the shell applied every `drive_navigation` /
 * `drive_action` on arrival. A model that plans ahead batches several moves
 * into one round, so a navigation began, the next replaced it before the first
 * screen had rendered, and an action stashed for a screen that never mounted
 * was replaced by the next stash. A demonstration skipped stops and dropped
 * its operations, and the overlay recorded moves that never happened.
 *
 * So the properties pinned here are ordering and honesty, read against a
 * virtual clock (fake timers drive the injected `sleep`):
 *   - a move does not start until the one before it has LANDED — for a
 *     navigation, until its screen is the one showing;
 *   - every move reports exactly one outcome, and "applied" only when it was;
 *   - take-over (canApply=false, clear()) stops moves that have not started;
 *   - whenIdle() is what the shell waits on before releasing the drive, so it
 *     must not resolve while a move is still in flight.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ACTION_OUTCOME_TIMEOUT_MS,
  NAV_SETTLE_MS,
  NAV_SHOW_TIMEOUT_MS,
  createDriveQueue,
  type DriveMove,
  type DriveQueueDeps,
} from '../driveQueue';
import type { SurfaceActionOutcome } from '../surfaceActions';
import { resolveNavigation, type NavigationDirective } from '@shared/navigation';
import { resolveSurfaceAction } from '@shared/navigation/surface-actions';

function nav(targetId: string): DriveMove {
  const res = resolveNavigation(targetId, {});
  if (!res.ok) throw new Error(`fixture target ${targetId} does not resolve`);
  return { kind: 'navigate', directive: res.directive };
}

function act(actionId = 'vault.search', params: Record<string, unknown> = { query: 'x' }): DriveMove {
  const res = resolveSurfaceAction(actionId, params);
  if (!res.ok) throw new Error(`fixture action ${actionId} does not resolve`);
  return { kind: 'act', directive: res.directive };
}

const idOf = (m: DriveMove) => (m.kind === 'navigate' ? m.directive.targetId : m.directive.actionId);

/**
 * A fake shell. `showsAfter[targetId]` is how long (virtual ms) after its
 * navigation began that screen becomes the one showing; absent = never shows.
 * `perform` answers 'applied' unless a test overrides it. Every call lands in
 * `log`, so ordering is asserted on what the queue actually did.
 */
function harness(opts: {
  showsAfter?: Record<string, number>;
  perform?: DriveQueueDeps['perform'];
  canApply?: () => boolean;
  refuse?: DriveQueueDeps['refuse'];
} = {}) {
  const log: string[] = [];
  const startedAt: Record<string, number> = {};
  const deps: DriveQueueDeps = {
    navigate: vi.fn((d: NavigationDirective) => {
      log.push(`navigate:${d.targetId}`);
      startedAt[d.targetId] = Date.now();
    }),
    isShowing: (d) => {
      const after = opts.showsAfter?.[d.targetId];
      return after !== undefined && startedAt[d.targetId] !== undefined && Date.now() - startedAt[d.targetId] >= after;
    },
    perform: vi.fn(
      opts.perform ??
        ((d) => {
          log.push(`perform:${d.actionId}`);
          return { status: 'applied' } as SurfaceActionOutcome;
        }),
    ),
    canApply: opts.canApply ?? (() => true),
    refuse: opts.refuse,
    onApplied: vi.fn((m: DriveMove, detail?: string) => {
      log.push(`applied:${idOf(m)}${detail ? `:${detail}` : ''}`);
    }),
    onFailed: vi.fn((m: DriveMove, reason: string) => {
      log.push(`failed:${idOf(m)}:${reason}`);
    }),
    sleep: (ms) => new Promise<void>((r) => setTimeout(r, ms)),
  };
  return { deps, log, queue: createDriveQueue(deps) };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('createDriveQueue — order', () => {
  it('a navigation holds the next move until its screen is showing and settled', async () => {
    const { deps, log, queue } = harness({ showsAfter: { cmc: 400 } });
    queue.push(nav('cmc'));
    queue.push(act('vault.search'));

    // Mid-navigation: the screen has not shown yet, so the action must not
    // have been handed to the bus. Applied-on-arrival failed exactly here —
    // the stash for the next screen landed before this one rendered.
    await vi.advanceTimersByTimeAsync(200);
    expect(log).toEqual(['navigate:cmc']);
    expect(deps.perform).not.toHaveBeenCalled();

    // Shown, but still inside the settle pause a watching person needs.
    await vi.advanceTimersByTimeAsync(250);
    expect(deps.perform).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(NAV_SETTLE_MS);
    await queue.whenIdle();
    expect(log).toEqual(['navigate:cmc', 'applied:cmc', 'perform:vault.search', 'applied:vault.search']);
  });

  it('runs a batch of navigations strictly in the order AnA made them', async () => {
    const { log, queue } = harness({ showsAfter: { cmc: 100, vault: 300, projects: 50 } });
    queue.push(nav('cmc'));
    queue.push(nav('vault'));
    queue.push(nav('projects'));
    await vi.advanceTimersByTimeAsync(5_000);
    await queue.whenIdle();
    expect(log).toEqual([
      'navigate:cmc',
      'applied:cmc',
      'navigate:vault',
      'applied:vault',
      'navigate:projects',
      'applied:projects',
    ]);
  });
});

describe('createDriveQueue — a navigation that never lands', () => {
  it('reports failure after NAV_SHOW_TIMEOUT_MS, never success, and moves on', async () => {
    const { deps, log, queue } = harness({ showsAfter: { vault: 0 } });
    queue.push(nav('cmc')); // never shows
    queue.push(nav('vault'));

    await vi.advanceTimersByTimeAsync(NAV_SHOW_TIMEOUT_MS - 100);
    expect(deps.onFailed).not.toHaveBeenCalled();
    expect(deps.onApplied).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(5_000);
    await queue.whenIdle();
    expect(deps.onFailed).toHaveBeenCalledTimes(1);
    const [failedMove, reason] = (deps.onFailed as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(idOf(failedMove)).toBe('cmc');
    expect(reason).toMatch(/did not open/);
    // The one that never showed is not in the applied record; the next one is.
    expect(log.filter((l) => l.startsWith('applied:'))).toEqual(['applied:vault']);
  });
});

describe('createDriveQueue — an action the screen performs later', () => {
  function stashing() {
    let deferred: ((o: SurfaceActionOutcome) => void) | null = null;
    const h = harness({
      showsAfter: { cmc: 0 },
      perform: (d, onDeferred) => {
        h.log.push(`perform:${d.actionId}`);
        deferred = onDeferred;
        return { status: 'stashed' };
      },
    });
    return { ...h, deliver: (o: SurfaceActionOutcome) => deferred!(o) };
  }

  it('waits for the deferred outcome, then reports it as applied with the screen detail', async () => {
    const { deps, log, queue, deliver } = stashing();
    queue.push(act('vault.search'));
    queue.push(nav('cmc'));

    await vi.advanceTimersByTimeAsync(5_000);
    // Stashed is not done: nothing recorded, and the next move has not begun.
    expect(deps.onApplied).not.toHaveBeenCalled();
    expect(deps.onFailed).not.toHaveBeenCalled();
    expect(deps.navigate).not.toHaveBeenCalled();

    deliver({ status: 'applied', detail: 'Searched for x' });
    await vi.advanceTimersByTimeAsync(NAV_SETTLE_MS + 100);
    await queue.whenIdle();
    expect(log).toEqual([
      'perform:vault.search',
      'applied:vault.search:Searched for x',
      'navigate:cmc',
      'applied:cmc',
    ]);
    // The belt timeout firing later must not add a second, contradicting outcome.
    await vi.advanceTimersByTimeAsync(ACTION_OUTCOME_TIMEOUT_MS);
    expect(deps.onFailed).not.toHaveBeenCalled();
  });

  it('reports a deferred refusal as a failure with the screen reason, never as applied', async () => {
    const { deps, queue, deliver } = stashing();
    queue.push(act('vault.search'));
    await vi.advanceTimersByTimeAsync(100);
    deliver({ status: 'failed', reason: 'No documents match.' });
    // A late second answer from the bus is ignored — one outcome per move.
    deliver({ status: 'applied' });
    await queue.whenIdle();
    await vi.advanceTimersByTimeAsync(ACTION_OUTCOME_TIMEOUT_MS);
    expect(deps.onApplied).not.toHaveBeenCalled();
    expect(deps.onFailed).toHaveBeenCalledTimes(1);
    expect((deps.onFailed as ReturnType<typeof vi.fn>).mock.calls[0][1]).toBe('No documents match.');
  });

  it('a screen that never answers is reported unavailable after the belt timeout', async () => {
    const { deps, queue } = stashing();
    queue.push(act('vault.search'));
    await vi.advanceTimersByTimeAsync(ACTION_OUTCOME_TIMEOUT_MS - 1);
    expect(deps.onFailed).not.toHaveBeenCalled();
    // Read without whenIdle(): a queue with no belt would never go idle, and
    // a hung test says less than a failed assertion.
    await vi.advanceTimersByTimeAsync(1);
    expect(deps.onFailed).toHaveBeenCalledTimes(1);
    expect((deps.onFailed as ReturnType<typeof vi.fn>).mock.calls[0][1]).toMatch(/did not become ready/);
    expect(deps.onApplied).not.toHaveBeenCalled();
  });
});

describe('createDriveQueue — refusal and take-over', () => {
  it('refuse() short-circuits: the move is reported failed and the screen never moves', async () => {
    const { deps, queue } = harness({
      showsAfter: { cmc: 0 },
      refuse: (m) => (m.kind === 'navigate' && m.directive.targetId === 'cmc' ? 'That screen is locked.' : null),
    });
    queue.push(nav('cmc'));
    await vi.advanceTimersByTimeAsync(1_000);
    await queue.whenIdle();
    expect(deps.navigate).not.toHaveBeenCalled();
    expect(deps.onApplied).not.toHaveBeenCalled();
    expect(deps.onFailed).toHaveBeenCalledWith(expect.objectContaining({ kind: 'navigate' }), 'That screen is locked.');
  });

  it('clear() drops every move not yet started; the one in flight finishes', async () => {
    const { deps, log, queue } = harness({ showsAfter: { cmc: 200, vault: 0, projects: 0 } });
    queue.push(nav('cmc'));
    queue.push(nav('vault'));
    queue.push(act('vault.search'));
    await vi.advanceTimersByTimeAsync(50);
    queue.clear();
    await vi.advanceTimersByTimeAsync(5_000);
    await queue.whenIdle();
    expect(log).toEqual(['navigate:cmc', 'applied:cmc']);
    expect(deps.perform).not.toHaveBeenCalled();

    // A move pushed after the clear belongs to a new drive and runs.
    queue.push(nav('projects'));
    await vi.advanceTimersByTimeAsync(NAV_SETTLE_MS + 100);
    await queue.whenIdle();
    expect(log.slice(-2)).toEqual(['navigate:projects', 'applied:projects']);
  });

  it('once the person has taken over (canApply=false) no move is made at all', async () => {
    let canApply = true;
    const { deps, queue } = harness({ showsAfter: { cmc: 100, vault: 0 }, canApply: () => canApply });
    queue.push(nav('cmc'));
    queue.push(nav('vault'));
    queue.push(act('vault.search'));
    await vi.advanceTimersByTimeAsync(50);
    canApply = false;
    await vi.advanceTimersByTimeAsync(5_000);
    await queue.whenIdle();
    expect((deps.navigate as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0].targetId)).toEqual(['cmc']);
    expect(deps.perform).not.toHaveBeenCalled();
    // Skipped is not failed: nothing was attempted, so nothing is reported.
    expect(deps.onFailed).not.toHaveBeenCalled();
  });
});

describe('createDriveQueue — whenIdle', () => {
  it('resolves only after the last queued move has landed', async () => {
    const { deps, queue } = harness({ showsAfter: { cmc: 300 } });
    queue.push(act('vault.search'));
    queue.push(nav('cmc'));
    expect(queue.size()).toBe(2);

    let idle = false;
    void queue.whenIdle().then(() => {
      idle = true;
    });
    await vi.advanceTimersByTimeAsync(200);
    // The drive is still moving; releasing it now would drop the last stop.
    expect(idle).toBe(false);

    await vi.advanceTimersByTimeAsync(100 + NAV_SETTLE_MS + 50);
    expect(idle).toBe(true);
    expect(deps.onApplied).toHaveBeenCalledTimes(2);
    expect(queue.size()).toBe(0);
  });
});
