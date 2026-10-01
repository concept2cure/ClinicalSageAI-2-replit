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
 * Search the current session's Data Room. Never throws: a missing tenant key,
 * an embedding outage or a query error is `failed`, with its cause for the log.
 */
export async function retrieveDataRoomEvidence(
  pool: pg.Pool,
  query: string,
  options: { limit: number; minSemanticScore: number; projectId?: string },
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
