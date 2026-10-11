/**
 * @vitest-environment jsdom
 *
 * The hook's half of Manual/Auto (row 74, slice S4).
 *
 *   - The policy the person chose is SENT: `run_policy` on the request, from
 *     the hook's options or this send's own override, and absent when neither
 *     is set — so every door that sends nothing keeps today's turn.
 *   - A Manual hold is KEPT: `paused` with reason 'manual' and the next steps
 *     becomes `runHold`, which is what the strip's "Next:" and "Run this step"
 *     are drawn from; resumed and cancelled clear it; `hold_expired` ends it
 *     with the run gone.
 *   - A steer that REPLACED the held step says which step it replaced.
 *   - The turn's ending carries the policy, the steps a stop left unrun, and
 *     the run-policy stop reasons — on `done` and on a reopened thread.
 *
 * Harness: useAnaChat-stopped-reason.test.ts's — a real-timer drain and the
 * stream held open so each frame's effect is read before the next.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';

import { useAnaChat } from '../useAnaChat';

const ev = (o: unknown) => new TextEncoder().encode(`data: ${JSON.stringify(o)}\n\n`);
const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  (globalThis.fetch as any) = fetchMock;
});
afterEach(cleanup);

const drain = () => new Promise(r => setTimeout(r, 25));
const lastAssistant = (messages: any[]) => [...messages].reverse().find(m => m.role === 'assistant');
const sentBody = (call = 0) => JSON.parse(fetchMock.mock.calls[call][1].body as string);

/** Open a turn whose stream this test feeds frame by frame. */
async function openTurn(options: Parameters<typeof useAnaChat>[0] = {}, sendOpts?: Record<string, unknown>) {
  let ctl!: ReadableStreamDefaultController<Uint8Array>;
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({ start(c) { ctl = c; }, cancel() { cancelled = true; } });
  fetchMock.mockResolvedValue({ ok: true, status: 200, body });
  const hook = renderHook(() => useAnaChat(options));
  let sent!: Promise<unknown>;
  await act(async () => {
    sent = hook.result.current.send('Compare the endpoints', undefined, sendOpts as never);
    await drain();
  });
  const feed = async (...frames: unknown[]) => {
    await act(async () => {
      for (const f of frames) ctl.enqueue(ev(f));
      await drain();
    });
  };
  const close = async () => {
    await act(async () => {
      if (!cancelled) ctl.close();
      await sent;
    });
  };
  return { hook, feed, close };
}

describe('the request carries the policy the person chose', () => {
  it('sends run_policy from the options', async () => {
    const { close } = await openTurn({ runPolicy: 'manual' });
    expect(sentBody().run_policy).toBe('manual');
    await close();
  });

  it("a send's own policy wins for that turn", async () => {
    const { close } = await openTurn({ runPolicy: 'manual' }, { runPolicy: 'auto' });
    expect(sentBody().run_policy).toBe('auto');
    await close();
  });

  it('is absent when nothing chose one, so the turn is today’s', async () => {
    const { close } = await openTurn({});
    expect('run_policy' in sentBody()).toBe(false);
    await close();
  });
});

describe('a Manual hold is kept, and cleared', () => {
  it('paused with reason manual becomes runHold with the next steps; resumed clears it', async () => {
    const { hook, feed, close } = await openTurn({ runPolicy: 'manual' });
    await feed({ type: 'run_started', runId: 'run_1' });
    expect(hook.result.current.runHold).toBeNull();
    await feed({ type: 'paused', round: 2, reason: 'manual', next: ['Searching PubMed'] });
    expect(hook.result.current.runStatus).toBe('paused');
    expect(hook.result.current.runHold).toEqual({ reason: 'manual', next: ['Searching PubMed'] });
    await feed({ type: 'resumed', round: 2 });
    expect(hook.result.current.runStatus).toBe('running');
    expect(hook.result.current.runHold).toBeNull();
    await close();
  });

  it("a person's pause is a person's, with nothing next", async () => {
    const { hook, feed, close } = await openTurn({ runPolicy: 'manual' });
    await feed({ type: 'run_started', runId: 'run_1' }, { type: 'paused', round: 1 });
    expect(hook.result.current.runHold).toEqual({ reason: 'person', next: [] });
    await feed({ type: 'cancelled', round: 1 });
    expect(hook.result.current.runHold).toBeNull();
    await close();
  });

  it('hold_expired ends the run on the client too, and says what did not run', async () => {
    const { hook, feed, close } = await openTurn({ runPolicy: 'manual' });
    await feed(
      { type: 'run_started', runId: 'run_1' },
      { type: 'paused', round: 2, reason: 'manual', next: ['Searching PubMed'] },
      { type: 'hold_expired', round: 2, next: ['Searching PubMed'] },
    );
    expect(hook.result.current.runStatus).toBeNull();
    expect(hook.result.current.runHold).toEqual({ reason: 'expired', next: ['Searching PubMed'] });
    // The turn's done names the stop. The expired hold is KEPT until the
    // server finishes the turn (review follow-through, objection 24): done arrives at
    // once after hold_expired, and post-processing runs on after it, so a
    // hold cleared on done left the strip and the panel saying "Working".
    await feed({ type: 'done', stoppedReason: 'hold_expired', rounds: 1, runPolicy: 'manual', pendingSteps: ['Searching PubMed'] });
    expect(hook.result.current.runHold).toEqual({ reason: 'expired', next: ['Searching PubMed'] });
    expect(hook.result.current.runStatus).toBeNull();
    const turn = lastAssistant(hook.result.current.messages);
    expect(turn).toMatchObject({ stoppedReason: 'hold_expired', rounds: 1, runPolicy: 'manual', pendingSteps: ['Searching PubMed'] });
    await feed({ type: 'post_done' });
    expect(hook.result.current.runHold).toBeNull();
    expect(hook.result.current.isStreaming).toBe(false);
    expect(lastAssistant(hook.result.current.messages)).toMatchObject({ stoppedReason: 'hold_expired', pendingSteps: ['Searching PubMed'] });
    await close();
  });

  it('a steer that replaced the held step says which step', async () => {
    const { hook, feed, close } = await openTurn({ runPolicy: 'manual' });
    await feed(
      { type: 'run_started', runId: 'run_1' },
      { type: 'interjected', round: 2, message: 'Search EMA instead', replaced: ['Searching PubMed'] },
    );
    const turn = lastAssistant(hook.result.current.messages);
    expect(turn.interjections).toEqual(['Search EMA instead']);
    expect(turn.replacedSteps).toEqual(['Searching PubMed']);
    await close();
  });

  it('a finished turn leaves the run as it was (no stop to clear)', async () => {
    const { hook, feed, close } = await openTurn({ runPolicy: 'auto' });
    await feed({ type: 'run_started', runId: 'run_1' }, { type: 'done', stoppedReason: 'no_more_tools', rounds: 2, runPolicy: 'auto' });
    expect(hook.result.current.runStatus).toBe('running');
    expect(lastAssistant(hook.result.current.messages).runPolicy).toBe('auto');
    await close();
  });
});

