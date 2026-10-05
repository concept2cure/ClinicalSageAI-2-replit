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
 * It fails closed. An answer whose record does not say which models wrote it
 * (not filed, unconfirmed, loaded from history, or an older server) cannot go
 * in as AnA's text, and the sentence says how to get one that can.
 *
 * @module client/src/concept2cure/v2/editor/anaInsertGate
 */

import type { AnaServedModel, AnaTurnRecordStatus } from '../../components/ana/useAnaChat.types';

/** The author id AnA's drafts carry on a suggestion (suggestions.ts SuggestionAuthor). */
export const ANA_SUGGESTION_AUTHOR_ID = 'ana';

const ASK_AGAIN = 'Ask again for an answer you can insert.';

/** Why one model the rule does not admit cannot write text for a document. */
function modelRefusal(m: AnaServedModel, inPart: boolean): string {
  if (m.model === null) {
    return 'One of the models that wrote this answer is not named on its record, so it cannot go into a document as AnA’s text.';
  }
  const by = `${inPart ? 'Written in part by' : 'Written by'} ${m.model}`;
  if (m.approvedForHighRisk === true) {
    return `${by}, which has not passed its performance qualification (PQ). Only a PQ-passed model may write text for a document here.`;
  }
  return `${by}, which is not approved for regulatory drafting. Ask again with Thorough effort to have an approved model write it.`;
}

/**
 * Why AnA's answer may not go into a document as her suggestion, or null when
 * it may: every model that wrote it is named, and the rule admits each.
 */
export function anaInsertRefusal(record: AnaTurnRecordStatus | null | undefined): string | null {
  if (!record) return `Which model wrote this answer is not on record here, so it cannot go into a document as AnA’s text. ${ASK_AGAIN}`;
  if (record.status === 'not_recorded') return `This answer’s record was not filed, so which model wrote it cannot be confirmed. ${ASK_AGAIN}`;
  if (record.status === 'unconfirmed') {
    return `Whether this answer’s record was filed is not confirmed, so which model wrote it is not known. ${ASK_AGAIN}`;
  }
  const served = record.servedBy ?? [];
  if (served.length === 0) return `This answer’s record does not say which model wrote it. ${ASK_AGAIN}`;
  const refused = served.find((m) => m.model === null || !m.qualified);
  return refused ? modelRefusal(refused, served.length > 1) : null;
}
