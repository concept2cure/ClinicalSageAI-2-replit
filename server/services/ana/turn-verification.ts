/**
 * What was checked about one AnA answer, as the person is shown it, the
 * conversation stores it and the turn record seals it (2026-10-04, AnA
 * reasoning).
 *
 * Two readings, never merged:
 *   - `check`: the engine's. Every identifier, regulation, quote and figure in
 *     the answer, compared with what AnA consulted this turn, and the verdicts
 *     it states (answer-grounding.ts). It leads.
 *   - `labels`: AnA's own [KNOWN] / [INFERRED] / [MISSING] labels, as
 *     validateEvidence reads them. A label is the model describing its own
 *     claim; it is reported as hers, never as grounding.
 *
 * Until this module the strip a reviewer read was built from the labels alone
 * ("3 of 3 claims grounded · 2 sources"), and the engine's check was computed
 * after the answer streamed, shown nowhere and not recorded.
 *
 * @module server/services/ana/turn-verification
 */

import { validateEvidence } from '../ana-ri/evidence-validation.js';
import type { EvidenceVerdict } from '../ana-ri/response-contract.js';
import { checkAnswer, type AnswerCheck, type EvidenceEntry } from './answer-grounding.js';

export interface TurnVerification {
  check: AnswerCheck;
  labels: EvidenceVerdict;
}

/** Check an answer against the turn's sources, and read its labels. */
export function verifyTurnAnswer(answer: string, entries: EvidenceEntry[]): TurnVerification {
  return { check: checkAnswer(answer, entries), labels: validateEvidence(answer, 'ana-ri') };
}
