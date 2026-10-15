/**
 * @fileoverview The part of a saved conversation AnA is given as history.
 * @module server/services/ana/history-window
 *
 * A question is saved when its turn starts, and the answer only when the turn
 * produced one (routes/ana-ri/post-processing.ts), so a turn that failed
 * leaves a question with no answer. (A turn the person stopped is saved with
 * whatever it had written, possibly nothing; an empty one is not a turn here.) From then on the transcript's
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
  const limit = Number.isFinite(max) ? Math.max(0, Math.floor(max)) : 0;
  if (limit === 0) return [];
  const turns = messages.filter(isConversationTurn).slice(-limit);
  const opening = turns.findIndex(m => m.role === 'user');
  return opening < 0 ? [] : turns.slice(opening);
}

function isConversationTurn(message: TranscriptMessage): boolean {
  if (typeof message?.content !== 'string') return false;
  if (message.role === 'user') return true;
  // An empty answer is a turn stopped before AnA wrote a word, saved so the
  // conversation shows the stop (QA 2026-10-08, j5). It is not something she
  // said, and sent to the model it would go as a filler marker in her voice.
  return message.role === 'assistant' && message.content.trim().length > 0;
}

/** Keep the start and end of a long turn, with the missing middle named. */
export function excerptTurnContent(content: string, limit: number): string {
  if (!Number.isInteger(limit) || limit <= 0) throw new RangeError('Turn excerpt limit must be a positive integer.');
  if (content.length <= limit) return content;
  const head = Math.ceil(limit / 2);
  const tail = Math.floor(limit / 2);
  return `${content.slice(0, head)}\n[Middle of this turn omitted: ${content.length - limit} characters]\n${tail > 0 ? content.slice(-tail) : ''}`;
}

export interface ConversationWindow<T extends TranscriptMessage> {
  turns: T[];
  /** Valid user/assistant turns before windowing; excludes non-conversation rows. */
  totalTurns: number;
  omittedTurns: number;
  shortenedTurns: number;
}

/** Describe what was omitted, as well as the history that actually reaches AnA. */
export function recentTurnWindow<T extends TranscriptMessage>(
  messages: readonly T[], max: number, maxChars?: number,
): ConversationWindow<T> {
  const valid = messages.filter(isConversationTurn);
  const selected = recentTurns(valid, max);
  let shortenedTurns = 0;
  const turns = selected.map(turn => {
    const content = maxChars === undefined ? turn.content : excerptTurnContent(turn.content, maxChars);
    if (content === turn.content) return turn;
    shortenedTurns++;
    return { ...turn, content };
  });
  return { turns, totalTurns: valid.length, omittedTurns: valid.length - selected.length, shortenedTurns };
}

/** An omission is a limitation, not proof a fact was never supplied. */
export function conversationWindowNotice(window: Pick<ConversationWindow<TranscriptMessage>, 'omittedTurns' | 'shortenedTurns'>): string {
  if (window.omittedTurns === 0 && window.shortenedTurns === 0) return '';
  const limits = [
    window.omittedTurns > 0 ? `${window.omittedTurns} earlier ${window.omittedTurns === 1 ? 'turn' : 'turns'} omitted` : '',
    window.shortenedTurns > 0 ? `${window.shortenedTurns} ${window.shortenedTurns === 1 ? 'turn' : 'turns'} shortened` : '',
  ].filter(Boolean).join('; ');
  return `## Conversation context is incomplete\n${limits}. An omission marker names missing middle text. ` +
    'Do not treat this window as the full conversation, or infer that missing facts were never supplied. ' +
    'Use the corrections and clarifications that are present. If essential context is missing, ' +
    'state the specific limitation and ask only for the missing facts that materially affect this answer. ' +
    'Do not restart intake or repeat questions already answered in the available context. ' +
    'Conversation excerpts are context, not independently verified scientific or regulatory evidence.';
}
