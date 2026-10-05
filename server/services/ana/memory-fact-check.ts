/**
 * Working memory keeps only what a checked answer found (FV-missed, AnA
 * reasoning round 8, 2026-10-05).
 *
 * The thread write-back (working-memory.ts) has a second model call summarise
 * the conversation into "Key Facts", decisions, next actions and an
 * objective. Every later turn reads them as memory the model is told not to
 * contradict, and after seven days the consolidation job promotes them into
 * the project's memory, which every colleague's conversation reads. Nothing
 * checked them, so a figure the answer check had reported "not found" became
 * an established fact.
 *
 * The rule, deterministic and fail-closed, reusing the answer engine
 * (checkAnswer) and each answer's stored check, never a model:
 *   - an item states no verdict (Rule 2: verdicts come from engines);
 *   - no claim in it matches a claim any answer's check reported not found;
 *   - every claim in it was found by ONE answer's check — never assembled from
 *     two answers' findings, which would vouch for a pairing neither made;
 *   - an item that claims nothing checkable is kept.
 * Anything else — an unchecked answer, a value only the person stated, a
 * figure read from a PDF the check cannot open — is withheld. That costs
 * legitimate facts once they leave the history window; it never keeps an
 * invented one.
 *
 * @module server/services/ana/memory-fact-check
 */

import { readAnswerCheck, readStoredVerification, type AnswerCheckView, type CheckedClaim } from '../../../shared/ana/answer-check-reader';
import { ANSWER_CHECK_VERSION, checkAnswer, type EvidenceEntry } from './answer-grounding.js';
import { figuresIn } from './answer-check-figures.js';
import { canonNumber } from './answer-check-sources.js';

/** An answer and the check the stream stored for it. */
export interface CheckedAnswer {
  text: string;
  check: AnswerCheckView;
}

/** What the thread's checked answers found, and what they did not. */
export interface FoundBasis {
  /** Per answer, one entry per claim its check found. */
  answers: EvidenceEntry[][];
  /** One entry per claim any answer's check reported not found. */
  notFound: EvidenceEntry[];
}

/** The fields the summary renders and the consolidation job promotes, each a list. */
export const SETTLED_LISTS = ['lockedFacts', 'decisions', 'openQuestions', 'nextActions', 'createdArtifacts', 'exclusions'] as const;

export type SettledList = (typeof SETTLED_LISTS)[number];

export type SettledSummary = { objective: string } & Record<SettledList, string[]>;

export type WithheldItems = { objective?: string } & Record<SettledList, string[]>;

/** A stored message's check, when it is this engine's and well formed. */
export function storedCheck(metadata: unknown): AnswerCheckView | null {
  const check = readStoredVerification(metadata)?.check;
  return check && check.engine === ANSWER_CHECK_VERSION ? check : null;
}

/** The check carried in hand (the current turn's), read as a stored one is. */
export function heldCheck(raw: unknown): AnswerCheckView | null {
  const check = readAnswerCheck(raw);
  return check && check.engine === ANSWER_CHECK_VERSION ? check : null;
}

const same = (a: CheckedClaim, b: CheckedClaim) => a.kind === b.kind && a.text === b.text;

/**
 * The claims an answer's check found, or null when the check does not describe
 * this text: its claims and its found count must match what the engine reads
 * in the text now.
 *
 * A check lists what it did not find, and counts what it did. The stored text
 * is the text it ran on (post-processing saves the two together) and the
 * engine is pinned by ANSWER_CHECK_VERSION, so re-reading the text gives the
 * claims it found. The counts are the second guard: a text that swapped one
 * claim for another of the same count would pass them, which needs an engine
 * change without a version bump.
 */
export function claimsFoundIn(answer: CheckedAnswer): CheckedClaim[] | null {
  const { text, check } = answer;
  const all = checkAnswer(text, []).unchecked; // with no sources, every claim is unchecked
  if (all.length !== check.claims) return null;
  const unsettled = [...check.notFound, ...check.unchecked, ...check.fromPerson, ...check.fromInput];
  const found: CheckedClaim[] = [];
  for (const claim of all) {
    const i = unsettled.findIndex((u) => same(u, claim));
    if (i >= 0) unsettled.splice(i, 1);
    else found.push(claim);
  }
  return unsettled.length === 0 && found.length === check.found ? found : null;
}

const NUMBER = /(?<![\w.])-?(?:\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?|\.\d+)/g;

/**
 * A claim as a source: a figure keeps only its own numbers. "HR (95% CI) 0.62"
 * must vouch for the 0.62, never for a "95%" a fact attaches to something else.
 */
function asSource(claim: CheckedClaim, answerText: string): EvidenceEntry {
  if (claim.kind !== 'figure') return { source: 'memory-check', content: claim.text };
  const own = figuresIn(answerText).find((f) => f.text === claim.text)?.values ?? [];
  const keep = new Set(own.map((v) => canonNumber(v)));
  const content = claim.text.replace(NUMBER, (n) => (keep.has(canonNumber(n)) ? n : '#'));
  return { source: 'memory-check', content };
}

/** What a thread's checked answers can vouch for. */
export function foundBasis(answers: CheckedAnswer[]): FoundBasis {
  const basis: FoundBasis = { answers: [], notFound: [] };
  for (const answer of answers) {
    basis.notFound.push(...answer.check.notFound.map((c) => asSource(c, answer.text)));
    const found = claimsFoundIn(answer);
    if (found && found.length > 0) basis.answers.push(found.map((c) => asSource(c, answer.text)));
  }
  return basis;
}

/** Whether one summary item may stand in memory. */
export function settleItem(item: unknown, basis: FoundBasis): boolean {
  if (typeof item !== 'string' || !item.trim()) return false;
  const own = checkAnswer(item, []);
  if (own.verdicts.length > 0) return false;
  if (own.claims === 0) return true;
  if (basis.notFound.length > 0 && checkAnswer(item, basis.notFound).found > 0) return false;
  return basis.answers.some((entries) => checkAnswer(item, entries).found === own.claims);
}

const describe = (v: unknown) => (typeof v === 'string' ? v : '[not a sentence]');

/**
 * The summarizer's output, settled field by field: what may stand, and what
 * was withheld. A field of the wrong shape is empty, never read character by
 * character or dropped with the whole row.
 */
export function settleSummary(raw: unknown, basis: FoundBasis): { structured: SettledSummary; withheld: WithheldItems } {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const objective = typeof r.objective === 'string' ? r.objective : '';
  const objectiveStands = !objective.trim() || settleItem(objective, basis);
  const structured = { objective: objectiveStands ? objective : '' } as SettledSummary;
  const withheld = (objectiveStands ? {} : { objective }) as WithheldItems;
  for (const field of SETTLED_LISTS) {
    const items: unknown[] = Array.isArray(r[field]) ? (r[field] as unknown[]) : [];
    structured[field] = items.filter((v) => settleItem(v, basis)) as string[];
    withheld[field] = items.filter((v) => !settleItem(v, basis)).map(describe);
  }
  return { structured, withheld };
}
