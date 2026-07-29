/**
 * Projects spec A2 — two-mode capacity model.
 *
 * Each project runs ONE of two retrieval regimes, selected deterministically by
 * the size of its knowledge corpus:
 *   - 'in_context': corpus fits the context budget → the full project knowledge
 *     is injected into the gateway prompt (prompt-cached) by the chat path.
 *   - 'retrieval':  corpus exceeds the budget → only relevant chunks are
 *     retrieved per query (the existing hybrid + rerank path).
 *
 * The mode is computed from a single configured threshold, persisted on the
 * project row (`projects.retrieval_mode` + `knowledge_token_estimate`) so it is
 * observable and surfaceable (never silent), and recomputed when the corpus
 * changes. This module owns that computation; the chat path reads it.
 *
 * Every function is graceful: a missing column (pre-migration), an empty
 * corpus, or a transient DB error resolves to the safe default ('retrieval')
 * and never throws.
 *
 * @module server/services/projects/retrieval-mode
 */
import { pool } from '../../db.js';

export type RetrievalMode = 'in_context' | 'retrieval';

/**
 * Token budget at or below which a project runs in 'in_context' mode. A single
 * configured constant (env-overridable), per spec A2. Default 180k leaves
 * headroom under a 200k context window for the prompt scaffold + the answer.
 */
