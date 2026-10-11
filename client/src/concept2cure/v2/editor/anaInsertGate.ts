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
 * Where it is applied, and where it is NOT. This module runs in the browser
 * only, at the pane's offer, the conversation's offer and the editor bridge.
 * These do not enforce it: `PATCH /sections/:sectionId` (the section save),
 * `POST /docs/from-draft`, a section revert, and `EditorBridge.propose`. So a
 * client that skips this module, an older bundle, or a save that carries text
 * with no pending AnA mark is not refused. The server's check is its own
 * change (SEC-A-7 on round 11's review).
 *
 * Nor does the record close that gap by itself, and an earlier draft of this
 * note said it did. A decision row naming the turn is written only when a
 * person accepts or rejects a pending AnA SUGGESTION, by this same client,
 * after the edit is applied; text typed or plain-pasted into the section
 * carries no mark and produces no such row, and a decision POST that fails
 * leaves the content in place with only a toast. What the record does give is
 * narrower and worth stating exactly: where a decision row IS written, the
 * server verifies the decided words against the named turn and records every
 * model that served it (round 10).
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

/* What asking again actually gets you. It is offered only where the RECORD is
   what is missing, so a fresh turn genuinely fixes it. It deliberately does
   not promise the answer will then be insertable: in production no model has
   passed performance qualification, so a new answer meets the model refusal
   instead. Round 13 removed "Ask again with Thorough effort" for naming a
   control neither host draws; a remedy that names no control but still
   promises an outcome it cannot deliver is the same defect in quieter words. */
const ASK_AGAIN = 'Ask again to get an answer with its own record.';
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
 *
 * `unfinished` is required rather than defaulting: the rule is fail closed,
 * and a default of "it finished" is the one shape that silently admits an
 * answer the person stopped or a stream that died.
 */
export function anaInsertRefusal(record: AnaTurnRecordStatus | null | undefined, unfinished: boolean): string | null {
  if (unfinished) return 'This answer did not finish, so it can’t be inserted. Ask again to get a complete answer.';
  if (record?.status === 'not_recorded') {
    return `This answer was not recorded, so the model that wrote it can’t be checked and the answer can’t be inserted. ${ASK_AGAIN}`;
  }
  if (record?.status === 'unconfirmed') {
    return `This answer’s record is not confirmed, so the model that wrote it can’t be checked and the answer can’t be inserted. ${ASK_AGAIN}`;
  }
  const served = record?.servedBy;
  /* This page was not told (a reopened conversation, a run-recovered record, an
     older server). The record exists on the server; saying the model "can't be
     checked" would report this view's limit as a fact about the record. */
  if (!served) return `This page has no record of which model wrote this answer, ${CANT_INSERT}. ${ASK_AGAIN}`;
  if (served.length === 0) return `This answer’s record names no model, ${CANT_INSERT}. ${ASK_AGAIN}`;
  const refused = served.find((m) => m.model === null || !m.qualified);
  return refused ? modelRefusal(refused, served.length > 1) : null;
}
