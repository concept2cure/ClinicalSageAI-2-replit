/** Fresh native Vault prerequisites. Production readers make every admission decision. */
import { expect } from 'vitest';
import type { Pool, PoolClient } from 'pg';
import { databaseUrl } from '../setup.db';

type VaultTenant = { orgId: number; orgUuid: string; programId: string };

/** Refuse retained/original databases before any fixture or legacy DDL write. */
export async function assertVaultFixtureDatabase(owner: Pool): Promise<string> {
  const configured = process.env.APP_DATABASE_URL?.trim();
  if (!configured) throw new Error('A restricted APP_DATABASE_URL is required.');
  const target = new URL(databaseUrl);
  const runtime = new URL(configured);
  const declared = process.env.C2C_VAULT_LEGACY_FIXTURE_DATABASE;
  const disposableCi = process.env.CI === 'true' && process.env.NODE_ENV === 'test' &&
    target.pathname === '/concept2cure-ri_dbtest';
  const recordedLocal = typeof declared === 'string' && /^platform_ci_vault_fixture_[a-z0-9_]+$/.test(declared) &&
    target.pathname === `/${declared}`;
  if ((!disposableCi && !recordedLocal) || target.pathname !== runtime.pathname ||
      target.hostname !== runtime.hostname || (target.port || '5432') !== (runtime.port || '5432') ||
      runtime.username !== 'app_service') {
    throw new Error('Vault fixture proof requires the recorded disposable database; retained QA is refused.');
  }
  const name = decodeURIComponent(target.pathname.slice(1));
  expect((await owner.query('SELECT current_database() AS name')).rows).toEqual([{ name }]);
  return name;
}

export async function seedVaultFixtureParent(owner: Pool, tenant: VaultTenant, input: {
  userId: number; namespace: string;
}): Promise<void> {
  const identity = await owner.query(
    `SELECT o.status AS organization_status, u.status AS user_status FROM organizations o, users u
     WHERE o.id=$1 AND u.id=$2`, [tenant.orgId, input.userId]);
  expect(identity.rows).toEqual([{ organization_status: 'active', user_status: 'active' }]);
  // The original positive requests declare admin. A real current row must agree.
  await owner.query(`INSERT INTO organization_users(organization_id,user_id,role) VALUES($1,$2,'admin')
    ON CONFLICT(user_id,organization_id) DO NOTHING`, [tenant.orgId, input.userId]);
  expect((await owner.query('SELECT role FROM organization_users WHERE organization_id=$1 AND user_id=$2',
    [tenant.orgId, input.userId])).rows).toEqual([{ role: 'admin' }]);
  const workspace = await owner.query(
    `INSERT INTO client_workspaces(organization_id,name,slug,status,created_by_id)
     VALUES($1,$2,$2,'active',$3) RETURNING id`, [tenant.orgId, input.namespace, input.userId]);
  const project = await owner.query(
    `INSERT INTO projects(organization_id,client_workspace_id,name,type,status,owner_id,created_by_id,regulatory_program_id,settings)
     VALUES($1,$2,$3,'regulatory','active',$4,$4,$5,'{}') RETURNING id`,
    [tenant.orgId, workspace.rows[0].id, input.namespace, input.userId, tenant.programId]);
  await owner.query(`INSERT INTO project_visibility_settings(organization_id,project_id,visibility)
    VALUES($1,$2,'private')`, [tenant.orgId, project.rows[0].id]);
  expect((await owner.query('SELECT id FROM projects WHERE organization_id=$1 AND regulatory_program_id=$2',
    [tenant.orgId, tenant.programId])).rows).toEqual([{ id: project.rows[0].id }]);
}

