/**
 * beginRun's one transaction (AnA detach §2.8, D-3), on a real Postgres engine
 * (PGlite): the thread the client named is verified before it is stamped, a
 * conversation holds one live run, and a person holds at most three.
 *
 *   - a colleague's thread is refused before any row is written; another
 *     organisation's resolves to nothing (its existence is not confirmed);
 *   - a second run on a conversation with a live run is refused
 *     RUN_IN_PROGRESS, naming the live run; a stale one is failed instead;
 *   - a fourth live run for one person is refused RUN_LIMIT; a stale row does
 *     not count;
 *   - neither refusal writes a row;
 *   - a new conversation's run is stamped with the minted thread and the
 *     question once they exist (stampRunThread), under the same rule.
 *
 * Racing posts on separate connections need a real server:
 * run-events-rls.dbtest.ts.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  beginRun,
  endRun,
  stampRunThread,
  RunRefusedError,
  MAX_LIVE_RUNS_PER_PERSON,
  _resetLocalRunsForTest,
} from '../run-control';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const ANA_RUNS = fs.readFileSync(path.join(ROOT, 'db/migrations/20260917_ana_runs.sql'), 'utf8');

const ORG = 1;
const OTHER_ORG = 2;
const ME = 10;
const COLLEAGUE = 11;

let db: PGlite;

async function q(text: string, params?: unknown[]) {
  const r = await db.query(text, params as any[]);
  return { rows: r.rows as any[], rowCount: (r as any).affectedRows ?? r.rows.length };
}
function pool(): any {
  return {
    query: q,
    connect: async () => ({
      query: q,
      release: () => undefined,
      on: () => {
        throw new Error('PGlite has no notifications');
      },
    }),
  };
}

const open = (over: { userId?: number | null; threadId?: string | null; org?: number } = {}) =>
  beginRun({
    pool: pool(),
    organizationId: over.org ?? ORG,
    userId: over.userId === undefined ? ME : over.userId,
    threadId: over.threadId ?? null,
    surface: 'ana-ri-stream',
  });
const count = async () => Number((await db.query<{ n: number }>('SELECT count(*)::int AS n FROM ana_runs')).rows[0].n);
const rowOf = async (id: string) => (await db.query<any>('SELECT * FROM ana_runs WHERE id = $1', [id])).rows[0];
const refusal = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e as RunRefusedError;
  }
  throw new Error('expected a refusal');
};

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE TABLE organizations (id integer PRIMARY KEY);
    CREATE TABLE users (id integer PRIMARY KEY);
    CREATE TABLE chat_threads (id text PRIMARY KEY, user_id integer, organization_id integer, title text);
    INSERT INTO organizations VALUES (${ORG}), (${OTHER_ORG});
    INSERT INTO users VALUES (${ME}), (${COLLEAGUE});
    INSERT INTO chat_threads (id, user_id, organization_id) VALUES
      ('mine', ${ME}, ${ORG}),
      ('unowned', NULL, ${ORG}),
      ('colleagues', ${COLLEAGUE}, ${ORG}),
      ('elsewhere', ${ME}, ${OTHER_ORG});
  `);
  await db.exec(ANA_RUNS);
});
afterAll(async () => {
  await db?.close();
});
beforeEach(async () => {
  _resetLocalRunsForTest();
  await db.exec('DELETE FROM ana_runs');
});

describe('the thread the client named is verified before it is stamped', () => {
  it("a colleague's conversation is refused before any row is written", async () => {
    const e = await refusal(open({ threadId: 'colleagues' }));
    expect(e).toBeInstanceOf(RunRefusedError);
    expect(e.code).toBe('THREAD_FORBIDDEN');
    expect(await count()).toBe(0);
  });

  it("another organisation's conversation resolves to nothing: the run carries no thread", async () => {
    const { runId } = await open({ threadId: 'elsewhere' });
    expect((await rowOf(runId)).thread_id).toBeNull();
  });

  it('an unknown id resolves to nothing too (getOrCreateThread will mint one)', async () => {
    const { runId } = await open({ threadId: 'no-such-thread' });
    expect((await rowOf(runId)).thread_id).toBeNull();
  });

  it("the caller's own conversation, and one with no owner, are stamped as verified", async () => {
    const a = await open({ threadId: 'mine' });
    expect((await rowOf(a.runId)).thread_id).toBe('mine');
    const b = await open({ threadId: 'unowned' });
    expect((await rowOf(b.runId)).thread_id).toBe('unowned');
  });
});

describe('one live run per conversation', () => {
  it('a second run on a conversation with a live run is refused, naming that run, and writes nothing', async () => {
    const first = await open({ threadId: 'mine' });
    const e = await refusal(open({ threadId: 'mine' }));
    expect(e.code).toBe('RUN_IN_PROGRESS');
    expect(e.runId).toBe(first.runId);
    expect(await count()).toBe(1);
  });

  it('once the run ends, the conversation takes the next', async () => {
    const first = await open({ threadId: 'mine' });
    await endRun(pool(), first.runId, 'finished', 'no_more_tools');
    await expect(open({ threadId: 'mine' })).resolves.toMatchObject({ runId: expect.any(String) });
  });

  it("a dead process's stale run does not hold the conversation: it is failed as orphaned", async () => {
    const stale = await open({ threadId: 'mine' });
    await db.query(`UPDATE ana_runs SET heartbeat_at = now() - interval '1 hour' WHERE id = $1`, [stale.runId]);
    await open({ threadId: 'mine' });
    expect(await rowOf(stale.runId)).toMatchObject({ status: 'failed', stopped_reason: 'orphaned' });
  });
});

describe('at most three live runs per person', () => {
  it('the fourth is refused RUN_LIMIT and writes nothing', async () => {
    for (let i = 0; i < MAX_LIVE_RUNS_PER_PERSON; i++) await open();
    const e = await refusal(open());
    expect(e.code).toBe('RUN_LIMIT');
    expect(await count()).toBe(MAX_LIVE_RUNS_PER_PERSON);
  });

  it('a run that ended, or a stale one, does not count', async () => {
    const a = await open();
    const b = await open();
    await open();
    await endRun(pool(), a.runId, 'finished', 'no_more_tools');
    await db.query(`UPDATE ana_runs SET heartbeat_at = now() - interval '1 hour' WHERE id = $1`, [b.runId]);
    await expect(open()).resolves.toBeDefined();
    await expect(open()).resolves.toBeDefined();
  });

  it('is per person and per organisation; a run with no person has no cap', async () => {
    for (let i = 0; i < MAX_LIVE_RUNS_PER_PERSON; i++) await open();
    await expect(open({ userId: COLLEAGUE })).resolves.toBeDefined();
    await expect(open({ org: OTHER_ORG })).resolves.toBeDefined();
    for (let i = 0; i < MAX_LIVE_RUNS_PER_PERSON + 1; i++) await open({ userId: null });
  });
});

describe('a new conversation is written onto its run once it exists', () => {
  it('stamps the minted thread and the question', async () => {
    const { runId } = await open();
    await db.exec(`INSERT INTO chat_threads (id, user_id, organization_id) VALUES ('minted', ${ME}, ${ORG})`);
    expect(await stampRunThread(pool(), { runId, organizationId: ORG, threadId: 'minted', userMessageId: 42 })).toBe(true);
    expect(await rowOf(runId)).toMatchObject({ thread_id: 'minted', user_message_id: 42 });
  });

  it('writes the question onto a run that already carries its verified thread', async () => {
    const { runId } = await open({ threadId: 'mine' });
    expect(await stampRunThread(pool(), { runId, organizationId: ORG, threadId: 'mine', userMessageId: 7 })).toBe(true);
    expect(await rowOf(runId)).toMatchObject({ thread_id: 'mine', user_message_id: 7 });
  });

  it('never moves a run onto a conversation another live run holds, nor across organisations', async () => {
    await open({ threadId: 'mine' });
    const { runId } = await open();
    expect(await stampRunThread(pool(), { runId, organizationId: ORG, threadId: 'mine', userMessageId: 1 })).toBe(false);
    expect(await stampRunThread(pool(), { runId, organizationId: OTHER_ORG, threadId: 'x', userMessageId: 1 })).toBe(false);
    expect((await rowOf(runId)).thread_id).toBeNull();
  });
});
