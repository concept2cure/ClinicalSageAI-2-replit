/** D2: real canonical report-group links, validated tenant keys and runtime RLS.
 * The database must already come from install-fresh/deploy-migrate. No synthetic
 * replacement table or policy is created. Legacy shapes are staged only inside
 * rolled-back transactions against the actual table and canonical migration. */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool, type PoolClient } from 'pg';
import { databaseUrl } from '../setup.db';
import { getPool } from '../../server/db/runtime';
import { runWithTenantScope } from '../../server/db/tenantStore';
import { applyMigrationFiles, CHILD_TABLE_PARENT_SCOPE, TENANT_ISOLATION_SWEEP } from '../../scripts/db/migration-set.mjs';

const FOUNDATION = 'migrations/0014_report_os_foundation.sql';
const TABLE = 'public.report_program_group_projects';
const GROUP_FK = 'report_program_group_projects_group_same_org_fk';
const PROJECT_FK = 'report_program_group_projects_project_same_org_fk';
const ROOT = path.resolve(__dirname, '..', '..');
const TAG = `report-group-native-${randomUUID()}`;
// The owner test transaction owns its rollback. Only the migration's outer
// BEGIN/COMMIT are removed; every production DDL/DML/preflight byte is retained.
const migrationBody = fs.readFileSync(path.join(ROOT, FOUNDATION), 'utf8')
  .replace(/^BEGIN;\r?\n/m, '').replace(/\r?\nCOMMIT;\s*$/, '');
type Tenant = { id: number; uuid: string; workspace: number; group: number; projects: number[]; link: number };
const tenants: Tenant[] = [];
let owner: Pool;

function asTenant<T>(tenant: Tenant, fn: () => Promise<T>): Promise<T> {
  return runWithTenantScope({ tenantId: String(tenant.id), orgUuid: tenant.uuid,
    role: 'member', source: 'test', caller: 'report-program-group-native' }, fn);
}

async function replay(): Promise<void> {
  const client = await owner.connect();
  try {
    const result = await applyMigrationFiles(client, ROOT,
      [FOUNDATION, CHILD_TABLE_PARENT_SCOPE, TENANT_ISOLATION_SWEEP],
      { stopOnFirstFailure: true, lockAttempts: 2, lockBackoffMs: 20 });
    expect(result.failures).toEqual([]);
    expect(result.applied).toEqual([FOUNDATION, CHILD_TABLE_PARENT_SCOPE, TENANT_ISOLATION_SWEEP]);
  } finally { client.release(); }
}

