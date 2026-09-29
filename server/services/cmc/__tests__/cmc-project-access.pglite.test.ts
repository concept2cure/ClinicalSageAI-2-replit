/**
 * cmcProjectInOrganization — which project ids a CMC write may file under
 * (PF-15, project first).
 *
 * Module 3 and the CMC change register took the project from the URL or the
 * body and wrote under it unchecked. The routes now ask this helper first, and
 * the route suites mock it; which rows its predicates admit is decided by the
 * database, so this drives it on real SQL: two organizations, a live, a deleted
 * and a foreign program, and an owned and a foreign legacy numeric project.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { cmcProjectInOrganization } from '../cmc-project-access';

const MINE = 1;
const THEIRS = 2;
const LIVE = '11111111-1111-4111-8111-111111111111';
const DELETED = '22222222-2222-4222-8222-222222222222';
const FOREIGN = '33333333-3333-4333-8333-333333333333';

let pg: PGlite;
const db = {
  query: async (sql: string, params?: unknown[]) => {
    const r = await pg.query(sql, params as unknown[]);
    return { rows: r.rows as unknown[] };
  },
};

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`
    CREATE TABLE regulatory_programs (
      id uuid PRIMARY KEY, organization_id integer NOT NULL, deleted_at timestamptz
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

describe('cmcProjectInOrganization', () => {
  it.each([
    ['a live program of the organization', LIVE, true],
    ['the same program in upper case', LIVE.toUpperCase(), true],
    ['a legacy numeric project of the organization', '41', true],
    ['a deleted program of the organization', DELETED, false],
    ["another organization's program", FOREIGN, false],
    ["another organization's numeric project", '42', false],
    ['a numeric id naming no project', '9999', false],
    ['zero', '0', false],
    ['a malformed id', 'proj-1', false],
    ['a numeric id past the safe range', '90071992547409930', false],
    ['an empty id', '', false],
    ['a non-string', 41, false],
  ] as const)('%s (%s) → %s', async (_label, id, expected) => {
    expect(await cmcProjectInOrganization(db, MINE, id)).toBe(expected);
  });

  it('the answer is per organization: the other organization owns its own ids', async () => {
    expect(await cmcProjectInOrganization(db, THEIRS, FOREIGN)).toBe(true);
    expect(await cmcProjectInOrganization(db, THEIRS, '42')).toBe(true);
    expect(await cmcProjectInOrganization(db, THEIRS, LIVE)).toBe(false);
    expect(await cmcProjectInOrganization(db, THEIRS, '41')).toBe(false);
  });

  it('a lookup that cannot complete throws — "could not tell" is not "not yours"', async () => {
    const broken = { query: async () => { throw new Error('connection reset'); } };
    await expect(cmcProjectInOrganization(broken, MINE, LIVE)).rejects.toThrow('connection reset');
    await expect(cmcProjectInOrganization(broken, MINE, '41')).rejects.toThrow('connection reset');
  });
});
