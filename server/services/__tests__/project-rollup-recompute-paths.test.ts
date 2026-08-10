/**
 * recomputePaths — the materialized-path rewrite.
 *
 * This used to be a JavaScript walk issuing three statements per node and
 * recursing serially, with nothing wrapping the traversal, so a failure
 * part-way through left `path` half-rewritten. Every ancestor/descendant lookup
 * in this service is a LIKE prefix scan over that column, so a partial rewrite
 * silently returns wrong subtrees.
 *
 * These assertions are about the SQL rather than a live tree, because the two
 * properties that matter cannot regress silently anywhere else: the org
 * predicate must appear on every branch of the recursion (a cross-org child
 * must be unreachable AND unwritable), and the generated path format must stay
 * byte-identical to what the old walk produced or existing rows stop matching
 * those prefix scans.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProjectRollupService } from '../project-rollup-service';

const query = vi.fn();
const fakePool = { query: (...a: unknown[]) => query(...a) };

beforeEach(() => {
  query.mockReset();
  query.mockResolvedValue({ rows: [] });
});

/** The single statement recomputePaths now issues. */
async function runAndCaptureSql(): Promise<{ sql: string; params: unknown[] }> {
  const svc = new ProjectRollupService(fakePool as never);
  await svc.recomputePaths(12, 7);
  expect(query).toHaveBeenCalledTimes(1);
  const [sql, params] = query.mock.calls[0] as [string, unknown[]];
  return { sql, params };
}

describe('recomputePaths', () => {
  it('rewrites the whole subtree in ONE statement', async () => {
    const { sql, params } = await runAndCaptureSql();
    // One statement is atomic on its own, which is what replaces the missing
    // transaction: either the subtree moves or none of it does.
    expect(sql).toContain('WITH RECURSIVE');
    expect(sql).toContain('UPDATE projects');
    expect(params).toEqual([12, 7]);
  });

  it('carries the organization predicate on EVERY branch', async () => {
    const { sql } = await runAndCaptureSql();
    // Anchor row, parent-path lookup, recursive child join and the UPDATE.
    // A cross-org child must be neither reachable through the recursion nor
    // writable through the final UPDATE.
    const orgPredicates = sql.match(/organization_id = \$2/g) ?? [];
    expect(orgPredicates.length).toBeGreaterThanOrEqual(4);

    // The recursive arm specifically — the branch that walks into children — is
    // the one where a missing predicate would leak another tenant's rows in.
    const recursiveArm = sql.slice(sql.indexOf('UNION ALL'));
    expect(recursiveArm).toContain('organization_id = $2');
  });

  it('preserves the path format the old walk produced', async () => {
    const { sql } = await runAndCaptureSql();
    // A root project's path is its own id...
    expect(sql).toContain('parent_project_id IS NULL THEN p.id::text');
    // ...every other path is <parentPath>/<id>...
    expect(sql).toContain("|| '/' ||");
    // ...and an unmaterialized parent path falls back to the bare parent id.
    // NULLIF reproduces the old JS `||`, which treated '' as falsy alongside
    // null; without it a parent with an empty path would produce '/123'.
    expect(sql).toContain('NULLIF');
    expect(sql).toContain('COALESCE');
    expect(sql).toContain('p.parent_project_id::text');
  });

  it('guards against a parent_project_id cycle', async () => {
    const { sql } = await runAndCaptureSql();
    // validateMove is meant to reject cycles. One that slipped through used to
    // blow the JS stack — loud and immediate. Inside a recursive CTE it would
    // instead spin forever holding a pool connection, so the walk refuses to
    // re-enter a node it has already emitted.
    expect(sql).toContain('visited');
    expect(sql).toContain('NOT c.id = ANY(s.visited)');
  });

  it('no longer recurses in JavaScript', async () => {
    const svc = new ProjectRollupService(fakePool as never);
    // The old implementation issued a parent lookup, an UPDATE and a children
    // query per node. Anything above one statement means the walk came back.
    await svc.recomputePaths(12, 7);
    expect(query).toHaveBeenCalledTimes(1);
  });
});
