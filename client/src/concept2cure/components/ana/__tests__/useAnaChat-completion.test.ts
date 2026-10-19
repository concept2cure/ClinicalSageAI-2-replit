// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAnaChat } from '../useAnaChat';

const frame = (event: unknown) => `data: ${JSON.stringify(event)}\n\n`;
const fetchMock = vi.fn();
function openStream(cancel = vi.fn()) {
  let controller!: { enqueue(chunk: Uint8Array): void; close(): void };
  const body = new ReadableStream<Uint8Array>({ start(c) { controller = c; }, cancel });
  return { body, cancel, push: (...events: unknown[]) => controller.enqueue(new TextEncoder().encode(events.map(frame).join(''))), close: () => controller.close() };
}
beforeEach(() => { vi.stubGlobal('fetch', fetchMock.mockReset()); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function drain() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); }); }

describe('AnA final completion releases the composer', () => {
  it('finishes without waiting for EOF and accepts the next question', async () => {
    const first = openStream();
    const next = openStream();
    fetchMock.mockResolvedValueOnce({ ok: true, body: first.body }).mockResolvedValueOnce({ ok: true, body: next.body });
    const onDriveEvent = vi.fn();
    const { result } = renderHook(() => useAnaChat({ onDriveEvent }));
    let sent!: Promise<void>;
    await act(async () => { sent = result.current.send('First question'); });
    first.push({ type: 'drive_state', enabled: true, mode: 'demo' }, { type: 'text', content: 'Draft answer' }, { type: 'done', latencyMs: 123 });
    await drain();
    expect(result.current.isStreaming).toBe(true);
    expect(result.current.messages.at(-1)?.progress?.at(-1)?.phase).toBe('finalizing');
    first.push({ type: 'warning', message: 'A source could not be loaded.' }, { type: 'post_done', cleanedResponse: 'Final answer', turnRecord: { status: 'recorded', id: 'record-1', sha256: 'f'.repeat(64) } });
    try {
      await vi.waitFor(() => expect(result.current.isStreaming).toBe(false), { timeout: 150 });
      await sent;
      expect(first.cancel).toHaveBeenCalledTimes(1);
      expect(result.current.messages.at(-1)?.warnings).toContain('A source could not be loaded.');
      expect(onDriveEvent.mock.calls.filter(([event]) => event.type === 'drive_turn_end')).toHaveLength(1);
      expect(result.current.messages.at(-1)).toMatchObject({ text: 'Final answer', latencyMs: 123, turnRecord: { status: 'recorded', id: 'record-1' } });
      await act(async () => { sent = result.current.send('Next question'); });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      if (!first.cancel.mock.calls.length) first.close();
      next.push({ type: 'post_done', cleanedResponse: 'Next answer' }); next.close();
      await act(async () => { await sent; });
    }
  });

  it('ignores late frames after completion in the same network chunk', async () => {
    const stream = openStream();
    fetchMock.mockResolvedValue({ ok: true, body: stream.body });
    const onDriveEvent = vi.fn();
    const { result } = renderHook(() => useAnaChat({ onDriveEvent }));
    let sent!: Promise<void>;
    await act(async () => { sent = result.current.send('Question'); });
    stream.push({ type: 'text', content: 'Answer' }, { type: 'post_done', cleanedResponse: 'Final answer' }, { type: 'text', content: 'late text' }, { type: 'drive_navigation', screen: 'vault' }, { type: 'error', error: 'late transport failure' });
    stream.close();
    await act(async () => { await sent; });
    expect(result.current.messages.at(-1)).toMatchObject({ text: 'Final answer', streaming: false });
    expect(result.current.messages.at(-1)?.interrupted).not.toBe(true);
    expect(onDriveEvent).not.toHaveBeenCalled();
  });

  it('does not let a stalled transport cancellation hold the completed turn open', async () => {
    const stream = openStream(vi.fn(() => new Promise<void>(() => {})));
    fetchMock.mockResolvedValue({ ok: true, body: stream.body });
    const { result } = renderHook(() => useAnaChat({}));
    let sent!: Promise<void>;
    await act(async () => { sent = result.current.send('Question'); });
    stream.push({ type: 'post_done', cleanedResponse: 'Final answer' });
    try {
      await vi.waitFor(() => expect(result.current.isStreaming).toBe(false), { timeout: 150 });
      await sent;
      expect(stream.cancel).toHaveBeenCalledTimes(1);
      expect(result.current.messages.at(-1)?.interrupted).not.toBe(true);
    } finally {
      if (!stream.cancel.mock.calls.length) stream.close();
      await act(async () => { await sent; });
    }
  });
});


