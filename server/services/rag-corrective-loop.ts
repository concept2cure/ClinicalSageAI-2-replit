/**
 * ═══════════════════════════════════════════════════════════════════════════
 *                     RAG CORRECTIVE LOOP (CRAG / Self-RAG)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Self-checks that wrap generation so a query can correct itself:
 *   - gradeContextSufficiency: are the retrieved sources enough to answer?
 *   - rewriteQuery: reformulate for a second retrieval when they are not.
 *   - verifyGroundedness: is the drafted answer actually supported by the
 *     sources (a faithfulness/hallucination guard)?
 *
 * These are plain functions over an injected route fn (the pipeline's cached
 * router) so they're trivially unit-tested. The orchestration — when to
 * re-retrieve, what to do with an ungrounded answer — lives in the pipeline and
 * is OFF unless a caller opts in, so default generation behaviour is unchanged.
 *
 * Parse failures default to the non-disruptive outcome (sufficient / grounded)
 * so a flaky judge never triggers spurious re-retrieval or falsely flags a good
 * answer.
 */

import type { AIRequest, AIResponse } from './aiProviderRouter.js';

/** Inject the pipeline's cached router so identical self-checks reuse the result. */
export type RouteFn = (request: AIRequest) => Promise<AIResponse>;

function parseBoolField(content: string, field: string, fallback: boolean): boolean {
  try {
    const v = JSON.parse(content)[field];
    return typeof v === 'boolean' ? v : fallback;
  } catch {
    return fallback;
  }
}

export interface SufficiencyGrade {
  sufficient: boolean;
  tokensUsed: number;
}

/**
 * Grade whether the retrieved sources contain enough information to answer the
 * query (CRAG's retrieval evaluator). Defaults to `sufficient: true` on a parse
 * failure so a flaky grader doesn't force needless re-retrieval.
 */
export async function gradeContextSufficiency(
  route: RouteFn,
  query: string,
  sourceText: string
): Promise<SufficiencyGrade> {
  const response = await route({
    taskType: 'structured_output',
    messages: [
      {
        role: 'system',
        content: `You judge whether the provided sources contain enough information to answer the question. Respond ONLY with JSON: {"sufficient": true} or {"sufficient": false}.`,
      },
      { role: 'user', content: `Question: "${query}"\n\nSources:\n${sourceText}` },
    ],
    maxTokens: 20,
    temperature: 0,
    jsonMode: true,
  });
  return {
    sufficient: parseBoolField(response.content, 'sufficient', true),
    tokensUsed: response.usage.totalTokens,
  };
}

export interface QueryRewrite {
  query: string;
  tokensUsed: number;
}

/**
 * Reformulate the query for a second retrieval pass when the first was graded
 * insufficient. Falls back to the original query if the model returns nothing.
 */
export async function rewriteQuery(route: RouteFn, query: string): Promise<QueryRewrite> {
  const response = await route({
    taskType: 'reasoning',
    messages: [
      {
        role: 'system',
        content: `The previous search did not retrieve enough information. Rewrite the question into a single, more effective retrieval query — expand acronyms, add synonyms, and make implicit constraints explicit. Return ONLY the rewritten query as plain text.`,
      },
      { role: 'user', content: `Question: "${query}"\n\nRewritten query:` },
    ],
    maxTokens: 100,
    temperature: 0.3,
  });
  const rewritten = response.content.trim().replace(/^["']|["']$/g, '').trim();
  return {
    query: rewritten.length > 0 ? rewritten : query,
    tokensUsed: response.usage.totalTokens,
  };
}

export interface GroundednessCheck {
  grounded: boolean;
  tokensUsed: number;
}

/**
 * Verify that every factual claim in the drafted answer is supported by the
 * sources (faithfulness / hallucination guard). Defaults to `grounded: true` on
 * a parse failure so a flaky verifier doesn't falsely flag a good answer.
 */
export async function verifyGroundedness(
  route: RouteFn,
  answer: string,
  sourceText: string
): Promise<GroundednessCheck> {
  const response = await route({
    taskType: 'structured_output',
    messages: [
      {
        role: 'system',
        content: `You are a faithfulness checker. Determine whether EVERY factual claim in the answer is directly supported by the sources. If any claim is unsupported or contradicted, it is not grounded. Respond ONLY with JSON: {"grounded": true} or {"grounded": false}.`,
      },
      { role: 'user', content: `Sources:\n${sourceText}\n\nAnswer:\n${answer}` },
    ],
    maxTokens: 20,
    temperature: 0,
    jsonMode: true,
  });
  return {
    grounded: parseBoolField(response.content, 'grounded', true),
    tokensUsed: response.usage.totalTokens,
  };
}
