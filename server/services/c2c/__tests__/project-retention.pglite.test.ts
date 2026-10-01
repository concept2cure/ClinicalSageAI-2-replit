/**
 * projectDeletionHolds / projectDeletionRefusal — what a hard delete of
 * projects rows would destroy (PF-08, PF-13).
 *
 * The routes that hard-delete projects (DELETE /api/projects/:id,
 * DELETE /api/device-projects/:id, DELETE /api/clients/:id) ask this first.
 * Which rows the delete would take, and which of their artifacts would cascade,
 * is decided by the database, so this drives it on real SQL:
 *   - an anchor row, and a deleted program's anchor;
 *   - a drafts-only project, one with approved and locked work, one in review;
 *   - a draft that kept its signature, and one that kept its lock snapshot;
 *   - workspaces of each.
 * The locks it takes need two connections, so they are proven on real
 * PostgreSQL in project-retention-locks.dbtest.ts.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { projectDeletionHolds, projectDeletionRefusal } from '../project-retention';

const PROGRAM = '11111111-1111-4111-8111-111111111111';
const DELETED_PROGRAM = '22222222-2222-4222-8222-222222222222';

let pg: PGlite;
const q = {
  query: async (sql: string, params?: unknown[]) => ({ rows: (await pg.query(sql, params as unknown[])).rows as any[] }),
};

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`
    CREATE TABLE client_workspaces (id integer PRIMARY KEY);
    CREATE TABLE regulatory_programs (id uuid PRIMARY KEY, organization_id integer NOT NULL, deleted_at timestamp);
    CREATE TABLE projects (
      id serial PRIMARY KEY, organization_id integer NOT NULL,
      client_workspace_id integer NOT NULL REFERENCES client_workspaces(id), regulatory_program_id uuid
    );
    CREATE TABLE concept2cure_artifacts (
      id serial PRIMARY KEY,
      project_id integer NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      status text NOT NULL DEFAULT 'draft'
    );
    CREATE TABLE concept2cure_signatures (id serial PRIMARY KEY, artifact_id integer NOT NULL);
    CREATE TABLE concept2cure_submission_snapshots (id serial PRIMARY KEY, artifact_id integer NOT NULL);
    INSERT INTO client_workspaces VALUES (10), (20), (30), (40);
    INSERT INTO regulatory_programs VALUES ('${PROGRAM}', 1, NULL), ('${DELETED_PROGRAM}', 1, now());
    -- Workspace 10: the program's anchor (1), a drafts-only project (2), a project with approved + locked work (3).
    -- Workspace 20: a drafts-only project (4). Workspace 30: a project in review (5).
    -- Workspace 40: a deleted program's anchor holding drafts only (6); a draft that was signed (7); a draft with a lock snapshot (8).
    INSERT INTO projects (id, organization_id, client_workspace_id, regulatory_program_id) VALUES
      (1, 1, 10, '${PROGRAM}'), (2, 1, 10, NULL), (3, 1, 10, NULL), (4, 1, 20, NULL), (5, 1, 30, NULL),
      (6, 1, 40, '${DELETED_PROGRAM}'), (7, 1, 40, NULL), (8, 1, 40, NULL);
    INSERT INTO concept2cure_artifacts (id, project_id, status) VALUES
      (101, 1, 'approved'), (102, 2, 'draft'), (103, 2, 'draft'), (104, 3, 'approved'), (105, 3, 'locked'), (106, 3, 'draft'),
      (107, 4, 'draft'), (108, 5, 'review'), (109, 6, 'draft'), (110, 7, 'draft'), (111, 8, 'draft');
    -- 110 was approved, signed, locked and taken back to draft: its signature stays. 111 keeps its lock snapshot.
    INSERT INTO concept2cure_signatures (artifact_id) VALUES (110);
    INSERT INTO concept2cure_submission_snapshots (artifact_id) VALUES (111);
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

  it("a deleted program's anchor is an ordinary project: drafts only, nothing held", async () => {
    expect(await projectDeletionHolds(q, { projectIds: [6] })).toEqual({ anchoredPrograms: [], governedArtifacts: 0 });
  });

  it('a draft that carries a signature, or a lock snapshot, is a record', async () => {
    expect(await projectDeletionHolds(q, { projectIds: [7] })).toEqual({ anchoredPrograms: [], governedArtifacts: 1 });
    expect(await projectDeletionHolds(q, { projectIds: [8] })).toEqual({ anchoredPrograms: [], governedArtifacts: 1 });
    expect(await projectDeletionHolds(q, { workspaceId: 40 })).toEqual({ anchoredPrograms: [], governedArtifacts: 2 });
  });
  // The locks the read takes are proven with two connections on real PostgreSQL:
  // project-retention-locks.dbtest.ts.
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
      message: 'This workspace holds 2 document(s) that are records (in review, approved, locked, or signed), and deleting it would delete them. Archive it instead. Nothing was deleted.',
      holds: { governedArtifacts: 2 },
    });
  });

  it('drafts only: no refusal', () => {
    expect(projectDeletionRefusal({ anchoredPrograms: [], governedArtifacts: 0 }, 'project')).toBeNull();
  });
});
