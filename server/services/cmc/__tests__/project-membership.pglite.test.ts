/**
 * projectBelongsToTenant — which project ids a CMC write may file under
 * (PF-15, project first).
 *
 * The interview commit, the Module 3 link, the Module 3 operating-system routes
 * and POST /api/cmc-changes all ask this one check before filing a record under
 * a project named in the request. The route suites mock it; which rows its
 * predicates admit is decided by the database, so this drives it on real SQL:
 * two organizations, a live, a deleted and a foreign program, and an owned and
 * a foreign legacy numeric project.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { projectBelongsToTenant } from '../project-membership';

const MINE = 1;
const THEIRS = 2;
const LIVE = '11111111-1111-4111-8111-111111111111';
const DELETED = '22222222-2222-4222-8222-222222222222';
const FOREIGN = '33333333-3333-4333-8333-333333333333';

let pg: PGlite;
let queries = 0;
const db = {
  query: async (sql: string, params?: unknown[]) => {
    queries += 1;
    const r = await pg.query(sql, params as unknown[]);
    return { rows: r.rows as any[] };
  },
};
const belongs = (organizationId: unknown, projectId: string) =>
  projectBelongsToTenant({ organizationId: organizationId as number, projectId }, db);

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`
    CREATE TABLE regulatory_programs (
      id uuid PRIMARY KEY, organization_id integer NOT NULL, deleted_at timestamp
    );
    CREATE TABLE projects (id serial PRIMARY KEY, organization_id integer NOT NULL);
    INSERT INTO regulatory_programs (id, organization_id, deleted_at) VALUES
      ('${LIVE}', ${MINE}, NULL), ('${DELETED}', ${MINE}, now()), ('${FOREIGN}', ${THEIRS}, NULL);
    INSERT INTO projects (id, organization_id) VALUES (41, ${MINE}), (42, ${THEIRS});
  `);
});
afterAll(async () => {
  await pg.close();
});

describe('projectBelongsToTenant', () => {
  it.each([
    ['a live program of the organization', LIVE, true],
    ['a legacy numeric project of the organization', '41', true],
    ['the same numeric id with surrounding space', ' 41 ', true],
    ['a program the organization deleted', DELETED, false],
    ["another organization's program", FOREIGN, false],
    ["another organization's numeric project", '42', false],
    ['a numeric id naming no project', '9999', false],
    ['zero', '0', false],
    ['a malformed id', 'proj-1', false],
    ['a numeric id past the safe range', '90071992547409930', false],
    ['an empty id', '', false],
  ] as const)('%s (%s) → %s', async (_label, id, expected) => {
    expect(await belongs(MINE, id)).toBe(expected);
  });

  it('the answer is per organization: the other organization owns its own ids', async () => {
    expect(await belongs(THEIRS, FOREIGN)).toBe(true);
    expect(await belongs(THEIRS, '42')).toBe(true);
    expect(await belongs(THEIRS, LIVE)).toBe(false);
    expect(await belongs(THEIRS, '41')).toBe(false);
  });

  it('with no organization, nothing is looked up and the answer is no', async () => {
    const before = queries;
    for (const org of [0, -1, null, undefined, 'abc']) expect(await belongs(org, LIVE)).toBe(false);
    expect(queries).toBe(before);
  });

  it('a lookup that cannot complete throws — "could not tell" is not "not yours"', async () => {
    const broken = { query: async () => { throw new Error('connection reset'); } };
    await expect(projectBelongsToTenant({ organizationId: MINE, projectId: LIVE }, broken)).rejects.toThrow('connection reset');
  });
});
