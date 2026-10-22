/**
 * The record's words for a detached turn that stopped at the 40-minute cap
 * (AnA detach DT3 review, finding 4.6). Any turn that detaches stops at
 * DETACHED_WALL_MS, whatever its run policy, with reason `budget_exhausted`;
 * the record said Auto's budget ("15 minutes of work, 40 minutes in all") for
 * a turn under no policy or Manual, where no 15-minute work limit was ever in
 * force. Auto keeps its own words: both of its limits did apply.
 */
import { describe, expect, it } from 'vitest';
import { turnStopWarning } from '../tool-trace.js';
import { AUTO_TIME_WORDS } from '@shared/ana/run-policy';

const CAP = 'stopped at the 40-minute limit for a turn that continues after its page closes';

describe('a detached turn stopped at the 40-minute cap', () => {
  it.each([[null], ['manual' as const]])('under %s: the cap that applied, never Auto\'s budget', policy => {
    const words = turnStopWarning('budget_exhausted', 4, { runPolicy: policy, detached: true });
    expect(words).toContain(CAP);
    expect(words).not.toContain(AUTO_TIME_WORDS);
    expect(words).not.toContain('15 minutes of work');
  });

  it("under Auto: Auto's own words, whose limits both applied", () => {
    expect(turnStopWarning('budget_exhausted', 4, { runPolicy: 'auto', detached: true })).toContain(AUTO_TIME_WORDS);
  });

  it('a turn that never detached is as before', () => {
    expect(turnStopWarning('budget_exhausted', 4, { runPolicy: 'auto' })).toContain(AUTO_TIME_WORDS);
  });
});
