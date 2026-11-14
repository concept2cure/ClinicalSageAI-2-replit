/**
 * "The projects you can open" leaves out a project deleted in Projects (routed by the coordinating session,
 * 2026-11-12; the same class as S12 sweep finding 89. Re-checked in the running app:
 * docs/evidence/F1/2026-11-12-reporting-deleted-projects-at-risk/).
 *
 * Deleting a project in Projects sets `regulatory_programs.deleted_at` and leaves its anchor `projects` row as it
 * was (routes/c2c/projects.ts closeOut). `getAccessibleReportProjectIds` read every projects row the sharing policy
 * admits, with no state. So the "at risk" read (routes/sentinel-routes.ts), whose answer is headed "for the projects
 * you can open", still listed "Project … is 3 days overdue" for a project nobody can open any more.
 *
 * Two meanings share this list, and only one changes:
 *   - `{ openable: true }`: the projects a person can open now. A deleted project, and a work project under one, is
 *     left out. An archived project can still be opened, so it stays.
 *   - the default: the projects whose saved reports a person may read. A signed report run of a deleted project is
 *     a record, and deleting a project does not check for one (projects.ts PROJECT_HOLD_READS), so the default keeps
 *     the deleted project. Narrowing it would hide signed runs from Run history.
 *
 * Real SQL on PGlite.
 */
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../../../db', () => ({ getPool: () => { throw new Error('the shared pool was used'); }, pool: {}, db: {} }));

import { canAccessReportProject, getAccessibleReportProjectIds } from '../project-access';

const ORG = 7;
const ADMIN = { userId: 5, role: 'admin' };
const LIVE = '11111111-1111-4111-8111-111111111111';
const DELETED = '22222222-2222-4222-8222-222222222222';
const ARCHIVED = '33333333-3333-4333-8333-333333333333';
const OTHER_ORG_DELETED = '44444444-4444-4444-8444-444444444444';

let pg: PGlite;
const client = { query: (text: string, params?: unknown[]) => pg.query(text, params) as Promise<{ rows: Array<Record<string, unknown>> }> };

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`
    CREATE TABLE regulatory_programs (id uuid PRIMARY KEY, organization_id integer NOT NULL, status text NOT NULL DEFAULT 'active', deleted_at timestamp);
    CREATE TABLE projects (id integer PRIMARY KEY, organization_id integer NOT NULL, owner_id integer, created_by_id integer, settings jsonb,
      parent_project_id integer, regulatory_program_id uuid, status text NOT NULL DEFAULT 'active');
    CREATE TABLE project_members (project_id integer NOT NULL, organization_id integer NOT NULL, user_id integer NOT NULL, role text, status text NOT NULL DEFAULT 'active');
    CREATE TABLE project_visibility_settings (project_id integer NOT NULL, organization_id integer NOT NULL, visibility text);
    CREATE TABLE concept2cure_artifacts (id serial PRIMARY KEY, organization_id integer NOT NULL, project_id integer NOT NULL);
    CREATE TABLE concept2cure_review_assignments (id serial PRIMARY KEY, organization_id integer NOT NULL, artifact_id integer NOT NULL, reviewer_id integer NOT NULL, status text NOT NULL);
    INSERT INTO regulatory_programs (id, organization_id, status, deleted_at) VALUES
      ('${LIVE}', 7, 'active', NULL), ('${DELETED}', 7, 'active', now()), ('${ARCHIVED}', 7, 'archived', NULL), ('${OTHER_ORG_DELETED}', 8, 'active', now());
    INSERT INTO projects (id, organization_id, owner_id, created_by_id, settings, parent_project_id, regulatory_program_id, status) VALUES
      (1, 7, 5, 5, '{}', NULL, '${LIVE}', 'active'),      -- open
      (2, 7, 5, 5, '{}', NULL, '${DELETED}', 'active'),   -- deleted in Projects: the anchor row is left as it was
      (3, 7, 5, 5, '{}', 2, NULL, 'active'),              -- a work project under the deleted project
      (4, 7, 5, 5, '{}', 3, NULL, 'active'),              -- and one under that
      (5, 7, 5, 5, '{}', NULL, '${ARCHIVED}', 'active'),  -- archived: still opened from Projects
      (6, 7, 5, 5, '{}', NULL, NULL, 'active'),           -- no program record
      (7, 7, 5, 5, '{}', NULL, NULL, 'deleted'),          -- its own row says deleted
      (8, 7, 5, 5, '{}', 1, NULL, 'active'),              -- a work project under the open project
      (9, 8, 5, 5, '{}', NULL, '${OTHER_ORG_DELETED}', 'active'); -- another organization's
  `);
}, 120_000);
afterAll(async () => { await pg.close(); });

describe('the projects a person can open', () => {
  it('leaves out a project deleted in Projects, the work projects under it, and a row marked deleted', async () => {
    expect(await getAccessibleReportProjectIds(ORG, ADMIN, client, { openable: true })).toEqual([1, 5, 6, 8]);
  });

  it('keeps an archived project: it is still opened from Projects', async () => {
    expect(await getAccessibleReportProjectIds(ORG, ADMIN, client, { openable: true })).toContain(5);
  });

  it('only ever removes projects the sharing policy admitted', async () => {
    const admitted = await getAccessibleReportProjectIds(ORG, ADMIN, client);
    const openable = await getAccessibleReportProjectIds(ORG, ADMIN, client, { openable: true });
    expect(openable.every((id) => admitted.includes(id))).toBe(true);
    expect(openable).not.toContain(9);
  });
});

describe('the projects whose saved reports a person may read', () => {
  it('still names a deleted project, so its signed runs stay in Run history', async () => {
    expect(await getAccessibleReportProjectIds(ORG, ADMIN, client)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('still admits a saved report’s deleted project when it is checked by itself', async () => {
    expect(await canAccessReportProject(ORG, ADMIN, 2, client)).toBe(true);
  });
});
