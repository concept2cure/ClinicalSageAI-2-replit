// @vitest-environment jsdom
/**
 * Surface context — what AnA can see of the screen the user is on.
 *
 * ── What this guards ─────────────────────────────────────────────────────────
 * `V2App` told AnA which surface was active and nothing about what was on it.
 * This channel carries the rest. The risk it introduces is not that context is
 * missing — it is that context is WRONG: showing AnA the previous screen's
 * program makes her confidently cite the wrong programme, which is worse than
 * her asking. So the tests that matter here are the staleness ones.
 *
 * The window is real and one render wide: on navigation the new surface has not
 * published yet and the old surface's cleanup effect has not run, so the store
 * still holds the old context while `activeSurfaceId` is already the new
 * screen. `useActiveSurfaceContext` must return null in exactly that window.
 */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';

import {
  usePublishSurfaceContext,
  useActiveSurfaceContext,
  setSurfaceContext,
  clearSurfaceContext,
  toModuleContext,
} from '../surfaceContext';

afterEach(() => { cleanup(); setSurfaceContext(null); });

function Publisher({ id, summary }: { id: string; summary: string }) {
  const ctx = React.useMemo(() => ({ summary, facts: { id } }), [summary, id]);
  usePublishSurfaceContext(id, ctx);
  return null;
}

function Reader({ active }: { active: string }) {
  const ctx = useActiveSurfaceContext(active);
  return <div data-testid="out">{ctx ? ctx.summary : 'NONE'}</div>;
}

describe('surface context reaches the shell', () => {
  it('a surface’s published context is readable for that surface', () => {
    render(<><Publisher id="mission-control" summary="Program C2C-101 at 61%." /><Reader active="mission-control" /></>);
    expect(screen.getByTestId('out').textContent).toBe('Program C2C-101 at 61%.');
  });

  it('is NOT readable for a different active surface', () => {
    // The staleness guard, stated directly: context is keyed by the surface that
    // published it, so it can never be presented as another screen's.
    render(<><Publisher id="mission-control" summary="Program C2C-101 at 61%." /><Reader active="biostat-workbench" /></>);
    expect(screen.getByTestId('out').textContent).toBe('NONE');
  });

  it('unmounting a surface clears its context', () => {
    const { rerender } = render(<><Publisher id="a" summary="from a" /><Reader active="a" /></>);
    expect(screen.getByTestId('out').textContent).toBe('from a');
    rerender(<><Reader active="a" /></>);
    expect(screen.getByTestId('out').textContent).toBe('NONE');
  });

  it('a late unmount does not wipe a newer surface’s context', () => {
    // React can run the outgoing surface's cleanup AFTER the incoming one has
    // published. Clearing unconditionally there would blank the context of the
    // screen the user is actually looking at, which is the harder bug to see
    // because it presents as AnA intermittently losing awareness.
    setSurfaceContext({ surfaceId: 'new', summary: 'newer' });
    clearSurfaceContext('old');
    render(<Reader active="new" />);
    expect(screen.getByTestId('out').textContent).toBe('newer');
  });

  it('the last publisher wins when surfaces swap', () => {
    const { rerender } = render(<><Publisher id="a" summary="from a" /><Reader active="a" /></>);
    expect(screen.getByTestId('out').textContent).toBe('from a');
    rerender(<><Publisher id="b" summary="from b" /><Reader active="b" /></>);
    expect(screen.getByTestId('out').textContent).toBe('from b');
  });

  it('a surface publishing null clears rather than sending an empty context', () => {
    function NullPublisher({ id }: { id: string }) {
      usePublishSurfaceContext(id, null);
      return null;
    }
    render(<><NullPublisher id="a" /><Reader active="a" /></>);
    expect(screen.getByTestId('out').textContent).toBe('NONE');
  });

  it('updates the reader when the publisher’s context changes', () => {
    const { rerender } = render(<><Publisher id="a" summary="first" /><Reader active="a" /></>);
    expect(screen.getByTestId('out').textContent).toBe('first');
    act(() => { rerender(<><Publisher id="a" summary="second" /><Reader active="a" /></>); });
    expect(screen.getByTestId('out').textContent).toBe('second');
  });
});

describe('toModuleContext shapes the wire payload', () => {
  it('returns null for no context, so module_context is omitted entirely', () => {
    // Not `{}`. An empty object reads to the orchestrator as "the screen is
    // empty", which is a different claim from "the screen did not tell us".
    expect(toModuleContext(null)).toBeNull();
  });

  it('carries the surface, summary, facts and actions', () => {
    expect(
      toModuleContext({
        surfaceId: 'mission-control',
        summary: 'Program C2C-101 at 61%.',
        facts: { programId: 7 },
        availableActions: ['Create a program'],
      })
    ).toEqual({
      surface: 'mission-control',
      summary: 'Program C2C-101 at 61%.',
      facts: { programId: 7 },
      available_actions: ['Create a program'],
    });
  });

  it('omits empty facts and actions rather than sending empty containers', () => {
    expect(toModuleContext({ surfaceId: 's', summary: 'x', facts: {}, availableActions: [] }))
      .toEqual({ surface: 's', summary: 'x' });
  });
});
