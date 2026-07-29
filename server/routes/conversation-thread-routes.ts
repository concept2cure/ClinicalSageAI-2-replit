/**
 * Conversation Thread — read-model API route (ui-v2 surface: conversation-thread).
 *
 * Backs client/src/concept2cure/v2/surfaces/ConversationThread.tsx by returning a
 * single AnA conversation in the surface's display shape, populated from the real,
 * org-scoped chat store (ai_threads / chat_threads + chat_messages) that the
 * /api/chat/* handlers already read and write.
 *
 * Honest scope (regulated product — no fabricated provenance). Sourced vs. omitted:
 *   SOURCED (stored data):
 *     - title    ai_threads.title (auto-derived from the first user message by the
 *                send path), or the first user message when only chat_threads exists
 *     - when     ai_threads/chat_threads updated_at || created_at, as ISO-8601
 *     - turns[]  chat_messages rows — role 'user' -> { role:'user', text },
 *                role 'assistant' -> { role:'ana', answer }
 *   OMITTED / NULLED (NOT persisted on the thread/message model — the chat write
 *   path saves only { thread_id, role, content, model, tokens_used } with no
 *   metadata, so returning any of these would fabricate regulated content):
 *     - section          not stored on the thread -> null
 *     - turn.thinking    model reasoning is not persisted -> omitted
 *     - turn.tools       tool runs live in a separate tool-run log with no
 *                        per-message linkage -> omitted
 *     - turn.proposal    governed-edit proposals are not linked per chat message -> omitted
 *     - turn.links       per-turn citations are not persisted on chat_messages -> omitted
 *     - turn.grounding   retrieval grounding is not persisted on chat_messages -> omitted
 *     - turn.artifactRef no message->artifact linkage is stored -> omitted
 *     - artifacts[]      artifact provenance (audit hash, confidence, evidence,
 *                        predicates) cannot be sourced without fabrication -> []
 *     - work[]           per-conversation work rollup is not modeled -> []
 *
 * RLS (CI gate ci:requestdb-coverage): every direct read goes through the
 * request-scoped Drizzle client (requestDb(req)) so the tenant session vars set by
 * requireTenantContext apply once RLS is enforced. The chat tables are not in the
 * typed Drizzle schema, so reads use parameterized raw SQL (sql``) through that same
 * request-scoped client. No shared pool / db import is used.
 *
 * @module routes/conversation-thread-routes
 */

import { Router, Request, Response } from 'express';
import { sql } from 'drizzle-orm';

import { createScopedLogger } from '../utils/logger.js';
import { requestDb } from '../db/requestDb';

const logger = createScopedLogger('conversation-thread-routes');

/** Postgres "undefined_table" — the fail-closed signal when a store is absent. */
const PG_UNDEFINED_TABLE = '42P01';

/** A single rendered turn in the ConversationThread surface. */
interface CtTurnView {
  role: 'user' | 'ana';
  text?: string;
  answer?: string;
}

/** The conversation-thread display shape (subset the real data can honestly fill). */
interface ConversationThreadView {
  title: string;
  /** Not persisted on the thread — always null (honest omission, not fabricated). */
  section: string | null;
  /** ISO-8601 last-activity timestamp (updated_at || created_at). */
  when: string;
  turns: CtTurnView[];
  /** Artifact provenance is not sourceable without fabrication — always empty. */
  artifacts: never[];
  /** Per-conversation work rollup is not modeled — always empty. */
  work: never[];
}

