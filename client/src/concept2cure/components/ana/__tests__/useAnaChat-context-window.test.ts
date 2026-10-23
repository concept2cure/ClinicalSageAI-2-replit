// @vitest-environment jsdom
/** D2/W2 context refusal through the real hook and parser. Fetch alone supplies
 * deterministic HTTP/SSE fixtures. This is UI carry/recovery qualification,
 * not a gateway/provider admission or durable turn-record storage test. */
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAnaChat } from '../useAnaChat';

const CODE = 'TOKEN_LIMIT_EXCEEDED';
const GUIDANCE = 'Some actions or source receipts from earlier steps may already exist; inspect the current state before repeating them.';
const CANONICAL = 'The request is about 51,000 tokens (≈50,000 of input plus 1,000 reserved for the answer). '
  + 'The largest context window available to it is 50,000 tokens (test/model). '
  + 'Reduce the input by about 1,000 tokens (≈5,000 characters), lower maxTokens, or split the work into smaller sections. '
  + GUIDANCE;
const FALLBACK = 'This conversation is too large for one AI request. Reduce the input or start a new conversation with a smaller selection. ' + GUIDANCE;
const GENERIC = "AnA couldn't complete this request. Try again, or ask an administrator for help if it keeps happening. Prior turns are preserved.";
const RECORD = { status: 'recorded', id: 'context-record-1', sha256: 'a'.repeat(64) } as const;
const fetchMock = vi.fn();
const frame = (event: unknown) => new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const stream = (events: unknown[]) => new Response(new ReadableStream<Uint8Array>({ start(controller) {
  events.forEach(event => controller.enqueue(frame(event)));
  controller.close();
} }));
const http = (payload: unknown, status = 413) => new Response(JSON.stringify(payload), {
  status, headers: { 'Content-Type': 'application/json' },
});
async function send(response: Response) {
  fetchMock.mockResolvedValue(response);
  const { result } = renderHook(() => useAnaChat({}));
  await act(async () => { await result.current.send('Review this selected evidence.'); });
  const turn = result.current.messages.at(-1)!;
  expect(turn.role).toBe('assistant');
  expect(result.current.isStreaming).toBe(false);
  expect(turn.streaming).toBe(false);
  expect(fetchMock.mock.calls.filter(([url]) => url === '/api/ana-ri/stream')).toHaveLength(1);
  return { result, turn };
}

