/**
 * Sentinel's over-allocation finding names each project with its own id.
 *
 * WHY THIS FILE EXISTS
 * The cross-project analyzer read a person's projects as two aggregates,
 * `ARRAY_AGG(DISTINCT p.name)` and `ARRAY_AGG(DISTINCT p.id)`, and paired them
 * by position. DISTINCT sorts each aggregate by its own values, so the names
 * came back in alphabetical order and the ids in numeric order: whenever the
 * two orders differ, a finding's `affected_items` put one project's name on
 * another project's id, and `details.projectNames[i]` did not belong to
 * `details.projectIds[i]`. Found on 2026-11-12 while making the Projects
 * screen's "at risk this week" rows name and open their project: a label paired
 * this way could send a reader to the wrong project (RULE 2: a stated fact with
 * no record behind it).
 *
 * A mocked pool returns whatever rows the test hands it, so this runs the
 * analyzer's own exported query text against a real engine (PGlite), as
 * sentinel-task-status.pglite.integration.test.ts does.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { SENTINEL_OVER_ALLOCATION_SQL, overAllocationProjects } from '../sentinel';

let pg: PGlite;

/** Just enough schema for the query under test. */
const DDL = `
CREATE TABLE users (id SERIAL PRIMARY KEY, name TEXT, email TEXT);
CREATE TABLE projects (
  id              INTEGER PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  name            TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'active'
);
CREATE TABLE unified_tasks (
  id              SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  project_id      INTEGER,
  assignee_id     INTEGER,
  status          TEXT NOT NULL,
  deleted_at      TIMESTAMPTZ
);
CREATE FUNCTION public.actor_name(p_user_id integer) RETURNS TABLE (name text, email text)
  LANGUAGE sql STABLE AS $$ SELECT u.name, u.email FROM users u WHERE u.id = p_user_id $$;
`;

const ORG = 7;
const LEE = 41;
/** Ids ascend as names descend, so the two sort orders are opposite. */
const PROJECTS = [
  { id: 11, name: 'Zeta stability study' },
  { id: 12, name: 'Mu device 510(k)' },
  { id: 13, name: 'Kappa IND' },
  { id: 14, name: 'Alpha NDA' },
];

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(DDL);
  await pg.query(`INSERT INTO users (id, name, email) VALUES ($1, 'Lee Park', 'lee@example.test')`, [LEE]);
  for (const p of PROJECTS) {
    await pg.query(`INSERT INTO projects (id, organization_id, name) VALUES ($1, $2, $3)`, [p.id, ORG, p.name]);
    // Two open tasks on each, so a project appears on more than one joined row.
    for (let n = 0; n < 2; n += 1) {
      await pg.query(`INSERT INTO unified_tasks (organization_id, project_id, assignee_id, status) VALUES ($1, $2, $3, 'pending')`, [ORG, p.id, LEE]);
    }
  }
});
afterAll(async () => { await pg?.close(); });

describe('Sentinel over-allocation: a project’s name stays with its id', () => {
  it('reads each project once, its name beside its own id', async () => {
    const { rows } = await pg.query<{ user_name: string; active_projects: number; open_tasks: number; projects: unknown }>(
      SENTINEL_OVER_ALLOCATION_SQL, [ORG]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ user_name: 'Lee Park', active_projects: 4, open_tasks: 8 });
    const projects = overAllocationProjects(rows[0].projects);
    expect(projects).toEqual([
      { id: 11, name: 'Zeta stability study' },
      { id: 12, name: 'Mu device 510(k)' },
      { id: 13, name: 'Kappa IND' },
      { id: 14, name: 'Alpha NDA' },
    ]);
  });

  it('pairs nothing by position: the query returns no separate list of names or of ids', async () => {
    const { rows } = await pg.query<Record<string, unknown>>(SENTINEL_OVER_ALLOCATION_SQL, [ORG]);
    expect(rows[0]).not.toHaveProperty('project_names');
    expect(rows[0]).not.toHaveProperty('project_ids');
  });

  it('keeps only a pair that holds a project number and a name, in the order of the numbers', () => {
    expect(overAllocationProjects([
      { id: 9, name: 'Nine' }, { id: 3, name: 'Three' }, { id: '4', name: 'a text id' }, { id: 5 }, null, 'x', { id: 6, name: '  ' },
    ])).toEqual([{ id: 3, name: 'Three' }, { id: 9, name: 'Nine' }]);
    expect(overAllocationProjects(null)).toEqual([]);
    expect(overAllocationProjects('not a list')).toEqual([]);
  });
});
