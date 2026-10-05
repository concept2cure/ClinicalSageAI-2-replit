/**
 * The run policy's pure rules (row 74, slice S4): what the request may ask
 * for, when a turn can hold for a person, when Manual holds, and which stop
 * reason a turn reports.
 *
 * Each rule is the kind a regulated product gets wrong quietly:
 *
 *   - a policy read loosely ('AUTO', '', a number) would run a turn under a
 *     policy nobody chose;
 *   - a turn treated as holdable without an owner holds forever, because
 *     nobody may resume a run that has no owner (applyControl NOT_YOURS);
 *   - Manual that holds before the first step stops the person's own request
 *     from starting, and Manual that ignores the round never holds at all;
 *   - a hold before a step that already goes to a person (an approval) asks
 *     twice; a hold while a demonstration drives stops the tour mid-screen;
 *   - a turn whose hold expired, or which could not hold, must never report
 *     the loop's own reason (which reads as an ordinary stop).
 */
import { describe, it, expect } from 'vitest';

import {
  parseRunPolicy,
  isHoldable,
  manualHoldDue,
  turnStoppedReason,
  policyStopDirective,
} from '../run-status.js';
import {
  ANA_RUN_POLICIES,
  RUN_AGENT_TOOL,
  AUTO_ACTIVE_MS,
  AUTO_WALL_MS,
  AUTO_MAX_ROUNDS,
  MAX_PAUSE_MS,
} from '@shared/ana/run-control-limits';

const read = { name: 'search_literature' };
const agent = { name: RUN_AGENT_TOOL };
const confirm = { name: 'save_document_to_vault' };
/** The stream passes the gate's own verdict; here a write is the one that goes to a person. */
const isUngoverned = (c: { name: string }) => c.name !== confirm.name;

const due = (
  policy: 'manual' | 'auto' | null,
  upcomingRound: number,
  pending: Array<{ name: string }>,
  demo = false,
) => manualHoldDue({ policy, upcomingRound, pending, demo, isUngoverned });

describe('parseRunPolicy — only the exact names choose a policy', () => {
  it("passes 'manual' and 'auto'", () => {
    expect(parseRunPolicy('manual')).toBe('manual');
    expect(parseRunPolicy('auto')).toBe('auto');
  });

  it('anything else is no policy, not an error', () => {
    for (const raw of ['AUTO', 'Manual', '', ' auto', undefined, null, 42, true, {}, ['auto']]) {
      expect(parseRunPolicy(raw), JSON.stringify(raw)).toBeNull();
    }
  });

  it('accepts exactly the shared policy names', () => {
    expect(ANA_RUN_POLICIES.map(p => parseRunPolicy(p))).toEqual([...ANA_RUN_POLICIES]);
  });
});

describe('isHoldable — a hold needs a run row AND an owner who can resume it', () => {
  it('holds with a run and its owner', () => {
    expect(isHoldable({ runId: 'run_1', runUserId: 3 })).toBe(true);
  });

  it('not without a run row', () => {
    expect(isHoldable({ runId: '', runUserId: 3 })).toBe(false);
    expect(isHoldable({ runId: null, runUserId: 3 })).toBe(false);
  });

  it('not with an unowned run — nobody could press Run this step', () => {
    expect(isHoldable({ runId: 'run_1', runUserId: null })).toBe(false);
  });

  it('user 0 is an owner, not a missing one', () => {
    expect(isHoldable({ runId: 'run_1', runUserId: 0 })).toBe(true);
  });
});

