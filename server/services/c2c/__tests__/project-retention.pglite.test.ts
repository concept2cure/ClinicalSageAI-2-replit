/**
 * projectDeletionHolds / projectDeletionRefusal — what a hard delete of
 * projects rows would destroy (PF-08, PF-13).
 *
 * The routes that hard-delete projects (DELETE /api/projects/:id, DELETE
 * /api/clients/:id) ask this first; which rows the delete would take, and which
 * of their artifacts would cascade, is decided by the database. So this drives
 * it on real SQL: an anchor row, an unanchored project holding only drafts, one
 * holding approved and locked work, a project in review, and two workspaces.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { projectDeletionHolds, projectDeletionRefusal } from '../project-retention';

const PROGRAM = '11111111-1111-4111-8111-111111111111';

let pg: PGlite;
const q = {
  query: async (sql: string, params?: unknown[]) => ({ rows: (await pg.query(sql, params as unknown[])).rows as any[] }),
};

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`
    CREATE TABLE projects (
      id serial PRIMARY KEY, organization_id integer NOT NULL,
      client_workspace_id integer NOT NULL, regulatory_program_id uuid
    );
    CREATE TABLE concept2cure_artifacts (
      id serial PRIMARY KEY,
      project_id integer NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      status text NOT NULL DEFAULT 'draft'
    );
    -- Workspace 10: the program's anchor (1), a drafts-only project (2), a project with approved + locked work (3).
    -- Workspace 20: a drafts-only project (4). Workspace 30: a project in review (5).
    INSERT INTO projects (id, organization_id, client_workspace_id, regulatory_program_id) VALUES
      (1, 1, 10, '${PROGRAM}'), (2, 1, 10, NULL), (3, 1, 10, NULL), (4, 1, 20, NULL), (5, 1, 30, NULL);
    INSERT INTO concept2cure_artifacts (project_id, status) VALUES
      (1, 'approved'), (2, 'draft'), (2, 'draft'), (3, 'approved'), (3, 'locked'), (3, 'draft'), (4, 'draft'), (5, 'review');
  `);
});
afterAll(async () => {
  await pg.close();
});

describe('projectDeletionHolds', () => {
  it('an anchor row names its program', async () => {
    expect(await projectDeletionHolds(q, { projectIds: [1] })).toEqual({ anchoredPrograms: [PROGRAM], governedArtifacts: 1 });
  });

  it('a project holding only drafts holds nothing', async () => {
    expect(await projectDeletionHolds(q, { projectIds: [2] })).toEqual({ anchoredPrograms: [], governedArtifacts: 0 });
  });

  it('approved and locked artifacts are counted; drafts are not', async () => {
    expect(await projectDeletionHolds(q, { projectIds: [3] })).toEqual({ anchoredPrograms: [], governedArtifacts: 2 });
  });

  it('an artifact in review is not a draft', async () => {
    expect(await projectDeletionHolds(q, { projectIds: [5] })).toEqual({ anchoredPrograms: [], governedArtifacts: 1 });
  });

  it('a workspace answers for every project the delete would take', async () => {
    expect(await projectDeletionHolds(q, { workspaceId: 10 })).toEqual({ anchoredPrograms: [PROGRAM], governedArtifacts: 3 });
    expect(await projectDeletionHolds(q, { workspaceId: 20 })).toEqual({ anchoredPrograms: [], governedArtifacts: 0 });
  });

  it('a project or workspace that does not exist holds nothing', async () => {
    expect(await projectDeletionHolds(q, { projectIds: [999] })).toEqual({ anchoredPrograms: [], governedArtifacts: 0 });
    expect(await projectDeletionHolds(q, { workspaceId: 999 })).toEqual({ anchoredPrograms: [], governedArtifacts: 0 });
  });

  it('runs inside the deleting transaction and locks the rows it names', async () => {
    await pg.exec('BEGIN');
    try {
      await projectDeletionHolds(q, { projectIds: [2] });
      const { rows } = await pg.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM pg_locks l JOIN pg_class c ON c.oid = l.relation
          WHERE c.relname = 'projects' AND l.mode = 'RowShareLock' AND l.pid = pg_backend_pid()`,
      );
      expect(rows[0].n).toBeGreaterThan(0);
    } finally {
      await pg.exec('ROLLBACK');
    }
  });
});

describe('projectDeletionRefusal', () => {
  it('an anchor row is refused first, naming the program, even with governed work too', () => {
    const r = projectDeletionRefusal({ anchoredPrograms: [PROGRAM], governedArtifacts: 4 }, 'project');
    expect(r?.status).toBe(409);
    expect(r?.body.error).toBe('PROJECT_IS_PROGRAM_ANCHOR');
    expect(r?.body.programIds).toEqual([PROGRAM]);
    expect(r?.body.message).toMatch(/Nothing was deleted\.$/);
  });

  it('governed work is refused with its count, and the remedy is archive', () => {
    const r = projectDeletionRefusal({ anchoredPrograms: [], governedArtifacts: 2 }, 'workspace');
    expect(r?.body).toEqual({
      error: 'PROJECT_HOLDS_RECORDS',
      message: 'This workspace holds 2 document(s) in review, approved or locked, and deleting it would delete them. Archive it instead. Nothing was deleted.',
      holds: { governedArtifacts: 2 },
    });
  });

  it('drafts only: no refusal', () => {
    expect(projectDeletionRefusal({ anchoredPrograms: [], governedArtifacts: 0 }, 'project')).toBeNull();
  });
});
