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
import { writeChainedAuditRow } from './auditService.js';

/**
 * Ensure critical chat tables exist. Called lazily on first use.
 * Uses IF NOT EXISTS so it's safe to call multiple times.
 */
let tablesEnsured = false;
async function ensureChatTables(): Promise<void> {
  if (tablesEnsured) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS chat_threads (
        id TEXT PRIMARY KEY,
        user_id INTEGER,
        project_id INTEGER,
        organization_id INTEGER,
        title TEXT,
        model TEXT,
        system_prompt TEXT,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS chat_messages (
        id SERIAL PRIMARY KEY,
        thread_id TEXT REFERENCES chat_threads(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        model TEXT,
        tokens_used INTEGER DEFAULT 0,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    tablesEnsured = true;
  } catch (e: unknown) {
    // This catch used to say "Tables may already exist with different schema —
    // that's fine". It was not fine, and that comment was the defect's alibi:
    // the CREATE above omitted model, tokens_used and metadata on
    // chat_messages (and title, model, system_prompt, metadata on
    // chat_threads), while the queries BELOW IN THIS FILE select and insert
    // exactly those columns. Every write failed with
    // `column "model" of relation "chat_messages" does not exist`, and this
    // handler is why nothing louder happened.
    //
    // The canonical shape now lives in migrations/20260728_chat_thread_store.sql,
    // which both creates it and repairs databases carrying the old narrow
    // shape. The DDL here is kept as a same-shape fallback for a database that
    // has not had migrations applied — it must stay in sync with that file.
    console.warn('[chat-thread-helpers] Table ensure warning:', e instanceof Error ? e.message : String(e));
    tablesEnsured = true; // Don't retry
  }
}

/**
 * Get an existing thread or create a new one.
 * @param threadId - Existing thread ID (or null to create new)
 * @param userId - Optional user ID to associate
 * @param prefix - Thread ID prefix ('thread' for legacy, 'cortex' for Cortex)
 */
/**
 * A caller-supplied thread id that this caller may not use.
 *
 * `THREAD_FORBIDDEN` — the thread exists in the caller's organization but is
 * owned by a different user. There is no sharing model for AnA conversations,
 * so a colleague's transcript is not readable or appendable by id.
 */
export class ThreadAccessError extends Error {
  readonly code: 'THREAD_FORBIDDEN';
  readonly threadId: string;
  constructor(code: 'THREAD_FORBIDDEN', threadId: string) {
    super(`${code}: thread ${threadId} is not accessible to this caller`);
    this.name = 'ThreadAccessError';
    this.code = code;
    this.threadId = threadId;
  }
}

function threadOwnerMatches(rowUserId: unknown, userId: number | string | null | undefined): boolean {
  // A thread with no recorded owner (legacy / system-created rows) is scoped by
  // organization alone. A thread WITH an owner is that user's: an unidentified
  // caller does not get it either.
  if (rowUserId === null || rowUserId === undefined) return true;
  if (userId === null || userId === undefined || userId === '') return false;
  return String(rowUserId) === String(userId);
}

/**
 * Resolve a caller-supplied thread id AS THE CALLER: scoped to the caller's
 * organization and, where the thread has an owner, to that owner.
 *
 * ── Why this exists ───────────────────────────────────────────────────────────
 * getOrCreateThread used to accept any id after `SELECT id FROM chat_threads
 * WHERE id = $1` — no organization predicate, no owner predicate — and the
 * AnA stream route then loaded that thread's last twenty messages into the
 * model context and appended the caller's message to it. With Row-Level
 * Security enforcing, the org half of that was caught by the policy on
 * chat_threads / chat_messages (the request-scoped micro-transaction carries
 * the tenant); with it off (dev, staging, any system-scoped code path) it was
 * a cross-tenant read AND write by id. The policy is org-keyed, so the
 * cross-USER half — a colleague's conversation, by an id of the shape
 * `ana-ri_<timestamp>_<9 base36 chars>` — was never caught anywhere.
 *
 * Returns null when no thread of that id exists IN THIS ORGANIZATION. A
 * foreign organization's row is never resolved, so the caller cannot learn
 * whether the id exists elsewhere; getOrCreateThread simply mints a fresh
 * thread, which is what it always did for an unknown id.
 *
 * @throws ThreadAccessError THREAD_FORBIDDEN — the thread exists here and is
 *         owned by someone else.
 */
export async function resolveAccessibleThread(
  threadId: string,
  organizationId: number | null | undefined,
  userId?: number | string | null
): Promise<{ id: string; user_id: number | null; organization_id: number | null } | null> {
  await ensureChatTables();
  const orgId = organizationId === null || organizationId === undefined ? null : Number(organizationId);
  // No organization to scope by → nothing can be proven about the id, so it
  // resolves to nothing. Callers without a tenant get a fresh thread.
  if (orgId === null || !Number.isFinite(orgId)) return null;
  const existing = await pool.query(
    'SELECT id, user_id, organization_id FROM chat_threads WHERE id = $1 AND organization_id = $2',
    [threadId, orgId]
  );
  const row = existing.rows[0] as
    | { id: string; user_id: number | null; organization_id: number | null }
    | undefined;
  if (!row) return null;
  if (!threadOwnerMatches(row.user_id, userId)) {
    throw new ThreadAccessError('THREAD_FORBIDDEN', threadId);
  }
  return row;
}

/**
 * Return `threadId` when the caller may use it, otherwise create a new thread
 * for the caller. A caller-supplied id is honoured ONLY when it resolves in the
 * caller's organization to a thread the caller owns (or that has no owner);
 * see resolveAccessibleThread. Anything else — unknown id, an id that exists
 * only in another tenant, no tenant to scope by — mints a fresh thread, so no
 * foreign row is ever read or written through this function.
 *
 * @throws ThreadAccessError when the id names a colleague's thread.
 */
/** The shell's project key is the regulatory_programs UUID; `project_id` on this table is an integer. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The program a thread was started in, as the shell names it (a
 * regulatory_programs UUID), or null. Kept in `metadata.programId` because the
 * table's `project_id` column is an integer that the shell's key never fits —
 * which is why, until now, no thread could be listed back under its project
 * and "resume a project chat" had nothing to resume.
 */
export function programIdForThread(projectId: unknown): string | null {
  return typeof projectId === 'string' && UUID_RE.test(projectId) ? projectId.toLowerCase() : null;
}

export async function getOrCreateThread(
  threadId: string | null,
  userId?: number | string | null,
  prefix: string = 'thread',
  organizationId?: number | null,
  programId?: string | null
): Promise<string> {
  await ensureChatTables();
  if (threadId) {
    const accessible = await resolveAccessibleThread(threadId, organizationId, userId);
    if (accessible) return accessible.id;
  }
  const newId = `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const ownerId =
    userId === null || userId === undefined || userId === '' ? null : Number(userId);
  const program = programIdForThread(programId);
  await pool.query(
    'INSERT INTO chat_threads (id, user_id, organization_id, metadata, created_at, updated_at) VALUES ($1, $2, $3, $4, NOW(), NOW())',
    [
      newId,
      Number.isFinite(ownerId as number) ? ownerId : null,
      organizationId || null,
      program ? JSON.stringify({ programId: program }) : null,
    ]
  );
  return newId;
}

/**
 * Ensure a thread exists with a caller-supplied ID, creating it if absent.
 *
 * Unlike {@link getOrCreateThread} (which generates a fresh ID when the given
 * thread is missing), this preserves the caller's exact ID — useful for
 * services that derive a stable conversation ID externally and expect the same
 * value back. Returns the (unchanged) thread ID.
 */
export async function ensureThread(
  threadId: string,
  userId?: number | null,
  organizationId?: number | null
): Promise<string> {
  await ensureChatTables();
  await pool.query(
    `INSERT INTO chat_threads (id, user_id, organization_id, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW())
     ON CONFLICT (id) DO NOTHING`,
    [threadId, userId ?? null, organizationId ?? null]
  );
  // ON CONFLICT DO NOTHING is silent about WHOSE row won. A stable external id
  // that already exists in another organization, or under another owner, must
  // not be handed back as if it were this caller's — that is the same hole as
  // the caller-supplied id above, reached through a different door.
  const row = (
    await pool.query('SELECT user_id, organization_id FROM chat_threads WHERE id = $1', [threadId])
  ).rows[0] as { user_id: number | null; organization_id: number | null } | undefined;
  if (row) {
    const wantOrg = organizationId === null || organizationId === undefined ? null : Number(organizationId);
    const haveOrg = row.organization_id === null ? null : Number(row.organization_id);
    if (haveOrg !== null && wantOrg !== null && haveOrg !== wantOrg) {
      throw new ThreadAccessError('THREAD_FORBIDDEN', threadId);
    }
    if (!threadOwnerMatches(row.user_id, userId)) {
      throw new ThreadAccessError('THREAD_FORBIDDEN', threadId);
    }
  }
  return threadId;
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
): Promise<Array<{ role: string; content: string; metadata?: unknown }>> {
  const result = await pool.query(
    'SELECT role, content, metadata FROM chat_messages WHERE thread_id = $1 ORDER BY created_at ASC',
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
/**
 * Save one message to the working transcript. Returns the row's id, so the
 * turn record (services/ana/turn-record.ts) can name the question and the
 * answer it is the record of.
 */
export async function saveChatMessage(
  threadId: string,
  role: string,
  content: string,
  model?: string,
  tokens?: number,
  metadata?: Record<string, unknown> | null
): Promise<number | null> {
  const inserted = await pool.query(
    'INSERT INTO chat_messages (thread_id, role, content, model, tokens_used, metadata, created_at) VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING id',
    [threadId, role, content, model || null, tokens || 0, metadata ? JSON.stringify(metadata) : null]
  );
  await pool.query('UPDATE chat_threads SET updated_at = NOW() WHERE id = $1', [threadId]);
  const id = Number((inserted as { rows?: Array<{ id?: unknown }> })?.rows?.[0]?.id);
  return Number.isFinite(id) ? id : null;
}

export const CONVERSATION_DELETED_AUDIT_ACTION = 'chat.thread.deleted';

export type DeleteConversationResult =
  | { status: 'deleted'; messagesDeleted: number; turnRecordsRetained: number | null }
  | { status: 'not_found' }
  | { status: 'forbidden' };

/**
 * Remove a conversation from the working transcript, as the person who owns
 * it, with a chained audit row in the same transaction.
 *
 * Both delete routes (DELETE /api/chat/thread/:id and
 * DELETE /api/cortex/threads/:id) removed a thread and its messages with no
 * audit row, and the chat route did not check the owner: any member of the
 * organization could remove a colleague's conversation by id. There is no
 * sharing model for AnA conversations (see ThreadAccessError), so deleting
 * one is its owner's act.
 *
 * What is removed is the working copy only. The retained turn records
 * (ana_turn_records) reference the thread by id, not by foreign key, and are
 * append-only: they stay, and the audit row says how many did.
 */
export async function deleteConversation(args: {
  threadId: string;
  organizationId: number;
  userId: number | string | null | undefined;
  ipAddress?: string;
  userAgent?: string;
}): Promise<DeleteConversationResult> {
  const { threadId, organizationId, userId } = args;
  // Read outside the transaction: a database that has not had the turn-record
  // migration yet has no such table, which must not stop a delete. Unknown is
  // recorded as null, never as zero.
  let turnRecordsRetained: number | null;
  try {
    const kept = await pool.query(
      'SELECT count(*)::int AS n FROM ana_turn_records WHERE organization_id = $1 AND thread_id = $2',
      [organizationId, threadId]
    );
    turnRecordsRetained = Number((kept as { rows: Array<{ n: number }> }).rows[0]?.n ?? 0);
  } catch {
    turnRecordsRetained = null;
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query(
      'SELECT id, user_id, title FROM chat_threads WHERE id = $1 AND organization_id = $2 FOR UPDATE',
      [threadId, organizationId]
    );
    const row = found.rows[0] as { id: string; user_id: number | null; title: string | null } | undefined;
    if (!row) {
      await client.query('ROLLBACK');
      return { status: 'not_found' };
    }
    if (!threadOwnerMatches(row.user_id, userId)) {
      await client.query('ROLLBACK');
      return { status: 'forbidden' };
    }
    const messages = await client.query('DELETE FROM chat_messages WHERE thread_id = $1', [threadId]);
    await client.query('DELETE FROM chat_threads WHERE id = $1 AND organization_id = $2', [threadId, organizationId]);
    const messagesDeleted = messages.rowCount ?? 0;
    await writeChainedAuditRow(client, {
      tenantId: organizationId,
      userId: userId ?? undefined,
      action: CONVERSATION_DELETED_AUDIT_ACTION,
      resourceType: 'chat_thread',
      resourceId: threadId,
      details: {
        threadId,
        title: row.title ?? null,
        ownerUserId: row.user_id ?? null,
        messagesDeleted,
        turnRecordsRetained,
      },
      ipAddress: args.ipAddress,
      userAgent: args.userAgent,
    });
    await client.query('COMMIT');
    return { status: 'deleted', messagesDeleted, turnRecordsRetained };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
