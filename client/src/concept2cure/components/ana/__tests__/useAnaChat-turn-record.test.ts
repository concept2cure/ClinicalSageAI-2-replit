/**
 * @vitest-environment jsdom
 *
 * Whether a turn was recorded, as the server said it, over a real stream.
 *
 * The server writes each AnA turn's retained record (21 CFR Part 11) before it
 * closes the turn, and says on `post_done` — or on `error`, for a turn that
 * failed — whether it did. The hook must carry exactly that: the id and hash
 * when recorded, the reason when not, and nothing at all when the server said
 * nothing. A malformed status is dropped, never read as recorded.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';

import { useAnaChat } from '../useAnaChat';
import { readTurnRecord } from '../anaProgress';

const ev = (o: unknown) => new TextEncoder().encode(`data: ${JSON.stringify(o)}\n\n`);
const drain = () => new Promise((r) => setTimeout(r, 25));
const SHA = 'f'.repeat(64);

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  (globalThis.fetch as any) = fetchMock;
});
afterEach(cleanup);

async function turnWith(events: unknown[]) {
  let ctl!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start(c) { ctl = c; } });
  fetchMock.mockResolvedValue({ ok: true, status: 200, body });
  const { result } = renderHook(() => useAnaChat({}));
  let sent!: Promise<unknown>;
  await act(async () => {
    sent = result.current.send('what is the primary endpoint?');
    await drain();
  });
  await act(async () => {
    for (const e of events) ctl.enqueue(ev(e));
    ctl.close();
    await sent.catch(() => undefined);
    await drain();
  });
  return [...result.current.messages].reverse().find((m) => m.role === 'assistant')!;
}

describe('the turn record status over a real stream', () => {
  it('a recorded turn carries its id and hash from post_done', async () => {
    const turn = await turnWith([
      { type: 'text', content: 'PFS.' },
      { type: 'done' },
      { type: 'post_done', cleanedResponse: 'PFS.', turnRecord: { status: 'recorded', id: 'rec-1', sha256: SHA } },
    ]);
    expect(turn.turnRecord).toEqual({ status: 'recorded', id: 'rec-1', sha256: SHA });
  });

  it('a turn that was not recorded carries the reason', async () => {
    const turn = await turnWith([
      { type: 'done' },
      { type: 'post_done', turnRecord: { status: 'not_recorded', reason: 'The record of this turn could not be written.' } },
    ]);
    expect(turn.turnRecord).toEqual({ status: 'not_recorded', reason: 'The record of this turn could not be written.' });
  });

  it('a failed turn keeps the status the error event carried', async () => {
    const turn = await turnWith([
      { type: 'text', content: 'Half an ans' },
      { type: 'error', error: 'An error occurred while generating the response', turnRecord: { status: 'recorded', id: 'rec-2', sha256: SHA } },
    ]);
    expect(turn.turnRecord).toEqual({ status: 'recorded', id: 'rec-2', sha256: SHA });
  });

  it('a server that says nothing leaves nothing on the turn', async () => {
    const turn = await turnWith([{ type: 'done' }, { type: 'post_done', cleanedResponse: 'ok' }]);
    expect(turn.turnRecord).toBeUndefined();
  });
});

describe('a turn that ended here before the server spoke for it', () => {
  /* Since AnA detach DT2 the ask is the run's own read (GET /runs/:id/events,
     §4.3): "what became of run X" has one path. It names the record, which is
     read through its Summary for the hash. */
  it('after Stop, asks the run for its record and shows what the server filed', async () => {
    let ctl!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({ start(c) { ctl = c; } });
    const lookups: string[] = [];
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).includes('/api/ana-ri/runs/run_42/events')) {
        lookups.push(String(url));
        const sealed = { recordId: 'rec-stopped', assistantMessageId: null };
        return {
          ok: true,
          status: 200,
          json: async () => ({ runId: 'run_42', status: 'cancelled', serverNow: new Date().toISOString(), events: [], controls: [], sealed, releasedAt: null }),
        };
      }
      if (String(url).includes('/api/ana-ri/turn-records/rec-stopped/summary')) {
        return { ok: true, status: 200, json: async () => ({ success: true, data: { recordSha256: SHA } }) };
      }
      if (String(url).includes('/control')) return { ok: true, status: 200, json: async () => ({ ok: true }) };
      const signal = init?.signal;
      signal?.addEventListener('abort', () => {
        const e = new Error('aborted');
        e.name = 'AbortError';
        ctl.error(e);
      });
      return { ok: true, status: 200, body };
    });
    const { result } = renderHook(() => useAnaChat({}));
    let sent!: Promise<unknown>;
    await act(async () => {
      sent = result.current.send('draft the summary');
      await drain();
    });
    await act(async () => {
      ctl.enqueue(ev({ type: 'run_started', runId: 'run_42' }));
      ctl.enqueue(ev({ type: 'text', content: 'Half' }));
      await drain();
    });
    await act(async () => {
      await result.current.stop();
      await sent.catch(() => undefined);
      await drain();
    });
    const turn = () => [...result.current.messages].reverse().find((m) => m.role === 'assistant')!;
    // Nothing is claimed while the server has not said.
    expect(turn().turnRecord).toEqual({ status: 'unconfirmed' });
    expect(turn().recordConfirming).toBe(true);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 2_150));
    });
    expect(lookups[0]).toContain('/runs/run_42/events');
    expect(turn().turnRecord).toEqual({ status: 'recorded', id: 'rec-stopped', sha256: SHA });
  });
});

