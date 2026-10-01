/**
 * Contract: a caller-supplied chat thread id resolves AS THE CALLER, or not at
 * all.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * server/services/chat-thread-helpers.ts::getOrCreateThread accepted any thread
 * id after `SELECT id FROM chat_threads WHERE id = $1` — no organization
 * predicate, no owner predicate. server/routes/ana-ri/stream.ts then
 * `saveMessage`d the caller's turn into that thread and loaded its last twenty
 * messages into the model context. Every route that takes a thread id from the
 * request body (the AnA stream, the legacy chat send, the cortex chat, the
 * non-streaming context builder) reached the same helper the same way.
 *
 * With RLS enforcing, the ORGANIZATION half was caught by the tenant policy on
 * chat_threads / chat_messages; with it off (dev, staging, any system-scoped
 * code path) it was a cross-tenant read and write by id. The policy is
 * org-keyed, so the USER half — a colleague's AnA conversation, by an id of the
 * shape `ana-ri_<Date.now()>_<9 base36 chars>` — was caught nowhere.
 *
 * ── What this proves, against the REAL store ──────────────────────────────────
 * These tests apply the real migration (migrations/20260728_chat_thread_store.sql)
 * to an in-process Postgres and drive the real helpers through the same `pool`
 * the routes use:
 *   - an id that exists only in another organization is never resolved: the
 *     caller gets a FRESH thread and the foreign transcript is untouched;
 *   - an id owned by a colleague in the same organization is REFUSED
 *     (THREAD_FORBIDDEN) — not silently forked, so the client learns it sent an
 *     id it may not use;
 *   - the caller's own id resolves to itself; a thread with no recorded owner
 *     is scoped by organization alone;
 *   - ensureThread cannot adopt a colleague's or a foreign tenant's stable id;
 *   - a caller with no organization to scope by never resolves a supplied id.
 *
 * @compliance 21 CFR Part 11 §11.10(d) — limiting system access to authorized
 *             individuals. A conversation that can be read by anyone holding
 *             its id is not access-controlled.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIGRATION = path.join(REPO_ROOT, 'migrations/20260728_chat_thread_store.sql');
/** The program spine and the thread's program key (PF-10 S1), which the mint now writes. */
const PROGRAMS = path.join(REPO_ROOT, 'migrations/20260524_program_workbench_schema.sql');
const THREAD_PROGRAM_KEY = path.join(REPO_ROOT, 'migrations/20261001c_chat_threads_program_key.sql');
const P_A = '0a000000-0000-4000-8000-00000000000a'; // organization A
const P_B = '0b000000-0000-4000-8000-00000000000b'; // organization B
const P_A_DELETED = '0a000000-0000-4000-8000-0000000000de'; // organization A, soft-deleted
const T = 60_000;

/** node-postgres shape over PGlite, for the ONE `pool` the helpers import. */
const h = vi.hoisted(() => ({ pool: null as unknown }));
vi.mock('../../server/db', () => ({
  get pool() {
    return h.pool;
  },
  getPool: () => h.pool,
  get db() {
    return null;
  },
}));

let pg: PGlite;

const ORG_A = 1;
const ORG_B = 2;
const ALICE = 101; // org A
const BOB = 102; // org A
const CAROL = 201; // org B

async function seedThread(id: string, userId: number | null, orgId: number, msg: string) {
  await pg.query(
    `INSERT INTO chat_threads (id, user_id, organization_id) VALUES ($1, $2, $3)`,
    [id, userId, orgId],
  );
  await pg.query(
    `INSERT INTO chat_messages (thread_id, role, content) VALUES ($1, 'user', $2)`,
    [id, msg],
  );
}

async function messagesOf(id: string): Promise<string[]> {
  const r = await pg.query<{ content: string }>(
    `SELECT content FROM chat_messages WHERE thread_id = $1 ORDER BY id`,
    [id],
  );
  return r.rows.map(x => x.content);
}

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`CREATE TABLE organizations (id SERIAL PRIMARY KEY, name TEXT); CREATE TABLE users (id SERIAL PRIMARY KEY, name TEXT);`);
  await pg.exec(fs.readFileSync(PROGRAMS, 'utf8'));
  await pg.exec(fs.readFileSync(MIGRATION, 'utf8'));
  await pg.exec(fs.readFileSync(THREAD_PROGRAM_KEY, 'utf8'));
  for (const [id, org, deleted] of [[P_A, ORG_A, false], [P_B, ORG_B, false], [P_A_DELETED, ORG_A, true]] as const) {
    await pg.query(
      `INSERT INTO regulatory_programs (id, organization_id, name, code, program_type, product_type, primary_agency, product_name, deleted_at)
       VALUES ($1, $2, 'p', $3, 'ind', 'drug', 'FDA', 'p', ${deleted ? 'now()' : 'NULL'})`,
      [id, org, id.slice(-4)],
    );
  }
  h.pool = {
    query: (text: string, params?: unknown[]) => pg.query(text, params as never),
    connect: async () => ({ query: (t: string, p?: unknown[]) => pg.query(t, p as never), release() {} }),
  };
  await seedThread('ana-ri_1_alice0001', ALICE, ORG_A, 'alice: my IND question');
  await seedThread('ana-ri_1_bob000001', BOB, ORG_A, 'bob: our CMC blocker');
  await seedThread('ana-ri_1_carol0001', CAROL, ORG_B, 'carol: tenant-b confidential');
  await seedThread('ana-ri_1_unowned01', null, ORG_A, 'system: unowned thread');
}, T);

