/**
 * Working Memory Service
 *
 * Generates structured conversation summaries that compress long conversation
 * history into a compact "working memory" block. Injected between the system
 * prompt and recent messages to maintain context without prompt explosion.
 *
 * Structure:
 * - Objective: what the conversation is trying to accomplish
 * - Locked Facts: established truths that should not be contradicted
 * - Decisions: choices made during the conversation
 * - Open Questions: unresolved items
 * - Next Actions: planned next steps
 * - Created Artifacts: documents/outputs produced
 *
 * @module server/services/working-memory
 */

import { pool } from '../db.js';
import { createScopedLogger } from '../utils/logger';
import { getEmbeddingService } from './enhancedEmbeddingService.js';

const logger = createScopedLogger('working-memory');

/** Message count threshold before generating/refreshing working memory summary */
const WORKING_MEMORY_THRESHOLD = parseInt(process.env.WORKING_MEMORY_THRESHOLD || '20', 10);

/** Embedding model used for working-memory semantic recall (matches client/project). */
const WORKING_MEMORY_EMBEDDING_MODEL = 'text-embedding-3-small';

/**
 * Opt-in flag for semantic working-memory recall. When off (default), working
 * memory is written without an embedding and read by recency only — exactly the
 * prior behaviour. When on, summaries are embedded on write and retrieved by
 * query similarity. Gated because it adds an embedding call to the write path
 * and requires the 20260602 migration (embedding column) to be applied.
 */
export function isSemanticWorkingMemoryEnabled(): boolean {
  return process.env.ENABLE_SEMANTIC_WORKING_MEMORY === 'true';
}

/**
 * Pure: should a written working-memory row carry an embedding? Only when the
 * feature is enabled AND the embedding column has actually been provisioned.
 * Gating on both is what makes flipping the flag on SAFE ahead of the migration:
 * without the column, appending `embedding` to the INSERT would throw and the
 * (best-effort) working-memory write would be lost. Kept pure so the decision is
 * unit-testable without a database.
 */
export function shouldEmbedWorkingMemory(flagOn: boolean, embeddingColumnPresent: boolean): boolean {
  return flagOn && embeddingColumnPresent;
}

/**
 * One-time probe: has a migration added the given optional column to
 * conversation_working_memory? (`embedding` — 20260602, `project_id` —
 * 20260820.) Cached `true` permanently once seen (columns are never dropped),
 * and re-probed while absent so applying the migration on a running server is
 * picked up without a restart. Runs only on the (infrequent) working-memory
 * write path.
 */
const confirmedColumns = new Set<string>();
async function workingMemoryColumnExists(column: 'embedding' | 'project_id'): Promise<boolean> {
  if (confirmedColumns.has(column)) return true;
  try {
    const { rows } = await pool.query(
      `SELECT 1 FROM information_schema.columns
        WHERE table_name = 'conversation_working_memory' AND column_name = $1 LIMIT 1`,
      [column]
    );
    if (rows.length > 0) confirmedColumns.add(column);
    return rows.length > 0;
  } catch {
    return false;
  }
}

async function embeddingColumnExists(): Promise<boolean> {
  return workingMemoryColumnExists('embedding');
}

let warnedMissingEmbeddingColumn = false;
let warnedMissingProjectIdColumn = false;

/**
 * Embed a working-memory summary to a pgvector literal, best-effort. Returns
 * null on any failure so the row is still stored (without an embedding) rather
 * than lost — the semantic read path filters `embedding IS NOT NULL`.
 */
async function embedSummaryToLiteral(summary: string): Promise<string | null> {
  try {
    const { embedding } = await getEmbeddingService(pool).embed(
      summary,
      WORKING_MEMORY_EMBEDDING_MODEL
    );
    return `[${embedding.join(',')}]`;
  } catch (error) {
    logger.warn(
      `working-memory embedding failed; storing without embedding: ${
        error instanceof Error ? error.message : 'unknown error'
      }`
    );
    return null;
  }
}

export interface WorkingMemory {
  id?: number;
  conversationId: number;
  threadId?: string;
  organizationId: number;
  summary: string;
  structured: {
    objective: string;
    lockedFacts: string[];
    decisions: string[];
    openQuestions: string[];
    nextActions: string[];
    createdArtifacts: string[];
    exclusions: string[];
  };
  messageCountAtGeneration: number;
  generatedAt: string;
}

