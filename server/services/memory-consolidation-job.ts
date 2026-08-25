/**
 * Memory Consolidation Job (E8)
 *
 * Runs nightly to consolidate stale working memories into permanent
 * project intelligence entries. Uses node-cron for scheduling.
 *
 * This is the ONLY path by which anything AnA learns in conversation becomes
 * durable, cross-thread memory — client/project memory entries are otherwise
 * written solely by document ingestion. Three properties keep it honest:
 *
 * - Project resolution accepts BOTH row shapes: conversation-keyed rows
 *   resolve through concept2cure_conversations, and thread-keyed rows (the
 *   live AnA chat path writes conversation_id NULL) resolve through their own
 *   project_id, recorded at write time. A row with no resolvable project is
 *   never promoted — we do not guess attribution after the fact.
 * - Every promotion passes the memory-acceptance gate (provenance, confidence,
 *   dedupe, contradiction). Rejections are final; contradictions are stored
 *   quarantined as status 'pending_review', which the recall paths exclude
 *   (they filter status = 'active') until a human clears them.
 * - Promoted entries are embedded, because semantic recall filters
 *   `embedding IS NOT NULL` — an unembedded entry is durable but invisible.
 *   Embedding failure stores the entry anyway and warns, never drops it.
 *
 * Strategy:
 * - Finds conversation_working_memory entries older than STALE_THRESHOLD_DAYS
 * - Resolves project context (conversation join OR the row's own project_id)
 * - Skips rows that already have a corresponding 'conversation_summary'
 *   entry in project_memory_entries (no consolidated_at column needed)
 * - Gates, embeds, and inserts consolidated summaries as project_memory_entries
 *
 * @module server/services/memory-consolidation-job
 */

import cron from 'node-cron';
import { pool } from '../db.js';
import { withTenantConnection } from '../db/withTenantConnection';
import { createScopedLogger } from '../utils/logger.js';
import {
  evaluateMemoryCandidate,
  type MemoryProvenance,
} from './ana-ri/memory-acceptance.js';
import { getEmbeddingService } from './enhancedEmbeddingService.js';

const logger = createScopedLogger('memory-consolidation');

// ── Configuration ────────────────────────────────────────────────────────────

const CONSOLIDATION_SCHEDULE = '0 2 * * *'; // 2 AM UTC daily
const STALE_THRESHOLD_DAYS = 7;
const BATCH_SIZE = 50;

// ── Types ────────────────────────────────────────────────────────────────────

export interface ConsolidationResult {
  threadsProcessed: number;
  memoriesConsolidated: number;
  skipped: number;
  /** Promotions the acceptance gate refused outright (junk, duplicates, sub-floor confidence). */
  rejectedByGate: number;
  /** Promotions stored as status 'pending_review' because they contradict existing memory. */
  quarantined: number;
  errors: number;
  startedAt: Date;
  completedAt: Date;
}

interface StaleMemoryRow {
  id: number;
  conversation_id: number | null;
  thread_id: string | null;
  organization_id: number;
  structured_data: Record<string, unknown> | null;
  summary: string;
  generated_at: Date;
  /** COALESCE(conversation's project, the row's own project_id) — never null once selected. */
  project_id: number;
  project_profile_id: number | null;
}

// ── Core Logic ───────────────────────────────────────────────────────────────

/**
 * Find stale working memories that need consolidation.
 *
 * Resolves a project for BOTH row shapes: conversation-keyed rows through
 * concept2cure_conversations (LEFT JOIN — the live AnA chat path writes
 * conversation_id NULL, and the old INNER JOIN silently excluded every one of
 * its rows from promotion, forever), and thread-keyed rows through their own
 * project_id column (20260820 migration), recorded at write time. Rows where
 * neither resolves are not promoted.
 *
 * Left-joins to project_memory_entries to skip already-consolidated rows
 * (identified by category = 'conversation_summary' and the title carrying the
 * conversation_working_memory id).
 */
