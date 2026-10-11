/**
 * Whether AnA's answer may go into a document as her suggestion (AnA
 * reasoning round 11, GRD-missed, 2026-10-05).
 *
 * The rule is the governed-write rule every other door that stores
 * model-authored text already applies: governed tools, governed commands,
 * confirmed proposals, and at the gateway the AI draft panel and batch draft
 * (docs/LAUNCH_DEFINITION_OF_DONE.md, D4: "tools and routes that store
 * model-authored content refuse an unapproved serving model"). It holds in
 * every section, as theirs does. Which models wrote the answer, and what RULE 2
 * says of each, is the server's to say: the turn's record status carries it
 * (`servedBy`, server/services/ai-governance/approved-models.ts
 * qualifyServedModels). This only applies it.
 *
 * It fails closed. An answer that did not finish, or whose models this view
 * was not told (not recorded, unconfirmed, loaded from history, an older
 * server), cannot go in as AnA's text.
 *
 * Where it is applied (round 13): in the browser only, at the pane's offer,
 * the conversation's offer and the editor bridge. The section save does not
 * yet check it, so a client that skips this module is not refused; the
 * server's check at save is its own change (SEC-A-7 on round 11's review).
 * The decision on each suggestion is recorded against its turn on the server
 * (round 10), so what such a save let in is on the record.
 *
 * What a refusal says (round 13, round 11's UI review). It names no control
 * the pane or the conversation does not draw: neither can set the effort a
 * turn runs at, and in production no approved model has passed performance
 * qualification yet, so "ask again with Thorough effort" ended in a second
 * refusal. It says "worked on", not "wrote part of": the record shows which
 * models served the turn, not which words each wrote. And it tells what this
 * view was not told apart from what the record says.
 *
 * @module client/src/concept2cure/v2/editor/anaInsertGate
 */

import type { AnaChatMessage, AnaServedModel, AnaTurnRecordStatus } from '../../components/ana/useAnaChat.types';
import { progressCutShort } from '../anaWorkModel';

/** The author id AnA's drafts carry on a suggestion (suggestions.ts SuggestionAuthor). */
export const ANA_SUGGESTION_AUTHOR_ID = 'ana';

const ASK_AGAIN = 'Ask again to get a new answer.';
const CANT_INSERT = 'so the answer can’t be inserted';

/**
 * Whether the answer's text is unfinished: the person stopped it, the stream
 * failed, its last phase was cut short, the run was cancelled, or the answer
 * itself was cut off. An answer the loop or the run policy forced to an end
 * (the round limit, an unanswered approval) is whole text, so it is not one:
 * what it could not check, the answer check says.
 */
export function answerUnfinished(turn: AnaChatMessage): boolean {
  return (
    turn.stopped === true ||
    turn.interrupted === true ||
    progressCutShort(turn) ||
    turn.stoppedReason === 'cancelled' ||
    turn.stoppedReason === 'answer_cut_off'
  );
}

/** Why one model the rule does not admit means the answer cannot go into a document. */
function modelRefusal(m: AnaServedModel, several: boolean): string {
  if (m.model === null) {
    const which = several ? 'one of the models that worked on' : 'the model that wrote';
    return `The record does not name ${which} this answer, ${CANT_INSERT}. ${ASK_AGAIN}`;
  }
  const by = several
    ? `More than one model worked on this answer, including ${m.model}`
    : `This answer was written by ${m.model}`;
  if (m.approvedForHighRisk === true) {
    return `${by}, which has not passed performance qualification, ${CANT_INSERT}. Asking again will not change that.`;
  }
  return `${by}, which is not approved for regulatory drafting, ${CANT_INSERT}.`;
}

/**
 * Why AnA's answer may not go into a document as her suggestion, or null when
 * it may: it finished, every model that worked on it is named, and the rule
 * admits each.
 */
export function anaInsertRefusal(record: AnaTurnRecordStatus | null | undefined, unfinished = false): string | null {
  if (unfinished) return `This answer did not finish, so it can’t be inserted. ${ASK_AGAIN}`;
  if (record?.status === 'not_recorded') {
    return `This answer was not recorded, so the model that wrote it can’t be checked and the answer can’t be inserted. ${ASK_AGAIN}`;
  }
  if (record?.status === 'unconfirmed') {
    return `This answer’s record is not confirmed, so the model that wrote it can’t be checked and the answer can’t be inserted. ${ASK_AGAIN}`;
  }
  const served = record?.servedBy;
  if (!served) return `The model that wrote this answer can’t be checked, ${CANT_INSERT}. ${ASK_AGAIN}`;
  if (served.length === 0) return `This answer’s record names no model, ${CANT_INSERT}. ${ASK_AGAIN}`;
  const refused = served.find((m) => m.model === null || !m.qualified);
  return refused ? modelRefusal(refused, served.length > 1) : null;
}
