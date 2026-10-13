/**
 * SagePlus Service
 *
 * Provides advanced regulatory writing and analytics capabilities for Concept2Cure.
 */
import { createContextLogger } from './utils/logger';
import { pool, query } from './db';

const logger = createContextLogger('sage-plus-service');

// SagePlus service configuration
const DEFAULT_CONFIG = {
  modelVersion: 'latest',
  enhancedValidation: true,
  autoSuggestions: true,
  maxCompletionTokens: 1000,
};

/**
 * Get documents from the knowledge base.
 *
 * ── Unreachable, and the fabricated fallback is gone (2026-10-12) ───────────
 * Nothing imports this. `server/routes/health.ts` is the only mounted entry
 * into this module and it imports `healthCheck` alone, so no per-request path
 * reaches the search below. That is recorded in
 * scripts/ci/unkeyed-request-tables-baseline.json against
 * `knowledge_documents`, which carries no tenant column, has RLS off and no
 * policy — so the `content ILIKE` search would be cross-tenant the day it is
 * mounted.
 *
 * Measured 2026-10-12, and it changes what this function IS: `knowledge_documents`
 * has no writer anywhere (only a PGlite test fixture), no seed in any migration
 * — so under RULE 1 nothing can reach a deployed database — no drizzle model,
 * and zero rows on a deploy-shaped database. The search has nothing to find.
 * Whether that means delete it or build the knowledge base is a product
 * decision: docs/work-orders/WO-19-graphrag-reads-are-inert.md, §2.
 *
 * What IS fixed here is the fallback. When `pool` was null this returned a
 * SYNTHESIZED document row — `{ id: 'fallback-1', title: 'Database connection
 * required', status: 'active' }` — to a caller asking for knowledge-base
 * documents. CLAUDE.md: "Fail closed, never fabricate … An error is never
 * rendered as an empty result", and a fabricated row is worse than an empty
 * one: `status: 'active'` presents an infrastructure failure as a published
 * document. It throws now. Safe to change with no caller, and it means the
 * first caller inherits the honest behaviour instead of the fixture.
 */
export async function getKnowledgeDocuments(options: {
  query?: string;
  category?: string;
  limit?: number;
  offset?: number;
}): Promise<any[]> {
  const { query: searchQuery = '', category = '', limit = 10, offset = 0 } = options;

  if (!pool) {
    // Not an empty result — the caller asked a question that could not be
    // answered, and must be able to tell that apart from "no documents match".
    throw new Error('Knowledge base unavailable: no database connection is configured');
  }

  try {
    const searchPattern = searchQuery === '' ? '' : `%${searchQuery}%`;
    const result = await query(
      `SELECT * FROM knowledge_documents 
         WHERE ($1 = '' OR title ILIKE $1 OR content ILIKE $1)
         AND ($2 = '' OR category = $2)
         ORDER BY updated_at DESC
         LIMIT $3 OFFSET $4`,
      [searchPattern, category, limit, offset]
    );

    return result.rows;
  } catch (error: any) {
    logger.error('Error fetching knowledge documents', { error: error.message });
    throw error;
  }
}

/**
 * Get regulatory compliance status.
 *
 * ── Unreachable, and it no longer invents a verdict (2026-10-12) ────────────
 * Nothing imports this either. It read `regulatory_status` and, when the row
 * was absent OR when there was no pool at all, returned
 * `{ status: 'pending', issues: [] }` — a compliance verdict, with an empty
 * issue list, synthesized by a service. CLAUDE.md: "Numbers, verdicts and
 * governed content come from deterministic engines", and "an error is never
 * rendered as an empty result". "No issues" is the most dangerous possible
 * default for a compliance read, and it was returned both for a product that
 * has never been assessed and for a database that could not be reached.
 *
 * Now: a missing pool throws, and an absent row returns null — "nothing
 * recorded for this product", which a caller can render as an honest empty
 * state. It no longer claims `pending` with no issues for either case. Safe to
 * change with no caller.
 */
