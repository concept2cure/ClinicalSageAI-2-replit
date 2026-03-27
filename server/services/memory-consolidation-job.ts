/**
 * Memory Consolidation Job (E8)
 *
 * Runs nightly to consolidate stale working memories into permanent
 * project intelligence entries. Uses node-cron for scheduling.
 *
 * Strategy:
 * - Finds conversation_working_memory entries older than STALE_THRESHOLD_DAYS
 * - Joins through concept2cure_conversations to get project context
 * - Skips threads that already have a corresponding 'conversation_summary'
 *   entry in project_memory_entries (no consolidated_at column needed)
 * - Inserts consolidated summaries as project_memory_entries
 *
 * @module server/services/memory-consolidation-job
 */

import cron from 'node-cron';
import { pool } from '../db.js';
import { createScopedLogger } from '../utils/logger.js';

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
  errors: number;
  startedAt: Date;
  completedAt: Date;
}

interface StaleMemoryRow {
  id: number;
  conversation_id: number;
  thread_id: string | null;
  organization_id: number;
  structured_data: Record<string, unknown> | null;
  summary: string;
  generated_at: Date;
  project_id: number;
  project_profile_id: number | null;
}

// ── Core Logic ───────────────────────────────────────────────────────────────

/**
 * Find stale working memories that need consolidation.
 *
 * Joins to concept2cure_conversations to resolve project_id.
 * Left-joins to project_memory_entries to skip already-consolidated threads
 * (identified by category = 'conversation_summary' and metadata containing the
 * conversation_working_memory id).
 */
async function findStaleMemories(batchSize: number): Promise<StaleMemoryRow[]> {
  const result = await pool.query<StaleMemoryRow>(
    `SELECT
       cwm.id,
       cwm.conversation_id,
       cwm.thread_id,
       cwm.organization_id,
       cwm.structured_data,
       cwm.summary,
       cwm.generated_at,
       cc.project_id,
       pip.id AS project_profile_id
     FROM conversation_working_memory cwm
     JOIN concept2cure_conversations cc
       ON cwm.conversation_id = cc.id
     LEFT JOIN project_intelligence_profiles pip
       ON pip.project_id = cc.project_id
       AND pip.organization_id = cwm.organization_id
     WHERE cwm.generated_at < NOW() - INTERVAL '${STALE_THRESHOLD_DAYS} days'
       AND cc.project_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM project_memory_entries pme
         WHERE pme.project_id = cc.project_id
           AND pme.category = 'conversation_summary'
           AND pme.title LIKE '%cwm_' || cwm.id::text || '%'
       )
     ORDER BY cwm.generated_at ASC
     LIMIT $1`,
    [batchSize]
  );
  return result.rows;
}

/**
 * Consolidate a single working memory record into a project memory entry.
 */
async function consolidateMemory(memory: StaleMemoryRow): Promise<boolean> {
  try {
    // Parse structured data
    const structured =
      typeof memory.structured_data === 'string'
        ? JSON.parse(memory.structured_data)
        : memory.structured_data;

    // Build consolidated content from both structured data and raw summary
    const parts: string[] = [];

    if (structured) {
      if (structured.objective) parts.push(`Objective: ${structured.objective}`);
      if (Array.isArray(structured.lockedFacts) && structured.lockedFacts.length > 0) {
        parts.push(`Key facts: ${structured.lockedFacts.join('; ')}`);
      }
      if (Array.isArray(structured.decisions) && structured.decisions.length > 0) {
        parts.push(`Decisions: ${structured.decisions.join('; ')}`);
      }
      if (Array.isArray(structured.openQuestions) && structured.openQuestions.length > 0) {
        parts.push(`Open questions: ${structured.openQuestions.join('; ')}`);
      }
      if (Array.isArray(structured.nextActions) && structured.nextActions.length > 0) {
        parts.push(`Next actions: ${structured.nextActions.join('; ')}`);
      }
      if (Array.isArray(structured.createdArtifacts) && structured.createdArtifacts.length > 0) {
        parts.push(`Artifacts: ${structured.createdArtifacts.join('; ')}`);
      }
    }

    // Fall back to raw summary if structured data yielded nothing
    const consolidatedContent = parts.length > 0 ? parts.join('\n') : memory.summary;

    if (!consolidatedContent || !consolidatedContent.trim()) {
      logger.warn(`Skipping memory ${memory.id} — empty content`);
      return false;
    }

    // We need a project_profile_id. If one doesn't exist, skip (the profile
    // is created on first project intelligence use; we don't create it here).
    if (!memory.project_profile_id) {
      logger.warn(
        `Skipping memory ${memory.id} — no project intelligence profile for project ${memory.project_id}`
      );
      return false;
    }

    const dateLabel = new Date(memory.generated_at).toISOString().split('T')[0];
    // Title encodes the cwm.id so the NOT EXISTS guard can detect duplicates
    const title = `Conversation summary ${dateLabel} [cwm_${memory.id}]`;

    await pool.query(
      `INSERT INTO project_memory_entries (
         project_profile_id, project_id, organization_id,
         category, title, content,
         importance_level, confidence_score,
         extracted_by, status, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
      [
        memory.project_profile_id,
        memory.project_id,
        memory.organization_id,
        'conversation_summary',
        title,
        consolidatedContent,
        'medium',       // importanceLevel
        0.75,           // confidenceScore — consolidated summaries get moderate confidence
        'memory_consolidation', // extractedBy
        'active',
      ]
    );

    logger.info(`Consolidated memory ${memory.id} into project ${memory.project_id}`);
    return true;
  } catch (err) {
    logger.error(`Failed to consolidate memory ${memory.id}:`, err);
    return false;
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
  let errors = 0;

  try {
    const staleMemories = await findStaleMemories(BATCH_SIZE);
    logger.info(`Found ${staleMemories.length} stale memories to consolidate`);

    for (const memory of staleMemories) {
      threadsProcessed++;
      const success = await consolidateMemory(memory);
      if (success) {
        memoriesConsolidated++;
      } else {
        // Distinguish between "skipped gracefully" vs "error"
        // consolidateMemory returns false for both; errors are logged inside
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
    errors,
    startedAt,
    completedAt,
  };

  const durationMs = completedAt.getTime() - startedAt.getTime();
  logger.info(
    `Consolidation complete: ${memoriesConsolidated}/${threadsProcessed} consolidated, ` +
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
