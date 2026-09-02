// @vitest-environment jsdom
/**
 * Steering a run that is already under way.
 *
 * WHAT WENT WRONG
 * The server has supported mid-run human control since run control shipped:
 * `POST /api/ana-ri/stream/:runId/control` takes pause / resume / cancel /
 * interject, the agentic loop applies it at its round-boundary checkpoint, and
 * an accepted steer is spliced into the next round AND written into the
 * decision lineage. `useAnaChat` exposes all four as `pause`, `resume`, `stop`
 * and `interject`.
 *
 * The v2 rail referenced none of them — zero occurrences of any of the four.
 * So a reviewer watching AnA work a question the wrong way could only wait for
 * her to finish. Capability existed at both ends and the wiring between them
 * was nobody's job, which is the same gap that hid the tool calls, the
 * reasoning and the answer's caveats.
 *
 * WHAT IS PINNED
 * That the controls appear only while a run is live, that each reaches the
 * hook, and — the honesty half — that the copy never promises an instant stop.
 * Control lands at a ROUND BOUNDARY, so a label saying otherwise would be the
 * interface overstating what the server does.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, fireEvent } from '@testing-library/react';

vi.mock('../dataConnect', () => ({
  connected: () => false,
}));
vi.mock('../../../utils/authToken', () => ({ getAuthHeaders: () => ({ Authorization: 'Bearer t' }) }));

import { AnaRail, type AnaMessage } from '../Shell';

afterEach(cleanup);

const surface = { id: 'cmc', label: 'CMC' };

function renderRail(over: Record<string, unknown> = {}, messages: AnaMessage[] = []) {
  const handlers = {
    onPause: vi.fn(), onResume: vi.fn(), onStop: vi.fn(), onSteer: vi.fn(),
  };
  const utils = render(
    <AnaRail
      open setOpen={() => {}} surface={surface} segment="biotech"
      mode="standard" setMode={() => {}} messages={messages}
      onSend={vi.fn()} onAct={vi.fn()} projectId={42}
      streaming runStatus="running" {...handlers} {...over}
    />,
  );
  return { ...utils, ...handlers };
}

describe('mid-run control reaches the rail', () => {
  it('offers nothing while no run is in flight', () => {
    const { container } = renderRail({ streaming: false, runStatus: null });
    expect(container.querySelector('.ana-runctl')).toBeNull();
  });

  it('pauses the run', () => {
    const { onPause } = renderRail();
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(onPause).toHaveBeenCalledTimes(1);
  });

  it('offers Resume, not Pause, once paused', () => {
    const { onResume } = renderRail({ runStatus: 'paused' });
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(onResume).toHaveBeenCalledTimes(1);
  });

  it('stops the run', () => {
    const { onStop } = renderRail();
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('sends a steer into the running turn', () => {
    const { onSteer, container } = renderRail();
    const input = screen.getByLabelText('Steer this run') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'focus on EU MDR Article 61(5)' } });
    fireEvent.submit(container.querySelector('.ana-runctl-steer') as HTMLFormElement);
    expect(onSteer).toHaveBeenCalledWith('focus on EU MDR Article 61(5)');
    // Cleared, so the same steer cannot be sent twice by a stray Enter.
    expect(input.value).toBe('');
  });

  it('refuses to send an empty steer', () => {
    const { onSteer, container } = renderRail();
    fireEvent.submit(container.querySelector('.ana-runctl-steer') as HTMLFormElement);
    expect(onSteer).not.toHaveBeenCalled();
  });

  it('never promises an instant stop', () => {
    // Control lands at a round boundary. "Paused" alone would claim the tool in
    // flight stopped dead, which is not what the server does.
    const { container } = renderRail({ runStatus: 'paused' });
    expect(container.querySelector('.ana-runctl-state')?.textContent).toContain('after this step');
  });

  it('the steer field is separate from the composer draft', () => {
    // One buffer for both would make a half-typed sentence ambiguous: steer the
    // running turn, or start the next one?
    const { container } = renderRail();
    const steer = screen.getByLabelText('Steer this run') as HTMLInputElement;
    fireEvent.change(steer, { target: { value: 'narrow to Class III' } });
    const composer = container.querySelector('.ana-composer textarea') as HTMLTextAreaElement;
    expect(composer?.value ?? '').toBe('');
  });
});

describe('a steer AnA took is visible afterwards', () => {
  it('shows the accepted steer under the answer it shaped', () => {
    renderRail({ streaming: false, runStatus: null }, [
      { role: 'ana', body: 'Under EU MDR, Article 61(5) permits…', interjections: ['focus on EU MDR'] },
    ] as AnaMessage[]);

    expect(screen.getByText(/You steered AnA/)).toBeTruthy();
    expect(screen.getByText(/focus on EU MDR/)).toBeTruthy();
  });

  it('adds no steer furniture to a turn that was never steered', () => {
    const { container } = renderRail({ streaming: false, runStatus: null }, [
      { role: 'ana', body: 'A plain answer.' },
    ] as AnaMessage[]);

    expect(container.querySelector('.ana-steers')).toBeNull();
  });
});