export default function createConversationThreadRoutes(): Router {
  const router = Router();

  /** Resolve the org id from tenant/user context, mirroring the chat handlers. */
  function getOrgId(req: Request): number {
    const raw =
      (req as any).tenantId ||
      (req as any).tenantContext?.organizationId ||
      (req as any).user?.organizationId;
    const num = raw === undefined || raw === null || raw === '' ? NaN : Number(raw);
    if (!Number.isFinite(num)) {
      throw new Error('CT_NO_TENANT: Organization context required');
    }
    return num;
  }

  function toIso(value: unknown): string {
    if (!value) return '';
    const d = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(d.getTime()) ? '' : d.toISOString();
  }

  /**
   * GET /api/concept2cure/conversation-thread/:threadId
   * One conversation in the ConversationThread surface display shape.
   * Envelope: { success: true, data: ConversationThreadView }.
   * Optional ?limit (1..500, default 200) keeps the most-recent N turns, in
   * chronological order (mirrors GET /api/chat/threads/:id/messages).
   */
  router.get('/:threadId', async (req: Request, res: Response) => {
    let orgId: number;
    try {
      orgId = getOrgId(req);
    } catch {
      return res.status(401).json({
        success: false,
        error: 'Organization context required',
        code: 'ORG_CONTEXT_REQUIRED',
      });
    }

    const threadId = String(req.params.threadId || '').trim();
    if (!threadId) {
      return res.status(400).json({
        success: false,
        error: 'threadId is required',
        code: 'THREAD_ID_REQUIRED',
      });
    }

    const parsedLimit = parseInt(String(req.query.limit ?? ''), 10);
    const limit = Number.isFinite(parsedLimit)
      ? Math.min(Math.max(parsedLimit, 1), 500)
      : 200;

    try {
      const db = requestDb(req);

      // ── Resolve + org-scope the thread. ai_threads carries the title; fall
      //    back to chat_threads (deriving the title from the first user message)
      //    when the thread predates provenance tracking. Both are org-scoped, so
      //    a thread owned by another tenant resolves to "not found" (no leak). ──
      let meta: Record<string, unknown> | null = null;
      let aiTableMissing = false;
      let chatTableMissing = false;

      try {
        const aiRes = await db.execute(sql`
          SELECT title, created_at, updated_at, project_id
          FROM ai_threads
          WHERE id = ${threadId} AND organization_id = ${orgId}
          LIMIT 1
        `);
        meta = (aiRes.rows[0] as Record<string, unknown> | undefined) ?? null;
      } catch (e: any) {
        if (e?.code === PG_UNDEFINED_TABLE) aiTableMissing = true;
        else throw e;
      }

      if (!meta) {
        try {
          const ctRes = await db.execute(sql`
            SELECT
              ct.created_at,
              ct.updated_at,
              ct.project_id,
              (SELECT content FROM chat_messages
                 WHERE thread_id = ct.id AND role = 'user'
                 ORDER BY created_at ASC LIMIT 1) AS title
            FROM chat_threads ct
            WHERE ct.id = ${threadId} AND ct.organization_id = ${orgId}
            LIMIT 1
          `);
          meta = (ctRes.rows[0] as Record<string, unknown> | undefined) ?? null;
        } catch (e: any) {
          if (e?.code === PG_UNDEFINED_TABLE) chatTableMissing = true;
          else throw e;
        }
      }

      if (!meta) {
        // Fail closed: if the backing store is absent we cannot confirm
        // ownership, so we never serve data.
        if (aiTableMissing && chatTableMissing) {
          logger.warn('conversation store tables missing', { threadId });
          return res.status(503).json({
            success: false,
            error: 'Conversation store unavailable',
            code: 'THREAD_STORE_UNAVAILABLE',
          });
        }
        return res.status(404).json({
          success: false,
          error: 'Thread not found',
          code: 'THREAD_NOT_FOUND',
        });
      }

      // ── Messages -> turns. chat_messages has no organization_id column;
      //    ownership is transitive through the org-verified thread above, and
      //    this read runs on the same request-scoped client. Most-recent N in
      //    chronological order. ──
      let turns: CtTurnView[] = [];
      try {
        const msgRes = await db.execute(sql`
          SELECT role, content, created_at
          FROM chat_messages
          WHERE thread_id = ${threadId}
          ORDER BY created_at DESC
          LIMIT ${limit}
        `);
        const rows = msgRes.rows as Array<Record<string, unknown>>;
        turns = rows
          .slice()
          .reverse() // DESC -> chronological
          .map((m): CtTurnView | null => {
            const role = String(m.role ?? '');
            const content = m.content == null ? '' : String(m.content);
            if (!content) return null;
            if (role === 'user') return { role: 'user', text: content };
            if (role === 'assistant') return { role: 'ana', answer: content };
            return null; // system/tool rows are not part of this surface
          })
          .filter((t): t is CtTurnView => t !== null);
      } catch (e: any) {
        if (e?.code === PG_UNDEFINED_TABLE) {
          logger.warn('chat_messages table missing; returning thread with no turns', {
            threadId,
          });
        } else {
          logger.error('conversation message load failed', {
            threadId,
            err: e instanceof Error ? e.message : String(e),
          });
        }
        turns = [];
      }

      const titleRaw = meta.title == null ? '' : String(meta.title).trim();
      const view: ConversationThreadView = {
        title: titleRaw || 'Untitled conversation',
        section: null,
        when: toIso(meta.updated_at ?? meta.created_at),
        turns,
        artifacts: [],
        work: [],
      };

      return res.json({ success: true, data: view });
    } catch (error) {
      logger.error('conversation-thread read error', {
        threadId,
        err: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({
        success: false,
        error: 'Failed to load conversation',
        code: 'CONVERSATION_THREAD_ERROR',
      });
    }
  });

  return router;
}