describe('the run-policy stop reasons are read, now that the server produces them', () => {
  it.each(['budget_exhausted', 'approval_timeout', 'hold_expired', 'hold_unavailable'])('%s', async reason => {
    const { hook, feed, close } = await openTurn({ runPolicy: 'auto' });
    await feed({ type: 'done', stoppedReason: reason, rounds: 3, runPolicy: 'auto' });
    expect(lastAssistant(hook.result.current.messages).stoppedReason).toBe(reason);
    await close();
  });

  it('ignores an unknown policy and a malformed step list', async () => {
    const { hook, feed, close } = await openTurn({});
    await feed({ type: 'done', stoppedReason: 'hold_unavailable', runPolicy: 'turbo', pendingSteps: 'Searching' });
    const turn = lastAssistant(hook.result.current.messages);
    expect(turn.runPolicy).toBeUndefined();
    expect(turn.pendingSteps).toBeUndefined();
    await close();
  });
});

describe('a reopened thread', () => {
  it('restores the policy and the steps a stop left unrun', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        messages: [
          { role: 'user', content: 'Compare the endpoints' },
          {
            role: 'assistant',
            content: 'Partial.',
            metadata: { stoppedReason: 'hold_expired', rounds: 1, runPolicy: 'manual', pendingSteps: ['Searching PubMed'] },
          },
        ],
      }),
    });
    const { result } = renderHook(() => useAnaChat({}));
    await act(async () => {
      await result.current.loadThread('th_1');
    });
    expect(result.current.messages[1]).toMatchObject({
      stoppedReason: 'hold_expired',
      rounds: 1,
      runPolicy: 'manual',
      pendingSteps: ['Searching PubMed'],
    });
  });
});

describe('review follow-through', () => {
  it('knows the policy of the turn in flight — what it sent, not the preference now', async () => {
    const { hook, close } = await openTurn({ runPolicy: 'manual' });
    expect(hook.result.current.turnRunPolicy).toBe('manual');
    await close();
    expect(hook.result.current.turnRunPolicy).toBeNull();
  });

  it("Manual's unavailable warning is said once — by the turn's stopped note, not again in its warnings", async () => {
    const { hook, feed, close } = await openTurn({ runPolicy: 'manual' });
    await feed(
      { type: 'warning', code: 'MANUAL_UNAVAILABLE', message: 'Manual needs run control, which was not available.' },
      { type: 'warning', message: 'Response timed out' },
    );
    expect(lastAssistant(hook.result.current.messages).warnings).toEqual(['Response timed out']);
    await close();
  });

  it('a reopened thread shows the steps a steer replaced (from the stored holds)', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        messages: [
          { role: 'user', content: 'Compare the endpoints' },
          {
            role: 'assistant',
            content: 'Searched EMA instead.',
            metadata: {
              runPolicy: 'manual',
              policyHolds: [
                { round: 2, reason: 'manual', next: ['Searching PubMed'], outcome: 'redirected', at: 'x' },
                { round: 3, reason: 'manual', next: ['Reading the protocol'], outcome: 'superseded', at: 'x' },
                { round: 4, reason: 'manual', next: ['Listing screens'], outcome: 'continued', at: 'x' },
              ],
            },
          },
        ],
      }),
    });
    const { result } = renderHook(() => useAnaChat({}));
    await act(async () => {
      await result.current.loadThread('th_1');
    });
    expect(result.current.messages[1].replacedSteps).toEqual(['Searching PubMed', 'Reading the protocol']);
  });
});
