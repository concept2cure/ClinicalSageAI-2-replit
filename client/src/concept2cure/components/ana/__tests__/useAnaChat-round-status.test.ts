/**
 * @vitest-environment jsdom
 *
 * The tool loop had no live line at all.
 *
 * WHAT WENT WRONG — and what did NOT
 * The first version of this file claimed the phase stayed stuck on "Generating
 * response…" for the length of the agentic loop. That was wrong, and the test
 * below is what proved it: `tool_use` clears `statusPhase` outright, so the
 * phase did not lie — it VANISHED. From the first tool call until the first
 * answer token the user watched a column of settled rows with nothing saying
 * she was still working, across a window that runs many seconds when the model
 * composes from a full round of results.
 *
 * The clearing was correct once. The rail rendered `m.statusPhase` as its
 * single body line, so a phase and a tool row competed for the same slot and
 * the row had to win. The work record renders them as different things — the
 * phase is what this ROUND is doing, the rows are the steps inside it — so the
 * clear now destroys the only live signal instead of resolving a conflict.
 *
 * Dropping the clear is what gives the round a line to speak on. It is ALSO
 * what would let a stale line stand if the round said nothing — so the server
 * emit and the client change are one change, not two, and the third test below
 * pins that dependency rather than leaving it as a comment.
 *
 * WHAT IS PINNED
 * The first group is behavioural, read AT THE INSTANT the round is running with
 * the stream deliberately still open. The second is a carriage assertion on the
 * server, because what it pins is that the round emits the event at all, and
 * driving the whole SSE route (auth, org context, gateway, tool registry) to
 * observe one write would test the mocks. Each half is labelled with which it
 * is.
 *
 * TWO HARNESS BUGS THIS FILE ALREADY CAUGHT, both of which made assertions pass
 * for no reason:
 *   1. Reading the phase after the turn completed. `post_done` clears it
 *      unconditionally, so every read was `undefined` — which is also what a
 *      broken fix looks like.
 *   2. Draining with a `Promise.resolve()` chain. The reader loop awaits a
 *      stream fed from another task and never gets scheduled by microtasks, so
 *      again: `undefined`, indistinguishable from failure.
 * Both are why the negative case below is not optional.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';

import { useAnaChat } from '../useAnaChat';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../..');

/** Encode one SSE event. */
const ev = (o: unknown) => new TextEncoder().encode(`data: ${JSON.stringify(o)}\n\n`);

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  (globalThis.fetch as any) = fetchMock;
});
afterEach(cleanup);

/**
 * Let the hook's reader loop drain what has been enqueued so far. A real timer,
 * not a microtask flush: the loop awaits `reader.read()` on a stream fed from
 * another task, and a `Promise.resolve()` chain never yields to it — the first
 * version of this helper did exactly that and every phase read back
 * `undefined`, which reads identically to "the phase was cleared".
 */
const drain = () => new Promise(r => setTimeout(r, 25));

/**
 * Drive a real tool round and read state AT THE MOMENT the round is running —
 * the stream is deliberately not closed first. The model answers with tools and
 * no prose, which is the case the missing phase lived in.
 */
