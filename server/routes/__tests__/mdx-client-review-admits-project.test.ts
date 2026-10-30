/**
 * The Client Review Room admits the project before anything is read or shared
 * (P-61 item 5, 2026-10-29; docs/design/DEVICE_FOLDS_2026-10-29.md F6).
 *
 * GET /api/mdx/client-review validated `programId` as a uuid and echoed it back
 * in `meta`, and filtered `unified_tasks` by the organization and, optionally,
 * an integer `project_id`, checking neither against anything. So a request that
 * named one project was answered with the organization's tasks for every
 * project, under a `meta.programId` that claimed otherwise, and a client of one
 * program saw what had been shared with every other.
 *
 * Now, before the room is read:
 *   - a `programId` goes through admitProject (server/lib/admit-project.ts):
 *     404 "Project not found" when the organization does not own the live
 *     project, 503 when the check cannot run;
 *   - a `project_id` must be the organization's project, and, with a
 *     `programId`, that project's: 404 otherwise.
 * The room then holds that project's shared tasks only, and says so
 * (`meta.scope: 'project'`). With neither, it is the organization's room, as
 * before, and says that.
 *
 * Nothing mocks the ownership answer or the query builder: the real
 * programInOrganization and drizzle run against PGlite.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { PGlite } from '@electric-sql/pglite';

const ORG = 7;
const OTHER_ORG = 8;
const OWN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OWN_TWO = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const FOREIGN = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const DELETED = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const MISSING = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

type Q = { query: (text: unknown, values?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number; fields?: unknown }> };
const h = vi.hoisted(() => ({ pg: null as unknown as PGlite, ownershipDown: false, statements: [] as string[] }));

/** node-postgres' query() over PGlite, in both call shapes drizzle and pg use. */
function client(): Q {
  return {
    async query(text: unknown, values?: unknown[]) {
      const config = typeof text === 'string' ? { text, values } : (text as { text: string; values?: unknown[]; rowMode?: 'array' });
      h.statements.push(config.text);
      const r = await h.pg.query(config.text, (config.values ?? values ?? []) as unknown[],
        'rowMode' in config && config.rowMode === 'array' ? { rowMode: 'array' } : undefined);
      return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length, fields: r.fields };
    },
  };
}

vi.mock('../../db', () => ({
  pool: {
    query: async (text: string, values?: unknown[]) => {
      if (h.ownershipDown) throw Object.assign(new Error('connection terminated'), { code: '57P01' });
      return client().query(text, values);
    },
  },
}));

import router from '../mdx-client-review';

function app() {
  const a = express();
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: unknown }).user = { id: 5, organizationId: ORG };
    (req as unknown as { dbClient: unknown }).dbClient = client();
    next();
  });
  a.use('/api/mdx', router);
  return a;
}
const get = (qs = '') => request(app()).get(`/api/mdx/client-review${qs}`);
const taskReads = () => h.statements.filter(s => /from "unified_tasks"/i.test(s));
const titles = (body: { data: { groups: Record<string, Array<{ title: string }>> } }) =>
  Object.values(body.data.groups).flat().map(t => t.title).sort();

let ownProject = 0;
let ownTwoProject = 0;
let unanchoredProject = 0;
let foreignProject = 0;

