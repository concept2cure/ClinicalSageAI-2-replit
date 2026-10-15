/**
 * TurnPolicy's Manual hold, driven directly with a scripted hold and run row
 * (row 74, slice S4) — for the endings the route harness cannot reach: a
 * client that disconnects while AnA is holding (the hold's own 'disconnected'
 * outcome needs a response that has ended mid-hold).
 *
 * The promise under test: a step AnA was holding before is never run for a
 * page that is gone, and the turn record says it was not run and why, with the
 * hold filed — a disconnect is not a person's Stop, and neither is silent.
 */
import { describe, expect, it } from 'vitest';

import type { ToolCall } from '../agentic-loop.js';
import type { RunHold, RunHoldOutcome } from '../run-hold.js';
import type { RunStatus } from '../run-status.js';
import { TurnPolicy } from '../turn-run-policy.js';

const pubmed: ToolCall = { id: 'tu_2', name: 'search_literature', input: { query: 'endpoint' } };

function scripted(outcome: RunHoldOutcome, status: RunStatus | null = 'running') {
  const frames: Array<Record<string, unknown>> = [];
  const notRun: Array<{ tool: string; round: number; why: string }> = [];
  const hold: RunHold = {
    hold: async () => outcome,
    expired: () => outcome === 'expired',
    expiredSignal: new AbortController().signal,
    heldMs: () => 0,
  };
  const policy = new TurnPolicy({ runPolicy: 'manual', holdable: true, startedAt: 0, now: () => 0 });
  const checkpoint = policy.checkpoint({
    run: {
      hold,
      cancelled: () => false,
      heartbeat: () => {},
      drainSteers: async () => [],
      holdForPerson: async () => true,
      status: async () => status,
    },
    demo: () => false,
    isUngoverned: () => true,
    label: (c) => `Label ${c.name}`,
    emit: (f) => frames.push(f),
    notRun: (c, round, why) => notRun.push({ tool: c.name, round, why }),
  });
  return { policy, checkpoint, frames, notRun };
}

describe('a client that disconnects while AnA holds', () => {
  it('the held step does not run, is filed not-run with why, and the hold is kept as disconnected', async () => {
    const t = scripted('disconnected');
    expect(await t.checkpoint(2, [pubmed])).toBe('abort');
    expect(t.notRun).toEqual([{ tool: 'search_literature', round: 2, why: expect.stringMatching(/page was closed/) }]);
    expect(t.policy.pendingSteps).toEqual(['Label search_literature']);
    expect(t.policy.policyHolds).toEqual([
      { round: 2, reason: 'manual', next: ['Label search_literature'], outcome: 'disconnected', at: expect.any(String) },
    ]);
  });
});
