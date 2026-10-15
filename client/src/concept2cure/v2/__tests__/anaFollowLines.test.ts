/**
 * The fixed lines a followed or detached turn says (AnA detach DT2, §2.10,
 * §3.5, §3.6, §5.1, §5.3): the stop lines and which reasons Continue may pick
 * up, the follower's phase and alert lines, the closing row's "not authorised"
 * count, and what the mirror could not show. Every one is a table entry or a
 * count of the server's events; none is a model's.
 */
import { describe, expect, it } from 'vitest';

import {
  FOLLOW_LINES,
  followPhaseLine,
  isContinuable,
  liveAlertLine,
  staleOwnerLine,
  stopLineText,
} from '../anaWorkModel';
import { CAP_LINE, GAP_LINE, mirrorLines, notAuthorisedLine, summaryRows } from '../turnSummaryRows';
import type { AnaFollow } from '../../components/ana/useAnaChat.types';
import type { TimelineEvent } from '@shared/ana/turn-timeline';

const AT = '2026-10-08T14:00:00.000Z';
const ev = (seq: number, over: Partial<TimelineEvent> = {}): TimelineEvent =>
  ({ kind: 'step', seq, at: AT, round: 1, phase: 'announced', step: `s${seq}`, task: null, source: 'vault', label: 'Searching the vault', preview: null, ...over }) as TimelineEvent;
const follow = (over: Partial<AnaFollow> = {}): AnaFollow => ({
  runId: 'r', scope: 'all', status: 'running', startedAt: 1_000_000, skewMs: 0, lastBeatAt: 1_000_000, highWater: 0, ...over,
});

describe('§2.10, §5.3: the run row’s stop lines', () => {
  it.each([
    ['unattended_limit', 'Stopped: nobody was watching for 15 minutes.'],
    ['session_ended', 'Stopped: the session that started this turn ended.'],
    ['server_shutdown', 'Stopped: the server restarted for an update.'],
    ['orphaned', 'Stopped: the server handling this turn stopped responding.'],
    ['error', 'Stopped: the turn ended with an error.'],
    ['admin_cancelled', 'Stopped by an administrator.'],
  ])('%s reads "%s"', (reason, line) => {
    expect(stopLineText(reason)).toBe(line);
  });

  it.each(['unattended_limit', 'session_ended', 'server_shutdown', 'orphaned'])('%s is continuable', (reason) => {
    expect(isContinuable(reason as never)).toBe(true);
  });

  it.each(['cancelled', 'admin_cancelled', 'error'])('%s is not: a decision, or an error to look at', (reason) => {
    expect(isContinuable(reason as never)).toBe(false);
  });
});

describe('§5.1: the follower’s lines', () => {
  it('the phase line counts announced steps, not plan updates, and reads the server’s clock', () => {
    const timeline = [ev(1), ev(2, { step: 's1' }), ev(3, { step: 'p1', source: 'plan' }), ev(4, { step: 's4' })];
    // The client is 30 s behind the server: elapsed is read on the server's clock.
    expect(followPhaseLine({ follow: follow({ skewMs: 30_000 }), timeline }, 1_000_000 + 60_000)).toBe('Working · step 2 · 1m 30s');
  });

  it('an admin sees who is being waited on, not the work', () => {
    expect(followPhaseLine({ follow: follow({ scope: 'cancel', status: 'paused' }), timeline: [] }, 1_000_000)).toBe(FOLLOW_LINES.waitingForAsker);
    expect(followPhaseLine({ follow: follow({ scope: 'cancel', status: 'awaiting_approval', approvalWaiting: true }), timeline: [] }, 1_000_000)).toBe(
      'Waiting for the person who asked to approve a step.',
    );
  });

  it('nothing once the run has ended', () => {
    expect(followPhaseLine({ follow: follow({ status: 'finished' }), timeline: [] }, 1_000_000)).toBeNull();
  });

  it('a stale owner after four missed beats (60 s), in whole minutes', () => {
    expect(staleOwnerLine(1_000_000, 1_000_000 + 60_000)).toBeNull();
    expect(staleOwnerLine(1_000_000, 1_000_000 + 61_000)).toBe("AnA hasn't reported for 1 min. The server handling this turn may have stopped.");
    expect(staleOwnerLine(1_000_000, 1_000_000 + 125_000)).toBe("AnA hasn't reported for 2 min. The server handling this turn may have stopped.");
  });

  it('the alert line, most urgent first', () => {
    expect(liveAlertLine({ follow: follow({ forbidden: 'nope', unreachable: true }), stopUnconfirmed: true }, 0)).toBe('nope');
    expect(liveAlertLine({ follow: follow({ unreachable: true }), stopUnconfirmed: true }, 0)).toBe('Stop not confirmed. Retrying.');
    expect(liveAlertLine({ follow: follow({ unreachable: true }) }, 0)).toBe("Can't reach the server. Retrying.");
    expect(liveAlertLine({ stopUnconfirmed: true }, 0)).toBe('Stop not confirmed. Retrying.');
    expect(liveAlertLine({}, 0)).toBeNull();
  });
});

describe('§2.7, §5.3: the closing row counts the steps that were not authorised', () => {
  it('one held-back step', () => {
    const events: TimelineEvent[] = [
      ev(1),
      ev(2, { step: 's1', phase: 'finished', status: 'not_run', heldBack: true }),
      { kind: 'end', seq: 3, at: AT, round: 1, outcome: 'answered', stoppedReason: null },
    ];
    const rows = summaryRows(events, [], { live: false });
    expect(rows[rows.length - 1]).toMatchObject({ kind: 'end', notes: ['1 step was not authorised and did not run.'] });
  });

  it('the count, and nothing at zero', () => {
    expect(notAuthorisedLine(0)).toBeNull();
    expect(notAuthorisedLine(3)).toBe('3 steps were not authorised and did not run.');
  });
});

describe('§3.5, §3.6: what the mirror could not show', () => {
  it('a missing seq is a gap', () => {
    expect(mirrorLines([ev(1), ev(3)], { highWater: 3 })).toEqual([GAP_LINE]);
  });
  it('a released run whose owner emitted more than was mirrored is a gap', () => {
    expect(mirrorLines([ev(1), ev(2)], { highWater: 4, released: true })).toEqual([GAP_LINE]);
    // While it runs, rows not yet flushed are not a gap.
    expect(mirrorLines([ev(1), ev(2)], { highWater: 4 })).toEqual([]);
  });
  it('the cap says so', () => {
    expect(mirrorLines([ev(1)], { highWater: 2050, truncated: true })).toEqual([CAP_LINE]);
    expect(CAP_LINE).toBe('Only the first 1,999 steps are shown while AnA works. The full list appears when the turn is recorded.');
  });
});
