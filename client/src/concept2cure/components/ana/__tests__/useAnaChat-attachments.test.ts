/**
 * @vitest-environment jsdom
 *
 * The attachment handoff, asserted at the wire.
 *
 * A user could previously attach a file, watch the chip appear in the thread,
 * send the turn, and reasonably believe AnA had received that file — while the
 * request body carried no reference to it at all. The upload's server file id
 * lived only in client state, so the stream route had nothing to resolve.
 *
 * These tests pin `file_ids` onto the request body itself rather than asserting
 * on rendered chips, because the chip was never the thing that was broken.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';

import { useAnaChat, type MessageAttachment } from '../useAnaChat';

/** An SSE stream that completes immediately, so `send` settles. */
function sseStream(): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"type":"text","text":"ok"}\n\n'));
      controller.enqueue(encoder.encode('data: {"type":"done"}\n\n'));
      controller.close();
    },
  });
}

const fetchMock = vi.fn();

/** The JSON body of the most recent POST to the stream route. */
function sentBody(): any {
  const call = fetchMock.mock.calls.find(c => String(c[0]).includes('/api/ana-ri/stream'));
  if (!call) throw new Error('stream route was never called');
  return JSON.parse(call[1].body);
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, status: 200, body: sseStream() });
  (globalThis.fetch as any) = fetchMock;
});
afterEach(cleanup);

async function send(attachments?: MessageAttachment[]) {
  const { result } = renderHook(() => useAnaChat({ projectId: 'proj_12' }));
  await act(async () => {
    await result.current.send('summarize the attached protocol', attachments);
  });
}

describe('useAnaChat — attachment handoff', () => {
  it('sends the server file id of an attached upload', async () => {
    await send([{ id: 'a1', name: 'protocol.pdf', fileId: 'file_123' }]);
    expect(sentBody().file_ids).toEqual(['file_123']);
  });

  it('sends every attached file id, in order', async () => {
    await send([
      { id: 'a1', name: 'protocol.pdf', fileId: 'file_1' },
      { id: 'a2', name: 'csr.pdf', fileId: 'file_2' },
    ]);
    expect(sentBody().file_ids).toEqual(['file_1', 'file_2']);
  });

  it('omits file_ids entirely when nothing is attached', async () => {
    await send();
    expect(sentBody()).not.toHaveProperty('file_ids');
  });

  it('drops attachments that have no server file id yet', async () => {
    // An attachment still uploading has no fileId; sending `undefined` in its
    // place would make the server reject or mis-resolve the whole batch.
    await send([
      { id: 'a1', name: 'ready.pdf', fileId: 'file_1' },
      { id: 'a2', name: 'still-uploading.pdf' },
    ]);
    expect(sentBody().file_ids).toEqual(['file_1']);
  });

  it('omits file_ids when no attachment finished uploading', async () => {
    await send([{ id: 'a2', name: 'still-uploading.pdf' }]);
    expect(sentBody()).not.toHaveProperty('file_ids');
  });
});

describe('useAnaChat — pinned data-room sources', () => {
  async function sendWithSources(selectedSourceIds?: Array<number | string> | null) {
    const { result } = renderHook(() => useAnaChat({ projectId: 'proj_12', selectedSourceIds }));
    await act(async () => {
      await result.current.send('draft the clinical overview');
    });
  }

  it('sends the pinned source ids', async () => {
    await sendWithSources([12, 34]);
    expect(sentBody().source_ids).toEqual([12, 34]);
  });

  it('omits source_ids when nothing is pinned', async () => {
    await sendWithSources([]);
    expect(sentBody()).not.toHaveProperty('source_ids');

    fetchMock.mockClear();
    await sendWithSources(null);
    expect(sentBody()).not.toHaveProperty('source_ids');
  });

  it('carries pinned sources alongside a fresh attachment', async () => {
    // The two are independent ways of choosing context and must not displace
    // each other: a user can pin a stored source AND attach a new file.
    const { result } = renderHook(() =>
      useAnaChat({ projectId: 'proj_12', selectedSourceIds: [7] }),
    );
    await act(async () => {
      await result.current.send('compare these', [
        { id: 'a1', name: 'new.pdf', fileId: 'file_new' },
      ]);
    });
    expect(sentBody().source_ids).toEqual([7]);
    expect(sentBody().file_ids).toEqual(['file_new']);
  });
});
