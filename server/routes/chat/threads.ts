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
 * Used by Ana to restore previous conversations.
 */
export async function listThreads(req: Request, res: Response) {
  try {
    const projectId = req.query.project_id as string | undefined;
    const limit = Math.min(parseInt((req.query.limit as string) || '10', 10), 50);
    const orgId = (req as any).tenantId || (req as any).tenantContext?.organizationId;

    let query: string;
    let params: unknown[];

    if (projectId) {
      // ai_threads is the project-scoped conversation store.
      //
      // This branch previously swallowed EVERY failure into `{ threads: [] }`,
      // so a broken query, a lost connection, or an RLS denial was reported to
      // the caller as "this project has no conversations". A reviewer looking
      // at a project's AnA history could not tell an empty history from a
      // failed read — the same data-integrity defect the Part 11 reads had.
      // Let the error escape to the outer catch, which now answers with a real
      // status instead of a fabricated empty list.
      const aiResult = await pool.query(
        `SELECT id, project_id, title, created_at, updated_at FROM ai_threads
         WHERE project_id = $1 ${orgId ? 'AND organization_id = $2' : ''}
         ORDER BY COALESCE(updated_at, created_at) DESC LIMIT ${orgId ? '$3' : '$2'}`,
        orgId ? [projectId, orgId, limit] : [projectId, limit]
      );
      return res.json({ threads: aiResult.rows });
    } else {
      // Org scope is required for the global recents list — without it
      // we'd leak threads across tenants.
      if (!orgId) {
        return res.json({ threads: [] });
      }
      // Derive title from the first user message so the recents list shows
      // meaningful labels instead of "thread_1234567" ids.
      query = `
        SELECT t.id, t.created_at, t.updated_at,
          (SELECT content FROM chat_messages
            WHERE thread_id = t.id AND role = 'user'
            ORDER BY created_at ASC LIMIT 1) AS title
        FROM chat_threads t
        WHERE t.organization_id = $1
        ORDER BY t.updated_at DESC
        LIMIT $2
      `;
      params = [orgId, limit];
    }

    const result = await pool.query(query, params);
    res.json({ threads: result.rows });
  } catch (error: any) {
    // A read that FAILED must never be reported as a read that returned
    // nothing. The previous `res.json({ threads: [] })` here made every
    // outage (missing table, connection loss, permission denial) look like
    // "you have no conversations", which silently hides user work and makes
    // the failure invisible to monitoring as well (a 200 is not an error rate).
    // 42P01 is called out separately because "the store was never provisioned"
    // is an operator problem, not a transient server fault.
    const code = (error as { code?: string } | null)?.code;
    if (code === '42P01') {
      console.error('[AnA] Thread listing failed: conversation store not provisioned');
      return res.status(503).json({
        error: 'Conversation store is not provisioned',
        code: 'THREAD_STORE_UNPROVISIONED',
      });
    }
    console.error('[AnA] Thread listing failed:', error?.message);
    return res.status(500).json({
      error: 'Failed to list threads',
      code: 'THREAD_LIST_ERROR',
    });
  }
}

/**
 * GET /api/chat/threads/:threadId/messages
 * Retrieve messages for a specific thread.
 * Used by Ana to restore conversation content.
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
    // Same rule as listThreads: an unreadable transcript is NOT an empty
    // transcript. Returning `{ messages: [] }` on a failed read let the UI
    // render a thread as if the user had said nothing, which is worse than an
    // error — it looks like data loss and it is indistinguishable from one.
    const code = (error as { code?: string } | null)?.code;
    if (code === '42P01') {
      console.error('[AnA] Thread messages failed: message store not provisioned');
      return res.status(503).json({
        error: 'Conversation store is not provisioned',
        code: 'THREAD_STORE_UNPROVISIONED',
      });
    }
    console.error('[AnA] Thread messages failed:', error?.message);
    return res.status(500).json({
      error: 'Failed to retrieve thread messages',
      code: 'THREAD_MESSAGES_ERROR',
    });
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
