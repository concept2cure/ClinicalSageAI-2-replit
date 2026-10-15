/**
 * The integer `projects` row a turn's project names, or null (PF-10 S6a).
 *
 * The client names the open project in one of two spaces: a v2 project is a
 * regulatory_programs UUID, a legacy one an integer `projects.id`. Code that
 * needed the integer used to coerce: Number.parseInt('7abb1c22-…', 10) is 7, a
 * valid, WRONG project of the same organization, so AnA's guidance executor
 * created artifacts under it, the command executor ran with it active, and the
 * intelligence prefix read its context; Number(uuid) gave NaN, so a v2 project
 * had no working memory at all. One resolution instead:
 *
 *   - an integer (parseIntegerProjectId, fail-closed) is itself;
 *   - a program UUID is its anchor row, read by the one reader
 *     (resolveProgramProjectAnchor, the lowest id, org-scoped);
 *   - anything else is no project.
 *
 * Not strict: a failed anchor lookup is no project. The callers are advisory
 * or best-effort steps; a wrong project is worse than none. A writer that must
 * fail on "could not tell" passes strict to resolveProgramProjectAnchor itself.
 * This answers which row, not whose: a writer still asks projectBelongsToTenant.
 */
import type { RequestDb } from '../../db/requestDb';
import { looksLikeProgramUuid, parseIntegerProjectId } from '../../lib/project-id.js';
import { resolveProgramProjectAnchor } from './program-project-anchor.js';

export async function integerProjectForRef(
  /** The db, or a loader for it: only a program UUID needs a read. */
  db: RequestDb | (() => Promise<RequestDb>),
  params: { ref: unknown; orgId: number; context: string },
): Promise<number | null> {
  const asInteger = parseIntegerProjectId(params.ref);
  if (asInteger !== null) return asInteger;
  if (!looksLikeProgramUuid(params.ref)) return null;
  const handle = typeof db === 'function' ? await db() : db;
  return resolveProgramProjectAnchor(handle, {
    programId: String(params.ref).trim().toLowerCase(),
    orgId: params.orgId,
    context: params.context,
  });
}
