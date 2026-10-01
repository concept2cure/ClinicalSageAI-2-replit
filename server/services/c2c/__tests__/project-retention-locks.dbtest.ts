/**
 * projectDeletionHolds locks what it judges (PF-08), on real PostgreSQL.
 *
 * The delete routes read what a hard delete would destroy, then delete, in one
 * transaction. If the read does not lock, a concurrent writer can change the
 * answer between the two:
 *   - approve a draft document, which the cascade then removes;
 *   - add a project, possibly a program's anchor row, to the workspace about
 *     to be deleted, which the workspace delete then removes unjudged.
 * Both were reproduced on PostgreSQL 16 against the first version of the read,
 * which locked the projects rows only. Locks need two connections, which PGlite
 * cannot give, so this runs on a real server (npm run test:db). Each case has a
 * negative control: with no read held, the same concurrent write goes through.
 * That shows the case can fail.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Pool, type PoolClient } from 'pg';
import { randomBytes } from 'node:crypto';
import { databaseUrl } from '../../../../tests/setup.db';
import { projectDeletionHolds } from '../project-retention';

let admin: Pool;
let pool: Pool;
let dbName: string;

const DDL = `
  CREATE TABLE client_workspaces (id integer PRIMARY KEY, organization_id integer NOT NULL);
  CREATE TABLE regulatory_programs (id uuid PRIMARY KEY, organization_id integer NOT NULL, deleted_at timestamp);
  CREATE TABLE projects (
    id integer PRIMARY KEY, organization_id integer NOT NULL,
    client_workspace_id integer NOT NULL REFERENCES client_workspaces(id),
    regulatory_program_id uuid REFERENCES regulatory_programs(id)
  );
  CREATE TABLE concept2cure_artifacts (
    id integer PRIMARY KEY,
    project_id integer NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    status text NOT NULL DEFAULT 'draft'
  );
  CREATE TABLE concept2cure_signatures (id serial PRIMARY KEY, artifact_id integer NOT NULL);
  CREATE TABLE concept2cure_submission_snapshots (id serial PRIMARY KEY, artifact_id integer NOT NULL);
`;

beforeAll(async () => {
  admin = new Pool({ connectionString: databaseUrl, max: 2 });
  dbName = `pf08_locks_${randomBytes(4).toString('hex')}`;
  await admin.query(`CREATE DATABASE "${dbName}"`);
  const url = new URL(databaseUrl);
  url.pathname = `/${dbName}`;
  pool = new Pool({ connectionString: url.toString(), max: 4 });
  await pool.query(DDL);
});
afterAll(async () => {
  await pool?.end();
  if (admin && dbName) {
    for (let i = 0; i < 100; i++) {
      const { rows } = await admin.query('SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = $1', [dbName]);
      if (rows[0].n === 0) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    await admin.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
    await admin.end();
  }
});
beforeEach(async () => {
  await pool.query(`
    TRUNCATE concept2cure_signatures, concept2cure_submission_snapshots, concept2cure_artifacts, projects, regulatory_programs, client_workspaces;
    INSERT INTO client_workspaces VALUES (10, 1);
    INSERT INTO projects VALUES (1, 1, 10, NULL);
    INSERT INTO concept2cure_artifacts VALUES (100, 1, 'draft');
  `);
});

/** Run `write` on a second connection that waits at most 300 ms for a lock. 'blocked' means it waited and gave up. */
async function concurrently(write: (c: PoolClient) => Promise<unknown>): Promise<'went-through' | 'blocked'> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query(`SET LOCAL lock_timeout = '300ms'`);
    await write(c);
    await c.query('ROLLBACK');
    return 'went-through';
  } catch (err) {
    await c.query('ROLLBACK').catch(() => undefined);
    if ((err as { code?: string }).code === '55P03') return 'blocked';
    throw err;
  } finally {
    c.release();
  }
}

/** Hold a transaction open on its own connection, having run `inside`, while `then` runs. */
async function holding(inside: (c: PoolClient) => Promise<unknown>, then: () => Promise<unknown>) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await inside(c);
    return await then();
  } finally {
    await c.query('ROLLBACK').catch(() => undefined);
    c.release();
  }
}

const approve = (c: PoolClient) => c.query(`UPDATE concept2cure_artifacts SET status = 'approved' WHERE id = 100`);
const joinWorkspace = (c: PoolClient) => c.query(`INSERT INTO projects VALUES (2, 1, 10, NULL)`);

describe('projectDeletionHolds holds what it judged until the delete commits', () => {
  it('an artifact of a project being judged cannot be approved underneath the delete', async () => {
    const r = await holding((c) => projectDeletionHolds(c, { projectIds: [1] }), () => concurrently(approve));
    expect(r).toBe('blocked');
  });

  it('control: with no read held, the same approval goes through', async () => {
    const r = await holding((c) => c.query('SELECT 1'), () => concurrently(approve));
    expect(r).toBe('went-through');
  });

  it('no project can join a workspace being judged', async () => {
    const r = await holding((c) => projectDeletionHolds(c, { workspaceId: 10 }), () => concurrently(joinWorkspace));
    expect(r).toBe('blocked');
  });

  it('control: with no read held, a project joins the workspace', async () => {
    const r = await holding((c) => c.query('SELECT 1'), () => concurrently(joinWorkspace));
    expect(r).toBe('went-through');
  });

  it('a workspace being judged also holds its existing artifacts', async () => {
    const r = await holding((c) => projectDeletionHolds(c, { workspaceId: 10 }), () => concurrently(approve));
    expect(r).toBe('blocked');
  });
});
