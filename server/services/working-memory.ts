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

const logger = createScopedLogger('working-memory');

/** Message count threshold before generating/refreshing working memory summary */
const WORKING_MEMORY_THRESHOLD = parseInt(process.env.WORKING_MEMORY_THRESHOLD || '20', 10);

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
 * Store a working memory record.
 */
export async function storeWorkingMemory(
  memory: Omit<WorkingMemory, 'id' | 'generatedAt'>
): Promise<void> {
  await pool.query(
    `INSERT INTO conversation_working_memory
     (conversation_id, thread_id, organization_id, summary, structured_data, message_count_at_generation, generated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
    [
      memory.conversationId,
      memory.threadId || null,
      memory.organizationId,
      memory.summary,
      JSON.stringify(memory.structured),
      memory.messageCountAtGeneration,
    ]
  );
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
 */
export async function getLatestWorkingMemoryByThread(
  threadId: string
): Promise<string | null> {
  try {
    const result = await pool.query(
      `SELECT summary FROM conversation_working_memory
       WHERE thread_id = $1 ORDER BY generated_at DESC LIMIT 1`,
      [threadId]
    );
    return result.rows.length > 0 ? result.rows[0].summary : null;
  } catch (error) {
    logger.debug(`Working memory by thread query failed: ${error instanceof Error ? error.message : 'table may not exist'}`);
    return null;
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
  currentMessageCount: number
): Promise<boolean> {
  if (!threadId) return false;
  try {
    const result = await pool.query(
      `SELECT message_count_at_generation FROM conversation_working_memory
       WHERE thread_id = $1 ORDER BY generated_at DESC LIMIT 1`,
      [threadId]
    );
    if (result.rows.length === 0) {
      return currentMessageCount >= WORKING_MEMORY_THRESHOLD;
    }
    const messagesSinceSummary =
      currentMessageCount - (result.rows[0].message_count_at_generation || 0);
    return messagesSinceSummary >= WORKING_MEMORY_THRESHOLD;
  } catch {
    // Table may be missing in sparse envs — skip refresh instead of crashing.
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
  messageCountAtGeneration: number
): Promise<void> {
  if (!threadId || !Number.isFinite(organizationId) || organizationId <= 0) return;
  try {
    await pool.query(
      `INSERT INTO conversation_working_memory
       (conversation_id, thread_id, organization_id, summary, structured_data, message_count_at_generation, generated_at)
       VALUES (NULL, $1, $2, $3, $4, $5, NOW())`,
      [threadId, organizationId, summary, JSON.stringify(structured), messageCountAtGeneration]
    );
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
}): Promise<void> {
  const { threadId, organizationId, messages } = params;
  if (!threadId || !Number.isFinite(organizationId) || organizationId <= 0) return;
  if (!Array.isArray(messages) || messages.length === 0) return;

  try {
    const shouldRefresh = await needsWorkingMemoryRefreshByThread(threadId, messages.length);
    if (!shouldRefresh) return;

    // Pull the previous summary for incremental refresh (keeps the model
    // focused on the delta instead of re-deriving everything each time).
    const previousSummary = (await getLatestWorkingMemoryByThread(threadId)) || undefined;
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
    );
  } catch (error) {
    logger.warn(
      `summarizeAndStoreWorkingMemoryForThread failed for thread ${threadId}: ${
        error instanceof Error ? error.message : 'unknown error'
      }`
    );
  }
}