export async function getComplianceStatus(productId: string): Promise<any | null> {
  if (!pool) {
    throw new Error('Compliance status unavailable: no database connection is configured');
  }

  try {
    const result = await query('SELECT * FROM regulatory_status WHERE product_id = $1', [
      productId,
    ]);

    if (result.rows.length > 0) {
      return result.rows[0];
    }

    // Absent, not pending. The distinction is the whole point: "assessed and
    // clear" and "never assessed" are different facts, and only the record can
    // say which this is.
    logger.info('No compliance status recorded for product', { productId });
    return null;
  } catch (error: any) {
    logger.error('Error getting compliance status', {
      error: error.message,
      productId,
    });
    throw error;
  }
}

/**
 * Get service configuration
 */
export function getConfiguration(): typeof DEFAULT_CONFIG {
  return { ...DEFAULT_CONFIG };
}

/**
 * Check service health.
 *
 * ── Why the status is computed rather than stated (fixed 2026-10-12) ────────
 * This returned `status: 'operational'` UNCONDITIONALLY. The database probe's
 * result went into `databaseConnected`, the failure went into the log, and the
 * status said "operational" either way — including when `SELECT 1` threw and
 * when there is no pool at all.
 *
 * It is not a cosmetic field. routes/health.ts makes it a conjunct of the deep
 * check's verdict:
 *
 *     const isHealthy =
 *       (databaseResult.status === 'ok' || databaseResult.status === 'not_configured') &&
 *       sagePlusResult.status === 'operational' && …
 *     res.status(isHealthy ? 200 : 503).json(healthReport);
 *
 * A conjunct that is always true contributes nothing, so that line was dead and
 * `services.sagePlus.status` read "operational" to any monitor while this
 * service could not reach the database. The aggregate verdict survived only
 * because `databaseResult` is probed separately on the same request.
 *
 * The existing suite did not catch it, and the way it missed is worth keeping:
 * health-5xx-containment.test.ts mocks this function as a REJECTION to exercise
 * the SagePlus-degraded path. That proves routes/health.ts's catch branch, which
 * is real, but this function never throws — it catches internally — so the state
 * the test asserts is one the production code cannot produce.
 *
 * Three states now, and the vocabulary deliberately matches the database row in
 * routes/health.ts so a missing pool does not turn a dev or test environment
 * 503: 'operational' | 'degraded' | 'not_configured'.
 *
 * No failure detail is returned. The caller's own `probeFailed` keeps driver
 * text out of the response body ("the detail is in the server log") and that
 * suite asserts it; adding a message here would be a second, unguarded way for
 * `getaddrinfo ENOTFOUND …` to reach a public health payload.
 */
export async function healthCheck(): Promise<{
  status: 'operational' | 'degraded' | 'not_configured';
  databaseConnected: boolean;
  timestamp: string;
}> {
  const timestamp = new Date().toISOString();

  if (!pool) {
    // Genuinely reachable: server/db/runtime.ts leaves `pool` null when neither
    // DATABASE_URL nor DATABASE_NEON_NEW_SECRET is set, and when initialisation
    // throws. Not an outage — nothing was configured to be up.
    return { status: 'not_configured', databaseConnected: false, timestamp };
  }

  try {
    const result = await query('SELECT 1');
    const databaseConnected = result.rows.length > 0;
    return {
      status: databaseConnected ? 'operational' : 'degraded',
      databaseConnected,
      timestamp,
    };
  } catch (error) {
    logger.error('Database health check failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { status: 'degraded', databaseConnected: false, timestamp };
  }
}

/**
 * CSR Reports schema export for compatibility
 */
export const csrReports = {
  name: 'csr_reports',
  columns: {
    id: 'id',
    title: 'title',
    content: 'content',
    metadata: 'metadata',
    created_at: 'created_at',
    updated_at: 'updated_at',
  },
};

/**
 * CSR Details schema export for compatibility
 */
export const csrDetails = {
  name: 'csr_details',
  columns: {
    id: 'id',
    report_id: 'report_id',
    detail_type: 'detail_type',
    data: 'data',
    created_at: 'created_at',
  },
};
