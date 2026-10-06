// @vitest-environment jsdom
/** Drive acknowledgements follow React commits or owner disposal, never just setState. */
import React, { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { resolveSurfaceAction } from '@shared/navigation/surface-actions';
import { createDriveQueue } from '../driveQueue';
import {
  __resetSurfaceActionBus,
  applySurfaceAction,
  cancelPendingSurfaceAction,
  registerSurfaceActionHandlers,
  registeredSurfaceId,
  useSurfaceActionHandlers,
} from '../surfaceActions';

function search(query: string) {
  const found = resolveSurfaceAction('vault.search', { query });
  if (!found.ok) throw new Error(found.error);
  return found.directive;
}

function driveQueue() {
  const navigate = vi.fn();
  const onApplied = vi.fn();
  const onFailed = vi.fn();
  const onDropped = vi.fn();
  const cancelPending = vi.fn(cancelPendingSurfaceAction);
  const queue = createDriveQueue({
    navigate,
    isShowing: () => true,
    perform: (d, deferred) => applySurfaceAction(d, navigate, deferred, { waitForCommit: true }),
    cancelPending,
    canApply: () => true,
    onApplied,
    onFailed,
    onDropped,
    sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
  });
  return { queue, navigate, onApplied, onFailed, onDropped, cancelPending };
}

function StatefulScreen({ initial = 'initial', onFirst, called = () => {} }: {
  initial?: string;
  onFirst?: () => void;
  called?: (query: string) => void;
}) {
  const [selected, setSelected] = useState(initial);
  useSurfaceActionHandlers('vault', {
    'vault.search': ({ query }) => {
      called(query);
      if (query === 'second' && selected !== 'first') {
        return { ok: false, reason: `Expected first selection; saw ${selected}` };
      }
      setSelected(query);
      if (query === 'first') onFirst?.();
      return { ok: true, detail: query };
    },
  });
  return <output data-testid="selected">{selected}</output>;
}

afterEach(() => { cleanup(); __resetSurfaceActionBus(); });

describe('React surface commit boundaries', () => {
  it.each([false, true])('a stashed action mounts and commits before the next action (StrictMode: %s)', async strict => {
    const h = driveQueue();
    h.queue.push({ kind: 'act', directive: search('first') });
    h.queue.push({ kind: 'act', directive: search('second') });
    await waitFor(() => expect(h.navigate).toHaveBeenCalledWith('vault'));
    const called = vi.fn();
    const host = <StatefulScreen called={called} />;
    render(strict ? <React.StrictMode>{host}</React.StrictMode> : host);
    await waitFor(() => expect(h.onApplied.mock.calls.length + h.onFailed.mock.calls.length).toBe(2));
    expect(h.onFailed).not.toHaveBeenCalled();
    expect(h.onApplied.mock.calls.map(([, detail]) => detail)).toEqual(['first', 'second']);
    expect(called.mock.calls.map(([query]) => query)).toEqual(['first', 'second']);
    expect(screen.getByTestId('selected').textContent).toBe('second');
  });

  it('an action that navigates away releases its barrier after unregistering its source', async () => {
    const h = driveQueue();
    const oldCalls = vi.fn();
    function LeavingScreen() {
      const [left, setLeft] = useState(false);
      return left ? <span>Source closed</span> : <StatefulScreen called={oldCalls} onFirst={() => setLeft(true)} />;
    }
    const view = render(<LeavingScreen />);
    act(() => {
      h.queue.push({ kind: 'act', directive: search('first') });
      h.queue.push({ kind: 'act', directive: search('second') });
    });
    await waitFor(() => expect(h.onApplied).toHaveBeenCalledTimes(1));
    expect(registeredSurfaceId()).toBeNull();
    expect(h.navigate).toHaveBeenCalledWith('vault');
    expect(oldCalls).toHaveBeenCalledExactlyOnceWith('first');
    expect(h.onFailed).not.toHaveBeenCalled();
    view.rerender(<StatefulScreen initial="first" />);
    await waitFor(() => expect(h.onApplied).toHaveBeenCalledTimes(2));
    expect(oldCalls).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('selected').textContent).toBe('second');
  });

  it('direct chip callers retain the same immediate applied outcome', () => {
    render(<StatefulScreen />);
    let outcome;
    act(() => { outcome = applySurfaceAction(search('first'), vi.fn()); });
    expect(outcome).toEqual({ status: 'applied', detail: 'first' });
    expect(screen.getByTestId('selected').textContent).toBe('first');
  });

  it('a non-React registration needs no commit barrier even when requested', () => {
    registerSurfaceActionHandlers('vault', { 'vault.search': () => ({ ok: true }) });
    expect(applySurfaceAction(search('first'), vi.fn(), undefined, { waitForCommit: true }))
      .toEqual({ status: 'applied' });
  });

  it.each([false, true])('Stop preserves an already-performed action awaiting commit (was stashed: %s)', async stashed => {
    const h = driveQueue();
    let release!: () => void;
    const committed = new Promise<void>(resolve => { release = resolve; });
    const performed = vi.fn(() => ({ ok: true as const }));
    const register = () => registerSurfaceActionHandlers('vault', { 'vault.search': performed }, () => committed);
    if (!stashed) register();
    const move = { kind: 'act' as const, directive: search('first') };
    h.queue.push(move);
    if (stashed) {
      await waitFor(() => expect(h.navigate).toHaveBeenCalledWith('vault'));
      register();
    }
    await waitFor(() => expect(performed).toHaveBeenCalledTimes(1));
    expect(h.onApplied).not.toHaveBeenCalled();
    h.queue.clear('Stopped');
    expect(h.cancelPending).not.toHaveBeenCalled();
    release();
    await h.queue.whenIdle();
    expect(h.onApplied).toHaveBeenCalledExactlyOnceWith(move, undefined);
    expect(h.onDropped).not.toHaveBeenCalled();
    expect(h.onFailed).not.toHaveBeenCalled();
  });
});
