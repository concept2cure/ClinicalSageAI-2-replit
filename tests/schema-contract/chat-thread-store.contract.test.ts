/**
 * Contract: the chat surface can actually persist a message.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * No .sql file in this repository creates chat_threads or chat_messages. Their
 * only creator was runtime DDL inside the application —
 * server/services/chat-thread-helpers.ts::ensureChatTables() — and that DDL
 * disagreed with the queries in the SAME FILE:
 *
 *   created:  chat_messages (id, thread_id, role, content, created_at)
 *   :111      SELECT role, content, metadata     FROM chat_messages
 *   :139      SELECT role, content, tokens_used  FROM chat_messages
 *   :186      INSERT INTO chat_messages (..., model, tokens_used, metadata, ...)
 *
 * So on every database — because nothing else creates these tables — persisting
 * a chat message failed with `column "model" of relation "chat_messages" does
 * not exist`. README.md calls the conversation surface "the product".
 *
 * migrations/20260601_chat_message_metadata.sql did not save it: that file is
 * `ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS metadata`, which cannot
 * run on a fresh database because the table it alters has no creator. It is one
 * of the files install-fresh.mjs reports unapplied with
 * `relation "chat_messages" does not exist`.
 *
 * ── Why this test executes SQL ────────────────────────────────────────────────
 * A grep cannot tell you whether a column exists. These tests build the real
 * tables, apply the REAL migration file, and run the REAL query text from the
 * routes. The broken shape is reproduced FIRST so the fix is known to close a
 * real mechanism.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIGRATION = path.join(REPO_ROOT, 'migrations/20260728_chat_thread_store.sql');
const METADATA_PATCH = path.join(REPO_ROOT, 'migrations/20260601_chat_message_metadata.sql');

/** ensureChatTables()'s DDL as it stood when the defect existed. */
const RUNTIME_DDL_NARROW = `
  CREATE TABLE IF NOT EXISTS chat_threads (
    id TEXT PRIMARY KEY,
    user_id INTEGER,
    project_id INTEGER,
    organization_id INTEGER,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS chat_messages (
    id SERIAL PRIMARY KEY,
    thread_id TEXT REFERENCES chat_threads(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
  );
`;

