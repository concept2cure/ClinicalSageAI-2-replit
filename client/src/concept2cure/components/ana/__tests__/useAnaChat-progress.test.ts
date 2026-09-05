/**
 * @vitest-environment jsdom
 *
 * The progress record, driven by a real event stream.
 *
 * `useAnaChat` kept one label — the latest `status` message — and replaced it
 * on every event, so the phases a turn passed through were unrecoverable the
 * moment the next one arrived. This pins that the hook now keeps them all, in
 * order, with the outcome recorded from the event that ended the turn; that
 * every tool step carries the server's duration; and that a steer is "pending"
 * exactly from the server accepting it until the `interjected` event lands.
 *
 * Same harness rules as useAnaChat-round-status.test.ts: a real timer to let
 * the reader loop drain, and state read while the stream is still open.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup, waitFor } from '@testing-library/react';

import { useAnaChat, hydrateToolTrace } from '../useAnaChat';

const ev = (o: unknown) => new TextEncoder().encode(`data: ${JSON.stringify(o)}\n\n`);
const drain = () => new Promise((r) => setTimeout(r, 25));

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  (globalThis.fetch as any) = fetchMock;
});
afterEach(cleanup);

function openStream() {
  let ctl!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start(c) { ctl = c; } });
  return { ctl, body };
}

/**
 * A fetch that honours the abort signal the way the real one does: aborting
 * rejects the in-flight `reader.read()` with an AbortError. A plain resolved
 * mock leaves the reader waiting forever, and the hook's stop path — which
 * the stopped-turn test drives — never gets to run its catch.
 */