describe('completed reply transport cleanup', () => {
  it('keeps a completed reply complete when cancelling the transport rejects', async () => {
    const stream = openStream(vi.fn().mockRejectedValue(new Error('transport cleanup failed')));
    fetchMock.mockResolvedValue({ ok: true, body: stream.body });
    const { result } = renderHook(() => useAnaChat({}));
    let sent!: Promise<void>;
    await act(async () => { sent = result.current.send('Question'); });
    stream.push({ type: 'post_done', cleanedResponse: 'Final answer' });
    try {
      await vi.waitFor(() => expect(result.current.isStreaming).toBe(false), { timeout: 150 });
      await sent;
      expect(stream.cancel).toHaveBeenCalledTimes(1);
      expect(result.current.messages.at(-1)?.interrupted).not.toBe(true);
    } finally {
      if (!stream.cancel.mock.calls.length) stream.close();
      await act(async () => { await sent; });
    }
  });
});

describe('input safety audit warnings reach the actual chat hook', () => {
  it.each([
    { auditTrail: { persisted: false, code: 'AUDIT_ROW_NOT_PERSISTED', message: 'SENTINEL-private-driver-text' },
      warning: 'The request was refused, but its audit entry could not be confirmed. Review the audit history before retrying.' },
    { auditTrail: { persisted: false, code: 'AUDIT_ROW_NOT_PERSISTED', unconfirmed: true },
      warning: 'The request was refused, but its audit entry could not be confirmed. Review the audit history before retrying.' },
    { auditTrail: { persisted: true, chained: false },
      warning: 'The request audit entry was stored, but is unavailable in the readable audit trail.' },
  ])('retains the enforced HTTP 400 refusal and its bounded audit warning: $warning', async ({ auditTrail, warning }) => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ success: false, error: {
      code: 'PROMPT_INJECTION_BLOCKED', message: 'Message was blocked by the input safety policy', details: { auditTrail },
    } }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
    const { result } = renderHook(() => useAnaChat({}));
    await act(async () => { await result.current.send('A synthetic policy-blocked input'); });
    expect(result.current.messages.at(-1)).toMatchObject({ refusalCode: 'PROMPT_INJECTION_BLOCKED', interrupted: true, streaming: false, warnings: [warning] });
    expect(result.current.isStreaming).toBe(false);
    expect(JSON.stringify(result.current.messages)).not.toContain('SENTINEL-private-driver-text');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps a healthy enforced refusal free of invented audit warnings', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ success: false, error: {
      code: 'PROMPT_INJECTION_BLOCKED', details: { auditTrail: { persisted: true, chained: true } },
    } }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
    const { result } = renderHook(() => useAnaChat({}));
    await act(async () => { await result.current.send('A synthetic policy-blocked input'); });
    expect(result.current.messages.at(-1)?.refusalCode).toBe('PROMPT_INJECTION_BLOCKED');
    expect(result.current.messages.at(-1)?.warnings ?? []).toEqual([]);
    expect(result.current.isStreaming).toBe(false);
  });

  it.each(['SENTINEL-untyped-receipt', { persisted: false, code: 'UNRELATED_ERROR', message: 'SENTINEL-private-reason' }])(
    'ignores an invalid audit receipt while preserving the real refusal', async auditTrail => {
      fetchMock.mockResolvedValue(new Response(JSON.stringify({ success: false, error: {
        code: 'PROMPT_INJECTION_BLOCKED', details: { auditTrail },
      } }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
      const { result } = renderHook(() => useAnaChat({}));
      await act(async () => { await result.current.send('A synthetic policy-blocked input'); });
      expect(result.current.messages.at(-1)?.refusalCode).toBe('PROMPT_INJECTION_BLOCKED');
      expect(result.current.messages.at(-1)?.warnings ?? []).toEqual([]);
      expect(JSON.stringify(result.current.messages)).not.toContain('SENTINEL');
    },
  );

  it.each([
    { code: 'AUDIT_ROW_NOT_PERSISTED',
      message: 'The input safety check completed, but its audit entry could not be confirmed. Review the audit history before retrying.',
      auditTrail: { persisted: false, code: 'AUDIT_ROW_NOT_PERSISTED',
        message: 'The 21 CFR Part 11 audit entry for this transition could not be confirmed. The action itself completed. Review the audit history before retrying. This has been logged for follow-up.' } },
    { code: 'AUDIT_ROW_NOT_RETRIEVABLE',
      message: 'The input safety audit entry was stored, but is unavailable in the readable audit trail.',
      auditTrail: { persisted: true, chained: false } },
  ])('keeps the $code notice visible with the completed reply and accepts a healthy next turn', async ({ code, message, auditTrail }) => {
    const first = openStream();
    const second = openStream();
    fetchMock.mockResolvedValueOnce({ ok: true, body: first.body }).mockResolvedValueOnce({ ok: true, body: second.body });
    const { result } = renderHook(() => useAnaChat({}));
    let sent!: Promise<void>;
    await act(async () => { sent = result.current.send('Inspect these input sources.'); });
    first.push({ type: 'warning', code, message, meta: { auditTrail } },
      { type: 'text', content: 'The source-based reply.' }, { type: 'done', latencyMs: 27 },
      { type: 'post_done', cleanedResponse: 'The final source-based reply.' });
    await act(async () => { await sent; });
    const completed = result.current.messages.at(-1);
    expect(completed).toMatchObject({ text: 'The final source-based reply.', warnings: [message], streaming: false });
    expect(completed?.interrupted).not.toBe(true);
    expect(result.current.isStreaming).toBe(false);
    expect(first.cancel).toHaveBeenCalledTimes(1);

    await act(async () => { sent = result.current.send('Ask the next question.'); });
    second.push({ type: 'text', content: 'The healthy next reply.' },
      { type: 'post_done', cleanedResponse: 'The healthy next reply.' });
    await act(async () => { await sent; });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.messages.at(-1)).toMatchObject({ text: 'The healthy next reply.', streaming: false });
    expect(result.current.messages.at(-1)?.warnings ?? []).toEqual([]);
    expect(result.current.messages.find(item => item.id === completed?.id)?.warnings).toEqual([message]);
  });

  it('renders the bounded warning message without copying receipt metadata into the conversation', async () => {
    const stream = openStream();
    fetchMock.mockResolvedValue({ ok: true, body: stream.body });
    const { result } = renderHook(() => useAnaChat({}));
    let sent!: Promise<void>;
    await act(async () => { sent = result.current.send('Question with an observed input-safety check'); });
    stream.push({ type: 'warning', code: 'AUDIT_ROW_NOT_PERSISTED',
      message: 'The input safety check completed, but its audit entry could not be confirmed. Review the audit history before retrying.',
      meta: { auditTrail: { persisted: false, code: 'AUDIT_ROW_NOT_PERSISTED' }, internal: 'SENTINEL-not-display-content' } },
      { type: 'post_done', cleanedResponse: 'The final answer is available.' });
    await act(async () => { await sent; });
    expect(result.current.messages.at(-1)?.warnings).toEqual(['The input safety check completed, but its audit entry could not be confirmed. Review the audit history before retrying.']);
    expect(JSON.stringify(result.current.messages)).not.toContain('SENTINEL-not-display-content');
    expect(result.current.isStreaming).toBe(false);
  });
});