async function rollbackOnly(fn: (client: PoolClient) => Promise<void>): Promise<void> {
  const client = await owner.connect();
  try {
    await client.query('BEGIN');
    await client.query(`LOCK TABLE ${TABLE} IN ACCESS EXCLUSIVE MODE`);
    await fn(client);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}

async function legacyShape(client: PoolClient): Promise<void> {
  await client.query(`ALTER TABLE ${TABLE} DROP CONSTRAINT ${GROUP_FK}, DROP CONSTRAINT ${PROJECT_FK}`);
  await client.query(`ALTER TABLE ${TABLE} ALTER COLUMN organization_id DROP NOT NULL`);
}

async function rejectedWithoutMutation(client: PoolClient, message: string): Promise<void> {
  const before = (await client.query(`SELECT * FROM ${TABLE} ORDER BY id`)).rows;
  await client.query('SAVEPOINT before_production_migration');
  const failure: unknown = await client.query(migrationBody).then(() => null, (error: unknown) => error);
  expect(failure).toMatchObject({ code: 'P0001' });
  expect((failure as Error).message).toContain(message);
  await client.query('ROLLBACK TO SAVEPOINT before_production_migration');
  expect((await client.query(`SELECT * FROM ${TABLE} ORDER BY id`)).rows).toEqual(before);
}

beforeAll(async () => {
  if (!process.env.APP_DATABASE_URL) throw new Error('APP_DATABASE_URL must name the provisioned non-owner runtime role.');
  owner = new Pool({ connectionString: databaseUrl, max: 3 });
  expect((await owner.query(`SELECT to_regclass($1) AS name`, [TABLE])).rows[0].name,
    'Provision the real database through install-fresh and deploy-migrate; this test creates no substitute table.').toBe(TABLE.replace('public.', ''));
  await replay();
  for (const suffix of ['a', 'b']) {
    const name = `${TAG}-${suffix}`;
    const org = (await owner.query("INSERT INTO organizations(name,slug,status) VALUES($1,$1,'active') RETURNING id,uuid", [name])).rows[0];
    const tenant: Tenant = { id: Number(org.id), uuid: String(org.uuid), workspace: 0, group: 0, projects: [], link: 0 };
    tenants.push(tenant);
    const workspace = (await owner.query("INSERT INTO client_workspaces(organization_id,name,slug,status) VALUES($1,$2,$2,'active') RETURNING id", [tenant.id, name])).rows[0];
    tenant.workspace = Number(workspace.id);
    for (let index = 0; index < 4; index++) {
      const project = (await owner.query("INSERT INTO projects(organization_id,client_workspace_id,name,type,status) VALUES($1,$2,$3,'regulatory','active') RETURNING id", [tenant.id, workspace.id, `${name}-${index}`])).rows[0];
      tenant.projects.push(Number(project.id));
    }
    tenant.group = Number((await owner.query('INSERT INTO report_program_groups(organization_id,name) VALUES($1,$2) RETURNING id', [tenant.id, name])).rows[0].id);
    tenant.link = Number((await owner.query(`INSERT INTO ${TABLE}(organization_id,program_group_id,project_id) VALUES($1,$2,$3) RETURNING id`, [tenant.id, tenant.group, tenant.projects[0]])).rows[0].id);
  }
}, 120_000);

afterAll(async () => {
  // Only this suite's uniquely named organizations and their disposable rows.
  try {
    if (owner && tenants.length) {
      await owner.query('DELETE FROM report_program_groups WHERE id=ANY($1::int[]) AND name LIKE $2', [tenants.map(t => t.group), `${TAG}-%`]);
      await owner.query('DELETE FROM projects WHERE id=ANY($1::int[]) AND name LIKE $2', [tenants.flatMap(t => t.projects), `${TAG}-%`]);
      await owner.query('DELETE FROM client_workspaces WHERE id=ANY($1::int[]) AND slug LIKE $2', [tenants.map(t => t.workspace), `${TAG}-%`]);
      await owner.query('DELETE FROM organizations WHERE id=ANY($1::int[]) AND slug LIKE $2', [tenants.map(t => t.id), `${TAG}-%`]);
    }
  } finally {
    await getPool().end();
    await owner?.end();
  }
});

describe('canonical report-program group tenancy on native PostgreSQL', () => {
  it('has non-null integer tenant identity and both immediate validated composite foreign keys', async () => {
    const column = (await owner.query("SELECT data_type,is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='report_program_group_projects' AND column_name='organization_id'")).rows[0];
    expect(column).toEqual({ data_type: 'integer', is_nullable: 'NO' });
    const constraints = (await owner.query(`SELECT conname,convalidated,condeferrable,confdeltype,confupdtype,pg_get_constraintdef(oid) AS definition
      FROM pg_constraint WHERE conrelid=$1::regclass AND conname=ANY($2::text[]) ORDER BY conname`, [TABLE, [GROUP_FK, PROJECT_FK]])).rows;
    expect(constraints).toHaveLength(2);
    for (const constraint of constraints) {
      expect(constraint).toMatchObject({ convalidated: true, condeferrable: false, confdeltype: 'c', confupdtype: 'a' });
      expect(constraint.definition).toContain('(id, organization_id)');
      expect(constraint.definition).toContain(constraint.conname === GROUP_FK
        ? 'FOREIGN KEY (program_group_id, organization_id) REFERENCES report_program_groups'
        : 'FOREIGN KEY (project_id, organization_id) REFERENCES projects');
    }
  });

  it('uses the configured actual non-owner NOSUPERUSER NOBYPASSRLS runtime with FORCE RLS', async () => {
    const result = await asTenant(tenants[0], () => getPool().query(`SELECT current_user AS who,rolsuper,rolbypassrls,
      current_setting('app.rls_enforce') AS enforcement,pg_get_userbyid(c.relowner) AS owner,c.relrowsecurity,c.relforcerowsecurity
      FROM pg_roles CROSS JOIN pg_class c WHERE rolname=current_user AND c.oid=$1::regclass`, [TABLE]));
    const row = result.rows[0];
    expect(row).toMatchObject({ who: decodeURIComponent(new URL(process.env.APP_DATABASE_URL!).username),
      rolsuper: false, rolbypassrls: false, enforcement: 'on', relrowsecurity: true, relforcerowsecurity: true });
    expect(row.who).not.toBe(row.owner);
  });

  it('filters real links by tenant and refuses mutation of the foreign tenant link', async () => {
    for (const tenant of tenants) {
      const other = tenants.find(t => t !== tenant)!;
      const rows = await asTenant(tenant, () => getPool().query(`SELECT id,organization_id FROM ${TABLE} WHERE id=ANY($1::int[]) ORDER BY id`, [tenants.map(t => t.link)]));
      expect(rows.rows).toEqual([{ id: tenant.link, organization_id: tenant.id }]);
      const deleted = await asTenant(tenant, () => getPool().query(`DELETE FROM ${TABLE} WHERE id=$1 RETURNING id`, [other.link]));
      expect(deleted.rowCount).toBe(0);
      expect((await owner.query(`SELECT id FROM ${TABLE} WHERE id=$1`, [other.link])).rowCount).toBe(1);
    }
  });

  it('permits an actual runtime same-org link and records its exact tenant identity', async () => {
    const tenant = tenants[0];
    const result = await asTenant(tenant, () => getPool().query(`INSERT INTO ${TABLE}(organization_id,program_group_id,project_id) VALUES($1,$2,$3) RETURNING organization_id,program_group_id,project_id`, [tenant.id, tenant.group, tenant.projects[1]]));
    expect(result.rows[0]).toEqual({ organization_id: tenant.id, program_group_id: tenant.group, project_id: tenant.projects[1] });
  });

  for (const parent of ['group', 'project'] as const) {
    it(`refuses a foreign ${parent} even through the migration owner's otherwise unrestricted connection`, async () => {
      const [a, b] = tenants;
      await expect(owner.query(`INSERT INTO ${TABLE}(organization_id,program_group_id,project_id) VALUES($1,$2,$3)`,
        [a.id, parent === 'group' ? b.group : a.group, parent === 'project' ? b.projects[2] : a.projects[2]]))
        .rejects.toMatchObject({ code: '23503', constraint: parent === 'group' ? GROUP_FK : PROJECT_FK });
    });
  }

  it('refuses a forged foreign runtime tenant and a foreign-project link inside the current tenant', async () => {
    const [a, b] = tenants;
    await expect(asTenant(a, () => getPool().query(`INSERT INTO ${TABLE}(organization_id,program_group_id,project_id) VALUES($1,$2,$3)`, [b.id, b.group, b.projects[2]]))).rejects.toMatchObject({ code: '42501' });
    await expect(asTenant(a, () => getPool().query(`INSERT INTO ${TABLE}(organization_id,program_group_id,project_id) VALUES($1,$2,$3)`, [a.id, a.group, b.projects[2]]))).rejects.toMatchObject({ code: '23503', constraint: PROJECT_FK });
  });

  it('replays the canonical foundation and policy installers without changing retained links or constraints', async () => {
    const before = (await owner.query(`SELECT * FROM ${TABLE} WHERE program_group_id=ANY($1::int[]) ORDER BY id`, [tenants.map(t => t.group)])).rows;
    const keysBefore = (await owner.query('SELECT conname,convalidated,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid=$1::regclass ORDER BY conname', [TABLE])).rows;
    await replay();
    expect((await owner.query(`SELECT * FROM ${TABLE} WHERE program_group_id=ANY($1::int[]) ORDER BY id`, [tenants.map(t => t.group)])).rows).toEqual(before);
    expect((await owner.query('SELECT conname,convalidated,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid=$1::regclass ORDER BY conname', [TABLE])).rows).toEqual(keysBefore);
  });
});

describe('canonical report-group legacy migration preflight', () => {
  it('backfills only an unambiguous NULL legacy tenant from two same-org parents', async () => rollbackOnly(async client => {
    const a = tenants[0];
    await legacyShape(client);
    const row = (await client.query(`INSERT INTO ${TABLE}(organization_id,program_group_id,project_id) VALUES(NULL,$1,$2) RETURNING id`, [a.group, a.projects[3]])).rows[0];
    await client.query(migrationBody);
    expect((await client.query(`SELECT organization_id,program_group_id,project_id FROM ${TABLE} WHERE id=$1`, [row.id])).rows[0])
      .toEqual({ organization_id: a.id, program_group_id: a.group, project_id: a.projects[3] });
    expect((await client.query('SELECT convalidated FROM pg_constraint WHERE conrelid=$1::regclass AND conname=ANY($2::text[])', [TABLE, [GROUP_FK, PROJECT_FK]])).rows).toEqual([{ convalidated: true }, { convalidated: true }]);
  }));

  it('refuses conflicting legacy parents without deleting, relabeling or backfilling any link', async () => rollbackOnly(async client => {
    const [a, b] = tenants;
    await legacyShape(client);
    // Include a valid NULL row that would be eligible for backfill: preflight
    // must refuse before touching even that row when any inconsistent row exists.
    await client.query(`INSERT INTO ${TABLE}(organization_id,program_group_id,project_id) VALUES(NULL,$1,$2),(NULL,$1,$3)`, [a.group, a.projects[3], b.projects[3]]);
    await rejectedWithoutMutation(client, 'REPORT_GROUP_MEMBERSHIP_TENANT_RECONCILIATION_REQUIRED');
  }));

  it('refuses an already populated but incorrect legacy tenant key instead of overwriting it', async () => rollbackOnly(async client => {
    const [a, b] = tenants;
    await legacyShape(client);
    await client.query(`INSERT INTO ${TABLE}(organization_id,program_group_id,project_id) VALUES($1,$2,$3)`, [b.id, a.group, a.projects[3]]);
    await rejectedWithoutMutation(client, 'REPORT_GROUP_MEMBERSHIP_TENANT_RECONCILIATION_REQUIRED');
  }));

  it('refuses an orphaned legacy parent with the same named reconciliation requirement', async () => rollbackOnly(async client => {
    const a = tenants[0];
    await legacyShape(client);
    // Remove only the actual project FK in this rolled-back legacy fixture.
    const keys = (await client.query("SELECT conname FROM pg_constraint WHERE conrelid=$1::regclass AND contype='f' AND confrelid='projects'::regclass", [TABLE])).rows;
    for (const key of keys) await client.query(`ALTER TABLE ${TABLE} DROP CONSTRAINT "${String(key.conname).replaceAll('"', '""')}"`);
    await client.query(`INSERT INTO ${TABLE}(organization_id,program_group_id,project_id) VALUES(NULL,$1,2147483647)`, [a.group]);
    await rejectedWithoutMutation(client, 'REPORT_GROUP_MEMBERSHIP_TENANT_RECONCILIATION_REQUIRED');
  }));

  it('refuses a same-name wrong-shape constraint rather than silently replacing it', async () => rollbackOnly(async client => {
    await client.query(`ALTER TABLE ${TABLE} DROP CONSTRAINT ${PROJECT_FK}`);
    await client.query(`ALTER TABLE ${TABLE} ADD CONSTRAINT ${PROJECT_FK} FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE`);
    await rejectedWithoutMutation(client, 'REPORT_GROUP_MEMBERSHIP_CONSTRAINT_MISMATCH');
    const definition = (await client.query('SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid=$1::regclass AND conname=$2', [TABLE, PROJECT_FK])).rows[0].definition;
    expect(definition).toBe('FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE');
  }));

  it('validates a correctly shaped existing NOT VALID key without replacing its identity', async () => rollbackOnly(async client => {
    await client.query(`ALTER TABLE ${TABLE} DROP CONSTRAINT ${PROJECT_FK}`);
    await client.query(`ALTER TABLE ${TABLE} ADD CONSTRAINT ${PROJECT_FK} FOREIGN KEY (project_id,organization_id) REFERENCES projects(id,organization_id) ON DELETE CASCADE ON UPDATE NO ACTION NOT VALID`);
    const before = (await client.query('SELECT oid,convalidated FROM pg_constraint WHERE conrelid=$1::regclass AND conname=$2', [TABLE, PROJECT_FK])).rows[0];
    expect(before.convalidated).toBe(false);
    await client.query(migrationBody);
    expect((await client.query('SELECT oid,convalidated FROM pg_constraint WHERE conrelid=$1::regclass AND conname=$2', [TABLE, PROJECT_FK])).rows[0])
      .toEqual({ oid: before.oid, convalidated: true });
  }));
});