function abortableStream(ctl: ReadableStreamDefaultController<Uint8Array>, body: ReadableStream<Uint8Array>) {
  return (_url: unknown, init?: { signal?: AbortSignal }) => {
    init?.signal?.addEventListener('abort', () => {
      try {
        ctl.error(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      } catch {
        /* already closed */
      }
    });
    return Promise.resolve({ ok: true, status: 200, body });
  };
}

/** The stream for the chat route, an accepting 2xx for the control route. */
function routed(body: ReadableStream<Uint8Array>) {
  return (url: unknown) =>
    Promise.resolve(
      String(url).includes('/control')
        ? { ok: true, status: 200, json: async () => ({ success: true }) }
        : { ok: true, status: 200, body },
    );
}

const lastAssistant = (result: { current: ReturnType<typeof useAnaChat> }) =>
  [...result.current.messages].reverse().find((m) => m.role === 'assistant')!;

describe('the progress record over a real stream', () => {
  it('keeps every phase in order, times the steps, and closes on post_done', async () => {
    const { ctl, body } = openStream();
    fetchMock.mockResolvedValue({ ok: true, status: 200, body });
    const { result } = renderHook(() => useAnaChat({ projectId: 'proj_12' }));

    let sent!: Promise<unknown>;
    await act(async () => {
      sent = result.current.send('how many patients do I need?');
      await drain();
    });

    await act(async () => {
      ctl.enqueue(ev({ type: 'run_started', runId: 'run_1' }));
      ctl.enqueue(ev({ type: 'status', phase: 'orchestrating', message: 'Planning response…' }));
      ctl.enqueue(ev({ type: 'status', phase: 'loading_context', message: 'Loading project memory…' }));
      ctl.enqueue(ev({ type: 'status', phase: 'generating', message: 'Generating response…' }));
      ctl.enqueue(ev({ type: 'status', phase: 'running_tools', message: 'Running 1 step…' }));
      ctl.enqueue(ev({ type: 'tool_use', round: 1, name: 'compute_sample_size', label: 'Sample size — biostatistics engine', input: { alpha: 0.05 } }));
      await drain();
    });

    // Mid-round: four phases, the last active, the step running with a start clock.
    let m = lastAssistant(result);
    expect(m.progress?.map((p) => [p.phase, p.status])).toEqual([
      ['orchestrating', 'done'],
      ['loading_context', 'done'],
      ['generating', 'done'],
      ['running_tools', 'active'],
    ]);
    expect(m.toolCalls?.[0].status).toBe('running');
    expect(typeof m.toolCalls?.[0].startedAt).toBe('number');
    expect(m.completedAt).toBeUndefined();

    await act(async () => {
      ctl.enqueue(ev({ type: 'tool_result', round: 1, name: 'compute_sample_size', label: 'Sample size — biostatistics engine', status: 'success', latencyMs: 812, result: '{}' }));
      ctl.enqueue(ev({ type: 'status', phase: 'reading_results', message: 'Reading the results…' }));
      ctl.enqueue(ev({ type: 'text', content: 'You need ' }));
      ctl.enqueue(ev({ type: 'text', content: '214 patients.' }));
      ctl.enqueue(ev({ type: 'done', latencyMs: 4200 }));
      await drain();
    });

    m = lastAssistant(result);
    // The server's own duration rides the step; a thousand text chunks are one phase.
    expect(m.toolCalls?.[0]).toMatchObject({ status: 'success', latencyMs: 812 });
    expect(typeof m.toolCalls?.[0].endedAt).toBe('number');
    expect(m.progress?.map((p) => p.phase)).toEqual([
      'orchestrating',
      'loading_context',
      'generating',
      'running_tools',
      'reading_results',
      'composing',
      'finalizing',
    ]);
    expect(m.progress?.[6].status).toBe('active');

    await act(async () => {
      ctl.enqueue(ev({ type: 'post_done', cleanedResponse: 'You need 214 patients.' }));
      ctl.close();
      await sent;
    });

    m = lastAssistant(result);
    expect(m.streaming).toBe(false);
    expect(typeof m.completedAt).toBe('number');
    expect(m.progress?.every((p) => p.status === 'done')).toBe(true);
  });

  it('records a stopped turn as stopped in the phase it was cut short', async () => {
    const { ctl, body } = openStream();
    fetchMock.mockImplementation(abortableStream(ctl, body));
    const { result } = renderHook(() => useAnaChat({}));

    let sent!: Promise<unknown>;
    await act(async () => {
      sent = result.current.send('sweep the dossier');
      await drain();
    });
    await act(async () => {
      ctl.enqueue(ev({ type: 'status', phase: 'running_tools', message: 'Running 3 steps…' }));
      await drain();
    });
    await act(async () => {
      result.current.stop();
      await drain();
      await sent.catch(() => undefined);
    });

    const m = lastAssistant(result);
    expect(m.stopped).toBe(true);
    expect(m.progress?.at(-1)).toMatchObject({ phase: 'running_tools', status: 'stopped' });
    expect(typeof m.completedAt).toBe('number');
  });

  it('holds a steer as pending from acceptance until the server confirms it landed', async () => {
    const { ctl, body } = openStream();
    // Keyed on the URL, not on call order: the stream and the control endpoint
    // are different routes, and an order-based mock is one stray fetch away
    // from handing the control answer to the wrong caller.
    fetchMock.mockImplementation(routed(body));
    const { result } = renderHook(() => useAnaChat({}));

    let sent!: Promise<unknown>;
    await act(async () => {
      sent = result.current.send('compare the two protocols');
      await drain();
    });
    await act(async () => {
      ctl.enqueue(ev({ type: 'run_started', runId: 'run_9' }));
      await drain();
    });
    // The control endpoint needs the run id; wait for the event to have landed.
    await waitFor(() => expect(result.current.runStatus).toBe('running'));
    expect(result.current.pendingSteers).toEqual([]);

    await act(async () => {
      const ok = await result.current.interject('Focus on the safety endpoints');
      expect(ok).toBe(true);
    });
    expect(result.current.pendingSteers).toEqual(['Focus on the safety endpoints']);

    await act(async () => {
      ctl.enqueue(ev({ type: 'interjected', round: 2, message: 'Focus on the safety endpoints' }));
      await drain();
    });
    expect(result.current.pendingSteers).toEqual([]);
    expect(lastAssistant(result).interjections).toEqual(['Focus on the safety endpoints']);

    await act(async () => {
      ctl.enqueue(ev({ type: 'done' }));
      ctl.enqueue(ev({ type: 'post_done' }));
      ctl.close();
      await sent;
    });
  });

  it('drops a steer the run never reached when the run ends', async () => {
    const { ctl, body } = openStream();
    fetchMock.mockImplementation(routed(body));
    const { result } = renderHook(() => useAnaChat({}));

    let sent!: Promise<unknown>;
    await act(async () => {
      sent = result.current.send('draft the cover letter');
      await drain();
    });
    await act(async () => {
      ctl.enqueue(ev({ type: 'run_started', runId: 'run_10' }));
      await drain();
    });
    await waitFor(() => expect(result.current.runStatus).toBe('running'));
    let ok = false;
    await act(async () => {
      ok = await result.current.interject('Shorter');
    });
    expect(ok).toBe(true);
    expect(fetchMock.mock.calls.map((c) => String(c[0]))).toContain('/api/ana-ri/stream/run_10/control');
    expect(result.current.pendingSteers).toEqual(['Shorter']);

    await act(async () => {
      ctl.enqueue(ev({ type: 'done' }));
      ctl.enqueue(ev({ type: 'post_done' }));
      ctl.close();
      await sent;
    });
    expect(result.current.pendingSteers).toEqual([]);
  });
});

describe('reopening a conversation restores the work record', () => {
  it('maps the persisted tool trace and steers back onto the turn', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        messages: [
          { role: 'user', content: 'How many patients?' },
          {
            role: 'assistant',
            content: 'You need 214 patients.',
            metadata: {
              reasoning: 'Two-arm superiority…',
              toolTrace: [
                { tool: 'compute_sample_size', label: 'Sample size — biostatistics engine', status: 'success', resultSummary: 'n=214' },
                { tool: 'search_literature', label: 'Searching the literature', status: 'error', resultSummary: 'timeout' },
                { tool: 'exotic_tool', label: 'Exotic step', status: 'not_found', resultSummary: '' },
              ],
              humanControls: [
                { action: 'pause', round: 2, at: '2026-09-01T00:00:00Z' },
                { action: 'interject', message: 'Use the FDA guidance', round: 2, at: '2026-09-01T00:00:01Z' },
              ],
            },
          },
        ],
      }),
    });
    const { result } = renderHook(() => useAnaChat({}));
    await act(async () => {
      await result.current.loadThread('thread_7');
    });
    const turn = lastAssistant(result);
    expect(turn.thinking).toBe('Two-arm superiority…');
    expect(turn.toolCalls?.map((c) => [c.name, c.status])).toEqual([
      ['compute_sample_size', 'success'],
      ['search_literature', 'error'],
      ['exotic_tool', 'error'],
    ]);
    expect(turn.toolCalls?.[1].message).toBe(
      "AnA couldn't finish searching the literature. She'll continue with what she has.",
    );
    expect(turn.toolCalls?.[2].message).toBe("This step (exotic step) isn't available here. AnA will work around it.");
    // No duration is invented for a step whose timing was never persisted.
    expect(turn.toolCalls?.[0].latencyMs).toBeUndefined();
    expect(turn.interjections).toEqual(['Use the FDA guidance']);
  });

  it('hydrates nothing from a turn that has no trace', () => {
    expect(hydrateToolTrace(undefined)).toEqual([]);
    expect(hydrateToolTrace([{ status: 'success' }])).toEqual([]);
  });
});