describe('readTurnRecord', () => {
  it('drops anything it cannot read, and never reads it as recorded', () => {
    expect(readTurnRecord(undefined)).toBeUndefined();
    expect(readTurnRecord({ status: 'recorded', id: 'r' })).toBeUndefined();
    expect(readTurnRecord({ status: 'recorded', id: 'r', sha256: 'not-a-hash' })).toBeUndefined();
    expect(readTurnRecord({ status: 'maybe' })).toBeUndefined();
  });

  it('keeps an unexplained refusal as a refusal', () => {
    expect(readTurnRecord({ status: 'not_recorded' })).toEqual({ status: 'not_recorded', reason: 'The server did not say why.' });
  });
});

describe('readTurnRecord: the models that wrote the turn (AnA reasoning round 11)', () => {
  /* The insert of an answer into a document is refused unless every model that
     wrote it may write governed content (anaInsertGate.ts). That rule reads
     only what this keeps, so a list it cannot read whole is not kept. */
  const OPUS = { provider: 'anthropic', model: 'claude-opus-5-5', qualified: true, approvedForHighRisk: true, pq: 'pending' };
  const SONNET = { provider: 'anthropic', model: 'claude-sonnet-5', qualified: false, approvedForHighRisk: false, pq: 'pending' };
  const recorded = (servedBy: unknown) => ({ status: 'recorded', id: 'rec-1', sha256: SHA, servedBy });

  it('keeps a well-formed list, in order, and the status as before', () => {
    expect(readTurnRecord(recorded([OPUS, SONNET]))).toEqual({ status: 'recorded', id: 'rec-1', sha256: SHA, servedBy: [OPUS, SONNET] });
    // An entry the registry does not know: nulls, kept as unknown.
    const unknown = { provider: 'anthropic', model: null, qualified: false, approvedForHighRisk: null, pq: null };
    expect(readTurnRecord(recorded([unknown]))).toEqual({ status: 'recorded', id: 'rec-1', sha256: SHA, servedBy: [unknown] });
  });

  it('drops the whole list when any entry cannot be read, so it reads as unknown, never as approved', () => {
    for (const bad of [
      [{ ...OPUS, qualified: 'yes' }],
      [OPUS, { ...SONNET, approvedForHighRisk: 'no' }],
      [{ ...OPUS, pq: 'maybe' }],
      [{ ...OPUS, model: 42 }],
      [null],
      'claude-opus-5-5',
    ]) {
      const read = readTurnRecord(recorded(bad));
      expect(read, JSON.stringify(bad)).toEqual({ status: 'recorded', id: 'rec-1', sha256: SHA });
    }
  });

  it('carries the list from post_done onto the turn', async () => {
    const turn = await turnWith([
      { type: 'text', content: 'PFS.' },
      { type: 'done' },
      { type: 'post_done', cleanedResponse: 'PFS.', turnRecord: recorded([SONNET]) },
    ]);
    expect(turn.turnRecord).toEqual({ status: 'recorded', id: 'rec-1', sha256: SHA, servedBy: [SONNET] });
  });
});
