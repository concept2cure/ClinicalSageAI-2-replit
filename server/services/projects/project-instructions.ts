/**
 * Project instructions → system context.
 *
 * A project's authored instructions and knowledge context are persisted to
 * `projects.settings.knowledge` by the Projects module's
 * `PATCH /api/concept2cure/projects/:id/knowledge` endpoint. Per the Projects
 * spec (A1.1) these must be prepended to the gateway system context for every
 * chat in the project. This helper is the single source of truth for reading
 * that blob (tenant-scoped) and formatting it as a system-prompt block, so the
 * two chat paths (send-message and submission-chat-handler) cannot drift.
 *
 * Graceful by design: a missing/empty blob, a non-matching project id (other
 * id space or org), or a transient DB error all yield an empty string — the
 * caller simply gets no block and the chat proceeds.
 *
 * @module server/services/projects/project-instructions
 */
import { pool } from '../../db.js';

/** Heading used for the injected block. Kept here so both call sites match. */
const PROJECT_INSTRUCTIONS_HEADING =
  '## PROJECT INSTRUCTIONS (authored for this project — follow precisely)';

export interface ProjectInstructions {
  customInstructions: string;
  context: string;
}

/**
 * Read a project's authored instructions + knowledge context, tenant-scoped.
 * Returns empty strings when absent. Never throws.
 */
export async function getProjectInstructions(
  projectId: number | string | null | undefined,
  organizationId: number | null | undefined
): Promise<ProjectInstructions> {
  const empty: ProjectInstructions = { customInstructions: '', context: '' };
  if (projectId === null || projectId === undefined || projectId === '') return empty;

  const pid =
    typeof projectId === 'string'
      ? parseInt(projectId.replace(/^proj_/, ''), 10)
      : projectId;
  if (!Number.isFinite(pid) || (pid as number) <= 0) return empty;

  // Tenant isolation: never read a project without an org filter. Production
  // callers always pass the authenticated org; absent one we fail closed
  // (return empty) rather than fall back to an unscoped, cross-tenant read.
  if (!organizationId) return empty;

  try {
    const res = await pool.query(
      'SELECT settings FROM projects WHERE id = $1 AND organization_id = $2 LIMIT 1',
      [pid, organizationId]
    );
    const settings = (res.rows?.[0]?.settings ?? {}) as Record<string, any>;
    const knowledge =
      settings.knowledge && typeof settings.knowledge === 'object'
        ? (settings.knowledge as Record<string, any>)
        : {};
    // Mirror normalizeKnowledge() in server/routes/concept2cure.ts: top-level
    // settings.customInstructions wins, then knowledge.customInstructions.
    const customInstructions = (
      typeof settings.customInstructions === 'string' && settings.customInstructions.trim()
        ? settings.customInstructions
        : typeof knowledge.customInstructions === 'string'
        ? knowledge.customInstructions
        : ''
    ).trim();
    const context = (typeof knowledge.context === 'string' ? knowledge.context : '').trim();
    return { customInstructions, context };
  } catch (err: any) {
    console.warn(
      '[projects] instruction load failed (continuing without):',
      err?.message
    );
    return empty;
  }
}

/**
 * Format project instructions as a system-prompt block. Pure function —
 * exported so it can be unit-tested without a database.
 */
export function formatProjectInstructionsBlock(instr: ProjectInstructions): string {
  const customInstructions = (instr.customInstructions || '').trim();
  const context = (instr.context || '').trim();
  if (!customInstructions && !context) return '';
  return (
    `\n\n${PROJECT_INSTRUCTIONS_HEADING}\n` +
    (customInstructions ? `${customInstructions}\n` : '') +
    (context ? `\n### Project knowledge context\n${context}\n` : '')
  );
}

/**
 * Convenience: read + format in one call. Returns '' when there is nothing to
 * inject. This is what the chat paths call.
 */
export async function getProjectInstructionsBlock(
  projectId: number | string | null | undefined,
  organizationId: number | null | undefined
): Promise<string> {
  const instr = await getProjectInstructions(projectId, organizationId);
  return formatProjectInstructionsBlock(instr);
}
