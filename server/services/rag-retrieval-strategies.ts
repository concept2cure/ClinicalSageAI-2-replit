/**
 * ═══════════════════════════════════════════════════════════════════════════
 *                       RAG RETRIEVAL STRATEGIES
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The query-transform retrieval strategies (HyDE, multi-query, step-back,
 * multi-hop decomposition), extracted from advancedRAGPipeline so the pipeline
 * stays a thin orchestrator over a focused, independently-testable strategy set.
 *
 * Each strategy is a plain function over a `StrategyDeps` bundle that the
 * pipeline binds to the current call's scope (tenant, threshold, corpus). The
 * strategies never touch SQL or the embedding model directly — they only
 * generate queries and fan them out through `deps.search` — so they can be unit
 * tested with trivial fakes.
 */

import type { RetrievedDocument } from './advancedRAGPipeline.js';
import { mergeByMaxScore } from './rag-fusion.js';
import { generateStepBackQuery, generateSubQuestions, type RouteFn } from './rag-query-transforms.js';

/** Primitives the strategies need, bound by the pipeline to the current call. */
export interface StrategyDeps {
  /** Cached AI-router call (HyDE / multi-query generation). */
  route: RouteFn;
  /** Pre-warm the embedding cache for a set of queries (best-effort). */
  embedBatch: (queries: string[]) => Promise<unknown>;
  /** Corpus search bound to the current threshold / tenant / artifactScope / corpus. */
  search: (query: string, limit: number) => Promise<RetrievedDocument[]>;
}

export interface StrategyResult {
  documents: RetrievedDocument[];
  /** Auxiliary LLM tokens spent generating queries (0 for pure searches). */
  tokensUsed: number;
}

/**
 * Retrieve over a set of queries and fuse the results. Shared by multi-query,
 * step-back, and decomposition.
 *
 * One batch embedding call pre-warms the text->vector cache so the per-query
 * embeds inside `search` become cache hits — N queries cost one embeddings
 * request instead of N (best-effort; on failure each search embeds its own
 * query). Searches run in parallel with the limit split across them, then
 * results are deduped by id keeping the highest score.
 */
async function retrieveOverQueries(
  deps: StrategyDeps,
  queries: string[],
  limit: number
): Promise<RetrievedDocument[]> {
  try {
    await deps.embedBatch(queries);
  } catch (error) {
    console.warn('[RAG] batch embed failed, falling back to per-query embed:', error);
  }
  const per = Math.ceil(limit / queries.length);
  const results = await Promise.all(queries.map(q => deps.search(q, per)));
  return mergeByMaxScore(results.flat());
}

/**
 * HyDE (Hypothetical Document Embeddings): generate a hypothetical authoritative
 * answer and retrieve documents similar to *it* rather than to the bare
 * question, closing the query/document phrasing gap.
 */
export async function hydeRetrieval(
  deps: StrategyDeps,
  query: string,
  limit: number
): Promise<StrategyResult> {
  const hyde = await deps.route({
    taskType: 'reasoning',
    messages: [
      {
        role: 'system',
        content: `You are a regulatory affairs expert. Generate a detailed, factual answer to the following question as if you were an authoritative regulatory document. Include specific regulatory references, requirements, and guidance. Do not mention that this is hypothetical.`,
      },
      { role: 'user', content: query },
    ],
    maxTokens: 500,
    temperature: 0.3,
  });

  const documents = await deps.search(hyde.content, limit);
  return { documents, tokensUsed: hyde.usage.totalTokens };
}

/**
 * Multi-query: expand the question into several alternative phrasings and
 * retrieve on all of them for better coverage of differently-worded sources.
 */
export async function multiQueryRetrieval(
  deps: StrategyDeps,
  query: string,
  limit: number
): Promise<StrategyResult> {
  const response = await deps.route({
    taskType: 'structured_output',
    messages: [
      {
        role: 'system',
        content: `You are a search query expert. Generate 4 alternative versions of the user's question that capture different perspectives or aspects. Return ONLY a JSON array of strings, no other text.`,
      },
      {
        role: 'user',
        content: `Original question: "${query}"\n\nGenerate 4 alternative phrasings that would help find relevant regulatory information.`,
      },
    ],
    maxTokens: 300,
    temperature: 0.5,
    jsonMode: true,
  });

  let alternatives: string[];
  try {
    const parsed = JSON.parse(response.content);
    alternatives = Array.isArray(parsed) ? parsed : parsed.queries || [query];
  } catch {
    alternatives = [query];
  }

  const queries = [query, ...alternatives.slice(0, 4)];
  return {
    documents: await retrieveOverQueries(deps, queries, limit),
    tokensUsed: response.usage.totalTokens,
  };
}

/**
 * Step-back: derive a more general question and retrieve on it alongside the
 * original to pull in governing-framework / definitional context a narrow query
 * misses. Degrades to original-only when no useful step-back is produced.
 */
export async function stepBackRetrieval(
  deps: StrategyDeps,
  query: string,
  limit: number
): Promise<StrategyResult> {
  const { stepBackQuery, tokensUsed } = await generateStepBackQuery(deps.route, query);
  const queries = stepBackQuery ? [query, stepBackQuery] : [query];
  return { documents: await retrieveOverQueries(deps, queries, limit), tokensUsed };
}

/**
 * Multi-hop decomposition: split a complex, multi-part question into atomic
 * sub-questions and retrieve each alongside the original, surfacing evidence for
 * every hop. Degrades to original-only when the question is atomic.
 */
export async function decomposeRetrieval(
  deps: StrategyDeps,
  query: string,
  limit: number
): Promise<StrategyResult> {
  const { subQuestions, tokensUsed } = await generateSubQuestions(deps.route, query);
  const queries = [query, ...subQuestions];
  return { documents: await retrieveOverQueries(deps, queries, limit), tokensUsed };
}
