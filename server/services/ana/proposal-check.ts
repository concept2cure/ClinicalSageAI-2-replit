/**
 * A governed proposal's prose, checked before a person approves it
 * (GRD-2 / FIG-3, AnA reasoning round 3, 2026-10-05).
 *
 * When AnA proposes a write that stores her prose in a governed record — a
 * drafted authoring document, a vault version, a protocol section — the turn
 * is held and a person is asked to approve it (routes/ana-ri/stream.ts
 * awaitDecision). Until now the dialog showed such a draft as "sections: 3
 * items", and nothing checked it: a figure she invented reached the record
 * with a person's approval on it.
 *
 * The prose is the text under the input fields a model writes
 * (governed-write-tools.ts FREE_TEXT_FIELD), at any depth (a section's
 * `content`), with HTML reduced to its text by the export pipeline's own
 * reducer. It is checked by the engine that checks her answers
 * (answer-grounding.ts checkAnswer), against the same sources: what she
 * consulted this turn. The check is shown in the approval dialog and kept with
 * the pending approval on the run row, beside the command and params the
 * person approves. It never blocks the approval: the person decides.
 *
 * @module server/services/ana/proposal-check
 */

import { htmlToPlainText } from '../ectd/leaf-pdf-renderer';
import { checkAnswer, type AnswerCheck, type EvidenceEntry } from './answer-grounding';
import { FREE_TEXT_FIELD } from './governed-write-tools';

/** How deep a proposal is walked. Deeper values are not read. */
const MAX_DEPTH = 32;
/** How much prose is checked, at most. A proposal past it is checked to here. */
const MAX_CHARS = 400_000;

/** The prose a proposal would store: every string under a free-text field, at any depth, as text. */
export function proposalProse(params: unknown): string {
  const out: string[] = [];
  let chars = 0;
  const take = (s: string): void => {
    const text = htmlToPlainText(s).trim();
    if (!text || chars >= MAX_CHARS) return;
    out.push(text);
    chars += text.length;
  };
  const walk = (v: unknown, prose: boolean, depth: number): void => {
    if (depth > MAX_DEPTH || v === null || v === undefined) return;
    if (typeof v === 'string') {
      if (prose) take(v);
    } else if (Array.isArray(v)) {
      for (const x of v) walk(x, prose, depth + 1);
    } else if (typeof v === 'object') {
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) walk(x, FREE_TEXT_FIELD.test(k), depth + 1);
    }
  };
  walk(params, false, 0);
  return out.join('\n\n');
}

/** The check of a proposal's prose against this turn's sources; null when it stores no prose. */
export function checkProposal(params: unknown, sources: EvidenceEntry[]): AnswerCheck | null {
  const prose = proposalProse(params);
  return prose ? checkAnswer(prose, sources) : null;
}

/** The envelopes that put a proposal to a person (GovernedActionSignoff reads them from post_done). */
const PROPOSAL_ERRORS = new Set(['HUMAN_CONFIRMATION_REQUIRED', 'PART11_SIGNATURE_REQUIRED']);

/**
 * End-of-turn results with the check of each proposal's prose: a proposal
 * reaches the sign-off dialog at the end of a turn too (an ana-action block, a
 * command), and is checked the same way as one held mid-turn. Every other
 * result is returned as it was.
 */
export function withProposalChecks<T>(results: T[], sources: EvidenceEntry[]): T[] {
  return results.map((r) => {
    const env = r as { error?: unknown; data?: { retry?: { params?: unknown } } } | null;
    if (!env || typeof env.error !== 'string' || !PROPOSAL_ERRORS.has(env.error)) return r;
    const check = checkProposal(env.data?.retry?.params, sources);
    return check ? ({ ...env, check } as T) : r;
  });
}
