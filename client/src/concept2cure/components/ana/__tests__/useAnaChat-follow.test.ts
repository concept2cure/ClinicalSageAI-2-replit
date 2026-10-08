/**
 * @vitest-environment jsdom
 *
 * Following a turn without its socket (AnA detach DT2,
 * docs/design/ANA_DETACH_2026-10-08.md §4, §5; DT2 tests 1, 2, 3, 5, 6, 7, and
 * the RUN_IN_PROGRESS / RUN_LIMIT refusals DT1 left the client unable to read).
 *
 * Every response here is what the DT1 routes answer: GET /runs?thread_id=,
 * GET /runs/:runId/events, and the stream's refusal frames. The follower reads
 * them through the hook a host uses; nothing is asserted on internals.
 *
 * Evidence: docs/evidence/ANA-SUMMARY/2026-10-08/DT2-follow/.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';

import { useAnaChat } from '../useAnaChat';
import { followPhaseLine, liveAlertLine } from '../../../v2/anaWorkModel';
import { footerState, NOT_RECORDED_LINE, summaryRows } from '../../../v2/turnSummaryRows';

const NOW = Date.parse('2026-10-08T14:10:00.000Z');
const iso = (ms: number) => new Date(ms).toISOString();
const SHA = 'a'.repeat(64);

type Res = { ok: boolean; status: number; json: () => Promise<unknown>; clone: () => Res; body?: ReadableStream<Uint8Array> };
const json = (status: number, body: unknown): Res => {
  const r: Res = { ok: status >= 200 && status < 300, status, json: async () => body, clone: () => r };
  return r;
};
type Handler = (url: string, init?: RequestInit) => Res | Promise<Res>;

/** A fetch that answers by URL, recording every call. */
function serve(routes: Array<[RegExp, Handler]>) {
  const calls: Array<{ url: string; body?: unknown }> = [];
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined });
    for (const [re, h] of routes) if (re.test(String(url))) return h(String(url), init);
    return json(404, {});
  });
  (globalThis as { fetch: unknown }).fetch = fn;
  return calls;
}

const step = (seq: number, s: string, phase: 'announced' | 'finished', label: string, extra: Record<string, unknown> = {}) => ({
  kind: 'step', seq, at: iso(NOW - 60_000 + seq * 1000), round: 1, phase, step: s, task: null, source: 'vault', label, preview: null, ...extra,
});
const task = (seq: number, t: string, change: string, title: string) => ({ kind: 'task', seq, at: iso(NOW - 60_000 + seq * 1000), round: 1, task: t, change, title });
const end = (seq: number, outcome: string, stoppedReason: string | null = null) => ({ kind: 'end', seq, at: iso(NOW - 60_000 + seq * 1000), round: 1, outcome, stoppedReason });

/** A body as GET /runs/:runId/events answers it. */
function poll(over: Record<string, unknown> = {}) {
  return {
    runId: 'run_live', threadId: 'th1', threadTitle: null, userMessageId: 501, status: 'running', stoppedReason: null,
    round: 1, runPolicy: 'manual', hold: null, plan: null, startedAt: iso(NOW - 4 * 60_000), detachedAt: null,
    unattendedStopsAt: null, lastBeatAt: iso(NOW - 5_000), releasedAt: null, serverNow: iso(NOW), highWater: 0,
    events: [], controls: [], sealed: null, approval: null, canControl: true, controlScope: 'all', ...over,
  };
}
const HISTORY = { messages: [{ id: 501, role: 'user', content: 'Find every stability report' }] };
const listed = (over: Record<string, unknown> = {}) => ({
  runs: [{ runId: 'run_live', threadId: 'th1', userMessageId: 501, status: 'running', stoppedReason: null, runPolicy: 'manual', startedAt: iso(NOW - 4 * 60_000), lastBeatAt: iso(NOW), releasedAt: null, ...over }],
  serverNow: iso(NOW),
});

/** The routes a reload of conversation th1 reads, with the run's polls answered in turn. */
function reloadServing(polls: Array<Record<string, unknown> | Error>, extra: Array<[RegExp, Handler]> = [], list = listed()) {
  let i = 0;
  return serve([
    ...extra,
    [/\/api\/chat\/threads\/th1\/messages/, () => json(200, HISTORY)],
    [/\/turn-records\?thread_id=/, () => json(200, { data: { records: [] } })],
    [/\/runs\?thread_id=th1/, () => json(200, list)],
    [/\/runs\/run_live\/events/, () => {
      const p = polls[Math.min(i++, polls.length - 1)];
      if (p instanceof Error) throw p;
      return json(200, p);
    }],
  ]);
}

