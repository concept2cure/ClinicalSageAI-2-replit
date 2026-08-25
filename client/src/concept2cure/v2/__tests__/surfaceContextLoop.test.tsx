// @vitest-environment jsdom
/**
 * Surface context — the publish/emit feedback loop.
 *
 * ── The defect this guards ───────────────────────────────────────────────────
 * MDX UAT 2026-08-18, item A3: clicking "Tasking" in the left nav crashed the
 * surface immediately with `Maximum update depth exceeded` inside <TaskBoard>,
 * raised through `setSurfaceContext()` → `emit()` → re-render →
 * `clearSurfaceContext()`. The error boundary contained it, so the whole module
 * rendered as an error panel rather than a board.
 *
 * The mechanism is a cycle between a surface and the shell:
 *
 *   surface renders → builds a context object → publish effect runs
 *     → setSurfaceContext() → emit()
 *     → the shell re-renders (it reads through useSyncExternalStore)
 *     → the surface re-renders → builds a NEW context object → …
 *
 * Each turn manufactures the input for the next, so there is no fixed point.
 * On the task board the trigger was `const list = tasks.filter(...)` — an
 * unmemoized array, so `stats` and `anaContext` (which take `list` as a memo
 * dependency) were fresh objects every render and the publish effect never
 * saw a stable dependency.
 *
 * ── Why the test is written against the STORE, not the board ─────────────────
 * Memoizing `list` fixes the task board. It does not fix the class: 119
 * surfaces can publish, and the next one written with an inline object literal
 * reintroduces exactly this crash. The store is the one place that can refuse
 * the loop for all of them, so that is what is asserted here — a re-publish of
 * content-equal context must not notify subscribers, however the caller built
 * the object.
 *
 * The counter is the assertion. A render count alone would only prove React
 * gave up; counting EMITS proves the store stopped feeding the cycle.
 */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';

import {
  usePublishSurfaceContext,
  useActiveSurfaceContext,
  setSurfaceContext,
} from '../surfaceContext';

afterEach(() => { cleanup(); setSurfaceContext(null); });

describe('the publish channel cannot drive an unbounded render loop', () => {
  it('a content-equal re-publish does not notify the shell', () => {
    let shellRenders = 0;

    /** Stands in for a surface that rebuilds its context object every render —
     *  what TaskBoard did, and what any surface using an inline literal does. */
    function UnmemoizedPublisher({ nonce }: { nonce: number }) {
      usePublishSurfaceContext('task-board', {
        summary: '12 tasks, 7 open, 1 blocked.',
        facts: { totals: { all: 12, open: 7, blocked: 1 } },
        availableActions: ['Open a task'],
      });
      return <span data-nonce={nonce} />;
    }

    /** Stands in for V2App, the store's real subscriber. */
    function Shell() {
      useActiveSurfaceContext('task-board');
      shellRenders += 1;
      return null;
    }

    const view = render(<><Shell /><UnmemoizedPublisher nonce={0} /></>);
    const afterMount = shellRenders;

    // Re-render the surface 20 times with identical content. Before the fix
    // each one emitted, so the shell re-rendered on every single pass; the
    // real board additionally re-rendered the publisher, which is what closed
    // the cycle into React's depth limit.
    for (let i = 1; i <= 20; i += 1) {
      act(() => { view.rerender(<><Shell /><UnmemoizedPublisher nonce={i} /></>); });
    }

    // 20 parent re-renders necessarily re-render Shell 20 times. What must NOT
    // happen is the store adding renders of its own on top of them.
    expect(shellRenders).toBe(afterMount + 20);
  });

  it('a changed context still reaches the shell', () => {
    // The guard above must not be bought by making the channel deaf: the whole
    // point of the store is that a real change propagates.
    const seen: string[] = [];

    function Publisher({ open }: { open: number }) {
      usePublishSurfaceContext('task-board', { summary: `${open} open`, facts: { open } });
      return null;
    }
    function Shell() {
      const ctx = useActiveSurfaceContext('task-board');
      seen.push(ctx ? ctx.summary : 'NONE');
      return null;
    }

    const view = render(<><Shell /><Publisher open={7} /></>);
    act(() => { view.rerender(<><Shell /><Publisher open={6} /></>); });
    act(() => { view.rerender(<><Shell /><Publisher open={5} /></>); });

    expect(seen).toContain('7 open');
    expect(seen).toContain('6 open');
    expect(seen.at(-1)).toBe('5 open');
  });
});
