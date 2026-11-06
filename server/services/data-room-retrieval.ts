/**
 * Data Room retrieval for AI generation, with an honest outcome.
 *
 * Every AI path that grounds output in a tenant's Data Room has to say which
 * of three things happened, because they mean different things to a reviewer:
 *
 *   ok      retrieval ran and found evidence above the floor;
 *   empty   retrieval ran and nothing cleared the floor — a fact about the corpus;
 *   failed  retrieval did not complete — the output is ungrounded and says
 *           nothing about the corpus.
 *
 * AI section editing, template generation and deep research used to catch a
 * failure, log it, and carry on with zero sources, so an outage read exactly
 * like an empty Data Room. Authoring's AI draft already reported the three
 * states inline (authoring.router.ts, `retrievalStatus`); this is that contract
 * as one function. docs/evidence/D2/2026-10-01-retrieval-status/.
 */
import type pg from 'pg';
import { currentTenantOrgUuid } from '../db/currentTenant';
import { getEmbeddingService } from './enhancedEmbeddingService';
import { ProgramReadAccessError, readCurrentProgramActor, type ProgramAccessExecutor } from './c2c/current-program-access';
import { canAccessReportProject, getAccessibleReportProjectIds } from './report-os/project-access';

export type RetrievalStatus = 'ok' | 'empty' | 'failed';

export interface DataRoomHit {
  id: string;
  title: string;
  content: string;
  score: number;
  sourceId: string | null;
}

export interface DataRoomRetrieval {
  hits: DataRoomHit[];
  status: RetrievalStatus;
  /**
   * Why it failed, for the server log only. Null unless `failed`. Routes send
   * `status` and a fixed sentence, never this text (ci:server-error-leaks).
   */
  cause: string | null;
}

/** What a response says for each outcome, so every route says it the same way. */
export const RETRIEVAL_STATUS_MESSAGE: Record<RetrievalStatus, string> = {
  ok: 'Grounded in Data Room evidence.',
  empty: 'No Data Room evidence cleared the relevance threshold.',
  failed: 'Data Room retrieval failed, so this output is not grounded in evidence and its claims are unverified.',
};

/**
 * The projects a Data Room search may rank for this person (F1, 2026-11-05):
 * the one they name, if they can open it, or else every project they can open.
 * The policy is the project sharing policy (services/report-os/project-access.ts).
 *
 * Throws ProgramReadAccessError: 404 PROJECT_NOT_FOUND for a named project they
 * cannot open, the same answer as a project that does not exist; 403 with no
 * current member; 503 PROJECT_ACCESS_UNAVAILABLE when the check could not run.
 * [] is an evaluated answer (they can open no project), never a failure.
 */
export async function readDataRoomProjectScope(
  q: ProgramAccessExecutor,
  input: { organizationId: number | null; userId: number | null; projectId?: number },
): Promise<number[]> {
  const { organizationId, userId, projectId } = input;
  if (!organizationId || !userId) {
    throw new ProgramReadAccessError(403, 'PROJECT_ACTOR_REQUIRED', 'A current organization actor is required.');
  }
  let admitted: number[];
  try {
    const actor = await readCurrentProgramActor(q, { organizationId, userId });
    if (projectId === undefined) return await getAccessibleReportProjectIds(organizationId, actor, q);
    admitted = (await canAccessReportProject(organizationId, actor, projectId, q)) ? [projectId] : [];
  } catch (error) {
    if (error instanceof ProgramReadAccessError) throw error;
    throw new ProgramReadAccessError(503, 'PROJECT_ACCESS_UNAVAILABLE',
      'Current project access could not be verified. Nothing was searched.');
  }
  if (admitted.length === 0) throw new ProgramReadAccessError(404, 'PROJECT_NOT_FOUND', 'Project not found.');
  return admitted;
}

/**
 * Search the current session's Data Room, within `projectIds` (the person's,
 * from readDataRoomProjectScope). Never throws: a missing tenant key, a missing
 * scope, an embedding outage or a query error is `failed`, with its cause for
 * the log. An empty scope finds nothing, so it is `empty`.
 */
export async function retrieveDataRoomEvidence(
  pool: pg.Pool,
  query: string,
  options: { limit: number; minSemanticScore: number; projectIds: readonly number[] },
): Promise<DataRoomRetrieval> {
  try {
    const organizationUuid = await currentTenantOrgUuid(pool);
    if (!organizationUuid) throw new Error('no tenant key for this session');
    const rows = await getEmbeddingService(pool).searchHybrid(query, { ...options, organizationUuid });
    const hits = rows.map(r => ({
      id: r.id,
      title: r.title,
      content: r.content,
      score: r.score,
      sourceId: r.sourceId ?? null,
    }));
    return { hits, status: hits.length > 0 ? 'ok' : 'empty', cause: null };
  } catch (e: unknown) {
    const message = e instanceof Error && e.message ? e.message : 'unknown error';
    return { hits: [], status: 'failed', cause: message.slice(0, 300) };
  }
}
