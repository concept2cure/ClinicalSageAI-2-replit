/**
 * Shared Chat Thread Helpers
 *
 * Common DB-backed thread management functions used by both
 * the legacy chat route (/api/chat) and the context-aware
 * Cortex chat route (/api/cortex/chat).
 *
 * Extracted to avoid code duplication.
 *
 * @module server/services/chat-thread-helpers
 */

import { pool } from '../db.js';

/**
 * Get an existing thread or create a new one.
 * @param threadId - Existing thread ID (or null to create new)
 * @param userId - Optional user ID to associate
 * @param prefix - Thread ID prefix ('thread' for legacy, 'cortex' for Cortex)
 */
export async function getOrCreateThread(
  threadId: string | null,
  userId?: number,
  prefix: string = 'thread'
): Promise<string> {
  if (threadId) {
    const existing = await pool.query('SELECT id FROM chat_threads WHERE id = $1', [threadId]);
    if (existing.rows.length > 0) return threadId;
  }
  const newId = `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  await pool.query(
    'INSERT INTO chat_threads (id, user_id, created_at, updated_at) VALUES ($1, $2, NOW(), NOW())',
    [newId, userId || null]
  );
  return newId;
}

/**
 * Estimate token count from text (≈4 chars per token for English).
 * Uses the stored tokens_used column when available, falls back to heuristic.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Retrieve all messages in a thread, ordered chronologically.
 */
export async function getThreadMessages(
  threadId: string
): Promise<Array<{ role: string; content: string }>> {
  const result = await pool.query(
    'SELECT role, content FROM chat_messages WHERE thread_id = $1 ORDER BY created_at ASC',
    [threadId]
  );
  return result.rows;
}

/**
 * Retrieve messages within a token budget, keeping the most recent messages.
 * Loads newest-first and accumulates until the budget is exhausted.
 *
 * @param threadId - The thread to load from
 * @param tokenBudget - Maximum tokens to allocate for history messages
 * @param workingMemorySummary - Optional summary to prepend (from working memory service)
 * @returns Messages in chronological order (oldest first), fitting within budget
 */
export async function getWindowedMessages(
  threadId: string,
  tokenBudget: number,
  workingMemorySummary?: string | null
): Promise<{
  messages: Array<{ role: string; content: string }>;
  totalMessages: number;
  includedMessages: number;
  tokensUsed: number;
  wasTruncated: boolean;
}> {
  // Load all messages newest-first so we can pick the most recent ones
  const result = await pool.query(
    'SELECT role, content, tokens_used FROM chat_messages WHERE thread_id = $1 ORDER BY created_at DESC',
    [threadId]
  );
  const allMessages = result.rows;
  const totalMessages = allMessages.length;

  // Reserve tokens for working memory summary if provided
  let remaining = tokenBudget;
  if (workingMemorySummary) {
    remaining -= estimateTokens(workingMemorySummary);
  }

  // Greedily include messages from newest to oldest
  const selected: Array<{ role: string; content: string }> = [];
  let tokensUsed = 0;
  for (const msg of allMessages) {
    const msgTokens = msg.tokens_used > 0 ? msg.tokens_used : estimateTokens(msg.content);
    if (tokensUsed + msgTokens > remaining && selected.length > 0) break;
    // Always include at least the most recent message
    selected.push({ role: msg.role, content: msg.content });
    tokensUsed += msgTokens;
  }

  // Reverse to chronological order
  selected.reverse();

  return {
    messages: selected,
    totalMessages,
    includedMessages: selected.length,
    tokensUsed,
    wasTruncated: selected.length < totalMessages,
  };
}

/**
 * Persist a single chat message.
 */
export async function saveChatMessage(
  threadId: string,
  role: string,
  content: string,
  model?: string,
  tokens?: number
): Promise<void> {
  await pool.query(
    'INSERT INTO chat_messages (thread_id, role, content, model, tokens_used, created_at) VALUES ($1, $2, $3, $4, $5, NOW())',
    [threadId, role, content, model || null, tokens || 0]
  );
  await pool.query('UPDATE chat_threads SET updated_at = NOW() WHERE id = $1', [threadId]);
}
