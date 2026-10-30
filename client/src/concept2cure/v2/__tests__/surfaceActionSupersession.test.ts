/**
 * The existing bus must not replay an older choice after a newer same-action
 * choice has already applied. Controlled readiness makes this interleaving
 * deterministic, without relying on when a rendered board's reads settle.
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { resolveSurfaceAction } from '@shared/navigation/surface-actions';
import {
  __resetSurfaceActionBus,
  applySurfaceAction,
  notifySurfaceActionReady,
  PENDING_ACTION_TTL_MS,
  registerSurfaceActionHandlers,
  type SurfaceActionHandler,
  type SurfaceActionOutcome,
} from '../surfaceActions';

function directive(actionId: string, params: Record<string, string>) {
  const resolved = resolveSurfaceAction(actionId, params);
  if (!resolved.ok) throw new Error(`Fixture action ${actionId}: ${resolved.error}`);
  return resolved.directive;
}

const filter = (mine: 'true' | 'false') => directive('tasking.filter', { mine });
const view = () => directive('tasking.set-view', { view: 'table' });

function heldFilter() {
  let ready = false;
  const applied: string[] = [];
  const handler: SurfaceActionHandler = ({ mine }) => {
    if (!ready) return { ok: false, reason: 'Task and project reads are pending.', retry: true };
    applied.push(mine);
    return { ok: true, detail: `mine=${mine}` };
  };
  registerSurfaceActionHandlers('tasks', { 'tasking.filter': handler });
  const old = filter('false');
  const deferred = vi.fn();
  const navigate = vi.fn();
  expect(applySurfaceAction(old, navigate, deferred)).toEqual({ status: 'stashed' });
  return { old, deferred, navigate, applied, ready: () => { ready = true; } };
}

beforeEach(() => { __resetSurfaceActionBus(); vi.useFakeTimers(); });
afterEach(() => { __resetSurfaceActionBus(); vi.useRealTimers(); });

it('keeps the newer personal selection after an older team filter finally receives readiness', () => {
  const h = heldFilter();
  expect(h.old.surfaceId).toBe('tasking'); // The actual registration is its tasks alias.
  h.ready();
  const newest = applySurfaceAction(filter('true'), h.navigate);
  expect(newest).toEqual({ status: 'applied', detail: 'mine=true' });
  expect(h.applied).toEqual(['true']);

  notifySurfaceActionReady('tasks');
  notifySurfaceActionReady('tasks');
  expect(h.applied, 'an old ready signal must not undo the newer personal scope').toEqual(['true']);
  expect(h.deferred).toHaveBeenCalledTimes(1);
  expect(h.deferred.mock.calls[0][0]).toMatchObject({ status: 'unavailable', reason: expect.stringMatching(/replaced|newer/) });
  expect(h.navigate).not.toHaveBeenCalled();
});

it('reports replacement once and clears the old retry timer after a newer immediate success', () => {
  const h = heldFilter();
  expect(vi.getTimerCount()).toBe(1);
  h.ready();
  expect(applySurfaceAction(filter('true'), h.navigate).status).toBe('applied');
  expect(vi.getTimerCount()).toBe(0);
  expect(h.deferred).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(PENDING_ACTION_TTL_MS * 2);
  notifySurfaceActionReady('tasks');
  expect(h.deferred).toHaveBeenCalledTimes(1);
  expect(h.applied).toEqual(['true']);
});

it.each(['refused', 'throws'] as const)('preserves an older filter when the newer handler %s', failure => {
  let ready = false;
  const applied: string[] = [];
  registerSurfaceActionHandlers('tasks', {
    'tasking.filter': ({ mine }) => {
      if (!ready) return { ok: false, reason: 'Loading.', retry: true };
      if (mine === 'true') {
        if (failure === 'throws') throw new Error('Filter refused.');
        return { ok: false, reason: 'Filter refused.' };
      }
      applied.push(mine);
      return { ok: true, detail: 'Original filter applied.' };
    },
  });
  const oldDeferred = vi.fn();
  expect(applySurfaceAction(filter('false'), vi.fn(), oldDeferred).status).toBe('stashed');
  ready = true;
  expect(applySurfaceAction(filter('true'), vi.fn())).toEqual({ status: 'failed', reason: 'Filter refused.' });
  expect(oldDeferred).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(1);
  notifySurfaceActionReady('tasks');
  expect(applied).toEqual(['false']);
  expect(oldDeferred).toHaveBeenCalledExactlyOnceWith({ status: 'applied', detail: 'Original filter applied.' });
  expect(vi.getTimerCount()).toBe(0);
});

it('keeps an independent queued view action when a filter on that same surface applies', () => {
  let viewReady = false;
  const applied: string[] = [];
  registerSurfaceActionHandlers('tasks', {
    'tasking.set-view': () => {
      if (!viewReady) return { ok: false, reason: 'View still loading.', retry: true };
      applied.push('table');
      return { ok: true, detail: 'Table view.' };
    },
    'tasking.filter': ({ mine }) => { applied.push(mine); return { ok: true }; },
  });
  const deferred = vi.fn();
  expect(applySurfaceAction(view(), vi.fn(), deferred).status).toBe('stashed');
  expect(applySurfaceAction(filter('true'), vi.fn())).toEqual({ status: 'applied' });
  expect(deferred).not.toHaveBeenCalled();
  notifySurfaceActionReady('tasks');
  expect(deferred).not.toHaveBeenCalled();
  viewReady = true;
  notifySurfaceActionReady('tasks');
  expect(applied).toEqual(['true', 'table']);
  expect(deferred).toHaveBeenCalledExactlyOnceWith({ status: 'applied', detail: 'Table view.' });
});

it('leaves a queued action for another surface owned by that surface', () => {
  const deferred = vi.fn();
  const search = directive('vault.search', { query: 'stability' });
  expect(applySurfaceAction(search, vi.fn(), deferred).status).toBe('stashed');
  registerSurfaceActionHandlers('tasks', { 'tasking.filter': () => ({ ok: true }) });
  expect(applySurfaceAction(filter('true'), vi.fn())).toEqual({ status: 'applied' });
  notifySurfaceActionReady('tasks');
  expect(deferred).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(1);
  const searchHandler = vi.fn<SurfaceActionHandler>(() => ({ ok: true, detail: 'Vault search.' }));
  registerSurfaceActionHandlers('vault', { 'vault.search': searchHandler });
  expect(searchHandler).toHaveBeenCalledExactlyOnceWith({ query: 'stability' }, {});
  expect(deferred).toHaveBeenCalledExactlyOnceWith({ status: 'applied', detail: 'Vault search.' });
  expect(vi.getTimerCount()).toBe(0);
});

it.each([false, true])('preserves work queued inside the newer handler (reuses original directive: %s)', reuseOriginal => {
  const old = filter('false');
  const replacement = reuseOriginal ? old : filter('false');
  const oldDeferred = vi.fn();
  const replacementDeferred = vi.fn();
  const applied: string[] = [];
  let queueReplacement = false;
  let replacementReady = false;
  registerSurfaceActionHandlers('tasks', {
    'tasking.filter': ({ mine }) => {
      if (mine === 'true' && queueReplacement) {
        queueReplacement = false;
        expect(applySurfaceAction(replacement, vi.fn(), replacementDeferred).status).toBe('stashed');
        applied.push('true');
        return { ok: true, detail: 'Newer immediate selection.' };
      }
      if (!replacementReady) return { ok: false, reason: 'Queued choice still loading.', retry: true };
      applied.push(mine);
      return { ok: true, detail: 'Handler-created queued selection.' };
    },
  });
  expect(applySurfaceAction(old, vi.fn(), oldDeferred).status).toBe('stashed');
  queueReplacement = true;
  expect(applySurfaceAction(filter('true'), vi.fn())).toEqual({ status: 'applied', detail: 'Newer immediate selection.' });
  expect(oldDeferred).toHaveBeenCalledTimes(1); // Reentrant stash superseded that entry.
  expect(oldDeferred.mock.calls[0][0].status).toBe('unavailable');
  expect(replacementDeferred).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(1);
  replacementReady = true;
  notifySurfaceActionReady('tasks');
  expect(applied).toEqual(['true', 'false']);
  expect(replacementDeferred).toHaveBeenCalledExactlyOnceWith({ status: 'applied', detail: 'Handler-created queued selection.' });
  expect(vi.getTimerCount()).toBe(0);
});

it('retains the existing queued-to-queued replacement behavior', () => {
  const h = heldFilter();
  const nextDeferred = vi.fn();
  expect(applySurfaceAction(filter('true'), h.navigate, nextDeferred)).toEqual({ status: 'stashed' });
  expect(h.deferred).toHaveBeenCalledTimes(1);
  expect(h.deferred.mock.calls[0][0].status).toBe('unavailable');
  expect(nextDeferred).not.toHaveBeenCalled();
  h.ready();
  notifySurfaceActionReady('tasks');
  expect(h.applied).toEqual(['true']);
  expect(nextDeferred).toHaveBeenCalledExactlyOnceWith({ status: 'applied', detail: 'mine=true' });
  vi.advanceTimersByTime(PENDING_ACTION_TTL_MS * 2);
  expect(h.deferred).toHaveBeenCalledTimes(1);
  expect(nextDeferred).toHaveBeenCalledTimes(1);
});

it('preserves the deferred outcome when the caller retries the identical directive object', () => {
  const h = heldFilter();
  h.ready();
  expect(applySurfaceAction(h.old, h.navigate)).toEqual({ status: 'applied', detail: 'mine=false' });
  expect(h.deferred).not.toHaveBeenCalled();
  notifySurfaceActionReady('tasks');
  expect(h.deferred).toHaveBeenCalledExactlyOnceWith({ status: 'applied', detail: 'mine=false' });
  expect(vi.getTimerCount()).toBe(0);
});

it('preserves a newer action queued by the old replacement observer', () => {
  let filterReady = false;
  let viewReady = false;
  registerSurfaceActionHandlers('tasks', {
    'tasking.filter': () => filterReady ? { ok: true } : { ok: false, reason: 'Loading.', retry: true },
    'tasking.set-view': () => viewReady ? { ok: true, detail: 'Observer view.' } : { ok: false, reason: 'Loading view.', retry: true },
  });
  const observerDeferred = vi.fn();
  const oldDeferred = vi.fn((_outcome: SurfaceActionOutcome) => {
    expect(applySurfaceAction(view(), vi.fn(), observerDeferred).status).toBe('stashed');
  });
  expect(applySurfaceAction(filter('false'), vi.fn(), oldDeferred).status).toBe('stashed');
  filterReady = true;
  expect(applySurfaceAction(filter('true'), vi.fn())).toEqual({ status: 'applied' });
  expect(oldDeferred).toHaveBeenCalledTimes(1);
  expect(oldDeferred.mock.calls[0][0]).toMatchObject({ status: 'unavailable', reason: expect.stringMatching(/replaced|newer/) });
  expect(observerDeferred).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(1);
  viewReady = true;
  notifySurfaceActionReady('tasks');
  expect(observerDeferred).toHaveBeenCalledExactlyOnceWith({ status: 'applied', detail: 'Observer view.' });
  expect(oldDeferred).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it('returns the exact newer commit promise and detail while retiring its older retry', async () => {
  let ready = false;
  let release!: () => void;
  const committed = new Promise<void>(resolve => { release = resolve; });
  const awaitCommit = vi.fn(() => committed);
  const applied: string[] = [];
  registerSurfaceActionHandlers('tasks', {
    'tasking.filter': ({ mine }) => {
      if (!ready) return { ok: false, reason: 'Loading.', retry: true };
      applied.push(mine);
      return { ok: true, detail: 'My own work.' };
    },
  }, awaitCommit);
  const oldDeferred = vi.fn();
  expect(applySurfaceAction(filter('false'), vi.fn(), oldDeferred).status).toBe('stashed');
  ready = true;
  const outcome = applySurfaceAction(filter('true'), vi.fn(), undefined, { waitForCommit: true });
  expect(outcome).toEqual({ status: 'applied', detail: 'My own work.', committed });
  expect(awaitCommit).toHaveBeenCalledTimes(1);
  expect(oldDeferred).toHaveBeenCalledTimes(1);
  expect(oldDeferred.mock.calls[0][0].status).toBe('unavailable');
  expect(vi.getTimerCount()).toBe(0);
  release();
  await committed;
  notifySurfaceActionReady('tasks');
  expect(applied).toEqual(['true']);
  expect(awaitCommit).toHaveBeenCalledTimes(1);
});
