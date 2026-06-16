/**
 * AnA IVD knowledge advisor — grounded lookup over the curated IVD corpus.
 *
 *   - lookupIvdKnowledge — wraps the IVD knowledge-base search() so AnA can
 *     answer in-vitro-diagnostic questions from the curated, citation-backed
 *     corpus (FDA IVD, EU IVDR, global IVD, MDCG, analytical/clinical
 *     performance, biomarker validity, NGS/molecular, standards, HTA, legal)
 *     instead of free-generating.
 *
 * HONEST + GROUNDED: returns only curated corpus entries with their real
 * citations and last-reviewed dates. No corpus hit → an explicit "no entries"
 * result; nothing is invented. NO LLM call here — pure retrieval over the
 * frozen corpus.
 *
 * @module server/services/ana-advisory/ivd-knowledge-advisor
 */

import {
  search,
  corpusVersion,
  corpusSize,
  type ScoredEntry,
} from '../ivd-knowledge/knowledge.service';
import type { KnowledgeDomain, Jurisdiction } from '../ivd-knowledge/types';
import type { AnaAdvisoryToolSpec } from './types';

export interface IvdKnowledgeLookupInput {
  query: string;
  domain?: KnowledgeDomain;
  jurisdiction?: Jurisdiction;
  topic?: string;
  limit?: number;
}

export interface IvdKnowledgeResult {
  id: string;
  title: string;
  domain: KnowledgeDomain;
  topic: string;
  jurisdictions: Jurisdiction[];
  summary: string;
  keyPoints: string[];
  detail: string;
  citations: { label: string; source: string; url?: string }[];
  pitfalls?: string[];
  lastReviewed: string;
  score: number;
  matchedIn: string[];
}

export interface IvdKnowledgeAdvice {
  headline: string;
  corpusVersion: string;
  corpusSize: number;
  resultCount: number;
  results: IvdKnowledgeResult[];
  provenance: { generatedAt: string; modules: string[] };
}

function shape(scored: ScoredEntry): IvdKnowledgeResult {
  const e = scored.entry;
  return {
    id: e.id,
    title: e.title,
    domain: e.domain,
    topic: e.topic,
    jurisdictions: e.jurisdictions,
    summary: e.summary,
    keyPoints: e.keyPoints,
    detail: e.detail,
    citations: e.citations.map((c) => ({ label: c.label, source: c.source, url: c.url })),
    pitfalls: e.pitfalls,
    lastReviewed: e.lastReviewed,
    score: scored.score,
    matchedIn: scored.matchedIn,
  };
}

/**
 * Retrieve grounded IVD knowledge for a query. Honest: empty corpus hits yield a
 * clear "no entries" headline and an empty result set — never fabricated guidance.
 */
export function lookupIvdKnowledge(input: IvdKnowledgeLookupInput): IvdKnowledgeAdvice {
  const limit = typeof input.limit === 'number' && input.limit > 0 ? Math.min(input.limit, 15) : 5;
  const scored = search(input.query ?? '', {
    domain: input.domain,
    jurisdiction: input.jurisdiction,
    topic: input.topic,
    limit,
  });
  const results = scored.map(shape);

  const headline =
    results.length === 0
      ? `No IVD knowledge-base entries matched "${input.query}". Try a broader query or a different domain/jurisdiction filter.`
      : `${results.length} curated IVD knowledge entr${results.length === 1 ? 'y' : 'ies'} for "${input.query}" — each with citations. Ground your answer in these; do not extrapolate beyond them.`;

  return {
    headline,
    corpusVersion: corpusVersion(),
    corpusSize: corpusSize(),
    resultCount: results.length,
    results,
    provenance: {
      generatedAt: new Date().toISOString(),
      modules: ['ivd-knowledge/knowledge.service'],
    },
  };
}

/** Tool descriptor so AnA can register this grounded-lookup tool. */
export const IVD_KNOWLEDGE_TOOL_SPEC: AnaAdvisoryToolSpec = {
  name: 'ivd_knowledge_lookup',
  description:
    'Look up grounded, citation-backed knowledge about in-vitro diagnostics (IVDs) from Concept2Cure’s ' +
    'curated IVD corpus: FDA IVD pathways, EU IVDR, global IVD markets, MDCG guidance, analytical & clinical ' +
    'performance, biomarker validity, NGS/molecular, standards (ISO/CLSI), HTA/market access, and legal. ' +
    'Returns matching entries with summaries, key points, detail, citations, and pitfalls. Use this to ground ' +
    'any IVD answer in the curated corpus rather than generating from memory; if it returns no entries, say so.',
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'The IVD question or keywords to search the corpus for.' },
      domain: {
        type: 'string',
        enum: ['regulatory', 'scientific', 'legal', 'standard'],
        description: 'Optional domain filter.',
      },
      jurisdiction: {
        type: 'string',
        enum: ['US', 'EU', 'UK', 'JP', 'CN', 'BR', 'CA', 'AU', 'global'],
        description: 'Optional jurisdiction filter.',
      },
      topic: { type: 'string', description: 'Optional topic filter (grouping within a domain).' },
      limit: { type: 'number', description: 'Max entries to return (default 5, max 15).' },
    },
    required: ['query'],
  },
};

export default { lookupIvdKnowledge, IVD_KNOWLEDGE_TOOL_SPEC };
