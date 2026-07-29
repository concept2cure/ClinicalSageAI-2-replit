/**
 * RAG evaluation metrics.
 *
 * Pure, dependency-free functions so they can be unit-tested without a database
 * or network. The runner (run-eval.ts) wires these to the live pipeline; these
 * functions only do the maths.
 *
 * Retrieval metrics treat a query as "hit" if any expected source id appears in
 * the retrieved set. Grounding/faithfulness are scored separately — retrieval
 * can be perfect while generation still hallucinates, and vice versa.
 */

export interface GoldItem {
  id: string;
  question: string;
  /**
   * Document/chunk ids that a correct retrieval should surface. Any one of them
   * counts as a hit. Populate these with real ids from your corpus to make the
   * retrieval metrics meaningful (see README).
   */
  expectedSourceIds?: string[];
  /** Substrings a faithful answer is expected to contain (case-insensitive). */
  expectedAnswerContains?: string[];
  /** Optional reference answer for LLM-judged faithfulness. */
  referenceAnswer?: string;
  /** Free-form tags for slicing results (e.g. "ICH", "FDA", "stats"). */
  tags?: string[];
}

/** Mean of a list of numbers; 0 for an empty list. */
export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * 1 if any expected id is within the top-k retrieved ids, else 0.
 * Aggregate across queries with `mean` to get hit-rate@k.
 */
export function hitAtK(retrievedIds: string[], expectedIds: string[], k: number): number {
  if (expectedIds.length === 0) return 0;
  const topK = new Set(retrievedIds.slice(0, k));
  return expectedIds.some(id => topK.has(id)) ? 1 : 0;
}

/** Fraction of expected ids found within top-k (recall@k). */
export function recallAtK(retrievedIds: string[], expectedIds: string[], k: number): number {
  if (expectedIds.length === 0) return 0;
  const topK = new Set(retrievedIds.slice(0, k));
  const found = expectedIds.filter(id => topK.has(id)).length;
  return found / expectedIds.length;
}

/** Fraction of top-k retrieved that are relevant (precision@k). */
export function precisionAtK(retrievedIds: string[], expectedIds: string[], k: number): number {
  if (k <= 0) return 0;
  const topK = retrievedIds.slice(0, k);
  if (topK.length === 0) return 0;
  const expected = new Set(expectedIds);
  const relevant = topK.filter(id => expected.has(id)).length;
  return relevant / topK.length;
}

/**
 * Reciprocal rank of the first relevant retrieved id (1/rank), 0 if none.
 * Aggregate with `mean` to get MRR.
 */
export function reciprocalRank(retrievedIds: string[], expectedIds: string[]): number {
  const expected = new Set(expectedIds);
  for (let i = 0; i < retrievedIds.length; i++) {
    if (expected.has(retrievedIds[i])) return 1 / (i + 1);
  }
  return 0;
}

/**
 * Fraction of expected substrings present in the answer (case-insensitive).
 * A lightweight, deterministic proxy for answer correctness that needs no LLM.
 */
export function answerContainsScore(answer: string, expectedSubstrings: string[]): number {
  if (expectedSubstrings.length === 0) return 0;
  const haystack = answer.toLowerCase();
  const present = expectedSubstrings.filter(s => haystack.includes(s.toLowerCase())).length;
  return present / expectedSubstrings.length;
}

/**
 * Detect the explicit "I couldn't find it" answer the pipeline returns when
 * retrieval is empty. Useful so we don't score a refusal as a hallucination.
 */
export function isGroundedRefusal(answer: string): boolean {
  const a = answer.toLowerCase();
  return (
    a.includes('could not find relevant information') ||
    a.includes("don't have enough information") ||
    a.includes('do not have enough information')
  );
}

export type JudgeFn = (prompt: string) => Promise<string>;

/**
 * LLM-judged faithfulness: does the answer stay grounded in the provided
 * sources? Returns a 0..1 score. Parsing is defensive — a judge that returns
 * prose still yields the first number it emits, defaulting to 0.
 */
export async function judgeFaithfulness(
  judge: JudgeFn,
  question: string,
  answer: string,
  sources: string[]
): Promise<number> {
  const prompt = `You are grading whether an answer is faithful to its sources.
Return ONLY a number between 0 and 1, where 1 means every claim in the answer is
supported by the sources and 0 means the answer is unsupported or contradicted.

Question: ${question}

Sources:
${sources.map((s, i) => `[${i + 1}] ${s}`).join('\n\n')}

Answer:
${answer}

Faithfulness score (0 to 1):`;

  const raw = await judge(prompt);
  const match = raw.match(/\d*\.?\d+/);
  if (!match) return 0;
  const value = Number(match[0]);
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