describe('context refusal on an empty SSE reply', () => {
  it.each([
    { error: CANONICAL, code: CODE },
    { error: { message: CANONICAL, code: CODE } },
  ])('keeps the canonical sanitized sentence and valid server record for %j', async envelope => {
    const { turn } = await send(stream([{ type: 'run_started', runId: 'context-run-1' },
      { type: 'error', ...envelope, turnRecord: RECORD }]));
    expect.soft(turn.text).toBe(CANONICAL);
    expect.soft(turn.refusalCode).toBe(CODE);
    expect.soft(turn.turnRecord).toEqual(RECORD);
    expect.soft(turn.recordConfirming).not.toBe(true);
    expect.soft(turn.interruptedWithPartialResponse).toBe(false);
    expect.soft(turn.text).not.toMatch(/try again/i);
    // A valid error-event record prevents the existing run-record lookup from
    // being started, and there is no automatic POST resubmission.
    expect.soft(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, '', '   ', 'Failed query: select "id" from private_sources',
    'Provider failed at /home/agent/private.ts:12', 'HTTP 413: hidden proxy response'])('uses fixed safe guidance for unusable server copy %j', async error => {
    const { turn } = await send(stream([{ type: 'error', code: CODE, error }]));
    expect.soft(turn.text).toBe(FALLBACK);
    expect.soft(turn.refusalCode).toBe(CODE);
    expect.soft(turn.turnRecord).toEqual({ status: 'unconfirmed' });
    expect.soft(turn.text).not.toMatch(/private_sources|private\.ts|proxy response|try again/i);
  });

  it('retains an explicit not-recorded outcome rather than inventing a successful record', async () => {
    const record = { status: 'not_recorded', reason: 'The record could not be confirmed.' };
    const { turn } = await send(stream([{ type: 'run_started', runId: 'context-run-2' },
      { type: 'error', error: CANONICAL, code: CODE, turnRecord: record }]));
    expect.soft(turn.text).toBe(CANONICAL);
    expect.soft(turn.turnRecord).toEqual(record);
    expect.soft(turn.recordConfirming).not.toBe(true);
    expect.soft(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('context refusal beside an existing partial reply', () => {
  it('keeps the exact partial text and adds the specific recovery warning and record', async () => {
    const partial = 'Partial draft: cohort A had 12/30 responses.\n';
    const { turn } = await send(stream([{ type: 'run_started', runId: 'context-run-partial' },
      { type: 'text', content: partial }, { type: 'error', error: CANONICAL, code: CODE, turnRecord: RECORD }]));
    expect.soft(turn.text).toBe(partial);
    expect.soft(turn.warnings).toContain(CANONICAL);
    expect.soft(turn.warnings?.join('\n')).not.toMatch(/try again/i);
    expect.soft(turn.interruptedWithPartialResponse).toBe(true);
    expect.soft(turn.refusalCode).toBe(CODE);
    expect.soft(turn.turnRecord).toEqual(RECORD);
    expect.soft(turn.recordConfirming).not.toBe(true);
    expect.soft(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('uses safe fallback beside a partial response when server copy is internal', async () => {
    const { turn } = await send(stream([{ type: 'text', content: 'Retain this text.' },
      { type: 'error', code: CODE, error: 'relation "secret_context" does not exist' }]));
    expect.soft(turn.text).toBe('Retain this text.');
    expect.soft(turn.warnings).toContain(FALLBACK);
    expect.soft(turn.warnings?.join('\n')).not.toMatch(/secret_context|try again/i);
    expect.soft(turn.turnRecord).toEqual({ status: 'unconfirmed' });
  });
});

describe('pre-header context refusal over HTTP', () => {
  it.each([
    { error: CANONICAL, code: CODE, turnRecord: RECORD },
    { error: { message: CANONICAL, code: CODE, details: { turnRecord: RECORD } } },
  ])('retains sanctioned copy and the valid record from %j', async envelope => {
    const { turn } = await send(http(envelope));
    expect.soft(turn.text).toBe(CANONICAL);
    expect.soft(turn.refusalCode).toBe(CODE);
    expect.soft(turn.turnRecord).toEqual(RECORD);
    expect.soft(turn.recordConfirming).not.toBe(true);
    expect.soft(turn.interruptedWithPartialResponse).toBe(false);
    expect.soft(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retains an explicitly not-recorded nested outcome', async () => {
    const record = { status: 'not_recorded', reason: 'The record was not written.' };
    const { turn } = await send(http({ error: { code: CODE, message: CANONICAL, details: { turnRecord: record } } }));
    expect.soft(turn.text).toBe(CANONICAL);
    expect.soft(turn.turnRecord).toEqual(record);
  });

  it.each([undefined, { status: 'recorded', id: 'partial-record' },
    { status: 'recorded', id: 'bad-hash', sha256: 'not-a-hash' }, { status: 'maybe' }])('never fabricates a record from %j', async turnRecord => {
    const { turn } = await send(http({ error: { code: CODE, message: CANONICAL, details: { turnRecord } } }));
    expect.soft(turn.text).toBe(CANONICAL);
    expect.soft(turn.turnRecord).toEqual({ status: 'unconfirmed' });
    expect.soft(turn.recordConfirming).not.toBe(true);
  });

  it.each([undefined, '', 'relation "private_context" does not exist'])('uses fixed fallback for unusable HTTP message %j', async message => {
    const { turn } = await send(http({ error: { code: CODE, message, details: { turnRecord: RECORD } } }));
    expect.soft(turn.text).toBe(FALLBACK);
    expect.soft(turn.turnRecord).toEqual(RECORD);
    expect.soft(turn.text).not.toMatch(/private_context|try again/i);
  });
});

describe('existing generic, budget, access and rate recovery stays unchanged', () => {
  it.each([
    { error: CANONICAL },
    { error: CANONICAL, code: 'UNRELATED_FAILURE' },
    { error: CANONICAL, code: 'ANA_TOOL_RESULT_BUDGET_EXCEEDED', status: 422 },
  ])('does not display arbitrary or newly unapproved copy from %j', async envelope => {
    const { turn } = await send(stream([{ type: 'error', ...envelope }]));
    expect(turn.text).toBe(GENERIC);
    expect(turn.text).not.toContain('51,000');
    expect(turn.turnRecord).toEqual({ status: 'unconfirmed' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    { status: 401, envelope: { error: 'private infrastructure detail' }, expected: 'Sign in again' },
    { status: 403, envelope: { error: 'private infrastructure detail' }, expected: 'current access' },
    { status: 429, envelope: { error: 'private infrastructure detail' }, expected: 'Too many AnA requests' },
    { status: 429, envelope: { code: 'WEEKLY_LIMIT_EXCEEDED', error: 'private infrastructure detail' }, expected: 'weekly limit' },
    { status: 422, envelope: { code: 'ANA_TOOL_RESULT_BUDGET_EXCEEDED', error: CANONICAL }, expected: GENERIC },
  ])('preserves HTTP recovery at status $status for $envelope', async ({ status, envelope, expected }) => {
    const { turn } = await send(http(envelope, status));
    expect(turn.text).toContain(expected);
    expect(turn.text).not.toContain('private infrastructure detail');
    expect(turn.turnRecord).toEqual({ status: 'unconfirmed' });
  });

  it('preserves partial generic recovery rather than exposing arbitrary server copy', async () => {
    const { turn } = await send(stream([{ type: 'text', content: 'Existing partial.' },
      { type: 'error', error: CANONICAL, code: 'UNRELATED_FAILURE' }]));
    expect(turn.text).toBe('Existing partial.');
    expect(turn.warnings).toContain('Review the partial text before asking AnA to try again.');
    expect(turn.warnings).not.toContain(CANONICAL);
  });

  it('preserves the independent audit warning alongside specific context recovery', async () => {
    const { turn } = await send(http({ error: { code: CODE, message: CANONICAL, details: {
      turnRecord: RECORD, auditTrail: { persisted: false, code: 'AUDIT_ROW_NOT_PERSISTED' },
    } } }));
    expect.soft(turn.text).toBe(CANONICAL);
    expect.soft(turn.turnRecord).toEqual(RECORD);
    expect.soft(turn.warnings).toContain('The request was refused, but its audit entry could not be confirmed. Review the audit history before retrying.');
  });
});
