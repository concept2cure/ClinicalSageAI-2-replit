/**
 * @fileoverview Regulatory guidance retrieval.
 *
 * Semantic search over the regulatory guidance corpus (`knowledge_entries`,
 * entryType GUIDELINE/REGULATION) used to ground generated assessments in
 * authoritative source text. Returns the most relevant excerpts for a query.
 *
 * Grounding is additive: any failure (no embeddings available, empty corpus,
 * DB error) returns an empty array so callers proceed ungrounded — it never
 * fabricates guidance.
 */

import { getPool } from '../db/runtime';
import { getEmbeddingService } from './enhancedEmbeddingService';
import { createScopedLogger } from '../utils/logger.js';

const log = createScopedLogger('guidance-retrieval');

export interface GuidanceSnippet {
  id: string;
  title: string;
  source: string | null;
  entryType: string;
  excerpt: string;
  similarity: number;
}

export interface GuidanceRetrievalOptions {
  /** Restrict to a tenant's guidance plus global (null-org) guidance. */
  organizationId?: number;
  limit?: number;
  threshold?: number;
  /** entry types to include; defaults to guidance/regulation. */
  entryTypes?: string[];
}

/**
 * Retrieve the guidance excerpts most semantically relevant to `query`.
 * Returns [] (never throws) so grounding never blocks the caller.
 */
export async function retrieveGuidance(
  query: string,
  options: GuidanceRetrievalOptions = {}
): Promise<GuidanceSnippet[]> {
  const { organizationId, limit = 5, threshold = 0.7 } = options;
  const entryTypes = options.entryTypes ?? ['GUIDELINE', 'REGULATION'];

  if (!query || !query.trim()) return [];

  try {
    const pool = getPool();
    const embeddingService = getEmbeddingService(pool);
    const { embedding } = await embeddingService.embed(query);
    const vectorLiteral = `[${embedding.join(',')}]`;

    // Tenant scoping: global (NULL-org) guidance is always visible; a tenant
    // also sees its own. -1 sentinel matches no org, so an unset organizationId
    // yields global-only. organization_id is referenced literally in the SQL.
    const orgParam = typeof organizationId === 'number' ? organizationId : -1;
    const params: unknown[] = [vectorLiteral, threshold, entryTypes, orgParam, limit];

    const { rows } = await pool.query(
      `
      SELECT id, title, source, entry_type,
             content,
             1 - (embedding <=> $1::vector) AS similarity
      FROM knowledge_entries
      WHERE embedding IS NOT NULL
        AND entry_type = ANY($3)
        AND 1 - (embedding <=> $1::vector) > $2
        AND (organization_id IS NULL OR organization_id = $4)
      ORDER BY embedding <=> $1::vector
      LIMIT $5
      `,
      params
    );

    return rows.map((row: any) => ({
      id: String(row.id),
      title: row.title,
      source: row.source ?? null,
      entryType: row.entry_type,
      excerpt: typeof row.content === 'string' ? row.content.slice(0, 800) : '',
      similarity: parseFloat(row.similarity),
    }));
  } catch (err) {
    log.warn('Guidance retrieval failed; proceeding ungrounded', {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/** Render guidance snippets into a compact prompt block, or '' when none. */
export function formatGuidanceForPrompt(snippets: GuidanceSnippet[]): string {
  if (snippets.length === 0) return '';
  const lines = snippets.map(
    (s, i) =>
      `[G${i + 1}] ${s.title}${s.source ? ` (${s.source})` : ''} — ${s.entryType}\n${s.excerpt}`
  );
  return `Authoritative regulatory guidance excerpts (cite as [G#] where relevant):\n${lines.join('\n\n')}`;
}
