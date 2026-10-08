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
 *   - patchThread          PATCH /api/chat/thread/:threadId (rename; the project is fixed)
 *   - deleteThread         DELETE /api/chat/thread/:threadId
 *
 * Handler bodies are copied verbatim from the original route registrations
 * (every SQL string, branch, and error message preserved).
 */

import type { Request, Response } from 'express';
import { pool } from '../../db.js';
import {
  deleteConversation,
  getThreadMessages,
  programIdForThread,
  resolveAccessibleThread,
  ThreadAccessError,
} from '../../services/chat-thread-helpers.js';

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
    /* A conversation belongs to the person who started it: opening a
       colleague's answers THREAD_FORBIDDEN (resolveAccessibleThread). Both
       chat_threads lists were scoped to the organisation only, so each named a
       colleague's conversation by its first message, a line the reader could
       never open (docs/design/ONE_ANA_ONE_CANVAS.md, slice 3). They list the
       caller's own. A thread with no recorded owner is not listed: it can still
       be opened by its id, as before. No identified caller, no list. */
    const me = (req as any).user?.id ?? (req as any).userId ?? null;

    let query: string;
    let params: unknown[];

    if (programId !== undefined) {
      // The shell's project key (regulatory_programs UUID). A thread carries it
      // in chat_threads.program_id from the moment it is minted, bound only to
      // a program of its own organization (chat-thread-helpers getOrCreateThread,
      // PF-10 S2), so this is what "resume a project chat" lists. Org scope is
      // required — the same rule as the global recents.
      if (!orgId) return res.json({ threads: [] });
      const program = programIdForThread(programId);
      if (!program) {
        return res.status(400).json({ error: 'program_id must be a UUID', code: 'THREAD_PROGRAM_INVALID' });
      }
      if (me === null) return res.json({ threads: [] });
      const result = await pool.query(
        `SELECT t.id, t.created_at, t.updated_at, t.program_id,
          (SELECT content FROM chat_messages
            WHERE thread_id = t.id AND role = 'user'
            ORDER BY created_at ASC LIMIT 1) AS title
        FROM chat_threads t
        WHERE t.organization_id = $1 AND t.program_id = $2 AND t.user_id = $4
        ORDER BY COALESCE(t.updated_at, t.created_at) DESC
        LIMIT $3`,
        [orgId, program, limit, me]
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
      if (!orgId || me === null) {
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
        WHERE t.organization_id = $1 AND t.user_id = $3
        ORDER BY t.updated_at DESC
        LIMIT $2
      `;
      params = [orgId, limit, me];
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
 * Rename a conversation. Its project cannot be changed (PF-10 S8).
 *
 * This route used to "move a conversation to a different project" (E6): it
 * wrote `project_id` on either store, by thread id alone, for any caller in the
 * organization. The founder decided on 2026-09-26 that a conversation belongs
 * to one project, and that switching project forks it, with the old one
 * staying bound to its own project. A re-home is the opposite of that rule,
 * and nothing in the client calls it (no `chat/thread/` request in client/).
 * So a project change is refused 409 THREAD_PROJECT_FIXED on both stores. The
 * rename that remains is scoped to the organization and, on the AnA store
 * (chat_threads), to the caller's own conversation. ai_threads (submission
 * chat, project onboarding) has no owner model anywhere: every member of the
 * organization already lists, reads and appends to it, so its rename stays
 * organization-wide here. An owner model for that store is D3's (review
 * wf_3b9a0148-a31).
 */
export async function patchThread(req: Request, res: Response) {
  try {
    const threadId = String(req.params.threadId);
    const { project_id, title } = req.body ?? {};
    const orgId = (req as any).tenantId || (req as any).tenantContext?.organizationId;

    if (!orgId) {
      return res.status(401).json({ ok: false, error: 'Organization context required' });
    }

    const store = await resolveThreadStore(threadId, orgId);

    if (!store) {
      return res.status(404).json({ ok: false, error: 'Thread not found' });
    }

    if (project_id !== undefined) {
      return res.status(409).json({
        ok: false,
        error: 'A conversation stays in the project it was held in. Start a new conversation in the other project.',
        code: 'THREAD_PROJECT_FIXED',
      });
    }

    // A colleague's AnA conversation is not the caller's to rename: the same
    // owner rule the stream applies before it appends to a thread.
    if (store === 'chat') {
      try {
        await resolveAccessibleThread(threadId, Number(orgId), (req as any).user?.id ?? null);
      } catch (e) {
        if (e instanceof ThreadAccessError) {
          return res.status(403).json({ ok: false, error: 'That conversation belongs to another user.', code: e.code });
        }
        throw e;
      }
    }

    // A closed set of two, chosen by the resolver — never a value from the request.
    const table = store === 'chat' ? 'chat_threads' : 'ai_threads';
    if (title !== undefined) {
      await pool.query(`UPDATE ${table} SET title = $1, updated_at = NOW() WHERE id = $2 AND organization_id = $3`, [
        title,
        threadId,
        orgId,
      ]);
    } else {
      await pool.query(`UPDATE ${table} SET updated_at = NOW() WHERE id = $1 AND organization_id = $2`, [threadId, orgId]);
    }

    res.json({ ok: true, threadId });
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

    // The owner's act, audited in the same transaction; the retained turn
    // records stay (services/chat-thread-helpers.ts deleteConversation).
    const result = await deleteConversation({
      threadId,
      organizationId: Number(orgId),
      userId: (req as any).userId ?? (req as any).user?.id ?? null,
      ipAddress: req.ip,
      userAgent: req.get('user-agent') ?? undefined,
    });
    if (result.status === 'forbidden') {
      return res.status(403).json({
        error: 'That conversation belongs to another user.',
        code: 'THREAD_FORBIDDEN',
      });
    }
    const deleted = result.status === 'deleted';

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
