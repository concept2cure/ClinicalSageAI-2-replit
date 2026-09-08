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
import { getThreadMessages, programIdForThread } from '../../services/chat-thread-helpers.js';

/**
 * GET /api/chat/threads
 * List threads, optionally filtered by project_id.
 * Used by Ana to restore previous conversations.
 */
export async function listThreads(req: Request, res: Response) {
  try {
    const projectId = req.query.project_id as string | undefined;
    const programId = req.query.program_id as string | undefined;
    const limit = Math.min(parseInt((req.query.limit as string) || '10', 10), 50);
    const orgId = (req as any).tenantId || (req as any).tenantContext?.organizationId;

    let query: string;
    let params: unknown[];

    if (programId !== undefined) {
      // The shell's project key (regulatory_programs UUID). Threads carry it in
      // metadata.programId from the moment they are minted (chat-thread-helpers
      // programIdForThread), so this is what "resume a project chat" lists.
      // Org scope is required — the same rule as the global recents.
      if (!orgId) return res.json({ threads: [] });
      const program = programIdForThread(programId);
      if (!program) {
        return res.status(400).json({ error: 'program_id must be a UUID', code: 'THREAD_PROGRAM_INVALID' });
      }
      const result = await pool.query(
        `SELECT t.id, t.created_at, t.updated_at, t.metadata->>'programId' AS program_id,
          (SELECT content FROM chat_messages
            WHERE thread_id = t.id AND role = 'user'
            ORDER BY created_at ASC LIMIT 1) AS title
        FROM chat_threads t
        WHERE t.organization_id = $1 AND t.metadata->>'programId' = $2
        ORDER BY COALESCE(t.updated_at, t.created_at) DESC
        LIMIT $3`,
        [orgId, program, limit]
      );
      return res.json({ threads: result.rows });
    }

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

/* ── Which store owns a thread ────────────────────────────────────────────────
   Two thread stores exist and both are live: `chat_threads`/`chat_messages`
   (AnA RI — everything the rail, the thread surface and the project landing
   mint) and `ai_threads`/`ai_messages` (submission chat, evidence-ask). The
   handlers below used to name a store literally, and one of them named the
   WRONG one: GET /threads/:id/messages verified the thread against `ai_threads`
   and then read `chat_messages`, so every conversation the project landing
   lists — all of them minted in `chat_threads` — answered "Thread not found"
   and resumed as an empty transcript. Measured in a browser on 2026-09-07;
   the jsdom test mocked the fetch and could not have seen it.

   So the store is RESOLVED, once, org-scoped, and each handler then acts on the
   store that actually owns the thread. */
type ThreadStore = 'chat' | 'ai';

async function resolveThreadStore(threadId: string, orgId: unknown): Promise<ThreadStore | null> {
  const { rows } = await pool.query(
    `SELECT 'chat'::text AS store FROM chat_threads WHERE id = $1 AND organization_id = $2
     UNION ALL
     SELECT 'ai'::text AS store FROM ai_threads WHERE id = $1 AND organization_id = $2
     LIMIT 1`,
    [threadId, orgId],
  );
  return (rows[0]?.store as ThreadStore | undefined) ?? null;
}

/** The `ai_threads` transcript. `chat_messages` is read by getThreadMessages. */
async function getAiThreadMessages(threadId: string): Promise<Array<{ role: string; content: string }>> {
  const { rows } = await pool.query(
    'SELECT role, content FROM ai_messages WHERE thread_id = $1 ORDER BY created_at ASC',
    [threadId],
  );
  return rows;
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

    const store = await resolveThreadStore(threadId, orgId);

    if (!store) {
      /* No `messages: []` in this body. A thread that cannot be read is not a
         thread with nothing in it, and a 404 carrying an empty list is exactly
         the shape a caller reads as "no messages" — the same rule the catch
         below states for a failed read. */
      return res.status(404).json({ error: 'Thread not found', code: 'THREAD_NOT_FOUND' });
    }

    const limit = Math.min(parseInt((req.query.limit as string) || '30', 10), 100);
    const messages = store === 'chat' ? await getThreadMessages(threadId) : await getAiThreadMessages(threadId);
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

    const store = await resolveThreadStore(threadId, orgId);

    if (!store) {
      return res.status(404).json({ ok: false, error: 'Thread not found' });
    }

    /* `chat_threads.project_id` is INTEGER and `ai_threads.project_id` is TEXT.
       Passing the shell's program UUID at the integer column threw 22P02 and
       surfaced as a 500; the program key belongs in `metadata.programId`, which
       is where getOrCreateThread writes it. Refuse it plainly instead. */
    if (store === 'chat' && project_id !== undefined && project_id !== null && project_id !== '') {
      /* Number(), not parseInt(): parseInt('0f3c1a2b-…') is 0, so a UUID would
         pass the guard and then be written as project 0. */
      const numericProject = typeof project_id === 'number' ? project_id : Number(String(project_id).trim());
      if (!Number.isInteger(numericProject) || numericProject <= 0) {
        return res.status(400).json({
          ok: false,
          error: 'project_id must be a numeric project for this conversation; the program key is set when the thread is created.',
          code: 'THREAD_PROJECT_INVALID',
        });
      }
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

    // A closed set of two, chosen by the resolver — never a value from the request.
    const table = store === 'chat' ? 'chat_threads' : 'ai_threads';
    await pool.query(
      `UPDATE ${table} SET ${updates.join(', ')} WHERE id = $${paramIdx}`,
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
