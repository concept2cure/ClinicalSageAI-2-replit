// @vitest-environment jsdom
/**
 * What a follower SEES (AnA detach DT2, docs/design/ANA_DETACH_2026-10-08.md
 * §4, §5.1; DT2 tests 1, 3, 4, 6, 7): the real hook driving the S4 components
 * a host mounts — AnaActivity (the turn's record and phase line), TurnSummary
 * (its rows), AnaWorkPanel (the plan rail) and RunControlStrip (the controls).
 * No second renderer: a followed turn is drawn by the same components as a
 * live one, from the same timeline events.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import { useAnaChat } from '../../components/ana/useAnaChat';
import { AnaActivity, activityPropsFor } from '../AnaActivity';
import { AnaWorkPanel } from '../AnaWorkPanel';
import { RunControlStrip } from '../AnaWorkSections';
import { TurnSummary } from '../TurnSummary';
import { NOT_RECORDED_LINE } from '../turnSummaryRows';

const NOW = Date.parse('2026-10-08T14:10:00.000Z');
const iso = (ms: number) => new Date(ms).toISOString();
const SHA = 'b'.repeat(64);

type Res = { ok: boolean; status: number; json: () => Promise<unknown>; clone: () => Res };
const json = (status: number, body: unknown): Res => {
  const r: Res = { ok: status >= 200 && status < 300, status, json: async () => body, clone: () => r };
  return r;
};
let controls: Array<Record<string, unknown>> = [];

function serve(polls: Array<Record<string, unknown>>, extra: Array<[RegExp, () => Res]> = []) {
  let i = 0;
  controls = [];
  (globalThis as { fetch: unknown }).fetch = vi.fn(async (url: string, init?: Parameters<typeof fetch>[1]) => {
    const u = String(url);
    for (const [re, h] of extra) if (re.test(u)) return h();
    if (/\/control$/.test(u)) {
      controls.push(JSON.parse(String(init?.body)));
      return json(200, { ok: true });
    }
    if (/\/api\/chat\/threads\/th1\/messages/.test(u)) return json(200, { messages: [{ id: 501, role: 'user', content: 'Find every stability report' }] });
    if (/\/turn-records\?thread_id=/.test(u)) return json(200, { data: { records: [] } });
    if (/\/runs\?thread_id=th1/.test(u)) {
      return json(200, { runs: [{ runId: 'run_live', userMessageId: 501, status: String(polls[0].status ?? 'running'), runPolicy: 'manual', startedAt: iso(NOW - 240_000), releasedAt: null }] });
    }
    if (/\/runs\/run_live\/events/.test(u)) return json(200, polls[Math.min(i++, polls.length - 1)]);
    return json(404, {});
  });
}

const step = (seq: number, s: string, phase: 'announced' | 'finished', label: string, extra: Record<string, unknown> = {}) => ({
  kind: 'step', seq, at: iso(NOW - 60_000 + seq * 1000), round: 1, phase, step: s, task: 't1', source: 'vault', label, preview: 'stability', ...extra,
});
const task = (seq: number, change: string, title: string) => ({ kind: 'task', seq, at: iso(NOW - 60_000 + seq * 1000), round: 1, task: 't1', change, title });
const end = (seq: number) => ({ kind: 'end', seq, at: iso(NOW - 60_000 + seq * 1000), round: 1, outcome: 'answered', stoppedReason: null });
const PLAN = [{ title: 'Find the reports', status: 'in_progress' }, { title: 'Read the reports', status: 'pending' }];
const EVENTS = [task(1, 'added', 'Find the reports'), task(2, 'started', 'Find the reports'), step(3, 's1', 'announced', 'Searching the vault'), step(4, 's1', 'finished', 'Searched the vault', { status: 'success', ms: 1200, facts: [{ name: 'Found', value: '3 reports' }] })];
function poll(over: Record<string, unknown> = {}) {
  return {
    runId: 'run_live', threadId: 'th1', threadTitle: null, userMessageId: 501, status: 'running', stoppedReason: null, round: 1,
    runPolicy: 'manual', hold: null, plan: PLAN, startedAt: iso(NOW - 240_000), detachedAt: null, unattendedStopsAt: null,
    lastBeatAt: iso(NOW - 5_000), releasedAt: null, serverNow: iso(NOW), highWater: 4, events: EVENTS, controls: [],
    sealed: null, approval: null, canControl: true, controlScope: 'all', ...over,
  };
}

/** A host as ConversationThread wires one: the record, the Summary, the panel and the strip. */
function Host() {
  const chat = useAnaChat({});
  const turn = chat.messages.find((m) => m.role === 'assistant') ?? null;
  const { loadThread } = chat;
  React.useEffect(() => {
    void loadThread('th1');
  }, [loadThread]);
  return (
    <div className="c2c-v2">
      {turn && (
        <div data-testid="record">
          <AnaActivity {...activityPropsFor(turn)} onSummary={() => undefined} />
        </div>
      )}
      {turn && (
        <div data-testid="summary">
          <TurnSummary turn={turn} live={chat.isStreaming && Boolean(turn.streaming)} />
        </div>
      )}
      <div data-testid="panel">
        <AnaWorkPanel messages={chat.messages} streaming={chat.isStreaming} runStatus={chat.runStatus} runHold={chat.runHold} />
      </div>
      <RunControlStrip
        streaming={chat.isStreaming}
        runStatus={chat.runStatus}
        runHold={chat.runHold}
        runPolicy={chat.turnRunPolicy}
        onPause={chat.runStatus ? () => void chat.pause() : undefined}
        onResume={chat.runStatus ? () => void chat.resume() : undefined}
        onStop={() => void chat.stop()}
        onSteer={chat.interject}
      />
    </div>
  );
}

