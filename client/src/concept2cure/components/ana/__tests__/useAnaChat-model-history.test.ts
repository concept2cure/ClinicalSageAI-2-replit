// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAnaChat } from '../useAnaChat';

function response(events: unknown[]) {
  return new Response(new ReadableStream({ start(controller) {
    controller.enqueue(new TextEncoder().encode(events.map(e => `data: ${JSON.stringify(e)}\n\n`).join('')));
    controller.close();
  } }));
}
const complete = () => response([{ type: 'text', content: 'The answer.' }, { type: 'post_done', cleanedResponse: 'The answer.' }]);
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function twoTurns(first: Response | Error) {
  const fetchMock = vi.fn().mockResolvedValue(complete());
  if (first instanceof Error) fetchMock.mockRejectedValueOnce(first);
  else fetchMock.mockResolvedValueOnce(first);
  vi.stubGlobal('fetch', fetchMock);
  const { result } = renderHook(() => useAnaChat({}));
  await act(async () => { await result.current.send('Review the protocol'); });
  const prior = result.current.messages.at(-1)!;
  await act(async () => { await result.current.send('Try the review again'); });
  return { prior, history: JSON.parse(fetchMock.mock.calls[1][1].body).conversation_history };
}

describe('follow-up model context after client failures', () => {
  it.each([401, 429, 503])('keeps HTTP %s recovery copy visible without passing it as an assistant answer', async status => {
    const { prior, history } = await twoTurns(new Response('{}', { status }));
    expect(prior.text.length).toBeGreaterThan(0);
    expect(prior.interruptedWithPartialResponse).toBe(false);
    expect(history).toEqual([{ role: 'user', content: 'Review the protocol' }]);
  });
  it('excludes a stream refusal', async () => {
    const { history } = await twoTurns(response([{ type: 'error', code: 'WEEKLY_LIMIT_EXCEEDED', error: 'Refused' }]));
    expect(history).toEqual([{ role: 'user', content: 'Review the protocol' }]);
  });
  it('excludes a connection-failure notice', async () => {
    const { history } = await twoTurns(new Error('connection failed'));
    expect(history).toEqual([{ role: 'user', content: 'Review the protocol' }]);
  });
  it('preserves actual partial reply text after a stream failure', async () => {
    const { prior, history } = await twoTurns(response([{ type: 'text', content: 'Partial protocol review' }, { type: 'error', error: 'Provider failed' }]));
    expect(prior.interruptedWithPartialResponse).toBe(true);
    expect(history).toEqual([{ role: 'user', content: 'Review the protocol' }, { role: 'assistant', content: 'Partial protocol review' }]);
  });
  it('preserves complete answers', async () => {
    const { history } = await twoTurns(complete());
    expect(history).toEqual([{ role: 'user', content: 'Review the protocol' }, { role: 'assistant', content: 'The answer.' }]);
  });
  it('applies the history cap after excluding recovery notices', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => response([{ type: 'error', error: 'Refused' }]));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useAnaChat({}));
    for (let i = 0; i < 12; i++) await act(async () => { await result.current.send(`Question ${i}`); });
    fetchMock.mockResolvedValueOnce(complete());
    await act(async () => { await result.current.send('Next question'); });
    const history = JSON.parse(fetchMock.mock.calls[12][1].body).conversation_history;
    expect(history).toEqual(Array.from({ length: 10 }, (_, i) => ({ role: 'user', content: `Question ${i + 2}` })));
  });
});
