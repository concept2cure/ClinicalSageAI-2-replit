/**
 * Tests for the ANA real-time duplex session orchestration. The runner is
 * injected, so barge-in / cancel / completion semantics are verified without
 * sockets or a model.
 */

import { describe, it, expect } from 'vitest';

import { AnaRealtimeSession, type RunTurn, type TurnInput, type TurnResult } from '../ana-realtime';

type Ev = [string, Record<string, unknown>];

const baseInput = (turnId: string): TurnInput => ({
  turnId,
  message: 'hello',
  organizationId: 1,
  userId: 1,
});

/** A runner whose turns resolve only when the test says so. */
function deferredRunner() {
  const calls: Array<{ input: TurnInput; signal: AbortSignal; resolve: (t: TurnResult) => void; reject: (e: unknown) => void }> = [];
  const runTurn: RunTurn = (input, signal) =>
    new Promise<TurnResult>((resolve, reject) => calls.push({ input, signal, resolve, reject }));
  return { calls, runTurn };
}

describe('AnaRealtimeSession', () => {
  it('emits thinking then done for a completed turn', async () => {
    const events: Ev[] = [];
    const { calls, runTurn } = deferredRunner();
    const s = new AnaRealtimeSession((e, p) => events.push([e, p]), runTurn);

    const p = s.handleMessage(baseInput('X'));
    expect(events[0]).toEqual(['ana:thinking', { turnId: 'X' }]);
    calls[0].resolve({ text: 'hi' });
    await p;
    expect(events).toContainEqual(['ana:done', { turnId: 'X', text: 'hi' }]);
  });

  it('barges in: a new message cancels the in-flight turn and suppresses its output', async () => {
    const events: Ev[] = [];
    const { calls, runTurn } = deferredRunner();
    const s = new AnaRealtimeSession((e, p) => events.push([e, p]), runTurn);

    const pA = s.handleMessage(baseInput('A'));
    const pB = s.handleMessage(baseInput('B')); // barge-in

    expect(calls[0].signal.aborted).toBe(true); // A was aborted
    expect(events).toContainEqual(['ana:cancelled', { reason: 'superseded' }]);
    expect(s.busy).toBe(true); // B is now in flight

    calls[0].resolve({ text: 'A (stale)' }); // A finishes late
    await pA;
    expect(events.some(([e, p]) => e === 'ana:done' && p.turnId === 'A')).toBe(false);

    calls[1].resolve({ text: 'B text' });
    await pB;
    expect(events).toContainEqual(['ana:done', { turnId: 'B', text: 'B text' }]);
  });

  it('cancel interrupts the current turn and suppresses its done', async () => {
    const events: Ev[] = [];
    const { calls, runTurn } = deferredRunner();
    const s = new AnaRealtimeSession((e, p) => events.push([e, p]), runTurn);

    const p = s.handleMessage(baseInput('C'));
    s.cancel('user_cancel');
    expect(calls[0].signal.aborted).toBe(true);
    expect(events).toContainEqual(['ana:cancelled', { reason: 'user_cancel' }]);
    calls[0].resolve({ text: 'late' });
    await p;
    expect(events.some(([e]) => e === 'ana:done')).toBe(false);
    expect(s.busy).toBe(false);
  });

  it('emits ana:error when the runner throws', async () => {
    const events: Ev[] = [];
    const { calls, runTurn } = deferredRunner();
    const s = new AnaRealtimeSession((e, p) => events.push([e, p]), runTurn);

    const p = s.handleMessage(baseInput('E'));
    calls[0].reject(new Error('boom'));
    await p;
    expect(events).toContainEqual(['ana:error', { turnId: 'E', error: 'boom' }]);
  });

  it('dispose aborts silently (no client to notify)', async () => {
    const events: Ev[] = [];
    const { calls, runTurn } = deferredRunner();
    const s = new AnaRealtimeSession((e, p) => events.push([e, p]), runTurn);

    const p = s.handleMessage(baseInput('D'));
    s.dispose();
    expect(calls[0].signal.aborted).toBe(true);
    calls[0].resolve({ text: 'x' });
    await p;
    expect(events.some(([e]) => e === 'ana:done')).toBe(false);
    expect(events.some(([e]) => e === 'ana:cancelled')).toBe(false);
  });
});
