// @vitest-environment jsdom
/** HTTP acceptance and SSE confirmation are separate channels with no shared request ID. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { MAX_INTERJECTION_CHARS } from '@shared/ana/run-control-limits';
import { useAnaChat } from '../useAnaChat';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function openStream(runId: string) {
  let controller!: { enqueue(chunk: Uint8Array): void; close(): void; error(reason: Error): void };
  let closed = false;
  const body = new ReadableStream<Uint8Array>({ start(c) { controller = c; } });
  const push = (...events: unknown[]) => {
    if (!closed) controller.enqueue(new TextEncoder().encode(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('')));
  };
  push({ type: 'run_started', runId });
  return {
    body, push,
    attach(signal?: AbortSignal | null) {
      signal?.addEventListener('abort', () => {
        if (!closed) {
          closed = true;
          controller.error(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
        }
      }, { once: true });
    },
    finish() {
      if (closed) return;
      push({ type: 'post_done', cleanedResponse: 'Finished.' });
      closed = true;
      controller.close();
    },
  };
}

const sends: Promise<void>[] = [];
beforeEach(() => { vi.useFakeTimers(); sends.length = 0; });
afterEach(async () => {
  cleanup();
  await Promise.all(sends);
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function fixture() {
  const streams: ReturnType<typeof openStream>[] = [];
  const controls: Array<ReturnType<typeof deferred<{ ok: boolean }>> & { signal: AbortSignal }> = [];
  const fetchMock = vi.fn((url: string, init?: { signal?: AbortSignal | null }) => {
    if (url.endsWith('/control')) {
      const pending = deferred<{ ok: boolean }>();
      const signal = init?.signal as AbortSignal;
      signal.addEventListener('abort', () => pending.reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })), { once: true });
      controls.push({ ...pending, signal });
      return pending.promise;
    }
    if (url.includes('/turn-records')) return Promise.resolve({ ok: false });
    const stream = openStream(`run-${streams.length + 1}`);
    stream.attach(init?.signal);
    streams.push(stream);
    return Promise.resolve({ ok: true, status: 200, body: stream.body });
  });
  vi.stubGlobal('fetch', fetchMock);
  const { result } = renderHook(() => useAnaChat({}));
  const send = async () => { await act(async () => { sends.push(result.current.send('Review the project evidence.')); }); };
  await send();
  const steer = async (message: string) => {
    let pending!: Promise<boolean>;
    await act(async () => { pending = result.current.interject(message); });
    return { pending };
  };
  const reply = async (index: number, ok: boolean, pending: Promise<boolean>) => {
    let accepted!: boolean;
    await act(async () => { controls[index].resolve({ ok }); accepted = await pending; });
    return accepted;
  };
  const echo = async (message: string, stream = streams[streams.length - 1]) => {
    await act(async () => { stream.push({ type: 'interjected', message, round: 2 }); });
  };
  return { result, controls, streams, send, steer, reply, echo };
}

describe('AnA steering receipts across HTTP and SSE ordering', () => {
  it('does not queue an already-landed steer when its SSE receipt arrives before HTTP success', async () => {
    const f = await fixture();
    const { pending } = await f.steer('Use the current protocol');
    expect(f.result.current.pendingSteers).toEqual([]);
    await f.echo('Use the current protocol');
    expect(f.result.current.messages.at(-1)?.interjections).toEqual(['Use the current protocol']);
    expect(await f.reply(0, true, pending)).toBe(true);
    expect(f.result.current.pendingSteers).toEqual([]);
  });

  it('shows accepted work waiting when HTTP succeeds first, then clears it on SSE confirmation', async () => {
    const f = await fixture();
    const { pending } = await f.steer('Review the stability results');
    expect(await f.reply(0, true, pending)).toBe(true);
    expect(f.result.current.pendingSteers).toEqual(['Review the stability results']);
    await f.echo('Review the stability results');
    expect(f.result.current.pendingSteers).toEqual([]);
  });

  it.each(['refusal', 'timeout'] as const)('never shows an unaccepted steer after a control %s', async failure => {
    const f = await fixture();
    const { pending } = await f.steer('Review the clinical summary');
    expect(f.result.current.pendingSteers).toEqual([]);
    if (failure === 'refusal') expect(await f.reply(0, false, pending)).toBe(false);
    else {
      await act(async () => { await vi.advanceTimersByTimeAsync(5000); expect(await pending).toBe(false); });
      expect(f.controls[0].signal.aborted).toBe(true);
    }
    expect(f.result.current.pendingSteers).toEqual([]);
  });

  it.each(['failure-first', 'success-first'] as const)('reconciles one duplicate receipt with success and refusal in %s order', async order => {
    const f = await fixture();
    const first = await f.steer('Use the source catalog');
    const second = await f.steer('Use the source catalog');
    await f.echo('Use the source catalog');
    if (order === 'failure-first') {
      expect(await f.reply(0, false, first.pending)).toBe(false);
      expect(await f.reply(1, true, second.pending)).toBe(true);
    } else {
      expect(await f.reply(1, true, second.pending)).toBe(true);
      expect(await f.reply(0, false, first.pending)).toBe(false);
    }
    expect(f.result.current.pendingSteers).toEqual([]);
    expect(f.result.current.messages.at(-1)?.interjections).toEqual(['Use the source catalog']);
  });

  it('keeps exactly one duplicate pending after one receipt and out-of-order HTTP successes', async () => {
    const f = await fixture();
    const first = await f.steer('Check the evidence');
    const second = await f.steer('Check the evidence');
    await f.echo('Check the evidence');
    expect(await f.reply(1, true, second.pending)).toBe(true);
    expect(f.result.current.pendingSteers).toEqual([]);
    expect(await f.reply(0, true, first.pending)).toBe(true);
    expect(f.result.current.pendingSteers).toEqual(['Check the evidence']);
    await f.echo('Check the evidence');
    expect(f.result.current.pendingSteers).toEqual([]);
  });
});

describe('AnA steering receipt eligibility and run isolation', () => {
  it('does not use an earlier same-text receipt to confirm a later submission', async () => {
    const f = await fixture();
    const first = await f.steer('Review the source');
    await f.echo('Review the source');
    const second = await f.steer('Review the source');
    expect(await f.reply(0, true, first.pending)).toBe(true);
    expect(await f.reply(1, true, second.pending)).toBe(true);
    expect(f.result.current.pendingSteers).toEqual(['Review the source']);
    await f.echo('Review the source');
    expect(f.result.current.pendingSteers).toEqual([]);
  });

  it('does not transfer a refused earlier attempt receipt to a later same-text submission', async () => {
    const f = await fixture();
    const first = await f.steer('Review the source');
    await f.echo('Review the source');
    const second = await f.steer('Review the source');
    expect(await f.reply(0, false, first.pending)).toBe(false);
    expect(await f.reply(1, true, second.pending)).toBe(true);
    expect(f.result.current.pendingSteers).toEqual(['Review the source']);
    await f.echo('Review the source');
    expect(f.result.current.pendingSteers).toEqual([]);
  });

  it('does not save an unmatched same-text echo as confirmation for a future request', async () => {
    const f = await fixture();
    await f.echo('Review the source');
    const { pending } = await f.steer('Review the source');
    expect(await f.reply(0, true, pending)).toBe(true);
    expect(f.result.current.pendingSteers).toEqual(['Review the source']);
    await f.echo('Review the source');
    expect(f.result.current.pendingSteers).toEqual([]);
  });

  it('does not consume unrelated pending work on an unmatched external echo', async () => {
    const f = await fixture();
    const { pending } = await f.steer('Review the protocol');
    expect(await f.reply(0, true, pending)).toBe(true);
    await f.echo('An instruction from another controller');
    expect(f.result.current.pendingSteers).toEqual(['Review the protocol']);
    await f.echo('Review the protocol');
    expect(f.result.current.pendingSteers).toEqual([]);
  });

  it.each(['echo-first', 'response-first'] as const)('matches whitespace and character-cap normalization in %s order', async order => {
    const f = await fixture();
    const message = `  ${'x'.repeat(MAX_INTERJECTION_CHARS + 20)}  `;
    const { pending } = await f.steer(message);
    if (order === 'response-first') {
      expect(await f.reply(0, true, pending)).toBe(true);
      expect(f.result.current.pendingSteers).toEqual([message]);
      await f.echo(message.trim().slice(0, MAX_INTERJECTION_CHARS));
    } else {
      await f.echo(message.trim().slice(0, MAX_INTERJECTION_CHARS));
      expect(await f.reply(0, true, pending)).toBe(true);
    }
    expect(f.result.current.pendingSteers).toEqual([]);
    expect(f.result.current.messages.at(-1)?.interjections).toEqual(['x'.repeat(MAX_INTERJECTION_CHARS)]);
  });

  it.each(['echo-first', 'response-first'] as const)('matches the real queue and drain cap-boundary echo in %s order', async order => {
    const f = await fixture();
    const canonicalEcho = 'a'.repeat(MAX_INTERJECTION_CHARS - 1);
    const message = `${canonicalEcho} b`;
    // The control endpoint's cap lands on the interior space. The actual
    // queue drain trims that space before emitting the interjected SSE frame.
    expect(message.trim().slice(0, MAX_INTERJECTION_CHARS)).toBe(`${canonicalEcho} `);
    const { pending } = await f.steer(message);
    if (order === 'response-first') {
      expect(await f.reply(0, true, pending)).toBe(true);
      expect(f.result.current.pendingSteers).toEqual([message]);
      await f.echo(canonicalEcho);
    } else {
      await f.echo(canonicalEcho);
      expect(await f.reply(0, true, pending)).toBe(true);
    }
    expect(f.result.current.pendingSteers).toEqual([]);
    expect(f.result.current.messages.at(-1)?.interjections).toEqual([canonicalEcho]);
  });

  it('preserves accepted-but-abandoned acknowledgment without affecting a replacement run', async () => {
    const f = await fixture();
    const old = await f.steer('Focus on the protocol');
    await f.echo('Focus on the protocol');
    await act(async () => { f.result.current.reset(); });
    await f.send();
    const next = await f.steer('Focus on the protocol');
    expect(await f.reply(1, true, next.pending)).toBe(true);
    expect(f.result.current.pendingSteers).toEqual(['Focus on the protocol']);
    expect(await f.reply(0, true, old.pending)).toBe(true);
    expect(f.result.current.pendingSteers).toEqual(['Focus on the protocol']);
    expect(f.result.current.messages.at(-1)?.interjections).toBeUndefined();
    await f.echo('Focus on the protocol');
    expect(f.result.current.pendingSteers).toEqual([]);
  });
});