async function roundState(
  withRoundStatus: boolean,
  opts: { thenText?: string } = {},
): Promise<{ phase?: string; toolCalls?: Array<{ label: string }> }> {
  let ctl!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start(c) { ctl = c; } });
  fetchMock.mockResolvedValue({ ok: true, status: 200, body });

  const { result } = renderHook(() => useAnaChat({ projectId: 'proj_12' }));

  let sent!: Promise<unknown>;
  await act(async () => {
    sent = result.current.send('how many patients do I need?');
    await drain();
  });

  await act(async () => {
    ctl.enqueue(ev({ type: 'status', phase: 'generating', message: 'Generating response…' }));
    if (withRoundStatus) {
      ctl.enqueue(ev({ type: 'status', phase: 'running_tools', message: 'Running 2 steps…' }));
    }
    ctl.enqueue(ev({ type: 'step', round: 1, tools: ['compute_sample_size'] }));
    ctl.enqueue(ev({ type: 'tool_use', round: 1, name: 'compute_sample_size', label: 'Sample size — biostatistics engine' }));
    ctl.enqueue(ev({ type: 'tool_result', round: 1, name: 'compute_sample_size', label: 'Sample size — biostatistics engine', status: 'success', result: '{}' }));
    if (opts.thenText) ctl.enqueue(ev({ type: 'text', content: opts.thenText }));
    await drain();
  });

  // Read here. The turn is mid-round; the stream is still open.
  const mid: any = [...result.current.messages]
    .reverse()
    .find(m => m.role === 'assistant');
  const snapshot = { phase: mid?.statusPhase, toolCalls: mid?.toolCalls };

  await act(async () => {
    ctl.enqueue(ev({ type: 'done' }));
    ctl.close();
    await sent;
  });

  return snapshot;
}

const phaseDuringRound = async (withRoundStatus: boolean) =>
  (await roundState(withRoundStatus)).phase;

describe('the phase line during a tool round — behavioural', () => {
  it('keeps a live line while the tools are running', async () => {
    // The regression: this was `undefined` for the whole loop.
    expect(await phaseDuringRound(true)).toBe('Running 2 steps…');
  });

  it('the tool rows are still captured — the phase does not replace them', async () => {
    // Guards the fix against overcorrecting: the reason the phase used to be
    // cleared was that it competed with the rows. Both must now survive.
    const { phase, toolCalls } = await roundState(true);
    expect(phase).toBe('Running 2 steps…');
    expect(toolCalls?.map(c => c.label)).toEqual(['Sample size — biostatistics engine']);
  });

  it('without a round status, the previous phase would stand over work it does not describe', async () => {
    // The cost of the fix, pinned so it cannot be paid silently. Removing the
    // clear on `tool_use` is what gives the round a line to speak on — and it
    // is also what lets a STALE line survive if the round says nothing. So the
    // two halves are one change: the server MUST announce each round, because
    // the client no longer blanks the phase on its behalf. Delete the server
    // emit and this is what the user reads while the tools run.
    expect(await phaseDuringRound(false)).toBe('Generating response…');
  });

  it('once she is answering, the answer is the status', async () => {
    // The clear on `text` is deliberate and must not have been lost.
    const { phase } = await roundState(true, { thenText: 'You will need' });
    expect(phase).toBeUndefined();
  });
});

describe('the round emits the status — carriage', () => {
  const streamSrc = () =>
    fs.readFileSync(path.join(REPO_ROOT, 'server/routes/ana-ri/stream.ts'), 'utf8');

  it('executeTools announces the round before the step event', () => {
    const src = streamSrc();
    // Anchored to executeTools specifically: a `running_tools` status emitted
    // anywhere else in the file would not fix the window this is about.
    const body = src.slice(src.indexOf('const executeTools = async'));
    const running = body.indexOf("phase: 'running_tools'");
    const step = body.indexOf("type: 'step'");
    expect(running).toBeGreaterThan(-1);
    expect(step).toBeGreaterThan(-1);
    expect(running).toBeLessThan(step);
  });

  it('the announced counts are read off the real round, never hardcoded', () => {
    const src = streamSrc();
    const body = src.slice(src.indexOf('const executeTools = async'));
    // `calls.length` is what the model actually asked for and `round` is the
    // real loop round. A literal count here would be the display inventing a
    // number, which is the failure mode this whole record exists to avoid.
    expect(body).toMatch(/const stepCount = calls\.length/);
    expect(body).toMatch(/Round \$\{round\}/);
  });

  it('the round says so when it finishes, rather than leaving "Running…" standing', () => {
    const src = streamSrc();
    const body = src.slice(src.indexOf('const executeTools = async'));
    expect(body).toContain("phase: 'reading_results'");
  });
});
