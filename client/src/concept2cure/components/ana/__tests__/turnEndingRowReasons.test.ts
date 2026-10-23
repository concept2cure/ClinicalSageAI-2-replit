/**
 * A turn's ending as the client reads it from the stream's `done` frame and a
 * stored answer's metadata (anaProgress.ts readTurnEnding). Since AnA detach
 * DT3 the run row's own stops reach the page that is still attached — an
 * admin's cancel, the session's end, a shutdown, the unattended limit, the
 * reaper, an error — and each must be kept, or the turn ends with no stop
 * line at all. Found in the DT3 browser acceptance: the asker's page, after an
 * admin's Stop, showed the partial answer and no "Stopped by an administrator."
 */
import { describe, expect, it } from 'vitest';
import { readTurnEnding } from '../anaProgress';
import { stopLineText } from '../../../v2/anaWorkModel';

describe("readTurnEnding keeps the run row's reasons (AnA detach §2.10)", () => {
  it.each(['unattended_limit', 'session_ended', 'server_shutdown', 'orphaned', 'error', 'admin_cancelled'])('%s', (reason) => {
    const ending = readTurnEnding({ stoppedReason: reason, rounds: 2 });
    expect(ending.stoppedReason).toBe(reason);
    expect(stopLineText(ending.stoppedReason)).toMatch(/^Stopped/);
  });

  it('a reason this build does not know is still dropped', () => {
    expect(readTurnEnding({ stoppedReason: 'made_up' }).stoppedReason).toBeUndefined();
  });
});

/*
 * …and the transcript says it under the turn, with Continue where the stop
 * was nobody's decision (§5.3). Found in the same acceptance: after a SIGTERM
 * the reopened turn showed its answer with no note and no Continue, because
 * the transcript's note table had no line for any run-row reason.
 */
describe("the transcript's note for a run-row stop", () => {
  it.each([
    ['server_shutdown', 'Stopped: the server restarted for an update. Continue picks it up.'],
    ['orphaned', 'Stopped: the server handling this turn stopped responding. Continue picks it up.'],
    ['session_ended', 'Stopped: the sign-in or access that started this turn ended. Continue picks it up.'],
    ['unattended_limit', 'Stopped: nobody was watching for 15 minutes. Continue picks it up.'],
    ['admin_cancelled', 'Stopped by an administrator.'],
    ['error', 'Stopped: the turn ended with an error.'],
  ])('%s: "%s"', async (reason, note) => {
    const { stoppedNoteText, isContinuable } = await import('../../../v2/anaWorkModel');
    expect(stoppedNoteText(reason as never)).toBe(note);
    expect(isContinuable(reason as never)).toBe(/Continue/.test(note));
  });
});