const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const assistant = (ms: ReturnType<typeof useAnaChat>['messages']) => ms.find((m) => m.role === 'assistant')!;

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('following a run after a reload (fake clock)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    vi.setSystemTime(NOW);
  });

  it('1. a reloaded thread whose last question has a live run renders a followed turn after it, with the plan and the phase line', async () => {
    reloadServing([
      poll({
        events: [task(1, 't1', 'added', 'Find the reports'), task(2, 't1', 'started', 'Find the reports'), step(3, 's1', 'announced', 'Searching the vault')],
        plan: [{ title: 'Find the reports', status: 'in_progress' }, { title: 'Read them', status: 'pending' }],
        highWater: 3,
      }),
    ]);
    const { result } = renderHook(() => useAnaChat({}));
    await act(async () => { await result.current.loadThread('th1'); });
    await advance(10);

    const ms = result.current.messages;
    expect(ms.map((m) => m.role)).toEqual(['user', 'assistant']);
    const f = ms[1];
    expect(f.follow).toMatchObject({ runId: 'run_live', scope: 'all', status: 'running' });
    expect(f.timeline?.map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(f.plan).toEqual([{ title: 'Find the reports', status: 'in_progress' }, { title: 'Read them', status: 'pending' }]);
    // Following sets the run in flight here, so every control works as for a live turn.
    expect(result.current.isStreaming).toBe(true);
    expect(result.current.runStatus).toBe('running');
    expect(result.current.followScope).toBe('all');
    // The phase line: steps announced, and the run's start against the server's clock.
    expect(followPhaseLine(f, Date.now())).toBe('Working · step 1 · 4m 00s');
  });

  it('a new conversation’s first turn is rejoined the same way: by its stamped thread and question', async () => {
    reloadServing([poll({ events: [step(1, 's1', 'announced', 'Searching the vault')], highWater: 1 })]);
    const { result } = renderHook(() => useAnaChat({}));
    await act(async () => { await result.current.loadThread('th1'); });
    await advance(10);
    expect(result.current.messages.map((m) => m.id)).toEqual(['m-501', 'f-run_live']);
  });

  it('3. a sealed run hands over to its record: the stored answer takes the turn’s place, under the same id', async () => {
    const events = [step(1, 's1', 'announced', 'Searching the vault'), step(2, 's1', 'finished', 'Searched the vault', { status: 'success', ms: 1200 })];
    let historyReads = 0;
    reloadServing(
      [
        poll({ events, highWater: 2 }),
        poll({ status: 'finished', events: [end(3, 'answered')], highWater: 3, sealed: { recordId: 'rec_1', assistantMessageId: 777 }, releasedAt: iso(NOW) }),
      ],
      [
        [/\/api\/chat\/threads\/th1\/messages/, () => json(200, ++historyReads === 1 ? HISTORY : { messages: [...HISTORY.messages, { id: 777, role: 'assistant', content: 'There are three stability reports.' }] })],
        [/\/turn-records\/rec_1\/summary/, () => json(200, { data: { recordSha256: SHA, verdict: { ok: true }, events: [...events, end(3, 'answered')], controls: [], models: [] } })],
      ],
    );
    const { result } = renderHook(() => useAnaChat({}));
    await act(async () => { await result.current.loadThread('th1'); });
    await advance(10);
    expect(assistant(result.current.messages).streaming).toBe(true);
    await advance(2_000);

    const turn = assistant(result.current.messages);
    expect(turn.id).toBe('f-run_live');
    expect(turn.text).toBe('There are three stability reports.');
    expect(turn.serverId).toBe(777);
    expect(turn.turnRecord).toEqual({ status: 'recorded', id: 'rec_1', sha256: SHA });
    expect(turn.follow).toBeUndefined();
    expect(turn.timeline?.map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.runStatus).toBeNull();
  });

  it('6. a stale owner says how long it has been silent; the reader’s own network says it is retrying, and the rows stay', async () => {
    reloadServing([
      poll({ events: [step(1, 's1', 'announced', 'Searching the vault')], highWater: 1, lastBeatAt: iso(NOW - 125_000) }),
      new TypeError('Failed to fetch'),
    ]);
    const { result } = renderHook(() => useAnaChat({}));
    await act(async () => { await result.current.loadThread('th1'); });
    await advance(10);
    expect(liveAlertLine(assistant(result.current.messages), Date.now())).toBe(
      "AnA hasn't reported for 2 min. The server handling this turn may have stopped.",
    );
    // Stop is offered: the run is the one in flight here.
    expect(result.current.isStreaming).toBe(true);

    await advance(2_000);
    const turn = assistant(result.current.messages);
    expect(liveAlertLine(turn, Date.now())).toBe("Can't reach the server. Retrying.");
    expect(turn.timeline?.map((e) => e.seq)).toEqual([1]);
    expect(result.current.isStreaming).toBe(true);
  });

  it('6. the reader backs off 2, 4, 8 … s while its network fails', async () => {
    const calls = reloadServing([poll({ highWater: 0 }), new TypeError('x')]);
    const { result } = renderHook(() => useAnaChat({}));
    await act(async () => { await result.current.loadThread('th1'); });
    await advance(0);
    const reads = () => calls.filter((c) => c.url.includes('/runs/run_live/events')).length;
    expect(reads()).toBe(1);
    await advance(2_000); // the regular poll fails
    expect(reads()).toBe(2);
    await advance(1_999);
    expect(reads()).toBe(2); // backing off 2 s
    await advance(1);
    expect(reads()).toBe(3);
    await advance(3_999);
    expect(reads()).toBe(3); // then 4 s
    await advance(1);
    expect(reads()).toBe(4);
  });

  it('7. with no record: "Recording…" while the owner is still trying, then the run’s reason, its rows and "Not recorded"', async () => {
    const events = [step(1, 's1', 'announced', 'Searching the vault')];
    reloadServing(
      [
        poll({ status: 'failed', stoppedReason: 'orphaned', events, highWater: 1 }),
        poll({ status: 'failed', stoppedReason: 'orphaned', releasedAt: iso(NOW + 2_000), highWater: 1 }),
      ],
      [],
      listed({ status: 'failed', stoppedReason: 'orphaned' }),
    );
    const { result } = renderHook(() => useAnaChat({}));
    await act(async () => { await result.current.loadThread('th1'); });
    await advance(10);
    let turn = assistant(result.current.messages);
    expect(turn.streaming).toBe(false);
    expect(footerState(turn, null)).toBe('Recording…');

    await advance(2_000);
    turn = assistant(result.current.messages);
    expect(footerState(turn, null)).toBe('Not recorded');
    const rows = summaryRows(turn.timeline ?? [], [], { live: false, clientEnding: { outcome: 'stopped', reason: turn.stoppedReason ?? null }, notRecorded: true });
    expect(rows[rows.length - 1]).toMatchObject({
      kind: 'end',
      text: 'Stopped: the server handling this turn stopped responding.',
      notes: [NOT_RECORDED_LINE],
      continuable: true,
    });
  });

  it('7. …or after 30 s from its end, when the owner never releases it', async () => {
    const calls = reloadServing([poll({ status: 'cancelled', stoppedReason: 'cancelled', highWater: 0 })], [], listed({ status: 'cancelled' }));
    const { result } = renderHook(() => useAnaChat({}));
    await act(async () => { await result.current.loadThread('th1'); });
    await advance(10);
    expect(footerState(assistant(result.current.messages), null)).toBe('Recording…');
    await advance(28_000);
    expect(footerState(assistant(result.current.messages), null)).toBe('Recording…');
    await advance(2_000);
    expect(footerState(assistant(result.current.messages), null)).toBe('Not recorded');
    const reads = calls.filter((c) => c.url.includes('/runs/run_live/events')).length;
    await advance(10_000);
    expect(calls.filter((c) => c.url.includes('/runs/run_live/events')).length).toBe(reads); // stopped polling
  });

  it('a colleague’s read is refused in the server’s words, and nothing is followed', async () => {
    serve([
      [/\/api\/chat\/threads\/th1\/messages/, () => json(200, HISTORY)],
      [/\/turn-records\?thread_id=/, () => json(200, { data: { records: [] } })],
      [/\/runs\?thread_id=th1/, () => json(200, listed())],
      [/\/runs\/run_live\/events/, () => json(403, { ok: false, code: 'RUN_NOT_YOURS', error: "You don't have access to this conversation's live progress." })],
    ]);
    const { result } = renderHook(() => useAnaChat({}));
    await act(async () => { await result.current.loadThread('th1'); });
    await advance(10);
    const turn = assistant(result.current.messages);
    expect(liveAlertLine(turn, Date.now())).toBe("You don't have access to this conversation's live progress.");
    expect(result.current.isStreaming).toBe(false);
  });

  it('an admin follows with cancel scope', async () => {
    reloadServing([poll({ controlScope: 'cancel', status: 'paused' })]);
    const { result } = renderHook(() => useAnaChat({}));
    await act(async () => { await result.current.loadThread('th1'); });
    await advance(10);
    expect(result.current.followScope).toBe('cancel');
    expect(followPhaseLine(assistant(result.current.messages), Date.now())).toBe('Waiting for the person who asked.');
  });
});

