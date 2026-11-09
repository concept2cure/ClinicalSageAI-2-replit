/**
 * The Report OS foundation reaches every deployed database (CLAUDE.md RULE 1).
 *
 * migrations/0014_report_os_foundation.sql was amended in place on 2026-10-13
 * (0e4ccf46f4) so that a report program group's membership records its
 * organisation (`report_program_group_projects.organization_id`), with
 * same-organisation composite keys. Run history, project access and scope
 * ownership have read `gp.organization_id` since then
 * (server/services/report-os/run-history.ts, project-access.ts,
 * scope-ownership.ts).
 *
 * But 0014 is on no deploy path. install-fresh reads `migrations/`, so a
 * database installed after 2026-10-13 has the column. deploy-migrate applies
 * C2C_MIGRATION_FILES only, so a database installed earlier never got it, and
 * Run history answers 500, "column gp.organization_id does not exist" (Reporting
 * use walk, 2026-11-09, on the local clinicalsage database).
 *
 * This proves that 0014 is in the deploy set, ahead of the report seed and the
 * tenant installers, and that replaying it over a database of the earlier shape:
 *   - adds the column and backfills it from the group's organisation;
 *   - sets NOT NULL and adds the same-organisation keys;
 *   - is a no-op the second time;
 *   - refuses a membership whose group and project disagree, rewriting nothing.
 */
import { describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { C2C_MIGRATION_FILES, TENANT_ISOLATION_SWEEP } from '../../../scripts/db/migration-set.mjs';

const FILE = 'migrations/0014_report_os_foundation.sql';
const sql = () => fs.readFileSync(path.join(process.cwd(), FILE), 'utf8');
const T = 120_000;

/** The drizzle base tables 0014 references, as a deployed database has them. */
const BASE = `
  CREATE TABLE organizations (id serial PRIMARY KEY);
  CREATE TABLE users (id serial PRIMARY KEY);
  CREATE TABLE client_workspaces (id serial PRIMARY KEY);
  CREATE TABLE projects (id serial PRIMARY KEY, organization_id integer NOT NULL REFERENCES organizations(id));
  CREATE TABLE immutable_report_records (id serial PRIMARY KEY, organization_id integer);
  INSERT INTO organizations (id) VALUES (7), (8);
  INSERT INTO projects (id, organization_id) VALUES (1, 7), (2, 8);`;

/** A database installed before 2026-10-13: 0014's tables, with no organisation on a membership. */
async function earlierShape(pg: PGlite) {
  await pg.exec(BASE);
  await pg.exec(sql());
  await pg.exec(`
    ALTER TABLE report_program_group_projects DROP CONSTRAINT report_program_group_projects_group_same_org_fk;
    ALTER TABLE report_program_group_projects DROP CONSTRAINT report_program_group_projects_project_same_org_fk;
    ALTER TABLE report_program_group_projects DROP COLUMN organization_id;`);
  const { rows } = await pg.query<{ id: number }>(
    `INSERT INTO report_program_groups (organization_id, name, created_by) VALUES (7, 'Board pack', NULL) RETURNING id`);
  return rows[0].id;
}

const column = async (pg: PGlite) => (await pg.query<{ is_nullable: string }>(
  `SELECT is_nullable FROM information_schema.columns WHERE table_name='report_program_group_projects' AND column_name='organization_id'`)).rows;

describe(FILE, () => {
  it('is in the deploy set, ahead of the report seed and the tenant installers', () => {
    const files = C2C_MIGRATION_FILES as readonly string[];
    const at = files.indexOf(FILE);
    expect(at, 'the Report OS foundation is on no deploy path').toBeGreaterThan(-1);
    expect(at).toBeLessThan(files.indexOf('migrations/20260930_report_type_registry_seed.sql'));
    expect(at).toBeLessThan(files.indexOf('db/migrations/20260813_child_table_parent_scoped_rls.sql'));
    expect(at).toBeLessThan(files.indexOf(TENANT_ISOLATION_SWEEP));
  });

  it('gives an earlier database the membership organisation, backfilled from its group, and replays as a no-op', async () => {
    const pg = new PGlite();
    try {
      const group = await earlierShape(pg);
      await pg.query(`INSERT INTO report_program_group_projects (program_group_id, project_id) VALUES ($1, 1)`, [group]);
      expect(await column(pg)).toEqual([]);

      for (let deploy = 0; deploy < 2; deploy++) await pg.exec(sql());

      expect(await column(pg)).toEqual([{ is_nullable: 'NO' }]);
      expect((await pg.query(`SELECT program_group_id, project_id, organization_id FROM report_program_group_projects`)).rows)
        .toEqual([{ program_group_id: group, project_id: 1, organization_id: 7 }]);
      const keys = (await pg.query<{ conname: string }>(
        `SELECT conname FROM pg_constraint WHERE conrelid='report_program_group_projects'::regclass AND conname LIKE '%same_org_fk' ORDER BY conname`)).rows;
      expect(keys.map((k) => k.conname)).toEqual([
        'report_program_group_projects_group_same_org_fk', 'report_program_group_projects_project_same_org_fk']);
      // What Run history reads now resolves.
      await expect(pg.query(`SELECT gp.project_id FROM report_program_groups g
        JOIN report_program_group_projects gp ON gp.program_group_id = g.id AND gp.organization_id = g.organization_id
        WHERE g.organization_id = 7`)).resolves.toMatchObject({ rows: [{ project_id: 1 }] });
      // And a member of another organisation's project is refused by the key.
      await expect(pg.query(`INSERT INTO report_program_group_projects (organization_id, program_group_id, project_id) VALUES (7, $1, 2)`, [group]))
        .rejects.toThrow(/foreign key/);
    } finally {
      await pg.close();
    }
  }, T);

  it('refuses a membership whose group and project are in different organisations, and rewrites nothing', async () => {
    const pg = new PGlite();
    try {
      const group = await earlierShape(pg);
      await pg.query(`INSERT INTO report_program_group_projects (program_group_id, project_id) VALUES ($1, 2)`, [group]);
      await expect(pg.exec(sql())).rejects.toThrow(/REPORT_GROUP_MEMBERSHIP_TENANT_RECONCILIATION_REQUIRED/);
      // The file is one transaction (BEGIN … COMMIT): the refusal rolls all of it back.
      await pg.exec('ROLLBACK');
      expect(await column(pg)).toEqual([]);
      expect((await pg.query(`SELECT count(*)::int AS n FROM report_program_group_projects`)).rows).toEqual([{ n: 1 }]);
    } finally {
      await pg.close();
    }
  }, T);
});
