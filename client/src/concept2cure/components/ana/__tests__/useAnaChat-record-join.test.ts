/**
 * @vitest-environment jsdom
 *
 * A reloaded conversation finds each turn's record by its message id, and a
 * live turn keeps the Summary's timeline frames (ANA-SUMMARY S4,
 * docs/design/ANA_AGENT_WORK_VIEW_2026-10-08.md §3.4, §3.5, §5 S4 test 4).
 *
 * The history read selected no id and the hook named messages `t-<thread>-<i>`,
 * so a reloaded turn had nothing to join its record on, and lost its
 * "Recorded" row. The history now carries each message's id; one call lists
 * the conversation's records, each naming its assistant message; the hook
 * attaches each record to that message, and to no other.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup, waitFor } from '@testing-library/react';

import { useAnaChat } from '../useAnaChat';

const SHA = 'a'.repeat(64);
const OTHER_SHA = 'b'.repeat(64);
const fetchMock = vi.fn();
const ev = (o: unknown) => new TextEncoder().encode(`data: ${JSON.stringify(o)}\n\n`);

beforeEach(() => {
  fetchMock.mockReset();
  (globalThis.fetch as any) = fetchMock;
});
afterEach(cleanup);

/** The history and the record list, by URL; any other call is refused. */
function serveThread(records: Array<Record<string, unknown>>) {
  fetchMock.mockImplementation(async (url: string) => {
    if (url.startsWith('/api/chat/threads/th-1/messages')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          messages: [
            { id: 11, role: 'user', content: 'What is the shelf life?' },
            { id: 12, role: 'assistant', content: 'Twenty-four months.', metadata: { toolTrace: [] } },
            { id: 13, role: 'user', content: 'And in the EU?' },
            { id: 14, role: 'assistant', content: 'The same.', metadata: null },
          ],
        }),
      };
    }
    if (url.startsWith('/api/ana-ri/turn-records?thread_id=th-1')) {
      return { ok: true, status: 200, json: async () => ({ data: { records } }) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  });
}

describe('4. reload joins each record to its message by id', () => {
  it('keeps each message\'s server id, and attaches the record that names it', async () => {
    serveThread([{ id: 'rec-14', assistantMessageId: 14, recordSha256: OTHER_SHA }, { id: 'rec-12', assistantMessageId: 12, recordSha256: SHA }]);
    const { result } = renderHook(() => useAnaChat({}));
    await act(async () => {
      await result.current.loadThread('th-1');
    });
    await waitFor(() => expect(result.current.messages[1]?.turnRecord).toBeDefined());
    const [, first, , second] = result.current.messages;
    expect(first).toMatchObject({ serverId: 12, turnRecord: { status: 'recorded', id: 'rec-12', sha256: SHA } });
    expect(second).toMatchObject({ serverId: 14, turnRecord: { status: 'recorded', id: 'rec-14', sha256: OTHER_SHA } });
    // One call for the whole conversation's records.
    expect(fetchMock.mock.calls.filter(([u]) => String(u).includes('/api/ana-ri/turn-records')).length).toBe(1);
  });

  it('never attaches a record by position: a record naming no message here is attached to none', async () => {
    serveThread([{ id: 'rec-99', assistantMessageId: 99, recordSha256: SHA }]);
    const { result } = renderHook(() => useAnaChat({}));
    await act(async () => {
      await result.current.loadThread('th-1');
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 25));
    });
    expect(result.current.messages.map((m) => m.turnRecord)).toEqual([undefined, undefined, undefined, undefined]);
  });
});

describe('a live turn keeps its timeline frames', () => {
  it('keeps each event once, in the order the server numbered them', async () => {
    let enqueue!: (chunk: Uint8Array) => void;
    let close!: () => void;
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        enqueue = (chunk) => c.enqueue(chunk);
        close = () => c.close();
      },
    });
    fetchMock.mockResolvedValue({ ok: true, status: 200, body });
    const { result } = renderHook(() => useAnaChat({}));
    let sent!: Promise<unknown>;
    await act(async () => {
      sent = result.current.send('find the stability reports');
      await new Promise((r) => setTimeout(r, 10));
    });
    const at = new Date().toISOString();
    const note = { seq: 1, at, round: 1, kind: 'note', text: 'Looking in the Vault.' };
    const step = { seq: 2, at, round: 1, kind: 'step', phase: 'announced', step: 's1', task: null, source: 'vault', label: 'Searching the Vault', preview: 'shelf life' };
    await act(async () => {
      for (const e of [note, step, step, { seq: 3, at, round: 1, kind: 'bogus' }]) enqueue(ev({ type: 'timeline', event: e }));
      enqueue(ev({ type: 'post_done' }));
      close();
      await sent.catch(() => undefined);
    });
    const turn = [...result.current.messages].reverse().find((m) => m.role === 'assistant');
    expect(turn?.timeline).toEqual([note, step]);
  });
});
