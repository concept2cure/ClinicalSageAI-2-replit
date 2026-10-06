/** A stopped demo must leave no deferred operation behind on a loading screen. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDriveQueue, NAV_SETTLE_MS } from '../driveQueue';
import {
  __resetSurfaceActionBus,
  applySurfaceAction,
  cancelPendingSurfaceAction,
  notifySurfaceActionReady,
  registerSurfaceActionHandlers,
} from '../surfaceActions';
import { resolveSurfaceAction } from '@shared/navigation/surface-actions';
import { resolveNavigation } from '@shared/navigation';

const STOP_REASON = 'The person stopped the drive.';

function harness() {
  const search = resolveSurfaceAction('vault.search', { query: 'protocol' });
  const projects = resolveNavigation('projects', {});
  if (!search.ok || !projects.ok) throw new Error('Test directives must resolve');
  const navigate = vi.fn();
  const onApplied = vi.fn();
  const onFailed = vi.fn();
  const onDropped = vi.fn();
  const queue = createDriveQueue({
    navigate,
    isShowing: () => true,
    perform: (directive, onDeferred) => applySurfaceAction(directive, navigate, onDeferred),
    cancelPending: cancelPendingSurfaceAction,
    canApply: () => true,
    onApplied,
    onFailed,
    onDropped,
    sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
  });
  const move = { kind: 'act' as const, directive: search.directive };
  return { queue, move, navigate, onApplied, onFailed, onDropped, projects: projects.directive };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  __resetSurfaceActionBus();
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('stopping a demo during a deferred screen action', () => {
  it('cancels the mount-gap action so arriving on its screen after Stop cannot execute it', async () => {
    const h = harness();
    h.queue.push(h.move);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.navigate).toHaveBeenCalledWith('vault');
    h.queue.clear(STOP_REASON);
    const handler = vi.fn(() => ({ ok: true as const }));
    registerSurfaceActionHandlers('vault', { 'vault.search': handler });
    await vi.advanceTimersByTimeAsync(0);
    expect(handler).not.toHaveBeenCalled();
    expect(h.onDropped).toHaveBeenCalledExactlyOnceWith(h.move, STOP_REASON);
    expect(h.onApplied).not.toHaveBeenCalled();
    expect(h.onFailed).not.toHaveBeenCalled();
  });

  it('cancels a loading-screen retry and starts the replacement demo without the 20-second TTL', async () => {
    const h = harness();
    let ready = false;
    const applied = vi.fn();
    registerSurfaceActionHandlers('vault', {
      'vault.search': () => {
        if (!ready) return { ok: false, reason: 'Loading documents', retry: true };
        applied();
        return { ok: true };
      },
    });
    h.queue.push(h.move);
    await vi.advanceTimersByTimeAsync(0);
    h.queue.clear(STOP_REASON);
    h.queue.push({ kind: 'navigate', directive: h.projects });
    await vi.advanceTimersByTimeAsync(NAV_SETTLE_MS + 1);
    expect(h.navigate).toHaveBeenCalledWith(h.projects);
    expect(h.onDropped).toHaveBeenCalledExactlyOnceWith(h.move, STOP_REASON);
    ready = true;
    notifySurfaceActionReady('vault');
    await vi.advanceTimersByTimeAsync(25_000);
    expect(applied).not.toHaveBeenCalled();
    expect(h.onDropped).toHaveBeenCalledTimes(1);
    expect(h.onFailed).not.toHaveBeenCalled();
    expect(h.onApplied).toHaveBeenCalledExactlyOnceWith({ kind: 'navigate', directive: h.projects });
    expect(h.queue.size()).toBe(0);
  });

  it('keeps the success of an action already applied before Stop', async () => {
    const h = harness();
    const handler = vi.fn(() => ({ ok: true as const }));
    registerSurfaceActionHandlers('vault', { 'vault.search': handler });
    h.queue.push(h.move);
    await vi.advanceTimersByTimeAsync(0);
    h.queue.clear(STOP_REASON);
    await h.queue.whenIdle();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(h.onApplied).toHaveBeenCalledExactlyOnceWith(h.move, undefined);
    expect(h.onDropped).not.toHaveBeenCalled();
    expect(h.onFailed).not.toHaveBeenCalled();
  });

  it('a stale cancellation cannot erase a different pending action the person selected', () => {
    const h = harness();
    const oldOutcome = vi.fn();
    const personOutcome = vi.fn();
    const personDirective = { ...h.move.directive, params: { query: 'their selection' } };
    applySurfaceAction(h.move.directive, h.navigate, oldOutcome);
    applySurfaceAction(personDirective, h.navigate, personOutcome);
    cancelPendingSurfaceAction(h.move.directive, STOP_REASON);
    const handler = vi.fn(() => ({ ok: true as const }));
    registerSurfaceActionHandlers('vault', { 'vault.search': handler });
    expect(handler).toHaveBeenCalledExactlyOnceWith({ query: 'their selection' }, {});
    expect(personOutcome).toHaveBeenCalledExactlyOnceWith({ status: 'applied' });
    expect(oldOutcome).toHaveBeenCalledTimes(1);
  });
});