/**
 * Build a structured summary prompt for the AI to generate working memory.
 */
export function buildWorkingMemoryPrompt(
  messages: Array<{ role: string; content: string }>,
  previousSummary?: string
): string {
  const conversationText = messages
    .map(m => `[${m.role}]: ${m.content}`)
    .join('\n\n');

  const previousContext = previousSummary
    ? `\n\nPrevious working memory summary:\n${previousSummary}\n\nIncorporate the above into your new summary, updating any outdated information.`
    : '';

  return `Analyze this regulatory conversation and produce a structured working memory summary.${previousContext}

Conversation:
${conversationText}

Respond with ONLY a JSON object in this exact format:
{
  "objective": "Single sentence describing the conversation's goal",
  "lockedFacts": ["Established facts that should not be contradicted"],
  "decisions": ["Decisions or choices made"],
  "openQuestions": ["Unresolved questions or items needing follow-up"],
  "nextActions": ["Planned next steps"],
  "createdArtifacts": ["Documents or outputs produced (with IDs if available)"],
  "exclusions": ["Topics explicitly ruled out or deferred"]
}`;
}

/**
 * Insert one working-memory row. Single seam for both write variants so the
 * optional embedding column is added consistently: when semantic recall is off
 * the SQL is identical to the prior recency-only insert (no embedding column);
 * when it is on, the summary is embedded and appended.
 */
async function insertWorkingMemoryRow(params: {
  conversationId: number | null;
  threadId: string | null;
  organizationId: number;
  summary: string;
  structured: WorkingMemory['structured'];
  messageCountAtGeneration: number;
  projectId?: number | null;
}): Promise<void> {
  const cols = [
    'conversation_id',
    'thread_id',
    'organization_id',
    'summary',
    'structured_data',
    'message_count_at_generation',
  ];
  const values: unknown[] = [
    params.conversationId,
    params.threadId,
    params.organizationId,
    params.summary,
    JSON.stringify(params.structured),
    params.messageCountAtGeneration,
  ];

  // Project attribution (20260820 migration) makes thread-keyed rows eligible
  // for nightly consolidation into project_memory_entries. Same posture as the
  // embedding column below: when the column is missing, write WITHOUT it rather
  // than lose the row, and warn once — an unattributed row is exactly as
  // consolidatable as before the migration (not at all), so nothing regresses.
  const projectId =
    typeof params.projectId === 'number' && Number.isFinite(params.projectId) && params.projectId > 0
      ? params.projectId
      : null;
  if (projectId !== null) {
    if (await workingMemoryColumnExists('project_id')) {
      cols.push('project_id');
      values.push(projectId);
    } else if (!warnedMissingProjectIdColumn) {
      warnedMissingProjectIdColumn = true;
      logger.warn(
        'conversation_working_memory.project_id is missing — apply the ' +
          '20260820_working_memory_project_id migration. Writing working memory without project ' +
          'attribution for now; these rows cannot be consolidated into project memory until the ' +
          'column exists.'
      );
    }
  }

  // Semantic recall requires BOTH the flag and the embedding column (20260602
  // migration). When the flag is on but the column is absent, insert WITHOUT
  // the embedding rather than let the INSERT throw and lose the write — the
  // semantic read filters `embedding IS NOT NULL`, so recall simply falls back
  // to recency until the migration is applied. One-time warn so the misconfig
  // is visible without flooding the log.
  if (isSemanticWorkingMemoryEnabled()) {
    if (shouldEmbedWorkingMemory(true, await embeddingColumnExists())) {
      cols.push('embedding');
      values.push(await embedSummaryToLiteral(params.summary));
    } else if (!warnedMissingEmbeddingColumn) {
      warnedMissingEmbeddingColumn = true;
      logger.warn(
        'ENABLE_SEMANTIC_WORKING_MEMORY is on but conversation_working_memory.embedding is missing — ' +
          'apply the 20260602_working_memory_embeddings migration. Writing working memory without ' +
          'embeddings for now; semantic recall falls back to recency until the column exists.'
      );
    }
  }

  cols.push('generated_at');
  const placeholders = values.map((_, i) => `$${i + 1}`).concat('NOW()').join(', ');

  await pool.query(
    `INSERT INTO conversation_working_memory (${cols.join(', ')}) VALUES (${placeholders})`,
    values
  );
}

