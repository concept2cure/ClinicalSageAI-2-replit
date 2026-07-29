/**
 * ═══════════════════════════════════════════════════════════════════════════
 *                          RAG QUERY TRANSFORMS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Query-understanding transforms that run *before* retrieval to shape what gets
 * retrieved. Each takes the raw user query and an injected route fn (the
 * pipeline's cached AI router) and returns derived queries; the pipeline then
 * retrieves on them and fuses the results.
 *
 * This module currently provides step-back prompting; multi-hop decomposition
 * is a natural follow-on that will live here too.
 */

import type { AIRequest, AIResponse } from './aiProviderRouter.js';
import type { QueryFilters } from './rag-filters.js';

/** Inject the pipeline's cached router so identical transforms reuse the result. */
export type RouteFn = (request: AIRequest) => Promise<AIResponse>;

export interface StepBackResult {
  /** The broader question, or null when the model echoed/declined (caller skips it). */
  stepBackQuery: string | null;
  tokensUsed: number;
}

/** Strip wrapping quotes, a leading "Step-back question:" echo, and surrounding whitespace. */
function cleanStepBack(raw: string): string {
  let text = raw.trim();
  text = text.replace(/^step-?back\s+question\s*:\s*/i, '').trim();
  // Strip a single pair of wrapping quotes if present.
  if (text.length >= 2 && /^["'].*["']$/.test(text)) {
    text = text.slice(1, -1).trim();
  }
  return text;
}

/**
 * Step-back prompting (Zheng et al., 2023): derive a single, more general
 * question whose answer supplies the background principles, definitions, or
 * governing framework needed to answer the specific one. Retrieving on the
 * step-back question *alongside* the original surfaces broader context that a
 * narrow query misses (e.g. the regulation a specific clause sits under).
 *
 * Returns `stepBackQuery: null` when the model returns an empty string or just
 * echoes the original — in those cases there is nothing useful to add, so the
 * caller retrieves on the original query alone.
 */
export async function generateStepBackQuery(route: RouteFn, query: string): Promise<StepBackResult> {
  const response = await route({
    taskType: 'reasoning',
    messages: [
      {
        role: 'system',
        content: `You are an expert at regulatory reasoning. Given a specific question, produce a single, more general "step-back" question whose answer provides the background principles, definitions, or governing framework needed to answer the specific question. Return ONLY the step-back question as plain text — no preamble, no quotes.`,
      },
      {
        role: 'user',
        content: `Specific question: "${query}"\n\nStep-back question:`,
      },
    ],
    maxTokens: 100,
    temperature: 0.3,
  });

  const text = cleanStepBack(response.content);
  const isUseful = text.length > 0 && text.toLowerCase() !== query.trim().toLowerCase();
  return { stepBackQuery: isUseful ? text : null, tokensUsed: response.usage.totalTokens };
}

export interface DecompositionResult {
  /** Atomic sub-questions for a multi-part query; empty when the query is atomic. */
  subQuestions: string[];
  tokensUsed: number;
}

/**
 * Multi-hop decomposition: split a complex, multi-part question into the minimal
 * set of atomic sub-questions needed to answer it, each retrievable on its own.
 * Returns an empty array when the query is already atomic (or the model echoes
 * it back as a single item) so the caller retrieves on the original alone.
 * Sub-questions are capped at `max` to bound the retrieval fan-out.
 */
export async function generateSubQuestions(
  route: RouteFn,
  query: string,
  max = 4
): Promise<DecompositionResult> {
  const response = await route({
    taskType: 'structured_output',
    messages: [
      {
        role: 'system',
        content: `You decompose complex questions for retrieval. If the question has multiple parts or requires several distinct facts to answer, break it into the minimal set of atomic sub-questions, each answerable on its own. If it is already a single atomic question, return an empty array. Return ONLY a JSON array of strings.`,
      },
      {
        role: 'user',
        content: `Question: "${query}"\n\nSub-questions (JSON array, [] if atomic):`,
      },
    ],
    maxTokens: 300,
    temperature: 0.3,
    jsonMode: true,
  });

  let subQuestions: string[] = [];
  try {
    const parsed = JSON.parse(response.content);
    const arr: unknown = Array.isArray(parsed)
      ? parsed
      : parsed.sub_questions || parsed.subQuestions || parsed.questions || [];
    if (Array.isArray(arr)) {
      subQuestions = arr
        .filter((q: unknown): q is string => typeof q === 'string' && q.trim().length > 0)
        .map(q => q.trim())
        .slice(0, max);
    }
  } catch {
    subQuestions = [];
  }

  // A single sub-question echoing the original means no real decomposition happened.
  if (subQuestions.length === 1 && subQuestions[0].toLowerCase() === query.trim().toLowerCase()) {
    subQuestions = [];
  }

  return { subQuestions, tokensUsed: response.usage.totalTokens };
}

export interface FilterExtractionResult {
  /** Filters detected in the query; empty object when the query carries no constraints. */
  filters: QueryFilters;
  tokensUsed: number;
}

/**
 * Self-querying: extract structured metadata constraints embedded in a natural
 * language question so retrieval can pre-filter, not just rank. We only ask for
 * fields a corpus can actually filter on — a document type, a source/publisher,
 * and a date range (there is no `domain` column anywhere, so we don't pretend to
 * extract one). Anything not clearly present is omitted; the model must not
 * invent constraints (over-filtering silently drops relevant results).
 *
 * Returns an empty `filters` object on parse failure or when nothing is present,
 * so the caller simply retrieves unfiltered.
 */
export async function extractQueryFilters(
  route: RouteFn,
  query: string
): Promise<FilterExtractionResult> {
  const response = await route({
    taskType: 'structured_output',
    messages: [
      {
        role: 'system',
        content: `Extract metadata filters explicitly present in the user's question, for pre-filtering a document search. Return ONLY a JSON object with any of these optional keys:
- "documentType": a document/record type if the user names one (e.g. "protocol", "guidance", "CSR", "SAP").
- "source": a source system or publisher if named (e.g. "FDA", "EMA", "ICH").
- "dateStart" / "dateEnd": ISO-8601 dates (YYYY-MM-DD) if the user constrains a time range.
Omit any key not explicitly and unambiguously present. Do NOT guess. Return {} if there are no constraints.`,
      },
      { role: 'user', content: `Question: "${query}"\n\nFilters (JSON):` },
    ],
    maxTokens: 150,
    temperature: 0,
    jsonMode: true,
  });

  const filters: QueryFilters = {};
  try {
    const parsed = JSON.parse(response.content) as Record<string, unknown>;
    if (typeof parsed.documentType === 'string' && parsed.documentType.trim()) {
      filters.atomType = parsed.documentType.trim();
    }
    if (typeof parsed.source === 'string' && parsed.source.trim()) {
      filters.source = parsed.source.trim();
    }
    const start = typeof parsed.dateStart === 'string' ? new Date(parsed.dateStart) : null;
    const end = typeof parsed.dateEnd === 'string' ? new Date(parsed.dateEnd) : null;
    // Only honour a range when both ends parse to valid dates.
    if (start && end && !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
      filters.dateRange = { start, end };
    }
  } catch {
    // Unparseable -> no filters; retrieval proceeds unfiltered.
  }

  return { filters, tokensUsed: response.usage.totalTokens };
}
