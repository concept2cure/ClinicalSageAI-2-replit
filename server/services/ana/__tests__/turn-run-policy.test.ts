/**
 * TurnPolicy's Manual hold, driven directly with a scripted hold and run row
 * (row 74, slice S4) — for the endings the route harness cannot reach: a
 * client that disconnects while AnA is holding. Since AnA detach DT3 the hold
 * has no 'disconnected' outcome of its own (it never saw a drop: design §1,
 * row 10); a turn that cannot detach is stopped by the stream's disconnect
 * handler, which reaches the hold as the run's cancel, and the policy knows
 * the page went (noteDisconnected).
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

function scripted(outcome: RunHoldOutcome, status: RunStatus | null = 'running', opts: { cancelled?: boolean } = {}) {
  // The run's stop lands WHILE AnA holds, as it does in a turn: the abort is
  // seen only once the hold returns.
  let stopped = false;
  const frames: Array<Record<string, unknown>> = [];
  const notRun: Array<{ tool: string; round: number; why: string }> = [];
  const hold: RunHold = {
    hold: async () => {
      if (opts.cancelled) stopped = true;
      return outcome;
    },
    expired: () => outcome === 'expired',
    expiredSignal: new AbortController().signal,
    heldMs: () => 0,
  };
  const policy = new TurnPolicy({ runPolicy: 'manual', holdable: true, startedAt: 0, now: () => 0 });
  const checkpoint = policy.checkpoint({
    run: {
      hold,
      cancelled: () => stopped,
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
  it('a turn that cannot detach: the held step does not run, is filed not-run with why, and the hold is kept as disconnected', async () => {
    // The stream stopped the run for the page (client_disconnected): the hold
    // sees the run's cancel, and the policy was told the page went.
    const t = scripted('cancelled', 'cancelled', { cancelled: true });
    t.policy.noteDisconnected();
    expect(await t.checkpoint(2, [pubmed])).toBe('abort');
    expect(t.notRun).toEqual([{ tool: 'search_literature', round: 2, why: expect.stringMatching(/page was closed/) }]);
    expect(t.policy.pendingSteps).toEqual(['Label search_literature']);
    expect(t.policy.policyHolds).toEqual([
      { round: 2, reason: 'manual', next: ['Label search_literature'], outcome: 'disconnected', at: expect.any(String) },
    ]);
  });
});

describe('a detached turn whose run is stopped while AnA holds (AnA detach DT3)', () => {
  it('is filed as stopped, never as a page that closed: the page closing did not end it', async () => {
    const t = scripted('cancelled', 'cancelled', { cancelled: true });
    expect(await t.checkpoint(2, [pubmed])).toBe('abort');
    expect(t.policy.policyHolds.map(h => h.outcome)).toEqual(['stopped']);
    expect(t.notRun[0].why).not.toMatch(/page was closed/);
  });

  it('the row reason wins over what the loop saw (§2.4)', () => {
    const t = scripted('running');
    expect(t.policy.stoppedReason('cancelled', 'server_shutdown')).toBe('server_shutdown');
    expect(t.policy.stoppedReason('cancelled', 'session_ended')).toBe('session_ended');
    expect(t.policy.stoppedReason('cancelled', null)).toBe('cancelled');
  });
});

describe('a run whose row failed while AnA held, with no abort reaching the turn (AnA detach DT3, §2.4)', () => {
  it('fails closed — the step never runs — and is not filed as a person\'s Stop', async () => {
    // The reaper (or a shutdown) wrote failed; the owner has not seen the
    // abort yet. That is no person's answer.
    const t = scripted('ended', 'failed');
    expect(await t.checkpoint(2, [pubmed])).toBe('abort');
    expect(t.frames).toContainEqual(expect.objectContaining({ type: 'warning', code: 'MANUAL_UNAVAILABLE' }));
    expect(t.frames).not.toContainEqual(expect.objectContaining({ type: 'cancelled' }));
    expect(t.policy.stoppedReason('cancelled')).toBe('hold_unavailable');
  });
});

describe("a read-only turn's Manual hold names only the steps that would run (AnA detach DT3 review, 2aa766a76)", () => {
  const draft: ToolCall = { id: 'tu_d', name: 'draft_document', input: {} };
  function manualRound(pending: ToolCall[], refused: (c: ToolCall) => boolean) {
    const frames: Array<Record<string, unknown>> = [];
    const holds: string[][] = [];
    const policy = new TurnPolicy({ runPolicy: 'manual', holdable: true, startedAt: 0, now: () => 0 });
    const checkpoint = policy.checkpoint({
      run: {
        hold: { hold: async () => 'running', expired: () => false, expiredSignal: new AbortController().signal, heldMs: () => 0 },
        cancelled: () => false,
        heartbeat: () => {},
        drainSteers: async () => [],
        holdForPerson: async (next: string[]) => {
          holds.push(next);
          return true;
        },
        status: async () => 'running',
      },
      demo: () => false,
      isUngoverned: () => true,
      willRefuse: refused,
      label: (c) => `Label ${c.name}`,
      emit: (f) => frames.push(f),
      notRun: () => {},
    });
    return { checkpoint, holds, policy };
  }

  it('a step the read-only answer will refuse is not offered as "Run this step"', async () => {
    const t = manualRound([draft, pubmed], c => c.name === 'draft_document');
    await t.checkpoint(2, [draft, pubmed]);
    expect(t.holds).toEqual([['Label search_literature']]);
  });

  it('when every step would be refused, there is nothing to hold for', async () => {
    const t = manualRound([draft], () => true);
    expect(await t.checkpoint(2, [draft])).toBe('continue');
    expect(t.holds).toEqual([]);
  });
});
