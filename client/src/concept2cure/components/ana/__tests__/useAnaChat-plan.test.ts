/**
 * @vitest-environment jsdom
 *
 * AnA's declared plan and the turn's context record, over a real stream.
 *
 * "Step 2 of 5" is only honest when both numbers are hers: the plan she
 * declared through `update_plan`, and the step she marked in progress. These
 * pin that the hook records exactly that — the latest plan, every change in
 * arrival order — that a malformed payload changes nothing, and that
 * `context_used` lands on the turn as the server stated it. The pure helpers
 * are pinned separately below the stream cases.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';

import { useAnaChat } from '../useAnaChat';
import { diffPlan, planPosition, readContextUsed, readPlanSteps } from '../anaProgress';

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

const lastAssistant = (result: { current: ReturnType<typeof useAnaChat> }) =>
  [...result.current.messages].reverse().find((m) => m.role === 'assistant')!;

const plan = (...s: Array<[string, 'pending' | 'in_progress' | 'completed']>) =>
  s.map(([title, status]) => ({ title, status }));

describe('the declared plan over a real stream', () => {
  it('keeps the latest plan and every change, in order', async () => {
    const { ctl, body } = openStream();
    fetchMock.mockResolvedValue({ ok: true, status: 200, body });
    const { result } = renderHook(() => useAnaChat({ projectId: 'proj_12' }));

    let sent!: Promise<unknown>;
    await act(async () => {
      sent = result.current.send('draft the CSR synopsis');
      await drain();
    });

    await act(async () => {
      ctl.enqueue(ev({ type: 'plan', round: 1, steps: plan(['Read the protocol', 'in_progress'], ['Draft the synopsis', 'pending']) }));
      await drain();
    });
    let turn = lastAssistant(result);
    expect(turn.plan).toEqual(plan(['Read the protocol', 'in_progress'], ['Draft the synopsis', 'pending']));
    expect(turn.planChanges?.map((c) => [c.kind, c.title, c.initial])).toEqual([
      ['added', 'Read the protocol', true],
      ['started', 'Read the protocol', true],
      ['added', 'Draft the synopsis', true],
    ]);

    await act(async () => {
      ctl.enqueue(ev({ type: 'plan', round: 2, steps: plan(['Read the protocol', 'completed'], ['Draft the synopsis', 'in_progress']) }));
      // A malformed update is ignored whole, never half-applied.
      ctl.enqueue(ev({ type: 'plan', round: 2, steps: [{ title: 'Read the protocol', status: 'done' }] }));
      await drain();
    });
    turn = lastAssistant(result);
    expect(turn.plan?.map((s) => s.status)).toEqual(['completed', 'in_progress']);
    expect(turn.planChanges?.slice(3).map((c) => [c.kind, c.title, c.round])).toEqual([
      ['completed', 'Read the protocol', 2],
      ['started', 'Draft the synopsis', 2],
    ]);

    await act(async () => {
      ctl.enqueue(
        ev({
          type: 'context_used',
          uploads: [{ fileId: 'f1', fileName: 'Protocol v3.pdf', mimeType: 'application/pdf', read: 'content' }],
          unresolvedUploads: 1,
          memory: [{ layer: 'project_memory', title: 'Estimand decision', documentName: 'Type B minutes' }],
          memoryStatus: 'read',
        }),
      );
      ctl.enqueue(ev({ type: 'post_done', cleanedResponse: 'Done.' }));
      ctl.close();
      await sent;
    });
    turn = lastAssistant(result);
    expect(turn.contextUsed).toEqual({
      uploads: [{ fileId: 'f1', fileName: 'Protocol v3.pdf', mimeType: 'application/pdf', read: 'content' }],
      unresolvedUploads: 1,
      memory: [{ layer: 'project_memory', title: 'Estimand decision', documentName: 'Type B minutes' }],
      memoryStatus: 'read',
    });
    // The server never completed the second step, so neither does the client.
    expect(turn.plan?.[1].status).toBe('in_progress');
  });

  it('a turn that declares no plan has none', async () => {
    const { ctl, body } = openStream();
    fetchMock.mockResolvedValue({ ok: true, status: 200, body });
    const { result } = renderHook(() => useAnaChat({}));
    let sent!: Promise<unknown>;
    await act(async () => {
      sent = result.current.send('what is an estimand?');
      await drain();
    });
    await act(async () => {
      ctl.enqueue(ev({ type: 'text', content: 'An estimand is…' }));
      ctl.enqueue(ev({ type: 'post_done', cleanedResponse: 'An estimand is…' }));
      ctl.close();
      await sent;
    });
    const turn = lastAssistant(result);
    expect(turn.plan).toBeUndefined();
    expect(planPosition(turn.plan)).toBeNull();
  });
});

describe('plan helpers', () => {
  it('planPosition counts only what she declared', () => {
    expect(planPosition(plan(['A', 'completed'], ['B', 'in_progress'], ['C', 'pending']))).toEqual({
      current: 2,
      total: 3,
      completed: 1,
    });
    // Nothing in progress: the position is the first step not yet done.
    expect(planPosition(plan(['A', 'completed'], ['B', 'pending']))?.current).toBe(2);
    expect(planPosition(plan(['A', 'completed'], ['B', 'completed']))).toEqual({ current: 2, total: 2, completed: 2 });
    expect(planPosition([])).toBeNull();
  });

  it('diffPlan reports additions, starts, completions and removals by title', () => {
    const changes = diffPlan(plan(['A', 'in_progress'], ['B', 'pending']), plan(['A', 'completed'], ['C', 'pending']), 5, 3);
    expect(changes.map((c) => [c.kind, c.title])).toEqual([
      ['completed', 'A'],
      ['added', 'C'],
      ['removed', 'B'],
    ]);
    expect(changes.every((c) => c.round === 3 && !c.initial)).toBe(true);
  });

  it('refuses malformed steps and context payloads', () => {
    expect(readPlanSteps([{ title: '', status: 'pending' }])).toBeNull();
    expect(readPlanSteps([])).toBeNull();
    expect(readContextUsed({ uploads: [], memory: [], memoryStatus: 'maybe' })).toBeNull();
    expect(readContextUsed({ uploads: 'x', memory: [], memoryStatus: 'none' })).toBeNull();
  });
});
