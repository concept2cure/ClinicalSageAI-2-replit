/**
 * The surface-action bus — fail-closed performance of validated directives.
 *
 * The properties under test are the ones that make "AnA operates the screen"
 * safe client-side: nothing performs except through a handler the mounted
 * surface registered; validation re-resolves against the shared registry (the
 * performed directive is the registry's, never the payload's); the
 * navigate→mount gap is a one-shot, TTL-bounded stash; and every outcome is
 * honest — applied, stashed, unavailable, or failed with the reason.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  __resetSurfaceActionBus,
  applySurfaceAction,
  registerSurfaceActionHandlers,
  registeredSurfaceId,
  validateDriveAction,
  PENDING_ACTION_TTL_MS,
} from '../surfaceActions';
import { resolveSurfaceAction } from '@shared/navigation/surface-actions';

function directive(actionId = 'vault.search', params: Record<string, unknown> = { query: 'x' }) {
  const res = resolveSurfaceAction(actionId, params);
  if (!res.ok) throw new Error(`fixture action ${actionId} does not resolve`);
  return res.directive;
}

afterEach(() => {
  __resetSurfaceActionBus();
  vi.useRealTimers();
});

describe('validateDriveAction', () => {
  it('resolves through the registry — the canonical copy, not the payload', () => {
    const d = validateDriveAction({
      actionType: 'surface_action',
      actionId: 'vault.search',
      surfaceId: 'TAMPERED',
      label: 'TAMPERED',
      params: { query: 'stability' },
    });
    expect(d).not.toBeNull();
    expect(d!.surfaceId).toBe('vault');
    expect(d!.label).toBe('Search the vault');
  });

  it('drops unknown actions, malformed payloads, and enum violations', () => {
    expect(validateDriveAction({ actionType: 'surface_action', actionId: 'vault.teleport' })).toBeNull();
    expect(validateDriveAction(null)).toBeNull();
    expect(validateDriveAction({ actionId: 'vault.search' })).toBeNull();
    expect(
      validateDriveAction({
        actionType: 'surface_action',
        actionId: 'projects.set-view',
        params: { view: 'carousel' },
      }),
    ).toBeNull();
  });
});

describe('applySurfaceAction', () => {
  it('performs through the registered handler and reports the handler outcome', () => {
    const handler = vi.fn().mockReturnValue({ ok: true, detail: 'Searched' });
    registerSurfaceActionHandlers('vault', { 'vault.search': handler });
    const nav = vi.fn();
    const outcome = applySurfaceAction(directive(), nav);
    expect(outcome).toEqual({ status: 'applied', detail: 'Searched' });
    expect(handler).toHaveBeenCalledWith({ query: 'x' });
    expect(nav).not.toHaveBeenCalled();
  });

  it('reports an honest refusal from the handler, never a fabricated success', () => {
    registerSurfaceActionHandlers('vault', {
      'vault.search': () => ({ ok: false, reason: 'The vault is still loading.' }),
    });
    const outcome = applySurfaceAction(directive(), vi.fn());
    expect(outcome).toEqual({ status: 'failed', reason: 'The vault is still loading.' });
  });

  it('a throwing handler is a failure, not a crash', () => {
    registerSurfaceActionHandlers('vault', {
      'vault.search': () => {
        throw new Error('boom');
      },
    });
    expect(applySurfaceAction(directive(), vi.fn())).toEqual({ status: 'failed', reason: 'boom' });
  });

  it('a mounted surface WITHOUT the handler is unavailable — never performed "at" it', () => {
    registerSurfaceActionHandlers('vault', {});
    const outcome = applySurfaceAction(directive(), vi.fn());
    expect(outcome.status).toBe('unavailable');
  });

  it('stashes across the navigate→mount gap and performs on registration (one shot)', () => {
    const nav = vi.fn();
    const deferred = vi.fn();
    const outcome = applySurfaceAction(directive(), nav, deferred);
    expect(outcome).toEqual({ status: 'stashed' });
    expect(nav).toHaveBeenCalledWith('vault');
    // The destination mounts and registers — the stashed directive performs.
    const handler = vi.fn().mockReturnValue({ ok: true });
    registerSurfaceActionHandlers('vault', { 'vault.search': handler });
    expect(handler).toHaveBeenCalledWith({ query: 'x' });
    expect(deferred).toHaveBeenCalledWith({ status: 'applied' });
    // One shot: a re-registration does not re-perform.
    handler.mockClear();
    registerSurfaceActionHandlers('vault', { 'vault.search': handler });
    expect(handler).not.toHaveBeenCalled();
  });

  it('an expired stash is dead — nothing performs, nothing is claimed', () => {
    vi.useFakeTimers();
    const deferred = vi.fn();
    applySurfaceAction(directive(), vi.fn(), deferred);
    vi.advanceTimersByTime(PENDING_ACTION_TTL_MS + 1);
    const handler = vi.fn().mockReturnValue({ ok: true });
    registerSurfaceActionHandlers('vault', { 'vault.search': handler });
    expect(handler).not.toHaveBeenCalled();
    expect(deferred).not.toHaveBeenCalled();
  });

  it('a stash for another surface is not consumed by an unrelated registration', () => {
    const deferred = vi.fn();
    applySurfaceAction(directive(), vi.fn(), deferred);
    const other = vi.fn().mockReturnValue({ ok: true });
    registerSurfaceActionHandlers('projects', { 'projects.set-view': other });
    expect(other).not.toHaveBeenCalled();
    expect(deferred).not.toHaveBeenCalled();
  });

  it('a mounted-but-not-ready surface (retry refusal) holds the directive for the ready signal', async () => {
    const { notifySurfaceActionReady } = await import('../surfaceActions');
    let loading = true;
    registerSurfaceActionHandlers('vault', {
      'vault.search': () =>
        loading ? { ok: false, reason: 'still loading', retry: true } : { ok: true, detail: 'done' },
    });
    const deferred = vi.fn();
    // Mounted, but the handler says not-ready → stashed, no navigation.
    const nav = vi.fn();
    expect(applySurfaceAction(directive(), nav, deferred)).toEqual({ status: 'stashed' });
    expect(nav).not.toHaveBeenCalled();
    // Ready signals while still loading change nothing (held, not dropped).
    notifySurfaceActionReady('vault');
    expect(deferred).not.toHaveBeenCalled();
    // Data lands; the surface signals ready; the directive performs once.
    loading = false;
    notifySurfaceActionReady('vault');
    expect(deferred).toHaveBeenCalledTimes(1);
    expect(deferred).toHaveBeenCalledWith({ status: 'applied', detail: 'done' });
    // Consumed: another ready signal does not re-perform.
    notifySurfaceActionReady('vault');
    expect(deferred).toHaveBeenCalledTimes(1);
  });

  it('a retry-held directive still dies at the TTL — held is not forever', async () => {
    const { notifySurfaceActionReady } = await import('../surfaceActions');
    vi.useFakeTimers();
    registerSurfaceActionHandlers('vault', {
      'vault.search': () => ({ ok: false, reason: 'still loading', retry: true }),
    });
    const deferred = vi.fn();
    expect(applySurfaceAction(directive(), vi.fn(), deferred)).toEqual({ status: 'stashed' });
    vi.advanceTimersByTime(PENDING_ACTION_TTL_MS + 1);
    notifySurfaceActionReady('vault');
    expect(deferred).not.toHaveBeenCalled();
  });

  it('unregistration clears ownership so a stale unmount cannot swallow actions', () => {
    const unregister = registerSurfaceActionHandlers('vault', {
      'vault.search': () => ({ ok: true }),
    });
    expect(registeredSurfaceId()).toBe('vault');
    unregister();
    expect(registeredSurfaceId()).toBeNull();
    // A later registration owns the slot; the old unregister is a no-op.
    registerSurfaceActionHandlers('projects', {});
    unregister();
    expect(registeredSurfaceId()).toBe('projects');
  });
});