afterAll(async () => {
  await pg?.close();
});

describe('getOrCreateThread resolves a supplied id as the caller', () => {
  it("a colleague's thread id is refused, not forked and not read", async () => {
    const { getOrCreateThread, ThreadAccessError } = await import(
      '../../server/services/chat-thread-helpers'
    );
    await expect(getOrCreateThread('ana-ri_1_bob000001', ALICE, 'ana-ri', ORG_A)).rejects.toBeInstanceOf(
      ThreadAccessError,
    );
    await expect(getOrCreateThread('ana-ri_1_bob000001', ALICE, 'ana-ri', ORG_A)).rejects.toMatchObject({
      code: 'THREAD_FORBIDDEN',
    });
    expect(await messagesOf('ana-ri_1_bob000001')).toEqual(['bob: our CMC blocker']);
  }, T);

  it("another tenant's thread id is never resolved — the caller gets a fresh thread", async () => {
    const { getOrCreateThread, saveChatMessage: saveMessage } = await import(
      '../../server/services/chat-thread-helpers'
    );
    const id = await getOrCreateThread('ana-ri_1_carol0001', ALICE, 'ana-ri', ORG_A);
    expect(id).not.toBe('ana-ri_1_carol0001');
    expect(id.startsWith('ana-ri_')).toBe(true);
    // The fresh thread is the caller's, in the caller's organization …
    const row = await pg.query<{ user_id: number; organization_id: number }>(
      `SELECT user_id, organization_id FROM chat_threads WHERE id = $1`,
      [id],
    );
    expect(row.rows[0]).toEqual({ user_id: ALICE, organization_id: ORG_A });
    // … and a message the route then saves lands there, never in tenant B.
    await saveMessage(id, 'user', 'alice: follow-up');
    expect(await messagesOf(id)).toEqual(['alice: follow-up']);
    expect(await messagesOf('ana-ri_1_carol0001')).toEqual(['carol: tenant-b confidential']);
  }, T);

  it("the caller's own thread id resolves to itself", async () => {
    const { getOrCreateThread } = await import('../../server/services/chat-thread-helpers');
    expect(await getOrCreateThread('ana-ri_1_alice0001', ALICE, 'ana-ri', ORG_A)).toBe(
      'ana-ri_1_alice0001',
    );
  }, T);

  it('a thread with no recorded owner is scoped by organization alone', async () => {
    const { getOrCreateThread } = await import('../../server/services/chat-thread-helpers');
    expect(await getOrCreateThread('ana-ri_1_unowned01', BOB, 'ana-ri', ORG_A)).toBe(
      'ana-ri_1_unowned01',
    );
    const fromB = await getOrCreateThread('ana-ri_1_unowned01', CAROL, 'ana-ri', ORG_B);
    expect(fromB).not.toBe('ana-ri_1_unowned01');
  }, T);

  it('an unknown id mints a fresh thread, as it always did', async () => {
    const { getOrCreateThread } = await import('../../server/services/chat-thread-helpers');
    const id = await getOrCreateThread('ana-ri_9_doesnotexist', ALICE, 'ana-ri', ORG_A);
    expect(id).not.toBe('ana-ri_9_doesnotexist');
  }, T);

  it('with no organization to scope by, a supplied id is never honoured', async () => {
    const { getOrCreateThread } = await import('../../server/services/chat-thread-helpers');
    const id = await getOrCreateThread('ana-ri_1_alice0001', ALICE, 'ana-ri', null);
    expect(id).not.toBe('ana-ri_1_alice0001');
  }, T);

  it("an unidentified caller does not get an owned thread", async () => {
    const { getOrCreateThread, ThreadAccessError } = await import(
      '../../server/services/chat-thread-helpers'
    );
    await expect(
      getOrCreateThread('ana-ri_1_alice0001', undefined, 'ana-ri', ORG_A),
    ).rejects.toBeInstanceOf(ThreadAccessError);
  }, T);
});

