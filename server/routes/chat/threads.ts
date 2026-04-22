/**
 * server/routes/chat/threads.ts
 *
 * Thread CRUD + message listing handlers extracted from server/routes/chat.ts
 * as part of the Phase 4 architecture consolidation.
 *
 * Exports five async Express handler functions (no Router here):
 *   - listThreads          GET  /api/chat/threads
 *   - listThreadMessages   GET  /api/chat/threads/:threadId/messages
 *   - getThread            GET  /api/chat/thread/:threadId
 *   - patchThread          PATCH /api/chat/thread/:threadId
 *   - deleteThread         DELETE /api/chat/thread/:threadId
 *
 * Handler bodies are copied verbatim from the original route registrations
 * (every SQL string, branch, and error message preserved).
 */

import type { Request, Response } from 'express';
import { pool } from '../../db.js';
import { getThreadMessages } from '../../services/chat-thread-helpers.js';

/**
 * GET /api/chat/threads
 * List threads, optionally filtered by project_id.
 * Used by AnaPersistentPanel to restore previous conversations.
 */
export async function listThreads(req: Request, res: Response) {
  try {
    const projectId = req.query.project_id as string | undefined;
    const limit = Math.min(parseInt((req.query.limit as string) || '10', 10), 50);
    const orgId = (req as any).tenantId || (req as any).tenantContext?.organizationId;

    let query: string;
    let params: unknown[];

    if (projectId) {
      // Try ai_threads first (has project_id) and return empty when no project rows.
      try {
        const aiResult = await pool.query(
          `SELECT id, project_id, title, created_at, updated_at FROM ai_threads
           WHERE project_id = $1 ${orgId ? 'AND organization_id = $2' : ''}
           ORDER BY COALESCE(updated_at, created_at) DESC LIMIT ${orgId ? '$3' : '$2'}`,
          orgId ? [projectId, orgId, limit] : [projectId, limit]
        );
        return res.json({ threads: aiResult.rows });
      } catch {
        // ai_threads unavailable: fail closed for project-scoped listing
        return res.json({ threads: [] });
      }
    } else {
      query = `SELECT id, created_at, updated_at FROM chat_threads ORDER BY updated_at DESC LIMIT $1`;
      params = [limit];
    }

    const result = await pool.query(query, params);
    res.json({ threads: result.rows });
  } catch (error: any) {
    // Table may not exist yet — return empty
    console.warn('[AnA] Thread listing failed:', error?.message);
    res.json({ threads: [] });
  }
}

/**
 * GET /api/chat/threads/:threadId/messages
 * Retrieve messages for a specific thread.
 * Used by AnaPersistentPanel to restore conversation content.
 */
export async function listThreadMessages(req: Request, res: Response) {
  try {
    const threadId = String(req.params.threadId);
    const orgId = (req as any).tenantId || (req as any).tenantContext?.organizationId;

    if (!orgId) {
      return res.status(401).json({ error: 'Organization context required' });
    }

    // Verify thread belongs to org before returning messages
    const threadCheck = await pool.query(
      `SELECT id FROM ai_threads WHERE id = $1 AND organization_id = $2`,
      [threadId, orgId]
    );

    if (threadCheck.rows.length === 0) {
      return res.status(404).json({ messages: [], error: 'Thread not found' });
    }

    const limit = Math.min(parseInt((req.query.limit as string) || '30', 10), 100);
    const messages = await getThreadMessages(threadId);
    res.json({ messages: messages.slice(-limit) });
  } catch (error: any) {
    console.warn('[AnA] Thread messages failed:', error?.message);
    res.json({ messages: [] });
  }
}

/**
 * GET /api/chat/thread/:threadId
 * Retrieve conversation history from database
 */
export async function getThread(req: Request, res: Response) {
  try {
    const threadId = String(req.params.threadId);
    const orgId = (req as any).tenantId || (req as any).tenantContext?.organizationId;

    if (!orgId) {
      return res.status(401).json({
        error: 'Organization context required',
        code: 'ORG_CONTEXT_REQUIRED',
      });
    }

    const threadResult = await pool.query(
      'SELECT id, created_at FROM chat_threads WHERE id = $1 AND organization_id = $2',
      [threadId, orgId]
    );

    if (threadResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Thread not found',
        code: 'THREAD_NOT_FOUND',
      });
    }

    const messages = await getThreadMessages(threadId);

    res.json({
      thread_id: threadId,
      messages,
      created_at: threadResult.rows[0].created_at,
    });
  } catch (error: any) {
    console.error('[AnA] Thread retrieval error:', error);
    res.status(500).json({
      error: 'Failed to retrieve thread',
      code: 'THREAD_RETRIEVAL_ERROR',
    });
  }
}

/**
 * PATCH /api/chat/thread/:threadId
 * Move a conversation to a different project or update thread metadata (E6)
 */
export async function patchThread(req: Request, res: Response) {
  try {
    const threadId = String(req.params.threadId);
    const { project_id, title } = req.body;
    const orgId = (req as any).tenantId || (req as any).tenantContext?.organizationId;

    if (!orgId) {
      return res.status(401).json({ ok: false, error: 'Organization context required' });
    }

    // Verify thread exists and belongs to org
    const threadCheck = await pool.query(
      `SELECT id FROM ai_threads WHERE id = $1 AND organization_id = $2`,
      [threadId, orgId]
    );

    if (threadCheck.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Thread not found' });
    }

    // Build dynamic SET clause
    const updates: string[] = [];
    const values: any[] = [];
    let paramIdx = 1;

    if (project_id !== undefined) {
      updates.push(`project_id = $${paramIdx++}`);
      values.push(project_id || null);
    }
    if (title !== undefined) {
      updates.push(`title = $${paramIdx++}`);
      values.push(title);
    }
    updates.push(`updated_at = NOW()`);

    values.push(threadId);

    await pool.query(
      `UPDATE ai_threads SET ${updates.join(', ')} WHERE id = $${paramIdx}`,
      values
    );

    res.json({ ok: true, threadId, project_id: project_id ?? undefined });
  } catch (error: any) {
    console.error('[AnA] Patch thread error:', error);
    res.status(500).json({ ok: false, error: 'Failed to update thread' });
  }
}

/**
 * DELETE /api/chat/thread/:threadId
 * Delete a conversation thread from database
 */
export async function deleteThread(req: Request, res: Response) {
  try {
    const threadId = String(req.params.threadId);
    const orgId = (req as any).tenantId || (req as any).tenantContext?.organizationId;

    if (!orgId) {
      return res.status(401).json({
        error: 'Organization context required',
        code: 'ORG_CONTEXT_REQUIRED',
      });
    }

    const result = await pool.query(
      'DELETE FROM chat_threads WHERE id = $1 AND organization_id = $2',
      [threadId, orgId]
    );
    const deleted = (result.rowCount || 0) > 0;

    res.json({
      success: deleted,
      message: deleted ? 'Thread deleted' : 'Thread not found',
    });
  } catch (error: any) {
    console.error('[AnA] Thread deletion error:', error);
    res.status(500).json({
      error: 'Failed to delete thread',
      code: 'THREAD_DELETE_ERROR',
    });
  }
}
