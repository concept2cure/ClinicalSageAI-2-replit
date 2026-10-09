/**
 * @vitest-environment jsdom
 *
 * Two calls of the same tool in one step had their results swapped.
 *
 * WHAT WENT WRONG
 * The server runs a step's tool calls concurrently and then emits their
 * results IN THE ORIGINAL CALL ORDER: `mapWithConcurrency` writes `results[i]`
 * by input index (agentic-loop.ts), and stream.ts loops over that array to
 * write each `tool_result`. So results arrive first-called, first-reported.
 *
 * The client paired each result with the MOST RECENT running call of the same
 * name — `[...toolCalls].reverse().findIndex(t => t.name === name && ...)`.
 * First-in results against last-in matching means two same-named calls in one
 * step were swapped EVERY time, not by a race. AnA searches the literature for
 * X and for Y in the same step; the transcript shows X's results under the Y
 * query and Y's under X. With three calls the first and last swap.
 *
 * That is not a cosmetic ordering bug. The result kept on each row is, in the
 * hook's own words, "so a reviewer can see exactly what this step returned".
 * A result shown against the wrong input is an audit record that says
 * something false about what AnA did.
 *
 * It also made more than one agent impossible to display honestly: several
 * concurrent sub-agents are several calls of ONE tool.
 *
 * WHAT IS PINNED
 * Results are paired by the call's own id (`toolUseId`, the field the approval
 * events already carry). Without an id — an older server during a deploy —
 * the fallback is the FIRST running call of that name, which is correct
 * precisely because the server emits in call order. The server half is a
 * carriage assertion: both emits must carry the id, or the client has nothing
 * to pair on and silently falls back.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';

import { useAnaChat } from '../useAnaChat';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../..');

const ev = (o: unknown) => new TextEncoder().encode(`data: ${JSON.stringify(o)}\n\n`);
const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  (globalThis.fetch as any) = fetchMock;
});
afterEach(cleanup);

/** A real timer — the reader loop is never scheduled by a microtask flush. */
const drain = () => new Promise(r => setTimeout(r, 25));

type Call = { name: string; input?: unknown; result?: string; status: string; toolUseId?: string };

/**
 * One step, N calls of the same tool, results emitted in ORIGINAL order —
 * exactly what stream.ts does. `withIds` false models an older server.
 */
async function pairedCalls(queries: string[], withIds: boolean): Promise<Call[]> {
  let ctl!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start(c) { ctl = c; } });
  fetchMock.mockResolvedValue({ ok: true, status: 200, body });

  const { result } = renderHook(() => useAnaChat({ projectId: 'proj_12' }));
  let sent!: Promise<unknown>;
  await act(async () => {
    sent = result.current.send('search the literature');
    await drain();
  });

  await act(async () => {
    queries.forEach((q, i) => {
      ctl.enqueue(ev({
        type: 'tool_use', round: 1, name: 'search_pubmed', label: `Searching for "${q}"`,
        input: { query: q },
        ...(withIds ? { toolUseId: `toolu_${i}` } : {}),
      }));
    });
    // Original order: the first call's result is reported first.
    queries.forEach((q, i) => {
      ctl.enqueue(ev({
        type: 'tool_result', round: 1, name: 'search_pubmed', label: `Searching for "${q}"`,
        status: 'success',
        result: JSON.stringify({ resultsFor: q }),
        ...(withIds ? { toolUseId: `toolu_${i}` } : {}),
      }));
    });
    ctl.enqueue(ev({ type: 'done' }));
    ctl.close();
    await drain();
    await sent;
  });

  const last: any = [...result.current.messages].reverse().find(m => m.role === 'assistant');
  return last?.toolCalls ?? [];
}

/** Each row's result must be the one produced for that row's own input. */
function pairing(calls: Call[]): Array<{ asked: string; got: string }> {
  return calls.map(c => ({
    asked: (c.input as { query: string }).query,
    got: JSON.parse(c.result ?? '{}').resultsFor,
  }));
}