/** A separate real viewer may read this one private parent, never write it. */
export async function seedVaultFixtureViewer(owner: Pool, tenant: VaultTenant, input: {
  userId: number; invitedBy: number;
}): Promise<void> {
  await owner.query("INSERT INTO organization_users(organization_id,user_id,role) VALUES($1,$2,'viewer')",
    [tenant.orgId, input.userId]);
  const inserted = await owner.query(
    `INSERT INTO project_members(project_id,organization_id,user_id,role,status,invited_by_id)
     SELECT id,organization_id,$3,'use','active',$4 FROM projects
     WHERE organization_id=$1 AND regulatory_program_id=$2 RETURNING project_id`,
    [tenant.orgId, tenant.programId, input.userId, input.invitedBy]);
  expect(inserted.rows).toHaveLength(1);
}

/** Runtime posture is checked on the actual scoped app_service executor. */
export async function assertVaultFixtureRuntime(tenant: VaultTenant): Promise<void> {
  const { getPool } = await import('../../server/db');
  const { runWithTenantScope } = await import('../../server/db/tenantStore');
  const { applySessionScope } = await import('../../server/db/sessionScope');
  const { LazyRequestDbClient } = await import('../../server/middleware/lazyRequestDbClient');
  const session = { tenantId: String(tenant.orgId), orgUuid: tenant.orgUuid, role: 'admin' };
  await runWithTenantScope({ ...session, source: 'request', caller: 'vault-fixture-posture' }, async () => {
    const q = new LazyRequestDbClient(getPool(), client => applySessionScope(client, session));
    try {
      const result = await q.query(`SELECT current_database() AS database, current_user AS role,
        r.rolsuper, r.rolbypassrls, current_setting('app.rls_enforce',true) AS enforcement,
        current_setting('app.current_tenant_id',true) AS tenant FROM pg_roles r WHERE r.rolname=current_user`);
      expect(result.rows).toEqual([{ database: decodeURIComponent(new URL(databaseUrl).pathname.slice(1)),
        role: 'app_service', rolsuper: false, rolbypassrls: false, enforcement: 'on', tenant: String(tenant.orgId) }]);
    } finally { await q.release(); }
  });
}

/** The intentional legacy writes are serial, transactional and confined to the new QA database. */
export async function withVaultLegacyLineageWrite<T>(owner: Pool, dropSuccessorIndex: boolean,
  write: (client: PoolClient) => Promise<T>): Promise<T> {
  await assertVaultFixtureDatabase(owner);
  await assertVaultLineageGuard(owner);
  const client = await owner.connect();
  const failures: unknown[] = [];
  let result: T | undefined;
  let rollbackFailed = false;
  try {
    await client.query('BEGIN');
    if (dropSuccessorIndex) await client.query('DROP INDEX vault.vault_documents_one_successor');
    await client.query('ALTER TABLE vault.documents DISABLE TRIGGER vault_documents_lineage_guard');
    result = await write(client);
    await client.query('ALTER TABLE vault.documents ENABLE TRIGGER vault_documents_lineage_guard');
    await client.query('COMMIT');
  } catch (error) {
    failures.push(error);
    try { await client.query('ROLLBACK'); }
    catch (rollbackError) {
      rollbackFailed = true;
      failures.push(rollbackError);
    }
  } finally {
    client.release(rollbackFailed);
    try {
      await owner.query('ALTER TABLE vault.documents ENABLE TRIGGER vault_documents_lineage_guard');
      await assertVaultLineageGuard(owner);
    }
    catch (restoreError) {
      failures.push(restoreError);
    }
  }
  if (failures.length > 1) throw new AggregateError(failures, 'Legacy setup or guard restoration failed.', { cause: failures[0] });
  if (failures.length) throw failures[0];
  return result as T;
}

export async function assertVaultLineageGuard(owner: Pool): Promise<void> {
  expect((await owner.query(`SELECT tgenabled FROM pg_trigger
    WHERE tgrelid='vault.documents'::regclass AND tgname='vault_documents_lineage_guard'`)).rows)
    .toEqual([{ tgenabled: 'O' }]);
}

export async function closeVaultFixtureRuntime(): Promise<void> {
  const { getPool } = await import('../../server/db');
  await getPool().end();
}
