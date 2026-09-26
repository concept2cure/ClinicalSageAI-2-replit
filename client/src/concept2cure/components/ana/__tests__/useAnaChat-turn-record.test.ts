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
