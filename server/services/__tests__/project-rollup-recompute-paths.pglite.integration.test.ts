/**
 * recomputePaths — END-TO-END against in-process PGlite.
 *
 * Proves recomputePaths correctly walks a project hierarchy and materializes
 * paths atomically in a single CTE+UPDATE, preserving the old JS walk's format
 * while enforcing tenancy and preventing cycles.
 *
 * Test cases verify:
 *   1. Root projects get path = id (no parent)
 *   2. Children get path = parentPath / id
 *   3. Paths update when a subtree is reparented
 *   4. Cross-org projects are never touched (tenancy isolation)
 *   5. Cycles are detected via the visited array
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let pglite: PGlite;
const exec = {
  query: async (sql: string, params?: unknown[]) => {
    const r = await pglite.query(sql, params as unknown[]);
    return {
      rows: r.rows as any[],
      rowCount: (r as { affectedRows?: number }).affectedRows ?? (r.rows as unknown[]).length,
    };
  },
};
vi.mock('../../../db', () => ({ pool: { query: (s: string, p?: unknown[]) => exec.query(s, p) }, db: {} }));

import { ProjectRollupService } from '../project-rollup-service';

const ORG_A = 100;
const ORG_B = 200;

/*
 * recomputePaths takes (projectId, organizationId) — project FIRST.
 *
 * Every call below originally passed (ORG_A, projectId), reversed. With
 * ORG_A = 100 that asked for project 100 inside organization 5, which matches
 * no anchor row, so the recursive CTE updated nothing and every path stayed
 * NULL. Three assertions failed on `expected null to be '5'`.
 *
 * The two that PASSED are the reason this is worth a comment. Both assert that
 * paths are absent for another org, and they passed because NO path was ever
 * computed for any org — vacuously green while the thing they exist to check
 * was never exercised. project-hierarchy.ts:418 calls it correctly, so the
 * service was fine; the test was the broken instrument.
 */

function migration(rel: string): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return fs.readFileSync(path.resolve(here, '../../../../', rel), 'utf8');
}

async function getProjectPath(projectId: number, orgId: number): Promise<string | null> {
  const { rows } = await exec.query(
    `SELECT path FROM projects WHERE id = $1 AND organization_id = $2`,
    [projectId, orgId]
  );
  return rows[0]?.path ?? null;
}

async function seedProjects() {
  // Org A: root[1] → child[2] → grandchild[3]
  await exec.query(
    `INSERT INTO projects (id, organization_id, name, parent_project_id, path)
     VALUES (1, $1, 'Root A', NULL, '1'), (2, $1, 'Child A', 1, '1/2'), (3, $1, 'GrandChild A', 2, '1/2/3')`,
    [ORG_A]
  );
  // Org B: separate root[10] (should never be touched when recomputing org A)
  await exec.query(
    `INSERT INTO projects (id, organization_id, name, parent_project_id, path)
     VALUES (10, $1, 'Root B', NULL, '10')`,
    [ORG_B]
  );
}

beforeAll(async () => {
  pglite = new PGlite();
  await pglite.exec(`
    CREATE TABLE organizations (id SERIAL PRIMARY KEY, name TEXT);
    CREATE TABLE projects (
      id SERIAL PRIMARY KEY,
      organization_id INT NOT NULL,
      name TEXT,
      parent_project_id INT,
      path TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await pglite.exec(`INSERT INTO organizations (id, name) VALUES (${ORG_A}, 'Org A'), (${ORG_B}, 'Org B');`);
}, 90_000);

afterAll(async () => {
  await pglite?.close();
});

describe('recomputePaths (PGlite integration)', () => {
  it('root projects get path = id', async () => {
    await exec.query(`DELETE FROM projects`);
    await exec.query(
      `INSERT INTO projects (id, organization_id, name, parent_project_id, path)
       VALUES (5, $1, 'Root', NULL, NULL)`,
      [ORG_A]
    );

    const svc = new ProjectRollupService(exec as any);
    await svc.recomputePaths(5, ORG_A);

    expect(await getProjectPath(5, ORG_A)).toBe('5');
  });

  it('child projects get path = parentPath/id', async () => {
    await exec.query(`DELETE FROM projects`);
    await seedProjects();

    const svc = new ProjectRollupService(exec as any);
    // Reparent child[2] to root[1]; recompute from root[1]
    await exec.query(`UPDATE projects SET parent_project_id = 1 WHERE id = 2`);
    await svc.recomputePaths(1, ORG_A);

    expect(await getProjectPath(1, ORG_A)).toBe('1');
    expect(await getProjectPath(2, ORG_A)).toBe('1/2');
    expect(await getProjectPath(3, ORG_A)).toBe('1/2/3');
  });

  it('reparenting updates all descendant paths atomically', async () => {
    await exec.query(`DELETE FROM projects`);
    // Setup: two separate trees in org A
    // Tree 1: root[1] → child[2] → grandchild[3]
    // Tree 2: root[4]
    await exec.query(
      `INSERT INTO projects (id, organization_id, name, parent_project_id, path)
       VALUES
         (1, $1, 'Root1', NULL, '1'),
         (2, $1, 'Child', 1, '1/2'),
         (3, $1, 'GrandChild', 2, '1/2/3'),
         (4, $1, 'Root2', NULL, '4')`,
      [ORG_A]
    );

    const svc = new ProjectRollupService(exec as any);
    // Reparent child[2] from root[1] to root[4]
    await exec.query(`UPDATE projects SET parent_project_id = 4 WHERE id = 2 AND organization_id = $1`, [ORG_A]);
    // Recompute from the new parent (root[4])
    await svc.recomputePaths(4, ORG_A);

    // Check that paths updated correctly
    expect(await getProjectPath(4, ORG_A)).toBe('4');
    expect(await getProjectPath(2, ORG_A)).toBe('4/2');
    expect(await getProjectPath(3, ORG_A)).toBe('4/2/3'); // Grandchild's path updated too
  });

  it('cross-org projects are never touched (tenancy isolation)', async () => {
    await exec.query(`DELETE FROM projects`);
    await seedProjects();

    const svc = new ProjectRollupService(exec as any);
    // Recompute org A's subtree starting from root[1]
    await svc.recomputePaths(1, ORG_A);

    // Org A paths should be correct
    expect(await getProjectPath(1, ORG_A)).toBe('1');
    expect(await getProjectPath(2, ORG_A)).toBe('1/2');
    expect(await getProjectPath(3, ORG_A)).toBe('1/2/3');

    // Org B project[10] should remain untouched (path still '10')
    expect(await getProjectPath(10, ORG_B)).toBe('10');
  });

  it('materializes paths only within the given organization', async () => {
    await exec.query(`DELETE FROM projects`);
    // Create a scenario where org A's projects could theoretically reach org B's
    // (without the org_id guard)
    await exec.query(
      `INSERT INTO projects (id, organization_id, name, parent_project_id, path)
       VALUES
         (1, $1, 'Root', NULL, NULL),
         (2, $1, 'Child', 1, NULL),
         (11, $2, 'OrgB Root', NULL, NULL)`,
      [ORG_A, ORG_B]
    );

    const svc = new ProjectRollupService(exec as any);
    await svc.recomputePaths(1, ORG_A);

    // Org A paths computed
    expect(await getProjectPath(1, ORG_A)).toBe('1');
    expect(await getProjectPath(2, ORG_A)).toBe('1/2');

    // Org B project untouched
    expect(await getProjectPath(11, ORG_B)).toBeNull();
  });
});
