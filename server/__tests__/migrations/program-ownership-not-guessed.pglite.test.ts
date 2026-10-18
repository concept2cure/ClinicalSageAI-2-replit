/**
 * A program with no recorded owner is not given one.
 *
 * db/migrations/069_gcc_multitenant_rls_expansion.sql (install-fresh only;
 * db:provision runs it against production) assigned every core.programs row
 * with no org_id to the first identity organisation whenever exactly one
 * existed, then wrote an 'OWNER' row for it in core.program_ownerships: an
 * ownership nobody recorded, inferred from there being one organisation at
 * that moment. The guess is removed; ownership rows are still carried over
 * from an org_id a program does record. The whole file runs here, twice,
 * against PGlite.
 */
import { describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

const SQL = fs.readFileSync(path.join(process.cwd(), 'db/migrations/069_gcc_multitenant_rls_expansion.sql'), 'utf8');

const ORG = '00000000-0000-4000-8000-0000000000c1';

/** What 069 reads from earlier files: one identity organisation and the programs table. */
const PRELUDE = `
  CREATE SCHEMA identity;
  CREATE SCHEMA core;
  CREATE FUNCTION uuid_generate_v4() RETURNS uuid LANGUAGE sql AS $$ SELECT gen_random_uuid() $$;
  CREATE FUNCTION identity.current_org_id() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
  CREATE TABLE identity.organizations (id uuid PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now());
  INSERT INTO identity.organizations (id) VALUES ('${ORG}');
  CREATE TABLE core.programs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text);
`;

const programs = async (pg: PGlite) =>
  (await pg.query<{ name: string; org_id: string | null; owners: number }>(
    `SELECT p.name, p.org_id,
            (SELECT count(*)::int FROM core.program_ownerships o WHERE o.program_id = p.id) AS owners
       FROM core.programs p ORDER BY p.name`)).rows;

describe('069_gcc_multitenant_rls_expansion.sql, applied twice', () => {
  it('leaves a program with no recorded owner ownerless, though only one organisation exists', async () => {
    const pg = new PGlite();
    try {
      await pg.exec(PRELUDE);
      await pg.exec(`INSERT INTO core.programs (name) VALUES ('Ownerless program')`);
      await pg.exec(SQL);
      await pg.exec(SQL);
      expect(await programs(pg)).toEqual([{ name: 'Ownerless program', org_id: null, owners: 0 }]);
    } finally {
      await pg.close();
    }
  }, 120_000);

  it('carries a recorded owner into program_ownerships', async () => {
    const pg = new PGlite();
    try {
      await pg.exec(PRELUDE);
      await pg.exec(SQL);
      await pg.exec(`INSERT INTO core.programs (name, org_id) VALUES ('Owned program', '${ORG}')`);
      await pg.exec(SQL);
      expect(await programs(pg)).toEqual([{ name: 'Owned program', org_id: ORG, owners: 1 }]);
    } finally {
      await pg.close();
    }
  }, 120_000);
});
