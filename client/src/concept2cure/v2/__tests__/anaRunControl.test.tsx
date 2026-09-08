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

  it('sends a steer into the running turn', async () => {
    const { onSteer, container } = renderRail();
    const input = screen.getByLabelText('Steer this run') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'focus on EU MDR Article 61(5)' } });
    fireEvent.submit(container.querySelector('.ana-runctl-steer') as HTMLFormElement);
    expect(onSteer).toHaveBeenCalledWith('focus on EU MDR Article 61(5)');
    // Clearing is a microtask later than it used to be, and deliberately so: the
    // box now empties only once the server has ACCEPTED the steer, because
    // emptying it is the only acknowledgement this control has and a refusal
    // used to be indistinguishable from a send. Hence the await.
    await act(async () => {});
    expect(input.value).toBe('');
    // The original reason for clearing — that a stray Enter cannot send the same
    // steer twice — is now carried by the in-flight guard instead, which holds
    // during the window where the text is still on screen awaiting an answer.
    expect(onSteer).toHaveBeenCalledTimes(1);
  });

  it('does not double-send while the first steer is still in flight', async () => {
    let release!: (v: boolean) => void;
    const onSteer = vi.fn(() => new Promise<boolean>((r) => { release = r; }));
    const { container } = renderRail({ onSteer });
    const input = screen.getByLabelText('Steer this run') as HTMLInputElement;
    const form = container.querySelector('.ana-runctl-steer') as HTMLFormElement;
    fireEvent.change(input, { target: { value: 'narrow to Class III' } });
    fireEvent.submit(form);
    // The text is still on screen while the server is deciding — a second Enter
    // in that window must not queue the same instruction again.
    fireEvent.submit(form);
    expect(onSteer).toHaveBeenCalledTimes(1);
    await act(async () => { release(true); });
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

/**
 * A steer the server REFUSED is not a steer that was sent.
 *
 * WHAT WENT WRONG
 * `onSteer(v); setSteer('')` cleared the box synchronously, before anything
 * knew the server's answer. `interject` does return one — `control()` answers
 * `false` on a 404 (the run is already gone), a 409, a validation refusal and
 * on a thrown fetch — but every call site discarded it (`void
 * anaChat.interject(m)` at V2App.tsx:829 and :871).
 *
 * So all four failures looked exactly like success: the sentence disappeared
 * from the input, which is the only acknowledgement this control has, and
 * nothing anywhere recorded that it had been typed. The person had steered a
 * run into nothing and had no way to know.
 *
 * WHAT IS PINNED
 * That an accepted steer still clears (the old behaviour must survive), that a
 * refused one keeps the text so it can be resent without retyping, and that the
 * refusal is stated rather than left to be inferred from a box that did not
 * empty. A handler that reports nothing is treated as accepted — the
 * pre-existing contract — because telling someone their steer failed on no
 * evidence is its own fabrication.
 */
describe('a steer the server refused says so, and keeps the text', () => {
  const submit = (v: string) => {
    const input = screen.getByLabelText('Steer this run') as HTMLInputElement;
    fireEvent.change(input, { target: { value: v } });
    fireEvent.submit(input.closest('form')!);
    return input;
  };

  it('clears the box when the server accepts', async () => {
    const input = (() => {
      renderRail({ onSteer: vi.fn().mockResolvedValue(true) });
      return submit('narrow to Class III');
    })();
    await act(async () => {});
    expect(input.value).toBe('');
    expect(screen.queryByText(/Not sent/)).toBeNull();
  });

  it('KEEPS the text and says it was not sent when the server refuses', async () => {
    renderRail({ onSteer: vi.fn().mockResolvedValue(false) });
    const input = submit('narrow to Class III');
    await act(async () => {});
    // The whole defect in one assertion: the sentence must still be there.
    expect(input.value).toBe('narrow to Class III');
    expect(screen.getByText(/Not sent — AnA did not accept this steer/)).toBeTruthy();
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  it('treats a thrown handler as a refusal, not a send', async () => {
    renderRail({ onSteer: vi.fn().mockRejectedValue(new Error('network')) });
    const input = submit('stop citing 2019');
    await act(async () => {});
    expect(input.value).toBe('stop citing 2019');
    expect(screen.getByText(/Not sent/)).toBeTruthy();
  });

  it('treats a handler that reports nothing as accepted (unchanged contract)', async () => {
    renderRail({ onSteer: vi.fn() });
    const input = submit('shorter');
    await act(async () => {});
    expect(input.value).toBe('');
    expect(screen.queryByText(/Not sent/)).toBeNull();
  });

  it('clears the refusal once the person edits the text again', async () => {
    renderRail({ onSteer: vi.fn().mockResolvedValue(false) });
    const input = submit('narrow to Class III');
    await act(async () => {});
    expect(screen.getByText(/Not sent/)).toBeTruthy();
    fireEvent.change(input, { target: { value: 'narrow to Class II' } });
    expect(screen.queryByText(/Not sent/)).toBeNull();
  });
});