export const RETRIEVAL_MODE_THRESHOLD_TOKENS = (() => {
  const raw = parseInt(process.env.PROJECT_RETRIEVAL_INCONTEXT_THRESHOLD ?? '', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 180_000;
})();

/** ~4 chars per token — a deliberate over-estimate so we never overflow. */
export const CHARS_PER_TOKEN = 4;

/**
 * Pure mode selector (exported for unit testing). `in_context` when the corpus
 * is at or below the threshold, else `retrieval`. An empty corpus (0) is
 * `in_context` — there is nothing to retrieve, so the small-corpus regime is
 * correct and the chat path simply injects nothing.
 */
export function computeRetrievalMode(
  tokenEstimate: number,
  threshold: number = RETRIEVAL_MODE_THRESHOLD_TOKENS
): RetrievalMode {
  return tokenEstimate <= threshold ? 'in_context' : 'retrieval';
}

/**
 * Estimate the token size of a project's knowledge corpus from its indexed
 * atoms (`concept2cure_artifacts` → `lumen_data_atoms`). Tenant-scoped. Returns
 * 0 on any error so the caller degrades to 'retrieval' (the safe default).
 */
export async function estimateProjectKnowledgeTokens(
  projectId: number,
  organizationId: number
): Promise<number> {
  if (!Number.isFinite(projectId) || projectId <= 0) return 0;
  if (!Number.isFinite(organizationId) || organizationId <= 0) return 0;
  try {
    const { rows } = await pool.query(
      `SELECT COALESCE(SUM(length(a.content)), 0)::bigint AS total_chars
         FROM lumen_data_atoms a
        WHERE a.organization_id = $1
          AND a.source_type IN ('artifact', 'data_room_upload')
          AND a.source_id IN (
            SELECT artifact_id FROM concept2cure_artifacts WHERE project_id = $2
          )`,
      [organizationId, projectId]
    );
    const totalChars = Number(rows?.[0]?.total_chars ?? 0);
    if (!Number.isFinite(totalChars) || totalChars <= 0) return 0;
    return Math.ceil(totalChars / CHARS_PER_TOKEN);
  } catch (err: any) {
    console.warn('[projects] token estimate failed (defaulting to retrieval):', err?.message);
    return 0;
  }
}

export interface ProjectRetrievalModeState {
  mode: RetrievalMode;
  tokenEstimate: number;
}

/**
 * Estimate the corpus, compute the mode, persist both on the project row, and
 * return them. Tenant-scoped UPDATE. Never throws — a persist failure (e.g. the
 * columns do not exist yet) is logged and the computed state is still returned.
 */
export async function refreshProjectRetrievalMode(
  projectId: number,
  organizationId: number
): Promise<ProjectRetrievalModeState> {
  const tokenEstimate = await estimateProjectKnowledgeTokens(projectId, organizationId);
  const mode = computeRetrievalMode(tokenEstimate);
  try {
    await pool.query(
      `UPDATE projects
          SET retrieval_mode = $1, knowledge_token_estimate = $2, updated_at = NOW()
        WHERE id = $3 AND organization_id = $4`,
      [mode, tokenEstimate, projectId, organizationId]
    );
  } catch (err: any) {
    console.warn('[projects] retrieval-mode persist failed (non-fatal):', err?.message);
  }
  return { mode, tokenEstimate };
}

/**
 * Read the persisted mode for a project; if it has not been computed yet
 * (null) or the read fails, compute and persist it now (read-through).
 * Tenant-scoped. Never throws.
 */
export async function getProjectRetrievalMode(
  projectId: number,
  organizationId: number
): Promise<ProjectRetrievalModeState> {
  try {
    const { rows } = await pool.query(
      `SELECT retrieval_mode, knowledge_token_estimate
         FROM projects WHERE id = $1 AND organization_id = $2 LIMIT 1`,
      [projectId, organizationId]
    );
    const row = rows?.[0];
    if (row && row.retrieval_mode) {
      return {
        mode: row.retrieval_mode === 'in_context' ? 'in_context' : 'retrieval',
        tokenEstimate: Number(row.knowledge_token_estimate ?? 0) || 0,
      };
    }
  } catch (err: any) {
    console.warn('[projects] retrieval-mode read failed (recomputing):', err?.message);
  }
  return refreshProjectRetrievalMode(projectId, organizationId);
}

/**
 * Assemble the full project knowledge corpus as a single system-prompt block,
 * for 'in_context' mode. Atoms are concatenated most-recent first up to a
 * character budget (a deliberate hard cap so the block can never overflow the
 * context window, independent of the token estimate). Returns '' when the
 * project has no corpus or on error. Tenant-scoped.
 *
 * The default budget (~160k chars ≈ 40k tokens) is conservative; the caller
 * may pass a larger budget once prompt caching for the block is validated.
 */
export async function assembleProjectKnowledgeCorpus(
  projectId: number,
  organizationId: number,
  budgetChars = 160_000
): Promise<string> {
  if (!Number.isFinite(projectId) || projectId <= 0) return '';
  if (!Number.isFinite(organizationId) || organizationId <= 0) return '';
  try {
    const { rows } = await pool.query(
      `SELECT a.title, a.content
         FROM lumen_data_atoms a
        WHERE a.organization_id = $1
          AND a.source_type IN ('artifact', 'data_room_upload')
          AND a.source_id IN (
            SELECT artifact_id FROM concept2cure_artifacts WHERE project_id = $2
          )
        ORDER BY a.updated_at DESC`,
      [organizationId, projectId]
    );
    if (!rows?.length) return '';
    const parts: string[] = [];
    let used = 0;
    for (const r of rows) {
      const title = typeof r.title === 'string' && r.title ? r.title : 'Untitled';
      const content = typeof r.content === 'string' ? r.content : '';
      const entry = `### ${title}\n${content}\n`;
      if (used + entry.length > budgetChars) {
        const remaining = budgetChars - used;
        if (remaining > 200) {
          parts.push(`${entry.slice(0, remaining)}\n…[truncated]\n`);
        }
        break;
      }
      parts.push(entry);
      used += entry.length;
    }
    if (parts.length === 0) return '';
    return (
      '\n\n## PROJECT KNOWLEDGE (full corpus — in-context mode)\n' +
      'The complete project knowledge is provided below. Ground your answer in it ' +
      'and cite document titles where relevant.\n\n' +
      parts.join('\n')
    );
  } catch (err: any) {
    console.warn('[projects] corpus assembly failed (continuing without):', err?.message);
    return '';
  }
}
