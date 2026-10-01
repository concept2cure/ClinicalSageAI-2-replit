/**
 * @vitest-environment jsdom
 *
 * A turn the round cap cut short must not read as finished.
 *
 * WHAT WENT WRONG
 * AnA's agentic loop stops for a reason: she said she was done
 * (`no_more_tools`), she hit the round cap and the loop forced a final answer
 * (`max_rounds`), she was repeating the same step (`duplicate_thrash`), or the
 * run was stopped (`cancelled`). The server knew which, recorded it on the run
 * row, and told nobody else: the `done` frame did not carry it and this hook
 * did not read it. So a turn the cap cut short arrived as an ordinary answer,
 * and every surface that draws a turn drew it as finished.
 *
 * WHAT IS PINNED
 * That the hook keeps what the server said — and ONLY what the server can say.
 * A value outside the known set is ignored rather than stored, because every
 * surface that reads `stoppedReason` branches on it, and an unrecognised value
 * would fall through to the branch that says "Finished". The reopened thread
 * restores both fields from the message metadata, so the fact survives reload.
 *
 * The harness is the one useAnaChat-round-status.test.ts documents: a real-timer
 * drain (a microtask chain never schedules the reader loop) and the stream held
 * open at the moment of the read, so a value set by `done` is observed before
 * `post_done` can overwrite or preserve it — both instants are asserted.
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

/** A real timer: the reader loop awaits a stream fed from another task. */
const drain = () => new Promise(r => setTimeout(r, 25));

const lastAssistant = (messages: any[]) => [...messages].reverse().find(m => m.role === 'assistant');

/**
 * Drive one turn to its `done` frame and read the message there, with the
 * stream still open; then close it with `post_done` and read it again.
 */
async function turnEnding(doneFrame: Record<string, unknown>) {
  let ctl!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start(c) { ctl = c; } });
  fetchMock.mockResolvedValue({ ok: true, status: 200, body });

  const { result } = renderHook(() => useAnaChat({ projectId: 'proj_12' }));

  let sent!: Promise<unknown>;
  await act(async () => {
    sent = result.current.send('Compare every endpoint in the three protocols');
    await drain();
  });

  await act(async () => {
    ctl.enqueue(ev({ type: 'status', phase: 'generating', message: 'Generating response…' }));
    ctl.enqueue(ev({ type: 'tool_use', round: 1, name: 'search_documents', label: 'Searching your documents' }));
    ctl.enqueue(ev({ type: 'tool_result', round: 1, name: 'search_documents', label: 'Searching your documents', status: 'success', result: '{}' }));
    ctl.enqueue(ev({ type: 'text', content: 'Here is what I found so far.' }));
    ctl.enqueue(ev({ type: 'done', latencyMs: 1200, provider: 'anthropic', ...doneFrame }));
    await drain();
  });

  // Read at `done`, the stream still open.
  const atDone = { ...lastAssistant(result.current.messages) };

  await act(async () => {
    ctl.enqueue(ev({ type: 'post_done', cleanedResponse: 'Here is what I found so far.' }));
    ctl.close();
    await sent;
  });

  const settled = { ...lastAssistant(result.current.messages) };
  return { atDone, settled };
}

