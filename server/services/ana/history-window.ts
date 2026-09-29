/**
 * @fileoverview The part of a saved conversation AnA is given as history.
 * @module server/services/ana/history-window
 *
 * A question is saved when its turn starts, and the answer only when the turn
 * produced one (routes/ana-ri/post-processing.ts), so a turn that failed or
 * was stopped leaves a question with no answer. From then on the transcript's
 * question/answer pairs are offset by one, and a window of the last N messages
 * can open on an answer. The Messages API's error reference lists a
 * conversation that opens on an assistant turn as a 400, and the offset is
 * permanent: every later turn of that conversation would carry it, not just
 * the one after the failure. Two questions in a row are not a problem — the
 * API combines consecutive turns of the same role.
 */

export interface TranscriptMessage {
  role: string;
  content: string;
}

/**
 * The most recent `max` messages of a transcript as the model may take them:
 * user and assistant turns only, opening on a user turn. What is dropped is
 * at most the answers at the far edge of the window, whose question already
 * fell outside it.
 */
export function recentTurns<T extends TranscriptMessage>(messages: readonly T[], max: number): T[] {
  const turns = messages.filter(m => m.role === 'user' || m.role === 'assistant').slice(-max);
  const opening = turns.findIndex(m => m.role === 'user');
  return opening < 0 ? [] : turns.slice(opening);
}