/* ── Over a real stream (real clock) ─────────────────────────────────────── */

const ev = (o: unknown) => new TextEncoder().encode(`data: ${JSON.stringify(o)}\n\n`);
const drain = (ms = 25) => new Promise((r) => setTimeout(r, ms));

function streamServing(extra: Array<[RegExp, Handler]> = []) {
  let ctl!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start(c) { ctl = c; } });
  const calls = serve([
    ...extra,
    [/\/api\/ana-ri\/stream$/, (_u, init) => {
      init?.signal?.addEventListener('abort', () => {
        const e = new Error('aborted');
        e.name = 'AbortError';
        try { ctl.error(e); } catch { /* closed */ }
      });
      const r = json(200, {});
      return { ...r, body };
    }],
  ]);
  return { calls, push: (o: unknown) => ctl.enqueue(ev(o)), close: () => ctl.close() };
}

describe('the originating page (real clock)', () => {
  it('2. overlapping SSE frames and polled rows render once', async () => {
    const s = streamServing([
      [/\/runs\/run_sse\/events/, () => json(200, poll({ runId: 'run_sse', events: [step(2, 's1', 'finished', 'Searched the vault', { status: 'success' }), step(3, 's2', 'announced', 'Reading the report'), step(4, 's2', 'finished', 'Read the report', { status: 'success' })], highWater: 4 }))],
    ]);
    const { result } = renderHook(() => useAnaChat({}));
    await act(async () => {
      void result.current.send('find the reports');
      await drain();
    });
    await act(async () => {
      s.push({ type: 'run_started', runId: 'run_sse' });
      s.push({ type: 'timeline', event: step(1, 's1', 'announced', 'Searching the vault') });
      s.push({ type: 'timeline', event: step(2, 's1', 'finished', 'Searched the vault', { status: 'success' }) });
      await drain();
    });
    // The page comes back on screen: one poll from the last seq, merged.
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await drain();
    });
    const seqs = () => assistant(result.current.messages).timeline?.map((e) => e.seq);
    expect(seqs()).toEqual([1, 2, 3, 4]);
    expect(s.calls.find((c) => c.url.includes('/runs/run_sse/events'))?.url).toContain('after=2');
    // The stream then delivers the rows the poll already merged: still once each.
    await act(async () => {
      s.push({ type: 'timeline', event: step(3, 's2', 'announced', 'Reading the report') });
      s.push({ type: 'timeline', event: step(4, 's2', 'finished', 'Read the report', { status: 'success' }) });
      await drain();
    });
    expect(seqs()).toEqual([1, 2, 3, 4]);
  });

  it('5. a failed cancel on a detachable turn says "Stop not confirmed. Retrying." and does not abort; a later 200 shows Stopped', async () => {
    let cancels = 0;
    const s = streamServing([
      [/\/control$/, () => json(++cancels === 1 ? 503 : 200, { ok: cancels !== 1 })],
      [/\/runs\/run_s\/events/, () => json(200, poll({ runId: 'run_s', status: 'cancelled' }))],
    ]);
    const { result } = renderHook(() => useAnaChat({}));
    await act(async () => {
      void result.current.send('draft the summary');
      await drain();
    });
    await act(async () => {
      s.push({ type: 'run_started', runId: 'run_s' });
      await drain();
    });
    await act(async () => {
      await result.current.stop();
      await drain();
    });
    let turn = assistant(result.current.messages);
    expect(turn.stopUnconfirmed).toBe(true);
    expect(liveAlertLine(turn, Date.now())).toBe('Stop not confirmed. Retrying.');
    expect(turn.stopped).toBeUndefined();
    expect(result.current.isStreaming).toBe(true);
    // The turn goes on meanwhile: its stream still delivers.
    await act(async () => {
      s.push({ type: 'timeline', event: step(1, 's1', 'announced', 'Searching the vault') });
      await drain();
    });
    expect(assistant(result.current.messages).timeline?.map((e) => e.seq)).toEqual([1]);
    // The retry, 2 s later, is answered: Stopped, only now.
    await act(async () => { await drain(2_150); });
    turn = assistant(result.current.messages);
    expect(cancels).toBe(2);
    expect(turn.stopped).toBe(true);
    expect(turn.stopUnconfirmed).toBeUndefined();
    expect(result.current.isStreaming).toBe(false);
  });

  it('5. a 409 (already stopped) shows Stopped', async () => {
    const s = streamServing([
      [/\/control$/, () => json(409, { ok: false, error: 'Run already cancelled' })],
      [/\/runs\/run_s\/events/, () => json(200, poll({ runId: 'run_s', status: 'cancelled' }))],
    ]);
    const { result } = renderHook(() => useAnaChat({}));
    await act(async () => {
      void result.current.send('draft the summary');
      await drain();
    });
    await act(async () => {
      s.push({ type: 'run_started', runId: 'run_s' });
      await drain();
    });
    await act(async () => {
      await result.current.stop();
      await drain();
    });
    const turn = assistant(result.current.messages);
    expect(turn.stopped).toBe(true);
    expect(turn.stopUnconfirmed).toBeUndefined();
  });

  it('a turn that asked to drive keeps today’s Stop: a failed cancel still aborts', async () => {
    const s = streamServing([[/\/control$/, () => json(503, {})]]);
    const { result } = renderHook(() => useAnaChat({ liveDrive: true }));
    await act(async () => {
      void result.current.send('show me the vault');
      await drain();
    });
    await act(async () => {
      s.push({ type: 'run_started', runId: 'run_d' });
      await drain();
    });
    await act(async () => {
      await result.current.stop();
      await drain();
    });
    expect(assistant(result.current.messages).stopped).toBe(true);
  });

  it("'leave' never cancels and never says Stopped", async () => {
    const s = streamServing([]);
    const { result } = renderHook(() => useAnaChat({}));
    await act(async () => {
      void result.current.send('draft the summary');
      await drain();
    });
    await act(async () => {
      s.push({ type: 'run_started', runId: 'run_l' });
      await drain();
    });
    await act(async () => {
      await result.current.stop('leave');
      await drain();
    });
    expect(s.calls.some((c) => c.url.endsWith('/control'))).toBe(false);
    expect(assistant(result.current.messages).stopped).toBeUndefined();
  });

  it('RUN_IN_PROGRESS: the refusal is said in the design’s words, and the run that holds the conversation is followed after its question', async () => {
    let historyReads = 0;
    const s = streamServing([
      [/\/api\/chat\/threads\/th1\/messages/, () => json(200, ++historyReads === 1 ? HISTORY : { messages: [...HISTORY.messages, { id: 502, role: 'user', content: 'Asked on the desktop' }] })],
      [/\/turn-records\?thread_id=/, () => json(200, { data: { records: [] } })],
      [/\/runs\?thread_id=th1/, () => json(200, { runs: [], serverNow: iso(Date.now()) })],
      [/\/runs\/run_desk\/events/, () => json(200, poll({ runId: 'run_desk', userMessageId: 502, events: [step(1, 's1', 'announced', 'Searching the vault')], highWater: 1, serverNow: iso(Date.now()) }))],
    ]);
    const { result } = renderHook(() => useAnaChat({}));
    await act(async () => { await result.current.loadThread('th1'); await drain(); });
    await act(async () => {
      void result.current.send('a second question');
      await drain();
    });
    await act(async () => {
      s.push({ type: 'error', code: 'RUN_IN_PROGRESS', runId: 'run_desk', error: 'AnA is still working on the last message in this conversation.' });
      s.close();
      await drain(60);
    });
    const ms = result.current.messages;
    expect(ms.map((m) => m.id.replace(/-\d+-\d+$/, ''))).toEqual(['m-501', 'm-502', 'f-run_desk', 'u', 'a']);
    expect(ms[4].text).toBe('AnA is still working on the last message in this conversation.');
    expect(ms[4].refusalCode).toBe('RUN_IN_PROGRESS');
    expect(ms[2].timeline?.map((e) => e.seq)).toEqual([1]);
    expect(result.current.isStreaming).toBe(true);
    expect(result.current.runStatus).toBe('running');
    // Following ends with the view.
    await act(async () => { result.current.reset(); await drain(); });
  });

  it('RUN_LIMIT: the refusal is said in the design’s words, and nothing is followed', async () => {
    const s = streamServing([]);
    const { result } = renderHook(() => useAnaChat({}));
    await act(async () => {
      void result.current.send('a fourth question');
      await drain();
    });
    await act(async () => {
      s.push({ type: 'error', code: 'RUN_LIMIT', error: 'You have three turns running. Stop one, or wait for one to finish.' });
      s.close();
      await drain(60);
    });
    const turn = assistant(result.current.messages);
    expect(turn.text).toBe('You have three turns running. Stop one, or wait for one to finish.');
    expect(turn.refusalCode).toBe('RUN_LIMIT');
    expect(s.calls.some((c) => c.url.includes('/runs/'))).toBe(false);
    expect(result.current.isStreaming).toBe(false);
  });
});