/** The real statements, verbatim in shape, from the files that issue them. */
const Q = {
  // server/services/chat-thread-helpers.ts:186
  insertMessage: `INSERT INTO chat_messages (thread_id, role, content, model, tokens_used, metadata, created_at)
                  VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
  // :111
  selectForContext: `SELECT role, content, metadata FROM chat_messages WHERE thread_id = $1 ORDER BY created_at ASC`,
  // :139
  selectForTokens: `SELECT role, content, tokens_used FROM chat_messages WHERE thread_id = $1 ORDER BY created_at DESC`,
  // server/routes/cortex-unified.ts:1391
  selectForUi: `SELECT id, role, content, model, tokens_used, created_at FROM chat_messages WHERE thread_id = $1 ORDER BY created_at ASC`,
  // server/routes/chat/threads.ts — thread creation with the wider column set
  insertThread: `INSERT INTO chat_threads (id, user_id, title, system_prompt, metadata, created_at, updated_at)
                 VALUES ($1,$2,$3,$4,$5,NOW(),NOW())`,
  selectThread: `SELECT id, title, model, created_at, updated_at, user_id, metadata FROM chat_threads WHERE id = $1`,
};

let pg: PGlite;
beforeEach(async () => {
  pg = new PGlite();
});
afterEach(async () => {
  await pg?.close();
});

const applyMigration = async () => pg.exec(fs.readFileSync(MIGRATION, 'utf8'));
const seedThread = () => pg.query(`INSERT INTO chat_threads (id) VALUES ('t1')`);

describe('the defect, reproduced against the runtime-created shape', () => {
  beforeEach(async () => {
    await pg.exec(RUNTIME_DDL_NARROW);
    await seedThread();
  });

  it('cannot persist a message — the INSERT the code issues fails', async () => {
    await expect(
      pg.query(Q.insertMessage, ['t1', 'user', 'hi', 'claude', 42, null])
    ).rejects.toThrow(/column "model".*does not exist/i);
  });

  it('cannot read context — the SELECT the code issues fails', async () => {
    await expect(pg.query(Q.selectForContext, ['t1'])).rejects.toThrow(
      /column "metadata" does not exist/i
    );
  });

  it('cannot read token counts either', async () => {
    await expect(pg.query(Q.selectForTokens, ['t1'])).rejects.toThrow(
      /column "tokens_used" does not exist/i
    );
  });

  it('the 20260601 metadata patch alone does NOT fix it', async () => {
    // It adds `metadata` and nothing else, so the INSERT still dies on `model`.
    await pg.exec(fs.readFileSync(METADATA_PATCH, 'utf8'));
    await expect(
      pg.query(Q.insertMessage, ['t1', 'user', 'hi', 'claude', 42, null])
    ).rejects.toThrow(/column "model".*does not exist/i);
  });
});

describe('on a FRESH database, the migration creates a working store', () => {
  beforeEach(async () => {
    await applyMigration();
  });

  it('round-trips a message through the real INSERT and SELECTs', async () => {
    await seedThread();
    await pg.query(Q.insertMessage, [
      't1',
      'assistant',
      'the answer',
      'claude-opus',
      1234,
      JSON.stringify({ tools: ['search'] }),
    ]);

    const ctx = await pg.query<any>(Q.selectForContext, ['t1']);
    expect(ctx.rows).toHaveLength(1);
    expect(ctx.rows[0].content).toBe('the answer');
    expect(ctx.rows[0].metadata).toEqual({ tools: ['search'] });

    const tok = await pg.query<any>(Q.selectForTokens, ['t1']);
    expect(tok.rows[0].tokens_used).toBe(1234);

    const ui = await pg.query<any>(Q.selectForUi, ['t1']);
    expect(ui.rows[0].model).toBe('claude-opus');
  });

  it('supports the wider thread shape the routes write', async () => {
    await pg.query(Q.insertThread, ['t2', 7, 'My thread', 'be brief', JSON.stringify({ a: 1 })]);
    const r = await pg.query<any>(Q.selectThread, ['t2']);
    expect(r.rows[0].title).toBe('My thread');
    expect(r.rows[0].metadata).toEqual({ a: 1 });
  });

  it('tokens_used defaults to 0, not NULL', async () => {
    // chat-thread-helpers.ts:155 does `msg.tokens_used > 0 ? ... : estimate(...)`.
    // NULL > 0 is NULL (falsy), so either value takes the heuristic branch — but
    // 0 keeps the column arithmetic-safe for any caller that sums it.
    await seedThread();
    await pg.query(`INSERT INTO chat_messages (thread_id, role, content) VALUES ('t1','user','x')`);
    const r = await pg.query<any>(`SELECT tokens_used FROM chat_messages WHERE thread_id='t1'`);
    expect(r.rows[0].tokens_used).toBe(0);
  });

  it('cascades messages when a thread is deleted', async () => {
    await seedThread();
    await pg.query(Q.insertMessage, ['t1', 'user', 'x', null, 0, null]);
    await pg.query(`DELETE FROM chat_threads WHERE id='t1'`);
    const r = await pg.query<any>(`SELECT count(*)::int AS n FROM chat_messages`);
    expect(r.rows[0].n).toBe(0);
  });
});

describe('on a LONG-LIVED database, the migration repairs the narrow shape', () => {
  it('adds the missing columns to tables the app already created', async () => {
    await pg.exec(RUNTIME_DDL_NARROW);
    await seedThread();
    // Prove it is broken first.
    await expect(
      pg.query(Q.insertMessage, ['t1', 'user', 'hi', 'm', 1, null])
    ).rejects.toThrow(/does not exist/i);

    await applyMigration();

    // ...and working after, without recreating the table or losing the row.
    await pg.query(Q.insertMessage, ['t1', 'user', 'hi', 'm', 1, null]);
    const r = await pg.query<any>(Q.selectForUi, ['t1']);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].model).toBe('m');
  });

  it('preserves existing rows while widening the table', async () => {
    await pg.exec(RUNTIME_DDL_NARROW);
    await seedThread();
    await pg.query(`INSERT INTO chat_messages (thread_id, role, content) VALUES ('t1','user','historic')`);

    await applyMigration();

    const r = await pg.query<any>(`SELECT content, model, tokens_used FROM chat_messages`);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].content).toBe('historic');
    expect(r.rows[0].model).toBeNull();
    // Pre-existing rows get the column default rather than NULL.
    expect(r.rows[0].tokens_used).toBe(0);
  });

  it('composes with 20260601 in either order', async () => {
    await pg.exec(RUNTIME_DDL_NARROW);
    await pg.exec(fs.readFileSync(METADATA_PATCH, 'utf8')); // metadata added first
    await expect(applyMigration()).resolves.toBeDefined();
    await seedThread();
    await pg.query(Q.insertMessage, ['t1', 'user', 'x', 'm', 1, JSON.stringify({ k: 1 })]);
    const r = await pg.query<any>(Q.selectForContext, ['t1']);
    expect(r.rows[0].metadata).toEqual({ k: 1 });
  });

  it('is idempotent', async () => {
    await applyMigration();
    await expect(applyMigration()).resolves.toBeDefined();
    await seedThread();
    await pg.query(Q.insertMessage, ['t1', 'user', 'x', 'm', 1, null]);
    const r = await pg.query<any>(`SELECT count(*)::int AS n FROM chat_messages`);
    expect(r.rows[0].n).toBe(1);
  });
});