async function findStaleMemories(batchSize: number): Promise<StaleMemoryRow[]> {
  // Cross-tenant by design: scans every org for stale memories. Runs under
  // app_super_admin role so the RLS policy from 0021 lets the query through
  // even when RLS_ENFORCE=on. tenantId='0' is a placeholder — the
  // super-admin clause matches regardless of its value.
  return withTenantConnection<StaleMemoryRow[]>(
    {
      tenantId: '0',
      role: 'app_super_admin',
      source: 'job',
      caller: 'memory-consolidation-job:findStaleMemories',
    },
    async client => {
      const result = await client.query<StaleMemoryRow>(
        `SELECT
           cwm.id,
           cwm.conversation_id,
           cwm.thread_id,
           cwm.organization_id,
           cwm.structured_data,
           cwm.summary,
           cwm.generated_at,
           COALESCE(cc.project_id, cwm.project_id) AS project_id,
           pip.id AS project_profile_id
         FROM conversation_working_memory cwm
         LEFT JOIN concept2cure_conversations cc
           ON cwm.conversation_id = cc.id
         LEFT JOIN project_intelligence_profiles pip
           ON pip.project_id = COALESCE(cc.project_id, cwm.project_id)
           AND pip.organization_id = cwm.organization_id
         WHERE cwm.generated_at < NOW() - INTERVAL '${STALE_THRESHOLD_DAYS} days'
           AND COALESCE(cc.project_id, cwm.project_id) IS NOT NULL
           AND NOT EXISTS (
             SELECT 1 FROM project_memory_entries pme
             WHERE pme.project_id = COALESCE(cc.project_id, cwm.project_id)
               AND pme.category = 'conversation_summary'
               AND pme.title LIKE '%cwm_' || cwm.id::text || '%'
           )
         ORDER BY cwm.generated_at ASC
         LIMIT $1`,
        [batchSize]
      );
      return result.rows;
    }
  );
}

type ConsolidationOutcome = 'consolidated' | 'quarantined' | 'rejected' | 'skipped';

/**
 * How many existing project memories the acceptance gate compares a candidate
 * against for dedupe/contradiction. Most recent first — the freshest memory is
 * the memory a contradiction matters against.
 */
const GATE_COMPARISON_LIMIT = 50;

/**
 * Embed consolidated content to a pgvector literal, best-effort. Semantic
 * recall filters `embedding IS NOT NULL`, so an entry stored without one is
 * durable but invisible to similarity search — store it anyway and warn,
 * because losing the memory outright is strictly worse.
 */
async function embedContentToLiteral(content: string, memoryId: number): Promise<string | null> {
  try {
    const { embedding } = await getEmbeddingService(pool).embed(content, 'text-embedding-3-small');
    return `[${embedding.join(',')}]`;
  } catch (err) {
    logger.warn(
      `Embedding failed for memory ${memoryId} — storing without embedding (invisible to ` +
        `semantic recall until re-embedded): ${err instanceof Error ? err.message : 'unknown error'}`
    );
    return null;
  }
}

/**
 * Consolidate a single working memory record into a project memory entry.
 *
 * Runs inside a `withTenantConnection` scope: the dedicated client has
 * app.current_tenant_id set to memory.organization_id, so the INSERT is
 * accepted by the RLS policy from 0021 even when RLS_ENFORCE=on.
 */
async function consolidateMemory(memory: StaleMemoryRow): Promise<ConsolidationOutcome> {
  return withTenantConnection(
    {
      tenantId: memory.organization_id,
      source: 'job',
      caller: 'memory-consolidation-job:consolidateMemory',
    },
    client => consolidateMemoryInner(memory, client)
  );
}

