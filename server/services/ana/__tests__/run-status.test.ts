/**
 * Tests — the AnA run state machine.
 *
 * The registry this replaces encoded the same rules implicitly, spread across
 * four methods that each re-checked `status === 'cancelled'`. A rule expressed
 * four times is four places to get it wrong, and the one that mattered most —
 * cancel is terminal — was the one most often re-derived.
 */

import { describe, it, expect } from 'vitest';
import {
  canTransitionRunStatus,
  isLiveRunStatus,
  statusAfterControl,
  LIVE_RUN_STATUSES,
  type RunStatus,
  MAX_PAUSE_MS,
  STALE_AFTER_MS,
} from '../run-status.js';

const ALL: RunStatus[] = [
  'running',
  'paused',
  'awaiting_approval',
  'cancelled',
  'finished',
  'failed',
];

describe('canTransitionRunStatus', () => {
  it('lets a running turn pause, gate, stop or finish', () => {
    expect(canTransitionRunStatus('running', 'paused')).toBe(true);
    expect(canTransitionRunStatus('running', 'awaiting_approval')).toBe(true);
    expect(canTransitionRunStatus('running', 'cancelled')).toBe(true);
    expect(canTransitionRunStatus('running', 'finished')).toBe(true);
  });

  it('lets a paused turn resume or be stopped', () => {
    expect(canTransitionRunStatus('paused', 'running')).toBe(true);
    expect(canTransitionRunStatus('paused', 'cancelled')).toBe(true);
  });

  it('does not let a paused turn jump to an approval gate', () => {
    // The gate is reached by EXECUTING a governed tool, and a paused run is not
    // executing. Allowing it would mean a run could be waiting on a human for a
    // call it had not made.
    expect(canTransitionRunStatus('paused', 'awaiting_approval')).toBe(false);
  });

  it('CANCEL IS TERMINAL — nothing leaves it', () => {
    // The invariant the old registry pinned, and the reason the completion
    // writer guards its UPDATE: whichever writer finishes last must not be
    // able to rewrite a run the person stopped.
    for (const to of ALL) {
      expect(canTransitionRunStatus('cancelled', to), `cancelled -> ${to}`).toBe(false);
    }
  });

  it('finished and failed are terminal too', () => {
    for (const from of ['finished', 'failed'] as RunStatus[]) {
      for (const to of ALL) {
        expect(canTransitionRunStatus(from, to), `${from} -> ${to}`).toBe(false);
      }
    }
  });

  it('never allows a self-transition', () => {
    // A no-op write that reports success would let a caller believe it changed
    // something. Every status change is a real change.
    for (const s of ALL) {
      expect(canTransitionRunStatus(s, s), `${s} -> ${s}`).toBe(false);
    }
  });

  it('is total — every pair answers true or false, never undefined', () => {
    for (const from of ALL) {
      for (const to of ALL) {
        expect(typeof canTransitionRunStatus(from, to)).toBe('boolean');
      }
    }
  });
});

describe('isLiveRunStatus', () => {
  it('counts exactly the three controllable states', () => {
    expect([...LIVE_RUN_STATUSES].sort()).toEqual(
      ['awaiting_approval', 'paused', 'running'].sort(),
    );
  });

  it('agrees with the transition table about what has settled', () => {
    // Anything that can still move is live; anything terminal is not. Two ways
    // of saying the same thing that must not drift apart.
    for (const s of ALL) {
      const canMove = ALL.some(to => canTransitionRunStatus(s, to));
      expect(isLiveRunStatus(s), s).toBe(canMove);
    }
  });
});

describe('statusAfterControl', () => {
  it('maps each control to the state it produces', () => {
    expect(statusAfterControl('pause')).toBe('paused');
    expect(statusAfterControl('resume')).toBe('running');
    expect(statusAfterControl('cancel')).toBe('cancelled');
    expect(statusAfterControl('approve')).toBe('running');
  });

  it('a steer changes no state — it is a redirect, not a transition', () => {
    // Load-bearing: a steer accepted while paused also resumes, and that resume
    // is a separate, explicit transition rather than a side effect hidden here.
    expect(statusAfterControl('interject')).toBeNull();
  });

  it('a denial continues the run without the tool, rather than ending it', () => {
    // Refusing one governed action is not cancelling the turn. The model is
    // told the person declined and adapts.
    expect(statusAfterControl('deny')).toBe('running');
    expect(statusAfterControl('deny')).not.toBe('cancelled');
  });
});

describe('the pause ceiling and the staleness ceiling have to be read together', () => {
  it('a run may be paused for LONGER than it may go without a heartbeat', () => {
    // Stated, not asserted away. MAX_PAUSE_MS (10 min) deliberately exceeds
    // STALE_AFTER_MS (5 min), so a pause the product explicitly permits outlives
    // the window the reaper uses to decide a run was orphaned by a restart.
    //
    // That is only safe because something beats THROUGH the pause: the SSE
    // keepalive in routes/ana-ri/stream.ts refreshes heartbeat_at every 15s for
    // the whole turn, including while held at a pause and during a single round
    // that runs long. Before it did, a person who paused and went to lunch had
    // their live run marked failed/orphaned by another request's sweep at the
    // five-minute mark, after which every control 409'd, no `resumed` event was
    // ever sent, and the turn completed into a row permanently recorded as
    // failed.
    //
    // This case exists so that raising MAX_PAUSE_MS, or lowering STALE_AFTER_MS,
    // lands on a comment that says what else has to be true.
    expect(MAX_PAUSE_MS).toBeGreaterThan(STALE_AFTER_MS);
  });

  it('leaves room for several keepalives inside one staleness window', () => {
    // The keepalive is 15s. If STALE_AFTER_MS ever dropped near it, a single
    // dropped beat would orphan a live run.
    const KEEPALIVE_MS = 15_000;
    expect(STALE_AFTER_MS).toBeGreaterThan(KEEPALIVE_MS * 4);
  });
});
