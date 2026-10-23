/**
 * @vitest-environment jsdom
 *
 * The page that started a turn loses its socket, and the turn goes on in the
 * server (AnA detach DT3, docs/design/ANA_DETACH_2026-10-08.md §4.2, §5.4,
 * U-14). For a detachable turn — a durable run that did not ask to drive —
 * this view follows the run from its last row, in place:
 *
 *   - the idle timer firing (a phone that slept) goes straight to following,
 *     and "AnA stopped responding" never shows;
 *   - a dropped connection, and a stream that ended before the turn did, the
 *     same;
 *   - the followed run's end hands over to its record.
 *
 * A turn that asked to drive follows its run the same way since the founder's
 * decision of 2026-10-22 (D-7): the server stops driving the screen once the
 * page is gone and refuses any further screen action, and this page's drive
 * is released (drive_turn_end). A refusal the server sent is not a lost socket.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';

import { useAnaChat } from '../useAnaChat';
import { liveAlertLine } from '../../../v2/anaWorkModel';

const NOW = Date.parse('2026-10-08T14:10:00.000Z');
const iso = (ms: number) => new Date(ms).toISOString();
const SHA = 'b'.repeat(64);

type Res = { ok: boolean; status: number; json: () => Promise<unknown>; clone: () => Res; body?: ReadableStream<Uint8Array> };
const json = (status: number, body: unknown): Res => {
  const r: Res = { ok: status >= 200 && status < 300, status, json: async () => body, clone: () => r };
  return r;
};
type Handler = (url: string, init?: RequestInit) => Res | Promise<Res>;

function serve(routes: Array<[RegExp, Handler]>) {
  const calls: string[] = [];
  (globalThis as { fetch: unknown }).fetch = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push(String(url));
    for (const [re, h] of routes) if (re.test(String(url))) return h(String(url), init);
    return json(404, {});
  });
  return calls;
}

const step = (seq: number, s: string, phase: 'announced' | 'finished', label: string, extra: Record<string, unknown> = {}) => ({
  kind: 'step', seq, at: iso(NOW - 60_000 + seq * 1000), round: 1, phase, step: s, task: null, source: 'vault', label, preview: null, ...extra,
});
const end = (seq: number, outcome: string) => ({ kind: 'end', seq, at: iso(NOW), round: 1, outcome, stoppedReason: null });
function poll(over: Record<string, unknown> = {}) {
  return {
    runId: 'run_d', threadId: 'th1', threadTitle: null, userMessageId: 501, status: 'running', stoppedReason: null,
    round: 1, runPolicy: null, hold: null, plan: null, startedAt: iso(NOW - 60_000), detachedAt: iso(NOW), unattendedStopsAt: null,
    lastBeatAt: iso(NOW), releasedAt: null, serverNow: iso(NOW), highWater: 0, events: [], controls: [], sealed: null,
    approval: null, canControl: true, controlScope: 'all', ...over,
  };
}

const ev = (o: unknown) => new TextEncoder().encode(`data: ${JSON.stringify(o)}\n\n`);

/** A stream the test drives, plus the run's polls answered in turn. */
function streamServing(polls: Array<Record<string, unknown>>, extra: Array<[RegExp, Handler]> = []) {
  let ctl!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start(c) { ctl = c; } });
  let i = 0;
  const calls = serve([
    ...extra,
    [/\/api\/ana-ri\/stream$/, (_u, init) => {
      init?.signal?.addEventListener('abort', () => {
        const e = new Error('aborted');
        e.name = 'AbortError';
        try { ctl.error(e); } catch { /* closed */ }
      });
      return { ...json(200, {}), body };
    }],
    [/\/runs\/run_d\/events/, () => json(200, polls[Math.min(i++, polls.length - 1)])],
  ]);
  return {
    calls,
    push: (o: unknown) => ctl.enqueue(ev(o)),
    close: () => ctl.close(),
    fail: (e: Error) => ctl.error(e),
  };
}

