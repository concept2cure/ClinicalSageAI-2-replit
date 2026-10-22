/**
 * The transcript's note for a turn stopped at the 40-minute cap of a turn that
 * goes on after its page closes (AnA detach DT3 review, finding 4.6): Auto's
 * budget words only for an Auto turn, whose limits both applied; otherwise
 * the cap that did.
 */
import { describe, expect, it } from 'vitest';
import { stoppedNoteText } from '../anaWorkModel';
import { AUTO_TIME_WORDS } from '@shared/ana/run-policy';

describe('the time-limit note', () => {
  it.each([[undefined], ['manual' as const]])('under %s: the 40-minute cap, never Auto\'s budget', policy => {
    const note = stoppedNoteText('budget_exhausted', 3, [], false, policy)!;
    expect(note).toContain('40-minute limit for a turn that goes on after its page closes');
    expect(note).not.toContain(AUTO_TIME_WORDS);
  });

  it("under Auto: Auto's budget, as before", () => {
    expect(stoppedNoteText('budget_exhausted', 3, [], false, 'auto')).toContain(AUTO_TIME_WORDS);
  });
});