describe('resolveAccessibleThread — the history gate the context builder uses', () => {
  it('returns null for a foreign tenant and throws for a colleague', async () => {
    const { resolveAccessibleThread, ThreadAccessError } = await import(
      '../../server/services/chat-thread-helpers'
    );
    expect(await resolveAccessibleThread('ana-ri_1_carol0001', ORG_A, ALICE)).toBeNull();
    await expect(resolveAccessibleThread('ana-ri_1_bob000001', ORG_A, ALICE)).rejects.toBeInstanceOf(
      ThreadAccessError,
    );
    expect((await resolveAccessibleThread('ana-ri_1_alice0001', ORG_A, ALICE))?.id).toBe(
      'ana-ri_1_alice0001',
    );
  }, T);
});

describe('ensureThread cannot adopt someone else’s stable id', () => {
  it("refuses a colleague's id and a foreign tenant's id, creates its own", async () => {
    const { ensureThread, ThreadAccessError } = await import(
      '../../server/services/chat-thread-helpers'
    );
    await expect(ensureThread('ana-ri_1_bob000001', ALICE, ORG_A)).rejects.toBeInstanceOf(
      ThreadAccessError,
    );
    await expect(ensureThread('ana-ri_1_carol0001', ALICE, ORG_A)).rejects.toBeInstanceOf(
      ThreadAccessError,
    );
    expect(await ensureThread('ext_alice_stable', ALICE, ORG_A)).toBe('ext_alice_stable');
    // Re-running for the same owner is idempotent.
    expect(await ensureThread('ext_alice_stable', ALICE, ORG_A)).toBe('ext_alice_stable');
    // The foreign transcripts are exactly as seeded.
    expect(await messagesOf('ana-ri_1_bob000001')).toEqual(['bob: our CMC blocker']);
    expect(await messagesOf('ana-ri_1_carol0001')).toEqual(['carol: tenant-b confidential']);
  }, T);
});

describe("a minted thread is bound only to a program of its own organization (PF-10 S2)", () => {
  const programOf = async (id: string) =>
    (await pg.query<{ program_id: string | null }>(`SELECT program_id FROM chat_threads WHERE id = $1`, [id])).rows[0]?.program_id;

  it("the organization's own program is bound, lower-cased", async () => {
    const { getOrCreateThread } = await import('../../server/services/chat-thread-helpers');
    const id = await getOrCreateThread(null, ALICE, 'ana-ri', ORG_A, P_A.toUpperCase());
    expect(await programOf(id)).toBe(P_A);
  });

  it("another organization's program is never bound: the thread is minted unbound", async () => {
    const { getOrCreateThread } = await import('../../server/services/chat-thread-helpers');
    const id = await getOrCreateThread(null, ALICE, 'ana-ri', ORG_A, P_B);
    expect(await programOf(id)).toBeNull();
    const meta = await pg.query<{ metadata: unknown }>(`SELECT metadata FROM chat_threads WHERE id = $1`, [id]);
    expect(JSON.stringify(meta.rows[0].metadata ?? null)).not.toContain(P_B);
  });

  it('a deleted program of the organization is not bound either', async () => {
    const { getOrCreateThread } = await import('../../server/services/chat-thread-helpers');
    const id = await getOrCreateThread(null, ALICE, 'ana-ri', ORG_A, P_A_DELETED);
    expect(await programOf(id)).toBeNull();
  });

  it("the program list shows the thread under its own program, never under another organization's", async () => {
    const { listThreads } = await import('../../server/routes/chat/threads');
    const list = async (orgId: number, program: string) => {
      const r: { body?: { threads: Array<{ id: string }> } } = {};
      const res = { status: () => res, json: (b: { threads: Array<{ id: string }> }) => { r.body = b; return res; } };
      await listThreads({ query: { program_id: program }, tenantId: orgId } as never, res as never);
      return (r.body?.threads ?? []).map((t) => t.id);
    };
    const { getOrCreateThread } = await import('../../server/services/chat-thread-helpers');
    const ours = await getOrCreateThread(null, ALICE, 'ana-ri', ORG_A, P_A);
    const foreignAttempt = await getOrCreateThread(null, ALICE, 'ana-ri', ORG_A, P_B);
    expect(await list(ORG_A, P_A)).toContain(ours);
    expect(await list(ORG_B, P_B)).not.toContain(foreignAttempt);
    expect(await list(ORG_A, P_B)).not.toContain(foreignAttempt);
  });
});