const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const assistant = (r: { current: ReturnType<typeof useAnaChat> }) => r.current.messages.find(m => m.role === 'assistant')!;
const STOPPED_RESPONDING = /stopped responding/i;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

async function started(s: ReturnType<typeof streamServing>, opts: Parameters<typeof useAnaChat>[0] = {}) {
  const hook = renderHook(() => useAnaChat(opts));
  await act(async () => {
    void hook.result.current.send('find the stability reports');
    await vi.advanceTimersByTimeAsync(5);
  });
  await act(async () => {
    s.push({ type: 'thread_id', thread_id: 'th1' });
    s.push({ type: 'run_started', runId: 'run_d' });
    s.push({ type: 'timeline', event: step(1, 's1', 'announced', 'Searching the vault') });
    await vi.advanceTimersByTimeAsync(5);
  });
  return hook;
}

describe('a detachable turn whose socket is lost follows its run, in place', () => {
  it('the idle timer: straight to following from the last row, and "stopped responding" never shows', async () => {
    const s = streamServing([poll({ events: [step(2, 's1', 'finished', 'Searched the vault', { status: 'success' })], highWater: 2 })]);
    const { result } = await started(s);
    await advance(90_000 + 10);
    const turn = assistant(result);
    expect(turn.text).not.toMatch(STOPPED_RESPONDING);
    expect(turn.interrupted).toBeFalsy();
    expect(turn.warnings ?? []).not.toContain('Response timed out');
    expect(turn.follow).toMatchObject({ runId: 'run_d', status: 'running' });
    expect(turn.timeline?.map(e => e.seq)).toEqual([1, 2]);
    expect(s.calls.find(u => u.includes('/runs/run_d/events'))).toContain('after=1');
    // The same turn, not a second one drawn beside it.
    expect(result.current.messages.filter(m => m.role === 'assistant')).toHaveLength(1);
    expect(result.current.isStreaming).toBe(true);
  });

  it('a dropped connection: following, never interrupted', async () => {
    const s = streamServing([poll()]);
    const { result } = await started(s);
    await act(async () => {
      s.fail(new TypeError('network error'));
      await vi.advanceTimersByTimeAsync(10);
    });
    const turn = assistant(result);
    expect(turn.interrupted).toBeFalsy();
    expect(turn.follow?.runId).toBe('run_d');
    expect(result.current.isStreaming).toBe(true);
  });

  it('a stream that ended before the turn did: following', async () => {
    const s = streamServing([poll()]);
    const { result } = await started(s);
    await act(async () => {
      s.close();
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(assistant(result).interrupted).toBeFalsy();
    expect(assistant(result).follow?.runId).toBe('run_d');
  });

  it('the followed run ends sealed: it hands over to the record, under the same id', async () => {
    const s = streamServing(
      [
        poll(),
        poll({ status: 'finished', events: [end(2, 'answered')], highWater: 2, sealed: { recordId: 'rec_d', assistantMessageId: 777 }, releasedAt: iso(NOW) }),
      ],
      [
        [/\/api\/chat\/threads\/th1\/messages/, () => json(200, { messages: [{ id: 501, role: 'user', content: 'find' }, { id: 777, role: 'assistant', content: 'There are three reports.' }] })],
        [/\/turn-records\/rec_d\/summary/, () => json(200, { data: { recordSha256: SHA } })],
      ],
    );
    const { result } = await started(s);
    const id = assistant(result).id;
    await advance(90_000 + 10);
    await advance(2_000 + 10);
    await advance(10);
    const turn = assistant(result);
    expect(turn.id).toBe(id);
    expect(turn.text).toBe('There are three reports.');
    expect(turn.turnRecord).toMatchObject({ status: 'recorded', id: 'rec_d' });
    expect(result.current.isStreaming).toBe(false);
  });
});

describe('a turn that asked to drive (D-7, decided 2026-10-22)', () => {
  it('the idle timer: it follows its run like any other, and this page lets go of the drive', async () => {
    const s = streamServing([poll()]);
    const driveEvents: string[] = [];
    const { result } = await started(s, { liveDrive: true, onDriveEvent: e => driveEvents.push(e.type) });
    await act(async () => {
      s.push({ type: 'drive_state', requested: true, enabled: true, mode: 'assist' });
      await vi.advanceTimersByTimeAsync(5);
    });
    await advance(90_000 + 10);
    const turn = assistant(result);
    expect(turn.text).not.toMatch(STOPPED_RESPONDING);
    expect(turn.interrupted).toBeFalsy();
    expect(turn.follow).toMatchObject({ runId: 'run_d', status: 'running' });
    expect(driveEvents).toContain('drive_turn_end');
  });

  it("the person's Stop of a driving turn is confirmed by the server before it shows Stopped", async () => {
    let cancels = 0;
    const s = streamServing([poll()], [[/\/stream\/run_d\/control$/, () => { cancels++; return json(503, {}); }]]);
    const { result } = await started(s, { liveDrive: true });
    await act(async () => {
      s.push({ type: 'drive_state', requested: true, enabled: true, mode: 'assist' });
      await vi.advanceTimersByTimeAsync(5);
    });
    await act(async () => { void result.current.stop(); await vi.advanceTimersByTimeAsync(5); });
    expect(cancels).toBe(1);
    // Not confirmed: the turn goes on, and nothing says it stopped.
    expect(result.current.runStatus).not.toBe('cancelled');
    expect(result.current.isStreaming).toBe(true);
  });
});

describe('what still ends as before', () => {

  it('a refusal the server sent is not a lost socket', async () => {
    const s = streamServing([poll()]);
    const { result } = await started(s);
    await act(async () => {
      s.push({ type: 'error', code: 'GATEWAY_UNAVAILABLE', error: 'No AI provider is configured.' });
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(assistant(result).interrupted).toBe(true);
    expect(assistant(result).follow).toBeUndefined();
  });
});

/* DT3 review (DP-82): an organisation administrator's Stop of a colleague's
   turn. One request carrying the reason, never retried behind their back, and
   the server's sentence returned when it refused — the stop and its chained
   audit row are written together or not at all. */
describe("an administrator's Stop (adminStop)", () => {
  const controlCalls = (calls: string[]) => calls.filter(u => /\/stream\/run_d\/control$/.test(u));

  it('sends the reason once; a refusal comes back in the server\'s words and is not retried', async () => {
    const bodies: unknown[] = [];
    const sentence = 'The turn was not stopped: the record of your stop could not be written. Nothing was changed. Try again.';
    const s = streamServing([poll()], [
      [/\/stream\/run_d\/control$/, (_u, init) => {
        bodies.push(JSON.parse(String(init?.body)));
        return json(503, { ok: false, error: sentence });
      }],
    ]);
    const { result } = await started(s);
    let answer: unknown;
    await act(async () => {
      answer = await result.current.adminStop!('The draft is going to the wrong agency.');
    });
    expect(answer).toEqual({ ok: false, message: sentence });
    expect(bodies).toEqual([{ action: 'cancel', reason: 'The draft is going to the wrong agency.' }]);
    await advance(60_000);
    expect(controlCalls(s.calls)).toHaveLength(1);
    expect(result.current.runStatus).not.toBe('cancelled');
  });

  it('an accepted stop shows the run stopping', async () => {
    const s = streamServing([poll()], [[/\/stream\/run_d\/control$/, () => json(200, { ok: true, status: 'cancelled', byRole: 'admin' })]]);
    const { result } = await started(s);
    let answer: unknown;
    await act(async () => {
      answer = await result.current.adminStop!('The draft is going to the wrong agency.');
    });
    expect(answer).toEqual({ ok: true });
    expect(result.current.runStatus).toBe('cancelled');
  });
});

/* The three reviews of the uncommitted DT3 change (2026-10-22), client half. */
describe('what a following page says, honestly (DT3 review)', () => {
  // 2.2: the page's own stream drew a step "running"; the follower adds only
  // timeline rows, so that row stayed "running" — for ever, once the run ended
  // without a seal.
  it('an in-place follow leaves no step "running": not while it follows, not after an unsealed end', async () => {
    const s = streamServing([
      poll(),
      poll({ status: 'failed', stoppedReason: 'server_shutdown', events: [end(3, 'stopped')], highWater: 3, sealed: null, releasedAt: iso(NOW) }),
    ]);
    const { result } = await started(s);
    await act(async () => {
      s.push({ type: 'tool_use', name: 'search_vault', label: 'Searching the vault', toolUseId: 'tu1', round: 1, input: {} });
      await vi.advanceTimersByTimeAsync(5);
    });
    expect(assistant(result).toolCalls?.map(c => c.status)).toEqual(['running']);
    await act(async () => {
      s.fail(new TypeError('network error'));
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(assistant(result).follow?.runId).toBe('run_d');
    expect((assistant(result).toolCalls ?? []).filter(c => c.status === 'running')).toEqual([]);
    await advance(3_000);
    expect(assistant(result).streaming).toBe(false);
    expect((assistant(result).toolCalls ?? []).filter(c => c.status === 'running')).toEqual([]);
  });

  // 2.4: a hand-over whose conversation could not be read showed a recorded
  // turn as an empty answer, with no error.
  it('a hand-over that cannot read the answer says so, never an empty answer', async () => {
    const s = streamServing(
      [poll({ status: 'finished', events: [end(2, 'answered')], highWater: 2, sealed: { recordId: 'rec_d', assistantMessageId: 777 }, releasedAt: iso(NOW) })],
      [
        [/\/api\/chat\/threads\/th1\/messages/, () => json(500, { error: 'down' })],
        [/\/turn-records\/rec_d\/summary/, () => json(200, { data: { recordSha256: SHA } })],
      ],
    );
    const { result } = await started(s);
    await act(async () => {
      s.fail(new TypeError('network error'));
      await vi.advanceTimersByTimeAsync(10);
    });
    await advance(10);
    const turn = assistant(result);
    expect(turn.streaming).toBe(false);
    expect(liveAlertLine(turn, Date.now())).toBe("The answer couldn't be loaded. Reopen the conversation.");
  });

  // 2.5: a 401 on the follower's poll (an idle session) read as "Can't reach
  // the server. Retrying." for ever; no retry can succeed.
  it('a 401 on the poll says the sign-in ended, in the server\'s words, and stops polling', async () => {
    let polls = 0;
    const s = streamServing([], [
      [/\/runs\/run_d\/events/, () => {
        polls++;
        return json(401, { code: 'SESSION_IDLE', message: 'Signed out after a period of inactivity. Sign in again.' });
      }],
    ]);
    const { result } = await started(s);
    await act(async () => {
      s.fail(new TypeError('network error'));
      await vi.advanceTimersByTimeAsync(10);
    });
    const turn = assistant(result);
    expect(liveAlertLine(turn, Date.now())).toBe('Signed out after a period of inactivity. Sign in again.');
    expect(turn.follow?.unreachable).toBeFalsy();
    const seen = polls;
    await advance(120_000);
    expect(polls).toBe(seen);
    expect(result.current.isStreaming).toBe(false);
  });

  // 2.7: a failure the server announced (an error frame with no code) was read
  // as a lost socket, and its words lost.
  it('a code-less error frame from the server is a refusal, not a lost socket', async () => {
    const s = streamServing([poll()]);
    const { result } = await started(s);
    await act(async () => {
      s.push({ type: 'error', error: 'An error occurred while generating the response' });
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(assistant(result).interrupted).toBe(true);
    expect(assistant(result).follow).toBeUndefined();
  });
});