beforeAll(async () => {
  h.pg = new PGlite();
  await h.pg.exec(`
    CREATE TABLE regulatory_programs (id uuid PRIMARY KEY, organization_id integer NOT NULL, deleted_at timestamptz);
    CREATE TABLE projects (id serial PRIMARY KEY, organization_id integer NOT NULL, regulatory_program_id uuid);
    CREATE TABLE unified_tasks (
      task_id text PRIMARY KEY, organization_id integer NOT NULL, project_id integer, module_type text NOT NULL,
      title text NOT NULL, description text, task_type text, status text NOT NULL DEFAULT 'pending',
      priority text NOT NULL DEFAULT 'medium', progress integer DEFAULT 0, due_date timestamp, completed_at timestamp,
      lifecycle_phase text, market text, filing_type text, client_visibility text,
      updated_at timestamp NOT NULL DEFAULT now(), deleted_at timestamptz);`);
  await h.pg.query(`INSERT INTO regulatory_programs (id, organization_id, deleted_at) VALUES
    ($1, ${ORG}, NULL), ($2, ${ORG}, NULL), ($3, ${OTHER_ORG}, NULL), ($4, ${ORG}, now())`, [OWN, OWN_TWO, FOREIGN, DELETED]);
  const project = async (org: number, program: string | null) =>
    (await h.pg.query<{ id: number }>('INSERT INTO projects (organization_id, regulatory_program_id) VALUES ($1, $2) RETURNING id', [org, program])).rows[0].id;
  ownProject = await project(ORG, OWN);
  ownTwoProject = await project(ORG, OWN_TWO);
  unanchoredProject = await project(ORG, null);
  foreignProject = await project(OTHER_ORG, FOREIGN);
  const task = (id: string, org: number, projectId: number | null, visibility: string) => h.pg.query(
    `INSERT INTO unified_tasks (task_id, organization_id, project_id, module_type, title, client_visibility)
     VALUES ($1, $2, $3, 'MedicalDevice', $1, $4)`, [id, org, projectId, visibility]);
  await task('own-shared', ORG, ownProject, 'client_visible');
  await task('own-internal', ORG, ownProject, 'internal');
  await task('own-two-shared', ORG, ownTwoProject, 'client_action_required');
  await task('unanchored-shared', ORG, unanchoredProject, 'client_visible');
  await task('org-shared', ORG, null, 'authority_ready');
  await task('foreign-shared', OTHER_ORG, foreignProject, 'client_visible');
});
afterAll(async () => { await h.pg.close(); });
beforeEach(() => { h.ownershipDown = false; h.statements.length = 0; });

describe('GET /api/mdx/client-review admits the project first (P-61 item 5)', () => {
  it.each([
    ['another organization\'s project', FOREIGN],
    ['a project that does not exist', MISSING],
    ['the organization\'s own deleted project', DELETED],
  ])('refuses %s with 404, and reads no task', async (_what, programId) => {
    const res = await get(`?programId=${programId}`);
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: 'Project not found' });
    expect(taskReads()).toEqual([]);
  });

  it('answers 503 when ownership cannot be checked, and reads no task', async () => {
    h.ownershipDown = true;
    const res = await get(`?programId=${OWN}`);
    expect(res.status).toBe(503);
    expect(taskReads()).toEqual([]);
  });

  it('shares the admitted project\'s client-visible tasks only, and says the scope is that project', async () => {
    const res = await get(`?programId=${OWN}`);
    expect(res.status).toBe(200);
    expect(titles(res.body)).toEqual(['own-shared']);
    expect(res.body.meta).toMatchObject({ scope: 'project', programId: OWN });
  });

  it.each([
    ['another organization\'s project id', () => `?project_id=${foreignProject}`],
    ['a project id that does not exist', () => '?project_id=987654'],
    ['the organization\'s project of another program', () => `?programId=${OWN}&project_id=${ownTwoProject}`],
  ])('refuses %s with 404, and reads no task', async (_what, qs) => {
    const res = await get(qs());
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: 'Project not found' });
    expect(taskReads()).toEqual([]);
  });

  it('a program and its own project id: the room is that project\'s', async () => {
    const res = await get(`?programId=${OWN}&project_id=${ownProject}`);
    expect(res.status).toBe(200);
    expect(titles(res.body)).toEqual(['own-shared']);
    expect(res.body.meta).toMatchObject({ scope: 'project', projectId: ownProject, programId: OWN });
  });

  it('a project id of the organization narrows the room to that project', async () => {
    const res = await get(`?project_id=${unanchoredProject}`);
    expect(res.status).toBe(200);
    expect(titles(res.body)).toEqual(['unanchored-shared']);
    expect(res.body.meta).toMatchObject({ scope: 'project', projectId: unanchoredProject, programId: null });
  });

  it('with neither, it is the organization\'s room, says so, and holds no other organization\'s task', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(titles(res.body)).toEqual(['org-shared', 'own-shared', 'own-two-shared', 'unanchored-shared']);
    expect(res.body.meta).toMatchObject({ scope: 'organization', programId: null, projectId: null });
  });
});