/**
 * Store a working memory record.
 */
export async function storeWorkingMemory(
  memory: Omit<WorkingMemory, 'id' | 'generatedAt'>
): Promise<void> {
  await insertWorkingMemoryRow({
    conversationId: memory.conversationId,
    threadId: memory.threadId || null,
    organizationId: memory.organizationId,
    summary: memory.summary,
    structured: memory.structured,
    messageCountAtGeneration: memory.messageCountAtGeneration,
  });
}

/**
 * Get the latest working memory for a conversation.
 */
export async function getLatestWorkingMemory(
  conversationId: number,
  organizationId: number
): Promise<WorkingMemory | null> {
  try {
    const result = await pool.query(
      `SELECT id, conversation_id, thread_id, organization_id, summary,
              structured_data, message_count_at_generation, generated_at
       FROM conversation_working_memory
       WHERE conversation_id = $1 AND organization_id = $2
       ORDER BY generated_at DESC LIMIT 1`,
      [conversationId, organizationId]
    );
    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      id: row.id,
      conversationId: row.conversation_id,
      threadId: row.thread_id,
      organizationId: row.organization_id,
      summary: row.summary,
      structured: typeof row.structured_data === 'string'
        ? (() => { try { return JSON.parse(row.structured_data); } catch { return null; } })()
        : row.structured_data,
      messageCountAtGeneration: row.message_count_at_generation,
      generatedAt: row.generated_at?.toISOString(),
    };
  } catch (error) {
    logger.warn(`Failed to get working memory for conversation ${conversationId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return null;
  }
}

/**
 * Get the latest working memory for a thread (used by cortex-unified).
 * Org-scoped to prevent any cross-tenant leak if a thread_id ever collides.
 */
export async function getLatestWorkingMemoryByThread(
  threadId: string,
  organizationId: number
): Promise<string | null> {
  if (!threadId || !Number.isFinite(organizationId) || organizationId <= 0) {
    return null;
  }
  try {
    const result = await pool.query(
      `SELECT summary FROM conversation_working_memory
       WHERE thread_id = $1 AND organization_id = $2
       ORDER BY generated_at DESC LIMIT 1`,
      [threadId, organizationId]
    );
    return result.rows.length > 0 ? result.rows[0].summary : null;
  } catch (error) {
    logger.debug(`Working memory by thread query failed: ${error instanceof Error ? error.message : 'table may not exist'}`);
    return null;
  }
}

/** A working-memory summary recalled by query similarity. */
export interface WorkingMemorySemanticHit {
  id: number;
  summary: string;
  /** Cosine similarity to the query in [0, 1]. */
  similarity: number;
  generatedAt: Date | string | null;
}

/**
 * Retrieve the working-memory summaries for a thread most relevant to `query`,
 * ranked by embedding similarity — the semantic counterpart to
 * getLatestWorkingMemoryByThread's recency lookup. Mirrors the client/project
 * pattern in searchMemoryEntriesSemantic: embed the query, cosine-rank with the
 * `<=>` operator, threshold, and tenant-scope by organization_id.
 *
 * Returns [] (rather than throwing) when the flag is off, inputs are invalid, or
 * the embedding column/migration is absent, so the assembler falls back to the
 * recency path without error.
 */
export async function searchWorkingMemorySemantic(
  threadId: string,
  organizationId: number,
  query: string,
  options?: { limit?: number; minSimilarity?: number }
): Promise<WorkingMemorySemanticHit[]> {
  if (!isSemanticWorkingMemoryEnabled()) return [];
  if (!threadId || !Number.isFinite(organizationId) || organizationId <= 0 || !query?.trim()) {
    return [];
  }

  const limit = Math.max(1, Math.min(options?.limit ?? 3, 20));
  const minSimilarity = options?.minSimilarity ?? 0.5;

  try {
    const { embedding } = await getEmbeddingService(pool).embed(
      query,
      WORKING_MEMORY_EMBEDDING_MODEL
    );
    const vectorLiteral = `[${embedding.join(',')}]`;

    const result = await pool.query(
      `SELECT id, summary, generated_at,
              1 - (embedding <=> $1::vector) AS similarity
         FROM conversation_working_memory
        WHERE thread_id = $2
          AND organization_id = $3
          AND embedding IS NOT NULL
          AND 1 - (embedding <=> $1::vector) >= $4
        ORDER BY embedding <=> $1::vector
        LIMIT $5`,
      [vectorLiteral, threadId, organizationId, minSimilarity, limit]
    );

    return result.rows.map(row => ({
      id: row.id,
      summary: row.summary,
      similarity: row.similarity,
      generatedAt: row.generated_at,
    }));
  } catch (error) {
    logger.debug(
      `searchWorkingMemorySemantic failed: ${
        error instanceof Error ? error.message : 'embedding column/migration may be absent'
      }`
    );
    return [];
  }
}

/**
 * Format structured working memory into a compact text block for prompt injection.
 */
export function formatWorkingMemoryForPrompt(memory: WorkingMemory): string {
  const s = memory.structured;
  const sections: string[] = [];

  sections.push(`**Objective**: ${s.objective}`);

  if (s.lockedFacts.length > 0) {
    sections.push(`**Locked Facts**:\n${s.lockedFacts.map(f => `- ${f}`).join('\n')}`);
  }
  if (s.decisions.length > 0) {
    sections.push(`**Decisions Made**:\n${s.decisions.map(d => `- ${d}`).join('\n')}`);
  }
  if (s.openQuestions.length > 0) {
    sections.push(`**Open Questions**:\n${s.openQuestions.map(q => `- ${q}`).join('\n')}`);
  }
  if (s.nextActions.length > 0) {
    sections.push(`**Next Actions**:\n${s.nextActions.map(a => `- ${a}`).join('\n')}`);
  }
  if (s.createdArtifacts.length > 0) {
    sections.push(`**Created Artifacts**:\n${s.createdArtifacts.map(a => `- ${a}`).join('\n')}`);
  }
  if (s.exclusions.length > 0) {
    sections.push(`**Deferred/Excluded**:\n${s.exclusions.map(e => `- ${e}`).join('\n')}`);
  }

  return sections.join('\n\n');
}

/**
 * Check if a conversation needs a working memory refresh.
 * Returns true if no memory exists or if significant new messages have been added.
 */
export async function needsWorkingMemoryRefresh(
  conversationId: number,
  organizationId: number,
  currentMessageCount: number
): Promise<boolean> {
  const existing = await getLatestWorkingMemory(conversationId, organizationId);
  if (!existing) return currentMessageCount >= WORKING_MEMORY_THRESHOLD;

  const messagesSinceSummary = currentMessageCount - existing.messageCountAtGeneration;

  // Refresh thresholds: every N messages after first summary
  return messagesSinceSummary >= WORKING_MEMORY_THRESHOLD;
}

/**
 * Thread-keyed variant of {@link needsWorkingMemoryRefresh} for chat paths
 * that only have a string thread_id (ai_threads), not a numeric
 * conversation_id (concept2cureConversations). Uses the same N-message
 * threshold as the conversation-keyed variant.
 */
export async function needsWorkingMemoryRefreshByThread(
  threadId: string,
  organizationId: number,
  currentMessageCount: number
): Promise<boolean> {
  if (!threadId || !Number.isFinite(organizationId) || organizationId <= 0) return false;
  try {
    const result = await pool.query(
      `SELECT message_count_at_generation FROM conversation_working_memory
       WHERE thread_id = $1 AND organization_id = $2
       ORDER BY generated_at DESC LIMIT 1`,
      [threadId, organizationId]
    );
    if (result.rows.length === 0) {
      return currentMessageCount >= WORKING_MEMORY_THRESHOLD;
    }
    const messagesSinceSummary =
      currentMessageCount - (result.rows[0].message_count_at_generation || 0);
    return messagesSinceSummary >= WORKING_MEMORY_THRESHOLD;
  } catch {
    return false;
  }
}

/**
 * Thread-keyed write variant. The underlying table allows null
 * conversation_id, so chat paths that only have an ai_threads.id can still
 * persist working memory without synthesizing a concept2cure conversation.
 */
export async function storeWorkingMemoryForThread(
  threadId: string,
  organizationId: number,
  summary: string,
  structured: WorkingMemory['structured'],
  messageCountAtGeneration: number,
  projectId?: number | null
): Promise<void> {
  if (!threadId || !Number.isFinite(organizationId) || organizationId <= 0) return;
  try {
    await insertWorkingMemoryRow({
      conversationId: null,
      threadId,
      organizationId,
      summary,
      structured,
      messageCountAtGeneration,
      projectId: projectId ?? null,
    });
  } catch (error) {
    logger.warn(
      `storeWorkingMemoryForThread failed for thread ${threadId}: ${
        error instanceof Error ? error.message : 'unknown error'
      }`
    );
  }
}

/**
 * Summarize a chat thread's recent messages into a structured working-memory
 * record and persist it. Thread-keyed, fire-and-forget, gated by
 * {@link needsWorkingMemoryRefreshByThread} so callers can invoke this after
 * every assistant turn without paying the summarization cost each time.
 *
 * Errors are logged and swallowed — working memory is best-effort context
 * compression, not a correctness-critical write.
 */
export async function summarizeAndStoreWorkingMemoryForThread(params: {
  threadId: string;
  organizationId: number;
  messages: Array<{ role: string; content: string }>;
  /**
   * Project the thread belongs to, when the calling surface knows it. Recorded
   * on the row so the nightly consolidation job can promote this thread's
   * memory into project_memory_entries; omitted → the row is excluded from
   * promotion (never guessed after the fact).
   */
  projectId?: number | null;
}): Promise<void> {
  const { threadId, organizationId, messages, projectId } = params;
  if (!threadId || !Number.isFinite(organizationId) || organizationId <= 0) return;
  if (!Array.isArray(messages) || messages.length === 0) return;

  try {
    const shouldRefresh = await needsWorkingMemoryRefreshByThread(threadId, organizationId, messages.length);
    if (!shouldRefresh) return;

    const previousSummary = (await getLatestWorkingMemoryByThread(threadId, organizationId)) || undefined;
    const prompt = buildWorkingMemoryPrompt(messages, previousSummary);

    const { getGateway } = await import('./ai-gateway/gateway.js');
    const gw = getGateway();
    const aiResult = await gw.route({
      taskType: 'summarization',
      messages: [
        {
          role: 'system',
          content:
            'You are a regulatory affairs analyst. Produce concise, structured JSON summaries.',
        },
        { role: 'user', content: prompt },
      ],
      maxTokens: 1500,
      temperature: 0.3,
      strategy: 'cost_optimized',
      callerModule: 'working-memory-writeback',
      organizationId,
    });

    const responseText = aiResult.content || '{}';
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    let structured: WorkingMemory['structured'];
    try {
      structured = jsonMatch
        ? JSON.parse(jsonMatch[0])
        : {
            objective: 'Unable to parse summary',
            lockedFacts: [],
            decisions: [],
            openQuestions: [],
            nextActions: [],
            createdArtifacts: [],
            exclusions: [],
          };
    } catch {
      structured = {
        objective: `Conversation with ${messages.length} messages`,
        lockedFacts: [],
        decisions: [],
        openQuestions: [],
        nextActions: [],
        createdArtifacts: [],
        exclusions: [],
      };
    }

    const formattedSummary = [
      `**Objective**: ${structured.objective}`,
      structured.lockedFacts?.length > 0
        ? `**Key Facts**: ${structured.lockedFacts.join('; ')}`
        : '',
      structured.decisions?.length > 0 ? `**Decisions**: ${structured.decisions.join('; ')}` : '',
      structured.openQuestions?.length > 0
        ? `**Open Questions**: ${structured.openQuestions.join('; ')}`
        : '',
    ]
      .filter(Boolean)
      .join('\n');

    await storeWorkingMemoryForThread(
      threadId,
      organizationId,
      formattedSummary,
      structured,
      messages.length,
      projectId ?? null,
    );
  } catch (error) {
    logger.warn(
      `summarizeAndStoreWorkingMemoryForThread failed for thread ${threadId}: ${
        error instanceof Error ? error.message : 'unknown error'
      }`
    );
  }
}