describe('manualHoldDue — when Manual stops before a step', () => {
  it('not before round 1: the step the message asked for runs', () => {
    expect(due('manual', 1, [read])).toBe(false);
  });

  it('before round 1 when that step starts an agent', () => {
    expect(due('manual', 1, [agent])).toBe(true);
    expect(due('manual', 1, [read, agent])).toBe(true);
  });

  it('before every further step that would run without a person', () => {
    expect(due('manual', 2, [read])).toBe(true);
    expect(due('manual', 7, [read, read])).toBe(true);
  });

  it('not when every pending call already goes to a person', () => {
    expect(due('manual', 2, [confirm])).toBe(false);
  });

  it('when any pending call would run without one', () => {
    expect(due('manual', 2, [confirm, read])).toBe(true);
  });

  it('not while a demonstration drives', () => {
    expect(due('manual', 2, [read], true)).toBe(false);
    expect(due('manual', 1, [agent], true)).toBe(false);
  });

  it('never under Auto or with no policy', () => {
    expect(due('auto', 5, [read])).toBe(false);
    expect(due('auto', 1, [agent])).toBe(false);
    expect(due(null, 5, [read])).toBe(false);
  });

  it('not for an empty step', () => {
    expect(due('manual', 3, [])).toBe(false);
  });
});

describe('turnStoppedReason — the turn reports why IT stopped', () => {
  it('a hold that could not be made outranks everything', () => {
    expect(turnStoppedReason('cancelled', { holdExpired: true, holdUnavailable: true })).toBe('hold_unavailable');
    expect(turnStoppedReason('no_more_tools', { holdExpired: false, holdUnavailable: true })).toBe('hold_unavailable');
  });

  it('then an expired hold — the loop only saw an abort', () => {
    expect(turnStoppedReason('cancelled', { holdExpired: true, holdUnavailable: false })).toBe('hold_expired');
  });

  it("otherwise the loop's own reason", () => {
    for (const r of ['no_more_tools', 'max_rounds', 'duplicate_thrash', 'cancelled', 'budget_exhausted', 'approval_timeout'] as const) {
      expect(turnStoppedReason(r, { holdExpired: false, holdUnavailable: false })).toBe(r);
    }
  });
});

describe('policyStopDirective — what the stream tells the loop after each round', () => {
  const MIN = 60_000;
  const base = { runPolicy: 'auto' as const, holdExpired: false, approvalTimedOut: false, activeMs: 0, wallMs: 0 };

  it('an expired hold halts, whatever else is true', () => {
    expect(policyStopDirective({ ...base, holdExpired: true, approvalTimedOut: true, activeMs: 99 * MIN })).toBe('halt');
    expect(policyStopDirective({ ...base, runPolicy: null, holdExpired: true })).toBe('halt');
  });

  it('an unanswered approval ends a policy turn, but not a turn with no policy', () => {
    expect(policyStopDirective({ ...base, approvalTimedOut: true })).toBe('approval_timeout');
    expect(policyStopDirective({ ...base, runPolicy: 'manual', approvalTimedOut: true })).toBe('approval_timeout');
    expect(policyStopDirective({ ...base, runPolicy: null, approvalTimedOut: true })).toBeNull();
  });

  it('Auto stops past 15 minutes of work or 40 minutes in all', () => {
    expect(policyStopDirective({ ...base, activeMs: AUTO_ACTIVE_MS })).toBeNull();
    expect(policyStopDirective({ ...base, activeMs: AUTO_ACTIVE_MS + 1 })).toBe('budget_exhausted');
    expect(policyStopDirective({ ...base, wallMs: AUTO_WALL_MS })).toBeNull();
    expect(policyStopDirective({ ...base, wallMs: AUTO_WALL_MS + 1 })).toBe('budget_exhausted');
  });

  it('the time ceilings are Auto-only: Manual and no policy keep today\'s bounds', () => {
    for (const runPolicy of ['manual', null] as const) {
      expect(policyStopDirective({ ...base, runPolicy, activeMs: 99 * MIN, wallMs: 99 * MIN })).toBeNull();
    }
  });
});

describe('the Auto ceilings are the published ones', () => {
  it('20 rounds, 15 minutes of work, 40 minutes in all', () => {
    expect(AUTO_MAX_ROUNDS).toBe(20);
    expect(AUTO_ACTIVE_MS).toBe(15 * 60_000);
    expect(AUTO_WALL_MS).toBe(2 * AUTO_ACTIVE_MS + MAX_PAUSE_MS);
    expect(AUTO_WALL_MS).toBe(40 * 60_000);
  });

  it("the agent tool's name is the one the sub-agent slice registers", () => {
    expect(RUN_AGENT_TOOL).toBe('run_agent');
  });
});
