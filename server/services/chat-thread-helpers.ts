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