async function consolidateMemoryInner(
  memory: StaleMemoryRow,
  client: import('pg').PoolClient
): Promise<ConsolidationOutcome> {
  try {
    // Parse structured data
    const structured =
      typeof memory.structured_data === 'string'
        ? JSON.parse(memory.structured_data)
        : memory.structured_data;

    // Build consolidated content from both structured data and raw summary
    const parts: string[] = [];
    let structuredFieldsPopulated = 0;

    if (structured) {
      if (structured.objective) {
        structuredFieldsPopulated++;
        parts.push(`Objective: ${structured.objective}`);
      }
      if (Array.isArray(structured.lockedFacts) && structured.lockedFacts.length > 0) {
        structuredFieldsPopulated++;
        parts.push(`Key facts: ${structured.lockedFacts.join('; ')}`);
      }
      if (Array.isArray(structured.decisions) && structured.decisions.length > 0) {
        structuredFieldsPopulated++;
        parts.push(`Decisions: ${structured.decisions.join('; ')}`);
      }
      if (Array.isArray(structured.openQuestions) && structured.openQuestions.length > 0) {
        structuredFieldsPopulated++;
        parts.push(`Open questions: ${structured.openQuestions.join('; ')}`);
      }
      if (Array.isArray(structured.nextActions) && structured.nextActions.length > 0) {
        structuredFieldsPopulated++;
        parts.push(`Next actions: ${structured.nextActions.join('; ')}`);
      }
      if (Array.isArray(structured.createdArtifacts) && structured.createdArtifacts.length > 0) {
        structuredFieldsPopulated++;
        parts.push(`Artifacts: ${structured.createdArtifacts.join('; ')}`);
      }
    }

    // Fall back to raw summary if structured data yielded nothing
    const consolidatedContent = parts.length > 0 ? parts.join('\n') : memory.summary;

    if (!consolidatedContent || !consolidatedContent.trim()) {
      logger.warn(`Skipping memory ${memory.id} — empty content`);
      return 'skipped';
    }

    // We need a project_profile_id. If one doesn't exist, skip (the profile
    // is created on first project intelligence use; we don't create it here).
    if (!memory.project_profile_id) {
      logger.warn(
        `Skipping memory ${memory.id} — no project intelligence profile for project ${memory.project_id}`
      );
      return 'skipped';
    }

    // ── Memory-acceptance gate ──────────────────────────────────────────────
    // The canonical quality gate (ana-ri/memory-acceptance) between AI output
    // and durable memory: length bounds, content dedupe against what the
    // project already remembers, contradiction detection, and an externally
    // scored confidence. Quality signals are what a consolidation candidate
    // honestly has: the summary was never evidence-validated (that check is
    // about world-claims in a live response), its structure is how many of the
    // six summarizer fields are populated, and evidence labels are taken from
    // the content itself. The resulting sub-0.7 confidence is stored as-is —
    // the memory orchestrator already weights atoms by confidence, so a
    // distilled conversation ranks honestly below a verified document extract.
    const existing = await client.query<{ id: number; content: string; category: string }>(
      `SELECT id, content, category FROM project_memory_entries
        WHERE project_id = $1 AND organization_id = $2 AND status IN ('active', 'pending_review')
        ORDER BY created_at DESC
        LIMIT $3`,
      [memory.project_id, memory.organization_id, GATE_COMPARISON_LIMIT]
    );

    const provenance: MemoryProvenance = {
      source_route: 'memory-consolidation-job',
      model: 'unrecorded', // the cwm row does not record which model summarized it
      provider: 'ai-gateway',
      evidence_validated: false,
      structure_score: structuredFieldsPopulated,
      generated_at: new Date(memory.generated_at).toISOString(),
      triggered_by: 'system',
    };

    const verdict = evaluateMemoryCandidate({
      content: consolidatedContent,
      category: 'conversation_summary',
      provenance,
      qualitySignals: {
        evidenceValidated: false,
        structureScore: structuredFieldsPopulated,
        structureMaxScore: 6,
        hasKnownLabels: consolidatedContent.includes('[KNOWN]'),
        hasInferredLabels: consolidatedContent.includes('[INFERRED]'),
        hasMissingLabels: consolidatedContent.includes('[MISSING]'),
      },
      existingMemories: existing.rows,
      threadId: memory.thread_id,
    });

    if (verdict.acceptance_status === 'rejected') {
      logger.info(
        `Memory ${memory.id} rejected by acceptance gate: ${verdict.decision_reason}`
      );
      return 'rejected';
    }

    // Contradictions are stored QUARANTINED: status 'pending_review' keeps the
    // entry out of every recall path (they filter status = 'active') until a
    // human resolves which side is true. Silently promoting either side would
    // put a known-disputed claim into AnA's prompts.
    const contradicted = verdict.contradiction_check_result.has_contradiction;
    const status = contradicted ? 'pending_review' : 'active';
    if (contradicted) {
      logger.warn(
        `Memory ${memory.id} quarantined (pending_review): ${verdict.decision_reason}`
      );
    }

    const embeddingLiteral = await embedContentToLiteral(consolidatedContent, memory.id);

    const dateLabel = new Date(memory.generated_at).toISOString().split('T')[0];
    // Title encodes the cwm.id so the NOT EXISTS guard can detect duplicates
    const title = `Conversation summary ${dateLabel} [cwm_${memory.id}]`;

    const cols = [
      'project_profile_id', 'project_id', 'organization_id',
      'category', 'title', 'content',
      'importance_level', 'confidence_score',
      'extracted_by', 'status',
    ];
    const values: unknown[] = [
      memory.project_profile_id,
      memory.project_id,
      memory.organization_id,
      'conversation_summary',
      title,
      consolidatedContent,
      'medium', // importanceLevel
      verdict.confidence_score, // externally scored — never the model's word for it
      'memory_consolidation', // extractedBy
      status,
    ];
    if (embeddingLiteral !== null) {
      cols.push('embedding');
      values.push(embeddingLiteral);
    }
    const placeholders = values.map((_, i) => `$${i + 1}`).concat('NOW()').join(', ');

    // tenant-isolation-safe: the row IS org-scoped — `cols` starts
    // project_profile_id, project_id, organization_id and `values` binds
    // memory.organization_id; the scanner cannot see it because the column
    // list is interpolated rather than written literally.
    await client.query(
      `INSERT INTO project_memory_entries (${cols.join(', ')}, created_at)
       VALUES (${placeholders})`,
      values
    );

    logger.info(
      `Consolidated memory ${memory.id} into project ${memory.project_id} ` +
        `(status ${status}, confidence ${verdict.confidence_score.toFixed(2)})`
    );
    return contradicted ? 'quarantined' : 'consolidated';
  } catch (err) {
    logger.error(`Failed to consolidate memory ${memory.id}:`, err);
    return 'skipped';
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Run the full consolidation cycle. Can be called on-demand or by the scheduler.
 */
export async function runConsolidation(): Promise<ConsolidationResult> {
  const startedAt = new Date();
  logger.info('Starting nightly memory consolidation cycle');

  let threadsProcessed = 0;
  let memoriesConsolidated = 0;
  let skipped = 0;
  let rejectedByGate = 0;
  let quarantined = 0;
  let errors = 0;

  try {
    const staleMemories = await findStaleMemories(BATCH_SIZE);
    logger.info(`Found ${staleMemories.length} stale memories to consolidate`);

    for (const memory of staleMemories) {
      threadsProcessed++;
      const outcome = await consolidateMemory(memory);
      switch (outcome) {
        case 'consolidated':
          memoriesConsolidated++;
          break;
        case 'quarantined':
          quarantined++;
          break;
        case 'rejected':
          rejectedByGate++;
          break;
        default:
          // "skipped gracefully" and "errored" both land here; errors are
          // logged inside consolidateMemoryInner.
          skipped++;
      }
    }
  } catch (err) {
    logger.error('Consolidation cycle failed:', err);
    errors++;
  }

  const completedAt = new Date();
  const result: ConsolidationResult = {
    threadsProcessed,
    memoriesConsolidated,
    skipped,
    rejectedByGate,
    quarantined,
    errors,
    startedAt,
    completedAt,
  };

  const durationMs = completedAt.getTime() - startedAt.getTime();
  logger.info(
    `Consolidation complete: ${memoriesConsolidated}/${threadsProcessed} consolidated, ` +
      `${quarantined} quarantined, ${rejectedByGate} rejected by gate, ` +
      `${skipped} skipped, ${errors} errors (${durationMs}ms)`
  );

  return result;
}

// ── Scheduler ────────────────────────────────────────────────────────────────

let schedulerActive = false;

/**
 * Initialize the cron scheduler for nightly memory consolidation.
 * Safe to call multiple times — only starts once.
 */
export function initMemoryConsolidationScheduler(): void {
  if (schedulerActive) return;

  if (!cron.validate(CONSOLIDATION_SCHEDULE)) {
    logger.error(`Invalid cron schedule: ${CONSOLIDATION_SCHEDULE}`);
    return;
  }

  cron.schedule(CONSOLIDATION_SCHEDULE, async () => {
    try {
      await runConsolidation();
    } catch (err) {
      logger.error('Scheduled consolidation run failed:', err);
    }
  });

  schedulerActive = true;
  logger.info(`Memory consolidation scheduler initialized (${CONSOLIDATION_SCHEDULE})`);
}