describe('same-tool results land on the call that produced them', () => {
  it('two calls, paired by id', async () => {
    const calls = await pairedCalls(['X', 'Y'], true);
    expect(pairing(calls)).toEqual([
      { asked: 'X', got: 'X' },
      { asked: 'Y', got: 'Y' },
    ]);
  });

  it('three calls, paired by id — the first and last were the ones that swapped', async () => {
    const calls = await pairedCalls(['A', 'B', 'C'], true);
    expect(pairing(calls)).toEqual([
      { asked: 'A', got: 'A' },
      { asked: 'B', got: 'B' },
      { asked: 'C', got: 'C' },
    ]);
  });

  it('keeps the id on the row, so a later correlation can use it', async () => {
    const calls = await pairedCalls(['X', 'Y'], true);
    expect(calls.map(c => c.toolUseId)).toEqual(['toolu_0', 'toolu_1']);
  });

  it('without ids (an older server), still pairs correctly — the fallback is first-in, not last-in', async () => {
    // The server emits in call order, so the first running call of a name is
    // the one a result belongs to. Last-in matching was the defect.
    const calls = await pairedCalls(['X', 'Y'], false);
    expect(pairing(calls)).toEqual([
      { asked: 'X', got: 'X' },
      { asked: 'Y', got: 'Y' },
    ]);
  });

  it('without ids, a call an earlier step left running does not take a later step\'s result', async () => {
    // Running calls are settled only when a turn ends badly — not between
    // steps. So a step-1 call whose result never came is still "running" in
    // step 2, and first-in matching by name ALONE would give it step 2's result.
    let ctl!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({ start(c) { ctl = c; } });
    fetchMock.mockResolvedValue({ ok: true, status: 200, body });
    const { result } = renderHook(() => useAnaChat({ projectId: 'proj_12' }));
    let sent!: Promise<unknown>;
    await act(async () => { sent = result.current.send('search'); await drain(); });
    await act(async () => {
      // Step 1: announced, never resolved.
      ctl.enqueue(ev({ type: 'tool_use', round: 1, name: 'search_pubmed', label: 'Searching for "stale"', input: { query: 'stale' } }));
      // Step 2: announced and resolved — with no id, as an older server sends.
      ctl.enqueue(ev({ type: 'tool_use', round: 2, name: 'search_pubmed', label: 'Searching for "fresh"', input: { query: 'fresh' } }));
      ctl.enqueue(ev({ type: 'tool_result', round: 2, name: 'search_pubmed', label: 'Searching for "fresh"', status: 'success', result: JSON.stringify({ resultsFor: 'fresh' }) }));
      await drain();
    });
    const mid: any = [...result.current.messages].reverse().find(m => m.role === 'assistant');
    const byQuery = Object.fromEntries((mid.toolCalls as Call[]).map(c => [(c.input as { query: string }).query, c]));
    expect(byQuery.fresh.status).toBe('success');
    expect(JSON.parse(byQuery.fresh.result!).resultsFor).toBe('fresh');
    expect(byQuery.stale.status).toBe('running');
    expect(byQuery.stale.result).toBeUndefined();
    await act(async () => { ctl.enqueue(ev({ type: 'done' })); ctl.close(); await drain(); await sent; });
  });

  it('a result whose id matches no call does not steal a sibling that has its own id', async () => {
    // Found by the adversarial review of this fix. Once the server has said
    // which call a result belongs to, falling back to the NAME could pin it on
    // a different call — exactly the misattribution this file exists to end.
    let ctl!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({ start(c) { ctl = c; } });
    fetchMock.mockResolvedValue({ ok: true, status: 200, body });
    const { result } = renderHook(() => useAnaChat({ projectId: 'proj_12' }));
    let sent!: Promise<unknown>;
    await act(async () => { sent = result.current.send('search'); await drain(); });
    await act(async () => {
      ctl.enqueue(ev({ type: 'tool_use', round: 1, name: 'search_pubmed', toolUseId: 'toolu_0', label: 'A', input: { query: 'A' } }));
      ctl.enqueue(ev({ type: 'tool_use', round: 1, name: 'search_pubmed', toolUseId: 'toolu_1', label: 'B', input: { query: 'B' } }));
      // An id that names neither call.
      ctl.enqueue(ev({ type: 'tool_result', round: 1, name: 'search_pubmed', toolUseId: 'toolu_9', label: '?', status: 'success', result: JSON.stringify({ resultsFor: 'stray' }) }));
      await drain();
    });
    const mid: any = [...result.current.messages].reverse().find(m => m.role === 'assistant');
    // Neither real call was handed the stray result.
    expect((mid.toolCalls as Call[]).map(c => c.status)).toEqual(['running', 'running']);
    expect((mid.toolCalls as Call[]).every(c => c.result === undefined)).toBe(true);
    await act(async () => {
      // Their own results still land correctly afterwards.
      ctl.enqueue(ev({ type: 'tool_result', round: 1, name: 'search_pubmed', toolUseId: 'toolu_0', label: 'A', status: 'success', result: JSON.stringify({ resultsFor: 'A' }) }));
      ctl.enqueue(ev({ type: 'tool_result', round: 1, name: 'search_pubmed', toolUseId: 'toolu_1', label: 'B', status: 'success', result: JSON.stringify({ resultsFor: 'B' }) }));
      ctl.enqueue(ev({ type: 'done' })); ctl.close(); await drain(); await sent;
    });
    const end: any = [...result.current.messages].reverse().find(m => m.role === 'assistant');
    expect(pairing(end.toolCalls)).toEqual([{ asked: 'A', got: 'A' }, { asked: 'B', got: 'B' }]);
  });

  it('every call settles — none is left running', async () => {
    const calls = await pairedCalls(['A', 'B', 'C'], true);
    expect(calls.every(c => c.status === 'success')).toBe(true);
  });
});

