/**
 * A link and a completion over the same two tasks queue — they do not deadlock.
 * REAL PostgreSQL: a deadlock only exists between two connections.
 *
 * WHAT WENT WRONG (D5 governed-path README, "Still open")
 * A completion locks the task it completes, then its dependents (the cascade's
 * locking read). A link locked both of its endpoints in task-id order. When the
 * dependent's id sorted first, the two took the same two row locks in opposite
 * orders: the completion held the predecessor and waited for the dependent, the
 * link held the dependent and waited for the predecessor. Postgres broke it
 * after `deadlock_timeout` by aborting one side (40P01) — a user's completion or
 * link answered as a failure for no reason of its own.
 *
 * A link now locks its SOURCE first, then its target — predecessor before
 * successor, the order every completion takes. In a graph without cycles that is
 * one order for both, so the second transaction waits for the first instead.
 *
 * The tables are built in a schema of their own, exactly as the migration set
 * builds them, so the suite runs on any server `test:db` points at.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../../shared/schema';
import unifiedTaskService from '../../server/services/unifiedTaskService';
import { cascadeUnblockOnCompletionOnClient } from '../../server/services/tasking/task-side-effects';
import { extractTableDdl, REPO_ROOT } from '../golden-journeys/harness';

const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || '';
const SCHEMA = `d5_link_lock_${process.pid}_${Date.now().toString(36)}`;
const ORG = 90521;
// The dependent's id sorts BEFORE its predecessor's: the order the old link
// locked in, and the one opposite to the completion's.
const PREDECESSOR = 'TASK-Z-PREDECESSOR';
const DEPENDENT = 'TASK-A-DEPENDENT';

const DDL = [
  extractTableDdl('migrations/0000_sweet_joseph.sql', ['unified_tasks', 'task_dependencies', 'cross_module_task_links']),
  ...[
    'db/migrations/20260727_unified_tasks_mdx_metadata.sql',
    'db/migrations/20260807_task_graph_org_columns.sql',
    'db/migrations/20260807_unified_tasks_soft_delete.sql',
  ].map(f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8')),
].join('\n');

let owner: Client;

async function connect(): Promise<Client> {
  const c = new Client({ connectionString: databaseUrl });
  await c.connect();
  await c.query(`SET search_path TO ${SCHEMA}`);
  return c;
}

/** The SQLSTATE of a failure, whether pg raised it or Drizzle wrapped it. */
function sqlState(err: unknown): string | undefined {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code ?? e?.cause?.code;
}

/** Until `pid` is waiting on a lock — the link has taken what it can and queued. */
async function waitingOnLock(pid: number): Promise<void> {
  for (let i = 0; i < 100; i++) {
    const { rows } = await owner.query(`SELECT wait_event_type FROM pg_stat_activity WHERE pid = $1`, [pid]);
    if (rows[0]?.wait_event_type === 'Lock') return;
    await new Promise(r => setTimeout(r, 50));
  }
  throw new Error('the link never waited on a lock');
}

beforeAll(async () => {
  if (!databaseUrl) throw new Error('[task-link-lock-order] TEST_DATABASE_URL or DATABASE_URL is required');
  owner = new Client({ connectionString: databaseUrl });
  await owner.connect();
  await owner.query(`CREATE SCHEMA ${SCHEMA}`);
  await owner.query(`SET search_path TO ${SCHEMA}`);
  await owner.query(DDL);
});

afterAll(async () => {
  if (!owner) return;
  try {
    await owner.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  } finally {
    await owner.end();
  }
});

beforeEach(async () => {
  await owner.query('TRUNCATE cross_module_task_links, task_dependencies, unified_tasks');
  await owner.query(
    `INSERT INTO unified_tasks (task_id, organization_id, module_type, title, status, priority, blocked_by) VALUES
       ($1, $3, 'IND', 'Predecessor', 'in-progress', 'medium', NULL),
       ($2, $3, 'IND', 'Dependent',   'blocked',     'medium', ARRAY[$1]::text[])`,
    [PREDECESSOR, DEPENDENT, ORG],
  );
});

describe('a link and a completion over the same two tasks', () => {
  it('queue one behind the other — neither is aborted as a deadlock victim', async () => {
    const completing = await connect();
    const linking = await connect();
    try {
      // The completion holds the predecessor's row.
      await completing.query('BEGIN');
      await completing.query(`UPDATE unified_tasks SET status = 'completed' WHERE task_id = $1`, [PREDECESSOR]);

      // The link over the same pair starts, and takes what it can.
      await linking.query('BEGIN');
      const linkPid: number = (await linking.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      const link = unifiedTaskService
        .linkTasks(
          { sourceTaskId: PREDECESSOR, targetTaskId: DEPENDENT, linkType: 'related', isBlocking: false, organizationId: ORG },
          drizzle(linking, { schema }),
        )
        .then(
          async row => { await linking.query('COMMIT'); return { row, error: null as unknown }; },
          async (error: unknown) => { await linking.query('ROLLBACK'); return { row: null, error }; },
        );
      await waitingOnLock(linkPid);

      // The completion's cascade now locks the dependent.
      let completionError: unknown = null;
      try {
        await cascadeUnblockOnCompletionOnClient(ORG, PREDECESSOR, { client: completing, actorUserId: 1 });
        await completing.query('COMMIT');
      } catch (err) {
        completionError = err;
        await completing.query('ROLLBACK');
      }
      const linked = await link;

      // 40P01 is deadlock_detected: Postgres aborted one side to break the cycle.
      expect(sqlState(completionError), 'the completion failed').toBeUndefined();
      expect(completionError, 'the completion failed').toBeNull();
      expect(sqlState(linked.error), 'the link failed').toBeUndefined();
      expect(linked.error, 'the link failed').toBeNull();

      const { rows } = await owner.query(
        `SELECT task_id, status, blocked_by FROM unified_tasks ORDER BY task_id`,
      );
      expect(rows).toEqual([
        { task_id: DEPENDENT, status: 'in-progress', blocked_by: [] },
        { task_id: PREDECESSOR, status: 'completed', blocked_by: null },
      ]);
      const links = await owner.query(`SELECT source_task_id, target_task_id FROM cross_module_task_links`);
      expect(links.rows).toEqual([{ source_task_id: PREDECESSOR, target_task_id: DEPENDENT }]);
    } finally {
      await completing.end();
      await linking.end();
    }
  });
});