describe('the done frame says why the turn stopped — behavioural', () => {
  it('keeps a round-limit stop and the round count on the turn, through post_done', async () => {
    const { atDone, settled } = await turnEnding({ stoppedReason: 'max_rounds', rounds: 12, runPolicy: null });

    expect(atDone.stoppedReason).toBe('max_rounds');
    expect(atDone.rounds).toBe(12);
    // post_done closes the turn; it must not drop what done said.
    expect(settled.stoppedReason).toBe('max_rounds');
    expect(settled.rounds).toBe(12);
    // The person's Stop and a lost connection are different facts, recorded
    // elsewhere. A cap is neither, and must not borrow their flags.
    expect(settled.stopped).toBeUndefined();
    expect(settled.interrupted).toBeUndefined();
  });

  it('keeps a repeated-step stop', async () => {
    const { settled } = await turnEnding({ stoppedReason: 'duplicate_thrash', rounds: 4 });
    expect(settled.stoppedReason).toBe('duplicate_thrash');
    expect(settled.rounds).toBe(4);
  });

  it('keeps a cut-off answer — a turn that must not read "Finished"', async () => {
    const { settled } = await turnEnding({ stoppedReason: 'answer_cut_off', rounds: 1 });
    expect(settled.stoppedReason).toBe('answer_cut_off');
    expect(settled.stopped).toBeUndefined();
    expect(settled.interrupted).toBeUndefined();
  });

  it('ignores a reason it does not know, and a round count that is not a count', async () => {
    // An unknown value stored here would reach stateLineFor's final branch and
    // read "Finished". Ignoring it leaves the turn exactly as today.
    const { settled } = await turnEnding({ stoppedReason: 'ran_out_of_ideas', rounds: -3 });
    expect(settled.stoppedReason).toBeUndefined();
    expect(settled.rounds).toBeUndefined();

    const odd = await turnEnding({ stoppedReason: 42, rounds: '12' });
    expect(odd.settled.stoppedReason).toBeUndefined();
    expect(odd.settled.rounds).toBeUndefined();

    const fractional = await turnEnding({ stoppedReason: 'max_rounds', rounds: 2.5 });
    expect(fractional.settled.stoppedReason).toBe('max_rounds');
    expect(fractional.settled.rounds).toBeUndefined();
  });

  it('does not accept the reasons later slices reserve before anything produces them', async () => {
    // budget_exhausted, approval_timeout, hold_expired and hold_unavailable are
    // named in the types so later work does not reshape them. Nothing on the
    // server produces them yet and no surface has words for them, so a stray
    // one must not reach a surface that would fall through to "Finished". The
    // slice that produces each one adds it to the known set with its copy.
    for (const reserved of ['budget_exhausted', 'approval_timeout', 'hold_expired', 'hold_unavailable']) {
      const { settled } = await turnEnding({ stoppedReason: reserved, rounds: 3 });
      expect(settled.stoppedReason, reserved).toBeUndefined();
    }
  });

  it('a turn with no stop reason on done is left without one', async () => {
    const { settled } = await turnEnding({});
    expect(settled.stoppedReason).toBeUndefined();
    expect(settled.rounds).toBeUndefined();
  });
});

describe('a reopened thread', () => {
  it('restores why each turn stopped, and its rounds, from the persisted metadata', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        messages: [
          { role: 'user', content: 'Compare every endpoint' },
          { role: 'assistant', content: 'Partial comparison.', metadata: { stoppedReason: 'max_rounds', rounds: 12 } },
          { role: 'user', content: 'Why did you stop?' },
          // The server omits no_more_tools; a finished turn carries only rounds.
          { role: 'assistant', content: 'Because the limit was reached.', metadata: { rounds: 2 } },
          { role: 'assistant', content: 'Repeating.', metadata: { stoppedReason: 'duplicate_thrash', rounds: 3 } },
          { role: 'assistant', content: 'Garbled.', metadata: { stoppedReason: 'gave_up', rounds: 'many' } },
        ],
      }),
    });
    const { result } = renderHook(() => useAnaChat({}));
    await act(async () => {
      await result.current.loadThread('th_1');
    });
    const [, capped, , finished, thrash, garbled] = result.current.messages as any[];
    expect(capped.stoppedReason).toBe('max_rounds');
    expect(capped.rounds).toBe(12);
    expect(finished.stoppedReason).toBeUndefined();
    expect(finished.rounds).toBe(2);
    expect(thrash.stoppedReason).toBe('duplicate_thrash');
    expect(thrash.rounds).toBe(3);
    expect(garbled.stoppedReason).toBeUndefined();
    expect(garbled.rounds).toBeUndefined();
  });
});