describe('the server sends the id the client pairs on — carriage', () => {
  // Driving the whole SSE route to observe one field would test the mocks; what
  // is pinned is that both concurrent-path emits carry the call's own id.
  // The window is wide because the emits carry explanatory comments; the match
  // is LAZY, so it stops at the end of its own object and cannot pick up the id
  // from a neighbouring emit. Proven by removing the field: both go red.
  const stream = fs.readFileSync(path.join(REPO_ROOT, 'server/routes/ana-ri/stream.ts'), 'utf8');

  it("the round's tool_use announcement carries toolUseId", () => {
    const m = stream.match(/type:\s*'tool_use',\s*\n\s*round,\s*\n\s*name:\s*toolUse\.name,[\s\S]{0,2000}?\}\)\}/);
    expect(m, 'concurrent-path tool_use emit not found').not.toBeNull();
    expect(m![0]).toMatch(/toolUseId:\s*toolUse\.id/);
  });

  it('the server-run steps (web search / fetch) carry their own id on both events', () => {
    // Correct without it only because each use and result are written back to
    // back; the id keeps pairing correct if that ordering ever changes.
    const m = stream.match(/const stepId = [\s\S]{0,300}?\n[\s\S]{0,200}?type: 'tool_use'[\s\S]{0,120}?\.\.\.stepId[\s\S]{0,400}?type: 'tool_result',[\s\S]{0,80}?\.\.\.stepId/);
    expect(m, 'server-tool path does not spread stepId onto both events').not.toBeNull();
  });

  it("the round's tool_result carries toolUseId", () => {
    const m = stream.match(/type:\s*'tool_result',\s*\n\s*round,\s*\n\s*name:\s*toolUse\.name,[\s\S]{0,2000}?result:\s*resultStr/);
    expect(m, 'concurrent-path tool_result emit not found').not.toBeNull();
    expect(m![0]).toMatch(/toolUseId:\s*toolUse\.id/);
  });
});