const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const listText = () => screen.getByTestId('summary').querySelector('.ana-summary-list')?.textContent ?? '';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('a followed turn, as a host draws it', () => {
  it('1. after its question: the rows, the plan rail and the follower phase line', async () => {
    serve([poll()]);
    render(<Host />);
    await advance(10);
    // The phase line, in the turn's own record, with the Summary button beside it.
    const record = screen.getByTestId('record');
    expect(record.querySelector('.ana-activity-phase')?.textContent).toContain('Working · step 1 · 4m 00s');
    expect(within(record).getByRole('button', { name: /Summary/ })).toBeTruthy();
    // The rows, by the S4 Summary.
    expect(listText()).toContain('Searched the vault');
    expect(listText()).toContain('Started');
    expect(listText()).toContain('Working…');
    // The plan rail, from the poll's plan.
    const rail = within(screen.getByTestId('panel')).getByRole('list', { name: 'Plan' });
    expect(within(rail).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      expect.stringContaining('Find the reports'),
      expect.stringContaining('Read the reports'),
    ]);
  });

  it('4. a Manual hold renders from `hold`, and its answers send controls', async () => {
    serve([poll({ status: 'paused', hold: { reason: 'manual', next: ['Read the reports'] } })]);
    render(<Host />);
    await advance(10);
    expect(screen.getByText('Waiting for you before the next step')).toBeTruthy();
    expect(screen.getByText(/Read the reports/, { selector: '.ana-runctl-next' })).toBeTruthy();
    await act(async () => {
      fireEvent.change(screen.getByRole('textbox', { name: 'Tell AnA what to do instead' }), { target: { value: 'Read only the 2024 reports' } });
      fireEvent.click(screen.getByRole('button', { name: 'Do this instead' }));
    });
    await advance(0);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Run this step' }));
    });
    await advance(0);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    });
    await advance(0);
    expect(controls.map((c) => c.action)).toEqual(['interject', 'resume', 'cancel']);
    expect(controls[0]).toMatchObject({ message: 'Read only the 2024 reports' });
  });

  it('6. a stale owner is said beside the rows, with Stop offered', async () => {
    serve([poll({ lastBeatAt: iso(NOW - 185_000) })]);
    render(<Host />);
    await advance(10);
    expect(screen.getByText("AnA hasn't reported for 3 min. The server handling this turn may have stopped.")).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Stop' })).toBeTruthy();
    expect(listText()).toContain('Searched the vault');
  });

  it('3. a sealed run hands over, and its rows read the same before and after', async () => {
    const sealedEvents = [...EVENTS, end(5)];
    serve(
      [
        poll(),
        poll({ status: 'finished', events: [end(5)], highWater: 5 }),
        poll({ status: 'finished', events: [], highWater: 5, sealed: { recordId: 'rec_9', assistantMessageId: 777 }, releasedAt: iso(NOW) }),
      ],
      [
        [/\/turn-records\/rec_9\/summary/, () => json(200, { data: { recordSha256: SHA, verdict: { ok: true }, events: sealedEvents, controls: [], models: [] } })],
      ],
    );
    render(<Host />);
    await advance(10);
    await advance(2_000); // ended; the owner is still recording
    expect(screen.getByText('Recording…')).toBeTruthy();
    const before = listText();
    expect(before).toContain('Answered.');
    // The hand-over reads the stored answer; this read keeps the first history.
    const history = [{ id: 501, role: 'user', content: 'Find every stability report' }, { id: 777, role: 'assistant', content: 'There are three.' }];
    const f = globalThis.fetch as ReturnType<typeof vi.fn>;
    const inner = f.getMockImplementation()!;
    f.mockImplementation(async (url: string, init?: Parameters<typeof fetch>[1]) =>
      /\/api\/chat\/threads\/th1\/messages/.test(String(url)) ? json(200, { messages: history }) : inner(url, init),
    );
    await advance(2_000);
    await advance(10);
    expect(screen.getByText('Recorded')).toBeTruthy();
    expect(listText()).toBe(before);
  });

  it('7. ended without a record: the run’s reason, the saved rows and "Not recorded"', async () => {
    serve([
      poll({ status: 'failed', stoppedReason: 'orphaned', events: EVENTS.slice(0, 3), highWater: 3 }),
      poll({ status: 'failed', stoppedReason: 'orphaned', events: [], highWater: 3, releasedAt: iso(NOW) }),
    ]);
    render(<Host />);
    await advance(10);
    expect(screen.getByText('Recording…')).toBeTruthy();
    await advance(2_000);
    expect(screen.getByText('Not recorded')).toBeTruthy();
    expect(listText()).toContain('Stopped: the server handling this turn stopped responding.');
    expect(listText()).toContain(NOT_RECORDED_LINE);
    expect(listText()).toContain('Searching the vault');
  });

  it('a gap in the mirror is said once, never in place of the rows', async () => {
    serve([poll({ events: [EVENTS[0], EVENTS[3]], highWater: 4 })]);
    render(<Host />);
    await advance(10);
    expect(screen.getAllByText('Some steps could not be shown live. The full list appears when the turn is recorded.')).toHaveLength(1);
    expect(listText()).toContain('Searched the vault');
  });
});
