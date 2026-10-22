import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { loadTaskHomePrograms } from '../task-home-programs';
import type { RequestSqlClient } from '../../../db/requestDb';
let pg: PGlite;
const OWN = '11111111-1111-4111-8111-111111111111';
beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`CREATE TABLE projects (id integer PRIMARY KEY, organization_id integer NOT NULL, regulatory_program_id uuid, client_workspace_id integer);
    CREATE TABLE regulatory_programs (id uuid PRIMARY KEY, organization_id integer NOT NULL, name text, deleted_at timestamptz);
    INSERT INTO regulatory_programs VALUES
      ('${OWN}',7,'Our program',NULL),
      ('22222222-2222-4222-8222-222222222222',8,'Other tenant',NULL),
      ('44444444-4444-4444-8444-444444444444',7,'Deleted program',now()),
      ('55555555-5555-4555-8555-555555555555',7,'Ambiguous program',NULL);
    INSERT INTO projects VALUES
      (12,7,'${OWN}',NULL),
      (13,8,'22222222-2222-4222-8222-222222222222',NULL),
      (14,7,'44444444-4444-4444-8444-444444444444',NULL),
      (15,7,'55555555-5555-4555-8555-555555555555',NULL),
      (16,7,'55555555-5555-4555-8555-555555555555',NULL),
      (17,7,'22222222-2222-4222-8222-222222222222',NULL);`);
});
afterAll(async () => { await pg.close(); });
const client: RequestSqlClient = { query: (sql, params) => pg.query(sql, params) };
describe('owning program for a task project', () => {
  it('returns the real UUID, and never maps a different tenant or damaged cross-tenant anchor', async () => {
    const result = await loadTaskHomePrograms(client, 7, [12,13,14,15,17]);
    expect([...result.entries()]).toEqual([[12, { id: OWN, title: 'Our program' }]]);
  });
  it('does not choose a deleted, ambiguous or unlinked program', async () => {
    expect((await loadTaskHomePrograms(client, 7, [14,15,999])).size).toBe(0);
  });
  it('refuses ambiguity even when the second anchor is outside the requested board subset', async () => {
    expect((await loadTaskHomePrograms(client, 7, [15])).size).toBe(0);
  });
  it('maps another organization only when that organization is the authenticated scope', async () => {
    expect((await loadTaskHomePrograms(client, 8, [13])).get(13)?.id).toBe('22222222-2222-4222-8222-222222222222');
  });
});
