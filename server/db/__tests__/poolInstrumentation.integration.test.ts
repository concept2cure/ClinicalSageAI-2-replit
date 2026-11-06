/**
 * Integration test for the tenant-scope enforcement PRIMITIVE added to
 * instrumentPool (server/db/poolInstrumentation.ts).
 *
 * `rlsPolicy.integration.test.ts` proves the 0021 policy filters correctly when
 * the session vars are set *by hand*. THIS test proves the primitive actually
 * sets them from the AsyncLocalStorage scope, end-to-end, over a real pooled
 * connection — and, most importantly, that the transaction-LOCAL `set_config`
 * does NOT leak a tenant onto a reused pooled connection (the one catastrophic
 * failure mode). Queries run through the shared `pool.query` with ZERO manual
 * set_config; the only tenant signal is `runWithTenantScope`.
 *
 * Runs only where a real non-superuser-capable Postgres is reachable (CI's
 * Integration Tests job). Skips with a note otherwise. Superuser BYPASSRLS, so
 * the pool connects then `SET ROLE`s into a throwaway non-superuser role.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

vi.unmock('pg');

import { Pool } from 'pg';
import { instrumentPool } from '../poolInstrumentation';
import { buildRlsStartupOptions } from '../rlsEnforcement';
import { runWithTenantScope } from '../tenantStore';
import type { RequestConnectable, RequestSqlClient } from '../requestDb';

const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const isSentinelTestUrl =
  databaseUrl === 'postgresql://test:test@localhost:5432/test' &&
  !process.env.RUN_INTEGRATION_TESTS;
const skip = !databaseUrl || isSentinelTestUrl;
const describeIfDb = skip ? describe.skip : describe;

if (skip) {
  console.warn('[pool-primitive-integration] skipping — set TEST_DATABASE_URL or DATABASE_URL to run');
}

// Byte-equal (modulo identifiers) to migrations/0021_enable_rls_everywhere.sql.
function policySql(table: string, col: string): string {
  return `
    CREATE POLICY tenant_isolation_policy ON ${table}
      FOR ALL
      USING (
        NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on'
        OR ${col} = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INT
        OR ${col} = substring(current_setting('app.current_org_id',    TRUE) from '^[0-9]+$')::INT
        OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
      )
      WITH CHECK (
        NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on'
        OR ${col} = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INT
        OR ${col} = substring(current_setting('app.current_org_id',    TRUE) from '^[0-9]+$')::INT
        OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
      )
  `;
}

describeIfDb('pool-instrumentation tenant-scope primitive — integration', () => {
  const suffix = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const TABLE = `rls_prim_int_${suffix}`;
  const ROLE = `rls_prim_role_${suffix}`;
  let setupPool: Pool; // superuser: DDL + fixtures + cleanup
  let pool: Pool; // instrumented, SET ROLE non-superuser, rls_enforce=on
  const prevEnforce = process.env.RLS_ENFORCE;

  beforeAll(async () => {
    setupPool = new Pool({ connectionString: databaseUrl });
    // Committed fixtures (NOT a temp table) so the instrumented pool's separate
    // connections can see them.
    await setupPool.query(`CREATE TABLE ${TABLE} (id SERIAL PRIMARY KEY, organization_id INTEGER NOT NULL, payload TEXT NOT NULL)`);
    await setupPool.query(`ALTER TABLE ${TABLE} ENABLE ROW LEVEL SECURITY`);
    await setupPool.query(`ALTER TABLE ${TABLE} FORCE ROW LEVEL SECURITY`);
    await setupPool.query(policySql(TABLE, 'organization_id'));
    await setupPool.query(`INSERT INTO ${TABLE} (organization_id, payload) VALUES (1, 'tenant-1-row'), (2, 'tenant-2-row')`);
    // Throwaway non-superuser role; grant table access so it can read/write
    // (RLS still filters — the role is not the table owner).
    await setupPool.query(`CREATE ROLE ${ROLE} NOLOGIN`);
    await setupPool.query(`GRANT SELECT, INSERT ON ${TABLE} TO ${ROLE}`);
    await setupPool.query(`GRANT USAGE, SELECT ON SEQUENCE ${TABLE}_id_seq TO ${ROLE}`);

    // The primitive only activates when RLS_ENFORCE=on (read at query time).
    process.env.RLS_ENFORCE = 'on';

    // max:1 → every query reuses the single physical connection, so the
    // no-leak assertion is meaningful.
    pool = new Pool({
      connectionString: databaseUrl,
      max: 1,
      // Both settings complete during the PostgreSQL startup handshake, before
      // the pool can expose the client to the first application query.
      options: buildRlsStartupOptions(process.env, `-c role=${ROLE}`),
    } as any);
    instrumentPool(pool); // the primitive under test
  });

  afterAll(async () => {
    if (pool) await pool.end();
    if (setupPool) {
      await setupPool.query(`DROP TABLE IF EXISTS ${TABLE}`);
      await setupPool.query(`DROP ROLE IF EXISTS ${ROLE}`);
      await setupPool.end();
    }
    if (prevEnforce === undefined) delete process.env.RLS_ENFORCE;
    else process.env.RLS_ENFORCE = prevEnforce;
  });

  it('exposes RLS enforcement to the first query on concurrent startup connections', async () => {
    const concurrent = new Pool({
      connectionString: databaseUrl,
      max: 4,
      options: buildRlsStartupOptions({ NODE_ENV: 'production', RLS_ENFORCE: 'on' }),
    } as any);
    try {
      const results = await Promise.all(Array.from({ length: 8 }, () =>
        concurrent.query("SELECT current_setting('app.rls_enforce', true) AS mode"),
      ));
      expect(results.every(result => result.rows[0]?.mode === 'on')).toBe(true);
    } finally {
      await concurrent.end();
    }
  });

  it('rejects malformed startup options before application SQL executes', async () => {
    const malformed = new Pool({ connectionString: databaseUrl, max: 1, options: '-c' } as any);
    try {
      await expect(malformed.query('SELECT 1')).rejects.toBeDefined();
    } finally {
      await malformed.end().catch(() => undefined);
    }
  });

  it('scope tenant 1 → sees only tenant-1 rows (vars applied automatically)', async () => {
    const rows = await runWithTenantScope(
      { tenantId: '1', source: 'job', caller: 'test' },
      () => pool.query(`SELECT payload FROM ${TABLE}`),
    );
    expect(rows.rowCount).toBe(1);
    expect(rows.rows[0].payload).toBe('tenant-1-row');
  });

  it('scope tenant 2 → sees only tenant-2 rows', async () => {
    const rows = await runWithTenantScope(
      { tenantId: '2', source: 'job', caller: 'test' },
      () => pool.query(`SELECT payload FROM ${TABLE}`),
    );
    expect(rows.rowCount).toBe(1);
    expect(rows.rows[0].payload).toBe('tenant-2-row');
  });

  it('super-admin scope → sees all rows', async () => {
    const rows = await runWithTenantScope(
      { tenantId: '0', role: 'app_super_admin', source: 'job', caller: 'test' },
      () => pool.query(`SELECT id FROM ${TABLE} ORDER BY id`),
    );
    expect(rows.rowCount).toBe(2);
  });

  it('NO-LEAK: rejects an unscoped query after scoped connection reuse', async () => {
    // Tenant 2 scope populates current_tenant_id LOCAL to its micro-transaction.
    await runWithTenantScope(
      { tenantId: '2', source: 'job', caller: 'test' },
      () => pool.query(`SELECT id FROM ${TABLE}`),
    );
    // Missing tenant context is rejected before SQL reaches the reused
    // connection; callers cannot mistake an empty RLS result for authorized
    // access or execute a policy-misconfigured table unscoped.
    await expect(pool.query(`SELECT id FROM ${TABLE}`)).rejects.toThrow(
      /requires an active tenant scope/,
    );
  });

  it('NO-LEAK: reused connection switches from tenant 2 to tenant 1', async () => {
    await runWithTenantScope(
      { tenantId: '2', source: 'job', caller: 'test' },
      () => pool.query(`SELECT id FROM ${TABLE}`),
    );
    const tenantOne = await runWithTenantScope(
      { tenantId: '1', source: 'job', caller: 'test' },
      () => pool.query(`SELECT organization_id FROM ${TABLE}`),
    );
    expect(tenantOne.rows).toEqual([{ organization_id: 1 }]);
  });

  it('WITH CHECK rejects an insert under a mismatched tenant scope', async () => {
    await expect(
      runWithTenantScope(
        { tenantId: '1', source: 'job', caller: 'test' },
        () => pool.query(`INSERT INTO ${TABLE} (organization_id, payload) VALUES (2, 'should-fail')`),
      ),
    ).rejects.toThrow(/row-level security/i);
  });
});

// Actual private-profile creators, on a separate disposable database. This does
// not migrate the shared fixture used by the live browser or alter app_service.
const ownerDatabaseUrl = process.env.DATABASE_OWNER_URL;
const appDatabaseUrl = process.env.APP_DATABASE_URL;
const describePrivateOwner = ownerDatabaseUrl && appDatabaseUrl ? describe : describe.skip;

describePrivateOwner('private profiles — native app_service owner boundary', () => {
  const databaseName = `private_profiles_${process.pid}_${Date.now()}`;
  const tables = ['user_intelligence_profiles', 'ana_relational_profiles'] as const;
  const creators = ['migrations/0013_ana_intelligence_system.sql', 'migrations/20260612_ana_relational_external_intel.sql'];
  let admin: Pool;
  let owner: Pool;
  let runtime: Pool;
  let sessions: Pool;
  let creatorSql: string[];
  const previousEnforce = process.env.RLS_ENFORCE;
  const previousAppUrl = process.env.APP_DATABASE_URL;
  const previousAuditKey = process.env.AUDIT_HMAC_KEY;
  let privateRuntimeImported = false;
  const asOwner = (accountId: number | null, sql: string, organizationId = 1) => runWithTenantScope(
    { tenantId: String(organizationId), accountId, source: 'request', caller: 'native-private-profile-proof' },
    () => runtime.query(sql),
  );

  beforeAll(async () => {
    const { readFile } = await import('node:fs/promises');
    const { resolve } = await import('node:path');
    creatorSql = await Promise.all(creators.map(file => readFile(resolve(process.cwd(), file), 'utf8')));
    admin = new Pool({ connectionString: ownerDatabaseUrl, max: 1 });
    await admin.query(`CREATE DATABASE ${databaseName}`);
    const ownerUrl = new URL(ownerDatabaseUrl!);
    const runtimeUrl = new URL(appDatabaseUrl!);
    ownerUrl.pathname = `/${databaseName}`;
    runtimeUrl.pathname = `/${databaseName}`;
    owner = new Pool({ connectionString: ownerUrl.toString(), max: 1 });
    await owner.query("CREATE TABLE organizations(id integer PRIMARY KEY,status text DEFAULT 'active'); CREATE TABLE users(id integer PRIMARY KEY,status text DEFAULT 'active'); CREATE TABLE projects(id integer PRIMARY KEY); CREATE TABLE organization_users(organization_id integer,user_id integer,role text)");
    await owner.query("INSERT INTO organizations(id) VALUES(1),(2); INSERT INTO users(id) VALUES(7),(8),(9); INSERT INTO projects VALUES(1); INSERT INTO organization_users VALUES(1,7,'member'),(1,8,'admin'),(2,9,'member')");
    for (const sql of creatorSql) await owner.query(sql);
    await owner.query(await readFile(resolve(process.cwd(), 'migrations/20261022_ana_skills.sql'), 'utf8'));
    await owner.query(await readFile(resolve(process.cwd(), 'migrations/20261022c_ana_project_skills.sql'), 'utf8'));
    const { AUDIT_LOGS_PGLITE_DDL } = await import('../pglite-harness');
    await owner.query(AUDIT_LOGS_PGLITE_DDL);
    await owner.query('ALTER TABLE audit_logs ADD COLUMN chain_seq bigserial');
    await owner.query("INSERT INTO user_intelligence_profiles(user_id,organization_id,personal_instructions) VALUES(7,1,'owner-seven-secret'),(8,1,'owner-eight-secret'),(9,2,'other-tenant-secret')");
    await owner.query("INSERT INTO ana_relational_profiles(user_id,organization_id,profile_summary) VALUES(7,1,'owner-seven-secret'),(8,1,'owner-eight-secret'),(9,2,'other-tenant-secret')");
    const appRole = decodeURIComponent(runtimeUrl.username);
    if (!/^[a-z_][a-z0-9_]*$/.test(appRole)) throw new Error('Invalid fixture runtime role');
    await owner.query(`GRANT USAGE ON SCHEMA public TO ${appRole}; GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${appRole}; GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${appRole}`);
    process.env.RLS_ENFORCE = 'on';
    const options = buildRlsStartupOptions({ NODE_ENV: 'production', RLS_ENFORCE: 'on' });
    const runtimeConfig = { connectionString: runtimeUrl.toString(), max: 1, options };
    process.env.APP_DATABASE_URL = runtimeUrl.toString();
    process.env.AUDIT_HMAC_KEY ||= 'private-native-fixture-key-not-production';
    sessions = new Pool(runtimeConfig);
    runtime = new Pool(runtimeConfig);
    instrumentPool(runtime);
  }, 30000);

  afterAll(async () => {
    if (privateRuntimeImported) await (await import('../runtime')).getPool().end();
    await runtime?.end();
    await sessions?.end();
    await owner?.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS ${databaseName}`);
      await admin.end();
    }
    if (previousEnforce === undefined) delete process.env.RLS_ENFORCE;
    else process.env.RLS_ENFORCE = previousEnforce;
    if (previousAppUrl === undefined) delete process.env.APP_DATABASE_URL;
    else process.env.APP_DATABASE_URL = previousAppUrl;
    if (previousAuditKey === undefined) delete process.env.AUDIT_HMAC_KEY;
    else process.env.AUDIT_HMAC_KEY = previousAuditKey;
  });

  it('uses a real non-superuser, non-bypass runtime role and FORCE RLS', async () => {
    const role = await asOwner(7, 'SELECT current_user, rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user');
    expect(role.rows[0]).toMatchObject({ current_user: 'app_service', rolsuper: false, rolbypassrls: false });
    const state = await owner.query('SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname=ANY($1)', [tables]);
    expect(state.rows).toHaveLength(2);
    expect(state.rows.every(row => row.relrowsecurity && row.relforcerowsecurity)).toBe(true);
  });

  it.each(tables)('%s admits only its owner within the tenant, including trusted owner-targeted reads', async table => {
    expect((await asOwner(7, `SELECT user_id FROM ${table} ORDER BY user_id`)).rows).toEqual([{ user_id: 7 }]);
    expect((await asOwner(8, `SELECT user_id FROM ${table} ORDER BY user_id`)).rows).toEqual([{ user_id: 8 }]);
    expect((await runWithTenantScope({ tenantId: '1', accountId: 7, source: 'job', caller: 'trusted-owner-target' }, () => runtime.query(`SELECT user_id FROM ${table}`))).rows).toEqual([{ user_id: 7 }]);
    expect((await asOwner(7, `SELECT user_id FROM ${table}`, 2)).rows).toEqual([]);
    expect((await asOwner(9, `SELECT user_id FROM ${table}`, 2)).rows).toEqual([{ user_id: 9 }]);
  });

  it.each(tables)('%s refuses same-tenant forged writes and owner reassignment', async table => {
    expect((await asOwner(7, `UPDATE ${table} SET organization_id=1 WHERE user_id=8`)).rowCount).toBe(0);
    expect((await asOwner(7, `DELETE FROM ${table} WHERE user_id=8`)).rowCount).toBe(0);
    await expect(asOwner(7, `INSERT INTO ${table}(user_id,organization_id) VALUES(8,1)`)).rejects.toMatchObject({ code: '42501' });
    await expect(asOwner(7, `INSERT INTO ${table}(user_id,organization_id) VALUES(8,2)`)).rejects.toMatchObject({ code: '42501' });
    await expect(asOwner(7, `UPDATE ${table} SET user_id=8 WHERE user_id=7`)).rejects.toMatchObject({ code: '42501' });
    expect((await asOwner(7, `UPDATE ${table} SET updated_at=now() WHERE user_id=7`)).rowCount).toBe(1);
  });

  it.each(tables)('%s denies unknown/missing owners after pooled connection reuse', async table => {
    const first = await asOwner(7, `SELECT pg_backend_pid() AS pid, user_id FROM ${table}`);
    const second = await asOwner(8, `SELECT pg_backend_pid() AS pid, user_id FROM ${table}`);
    expect(first.rows[0].pid).toBe(second.rows[0].pid);
    expect(second.rows[0].user_id).toBe(8);
    expect((await asOwner(null, `SELECT user_id FROM ${table}`)).rows).toEqual([]);
    expect((await asOwner(999, `SELECT user_id FROM ${table}`)).rows).toEqual([]);
    const unbound = await asOwner(null, "SELECT current_setting('app.current_account_id',true) AS owner");
    expect(unbound.rows).toEqual([{ owner: '' }]);
  });

  it('session-level owner is cleared before the next borrower of the physical connection', async () => {
    const { applySessionScope, clearSessionScope } = await import('../sessionScope');
    const client = await sessions.connect();
    let firstPid: number;
    try {
      await applySessionScope(client, { tenantId: '1', accountId: 7 });
      const result = await client.query('SELECT pg_backend_pid() AS pid,user_id FROM ana_relational_profiles');
      firstPid = result.rows[0].pid;
      expect(result.rows[0].user_id).toBe(7);
      await clearSessionScope(client);
    } finally { client.release(); }
    const reused = await sessions.connect();
    try {
      const result = await reused.query("SELECT pg_backend_pid() AS pid, current_setting('app.current_account_id',true) AS owner");
      expect(result.rows).toEqual([{ pid: firstPid!, owner: '' }]);
      expect((await reused.query('SELECT user_id FROM ana_relational_profiles')).rows).toEqual([]);
      await applySessionScope(reused, { tenantId: '1', accountId: 8 });
      expect((await reused.query('SELECT user_id FROM ana_relational_profiles')).rows).toEqual([{ user_id: 8 }]);
      await clearSessionScope(reused);
    } finally { reused.release(); }
  });

  it.each(tables)('%s cannot OR-bypass owner privacy through permissive policies, switches or the platform role', async table => {
    await owner.query(`CREATE POLICY broad_legacy_tenant_read ON ${table} USING(true) WITH CHECK(true)`);
    expect((await asOwner(7, `SELECT user_id FROM ${table}`)).rows).toEqual([{ user_id: 7 }]);
    const client = await sessions.connect();
    try {
      await client.query("SELECT set_config('app.current_tenant_id','1',false),set_config('app.current_account_id','7',false),set_config('app.current_user_role','app_super_admin',false),set_config('app.rls_enforce','off',false)");
      expect((await client.query(`SELECT user_id FROM ${table}`)).rows).toEqual([{ user_id: 7 }]);
      await client.query("SELECT set_config('app.current_tenant_id','0',false),set_config('app.current_account_id','',false),set_config('app.current_user_role','app_super_admin',false),set_config('app.rls_enforce','off',false)");
      expect((await client.query(`SELECT user_id FROM ${table}`)).rows).toEqual([]);
    } finally {
      const { clearSessionScope } = await import('../sessionScope');
      await clearSessionScope(client);
      client.release();
    }
  });

  it('actual creators replay twice and restore disabled RLS and drifted owner expressions without rewriting data', async () => {
    for (const table of tables) {
      await owner.query(`ALTER TABLE ${table} DISABLE ROW LEVEL SECURITY; ALTER TABLE ${table} NO FORCE ROW LEVEL SECURITY; ALTER POLICY ${table}_owner_boundary ON ${table} USING(true) WITH CHECK(true)`);
    }
    for (let replay = 0; replay < 2; replay++) for (const sql of creatorSql) await owner.query(sql);
    for (const table of tables) {
      expect((await asOwner(7, `SELECT user_id FROM ${table}`)).rows).toEqual([{ user_id: 7 }]);
      expect((await asOwner(null, `SELECT user_id FROM ${table}`)).rows).toEqual([]);
      expect((await owner.query(`SELECT count(*)::integer AS n FROM ${table}`)).rows).toEqual([{ n: 3 }]);
    }
    const state = await owner.query('SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE relname=ANY($1)', [tables]);
    expect(state.rows.every(row => row.relrowsecurity && row.relforcerowsecurity)).toBe(true);
  });

  it('converges an existing profile substrate without owner uniqueness before the private upsert runs', async () => {
    // An older Drizzle-created table lacked the owner identity index. The
    // creator must converge that existing table, rather than only fresh DDL.
    await owner.query('ALTER TABLE user_intelligence_profiles DROP CONSTRAINT user_intelligence_profiles_user_id_organization_id_key');
    await expect(asOwner(7, 'INSERT INTO user_intelligence_profiles(user_id,organization_id) VALUES(7,1) ON CONFLICT(user_id,organization_id) DO NOTHING'))
      .rejects.toMatchObject({ code: '42P10' });
    for (let replay = 0; replay < 2; replay++) await owner.query(creatorSql[0]);
    expect((await asOwner(7, 'INSERT INTO user_intelligence_profiles(user_id,organization_id) VALUES(7,1) ON CONFLICT(user_id,organization_id) DO NOTHING')).rowCount).toBe(0);
    expect((await owner.query('SELECT count(*)::integer AS n FROM user_intelligence_profiles')).rows).toEqual([{ n: 3 }]);
    expect((await asOwner(8, 'SELECT user_id FROM user_intelligence_profiles')).rows).toEqual([{ user_id: 8 }]);
  });

  describe('owner-private rule lifecycle on actual native SQL', () => {
    const createAction = () => ({ action: 'create_rule' as const, intentId: crypto.randomUUID(), reason: 'Private reason OWNER_REASON_CANARY.',
      rule: { name: 'OWNER_NAME_CANARY', instructions: 'Apply OWNER_INSTRUCTION_CANARY to my own work.', level: 'soft' as const, conflictKey: 'user.private-style' },
      correction: { text: 'Use OWNER_CORRECTION_CANARY for my working preferences.', agency: 'FDA', documentType: 'other', intent: 'fix' } });
    async function privateService() {
      privateRuntimeImported = true;
      return import('../../services/ana-context-router');
    }
    async function inPrivateScope<T>(accountId: number, work: (client: RequestConnectable) => Promise<T>,
      options: { databaseAccount?: number; auditFail?: boolean; loseCommit?: boolean; commitNeverSent?: boolean } = {}): Promise<T> {
      const { applySessionScope, clearSessionScope } = await import('../sessionScope');
      const physical = await sessions.connect(); let discarded = false; let commitLost = false;
      await applySessionScope(physical, { tenantId: '1', accountId: options.databaseAccount ?? accountId });
      const query: RequestSqlClient['query'] = async (sql, params) => {
        if (options.auditFail && /INSERT INTO audit_logs/.test(sql)) throw new Error('fixture private audit refused');
        if (options.commitNeverSent && sql === 'COMMIT') throw new Error('fixture commit was not sent');
        const result = await physical.query(sql, params);
        if (options.loseCommit && !commitLost && sql === 'COMMIT') { commitLost = true; throw new Error('fixture commit acknowledgement lost'); }
        return result;
      };
      const client: RequestConnectable = { query, connect: async () => ({ query, release: error => {
        if (error && !discarded) { discarded = true; physical.release(error); }
      } }) };
      try {
        return await runWithTenantScope({ tenantId: '1', accountId, source: 'request', caller: 'private-native-lifecycle' }, () => work(client));
      } finally {
        if (!discarded) { await clearSessionScope(physical); physical.release(); }
      }
    }
    beforeEach(async () => {
      await owner.query("UPDATE user_intelligence_profiles SET workflow_preferences='{}'::jsonb WHERE organization_id=1");
      await owner.query('DELETE FROM audit_logs');
    });

    it('captures a real private correction, versions edits and revocation, and leaves only hashes in shared audit', async () => {
      const service = await privateService(); const action = createAction();
      const created = await inPrivateScope(7, client => service.writePrivateUserRule(client, 1, 7, action));
      const first = created.privateRules.rules[0];
      expect(created).toMatchObject({ audited: true, replayed: false, privateRules: { revision: 1, promptUse: 'protected_turns_only' } });
      expect(first).toMatchObject({ scope: 'user', state: 'active', version: 1, name: action.rule.name });
      const updated = await inPrivateScope(7, client => service.writePrivateUserRule(client, 1, 7,
        { action: 'update_rule', intentId: crypto.randomUUID(), reason: 'Update my own private method.', ruleId: first.ruleId, expectedVersion: 1,
          rule: { ...action.rule, instructions: 'My next task follows OWNER_EDIT_CANARY.' } }));
      expect(updated.privateRules.rules[0]).toMatchObject({ version: 2, instructions: 'My next task follows OWNER_EDIT_CANARY.', source: first.source });
      const revoked = await inPrivateScope(7, client => service.writePrivateUserRule(client, 1, 7,
        { action: 'revoke_rule', intentId: crypto.randomUUID(), reason: 'Explicitly retire my own private method.', ruleId: first.ruleId, expectedVersion: 2 }));
      expect(revoked.privateRules.rules[0]).toMatchObject({ state: 'revoked', version: 3 });
      const audits = await owner.query('SELECT action,new_values,reason,sha256_chain,hmac_seal FROM audit_logs ORDER BY chain_seq');
      expect(audits.rows.map(row => row.action)).toEqual(['ana_correction.recorded', 'ana_rule.created', 'ana_rule.updated', 'ana_rule.revoked']);
      expect(audits.rows.every(row => row.sha256_chain && row.hmac_seal)).toBe(true);
      expect(JSON.stringify(audits.rows)).not.toMatch(/OWNER_(NAME|INSTRUCTION|CORRECTION|REASON|EDIT)_CANARY/);
      const stored = await owner.query('SELECT workflow_preferences FROM user_intelligence_profiles WHERE user_id=7 AND organization_id=1');
      expect(JSON.stringify(stored.rows)).toContain('OWNER_CORRECTION_CANARY');
      expect(JSON.stringify(stored.rows)).toContain('OWNER_REASON_CANARY');
      expect((await inPrivateScope(8, client => service.readPrivateUserRuleLedger(client, 1, 8))).rules).toEqual([]);
      await expect(inPrivateScope(8, client => service.readPrivateUserRuleLedger(client, 1, 7))).rejects.toMatchObject({ code: 'PRIVATE_OWNER_REQUIRED' });
    });

    it('serves real owner profile CRUD through its existing HTTP routes and denies coworker/admin targeting', async () => {
      const [{ default: express }, { default: request }, { default: router }] = await Promise.all([
        import('express'), import('supertest'), import('../../routes/client-intelligence'),
      ]);
      const call = (userId: number, method: 'get' | 'post', body?: string | object, query = '') => inPrivateScope(userId, async client => {
        const app = express(); app.use(express.json());
        app.use((req, _res, next) => {
          Object.assign(req, { user: { id: userId, organizationId: 1, role: 'admin' }, dbClient: client });
          runWithTenantScope({ tenantId: '1', accountId: userId, source: 'request', caller: 'private-profile-http' }, next);
        });
        app.use('/api/client-intelligence', router);
        const pending = request(app)[method](`/api/client-intelligence/ana/user-profile${query}`);
        return body === undefined ? pending : pending.send(body);
      });
      const action = createAction(); const created = await call(7, 'post', action);
      expect(created.status, JSON.stringify(created.body)).toBe(200);
      const ruleId = created.body.privateRules.rules[0].ruleId;
      const own = await call(7, 'get');
      expect(own.status).toBe(200); expect(own.body.privateRules.rules[0].ruleId).toBe(ruleId);
      expect(own.body.profile.userId).toBe(7);
      const coworker = await call(8, 'get', undefined, '?userId=7&user_id=7');
      expect(coworker.status).toBe(200); expect(coworker.body.privateRules.rules).toEqual([]);
      expect(JSON.stringify(coworker.body)).not.toContain('OWNER_');
      const forged = await call(8, 'post', { action: 'revoke_rule', intentId: crypto.randomUUID(), reason: 'Try to revoke a coworker rule.', ruleId, expectedVersion: 1 });
      expect(forged.status).toBe(404);
      expect((await call(7, 'post', { ...action, userId: 8 })).status).toBe(422);
      await owner.query('DELETE FROM organization_users WHERE organization_id=1 AND user_id=7');
      try { expect((await call(7, 'get')).status).toBe(403); }
      finally { await owner.query("INSERT INTO organization_users VALUES(1,7,'member')"); }
    }, 30000);

    it('deduplicates scoped intents by exact raw canonical payload and reconciles a lost commit on a fresh connection', async () => {
      const service = await privateService(); const action = createAction();
      const created = await inPrivateScope(7, client => service.writePrivateUserRule(client, 1, 7, action), { loseCommit: true });
      expect(created).toMatchObject({ audited: true, replayed: true, privateRules: { revision: 1 } });
      const repeated = await inPrivateScope(7, client => service.writePrivateUserRule(client, 1, 7, action));
      expect(repeated.privateRules.rules).toEqual(created.privateRules.rules);
      expect(repeated.replayed).toBe(true);
      await expect(inPrivateScope(7, client => service.writePrivateUserRule(client, 1, 7,
        { ...action, reason: 'Changed payload for the same immutable intent.' }))).rejects.toMatchObject({ code: 'PRIVATE_INTENT_REUSED' });
      expect((await owner.query('SELECT count(*)::integer AS n FROM audit_logs')).rows).toEqual([{ n: 2 }]);
      const { createHash } = await import('node:crypto'); const { stableStringify } = await import('../../../shared/canonical-json');
      expect(created.privateRules.receipts[0].payloadSha256).toBe(createHash('sha256').update(stableStringify(action)).digest('hex'));
    });

    it('serializes real concurrent writers: one scoped intent records once and stale competing edits cannot overwrite it', async () => {
      const service = await privateService(); const action = createAction();
      const { withTenantConnection } = await import('../withTenantConnection');
      const write = (input: unknown) => withTenantConnection({ tenantId: 1, accountId: 7, source: 'request', caller: 'private-rule-concurrency' }, async client => {
        const query: RequestSqlClient['query'] = (sql, params) => client.query(sql, params);
        return service.writePrivateUserRule({ query, connect: async () => ({ query, release: () => undefined }) }, 1, 7, input);
      });
      const created = await Promise.all([write(action), write(action)]);
      expect(created.map(result => result.replayed).sort()).toEqual([false, true]);
      expect((await owner.query('SELECT count(*)::integer AS n FROM audit_logs')).rows).toEqual([{ n: 2 }]);
      const rule = created[0].privateRules.rules[0];
      const edits = await Promise.allSettled(['First competing change.', 'Second competing change.'].map(instructions => write({
        action: 'update_rule', intentId: crypto.randomUUID(), reason: 'Concurrent human change with current expected version.',
        ruleId: rule.ruleId, expectedVersion: 1, rule: { ...action.rule, instructions },
      })));
      expect(edits.filter(result => result.status === 'fulfilled')).toHaveLength(1);
      const refused = edits.find(result => result.status === 'rejected');
      if (refused?.status !== 'rejected') throw new Error('Expected one stale concurrent edit refusal');
      expect(refused.reason).toMatchObject({ code: 'PRIVATE_RULE_VERSION_CHANGED' });
      const current = await inPrivateScope(7, client => service.readPrivateUserRuleLedger(client, 1, 7));
      expect(current).toMatchObject({ revision: 2, rules: [{ version: 2 }] });
      expect((await owner.query('SELECT count(*)::integer AS n FROM audit_logs')).rows).toEqual([{ n: 3 }]);
    });

    it('holds an unconfirmed intent without recording it, then permits only an explicit same-intent retry', async () => {
      const service = await privateService(); const action = createAction();
      await expect(inPrivateScope(7, client => service.writePrivateUserRule(client, 1, 7, action), { commitNeverSent: true }))
        .rejects.toMatchObject({ code: 'PRIVATE_RULE_OUTCOME_UNKNOWN' });
      expect((await inPrivateScope(7, client => service.readPrivateUserRuleLedger(client, 1, 7))).receipts).toEqual([]);
      const retried = await inPrivateScope(7, client => service.writePrivateUserRule(client, 1, 7, action));
      expect(retried.privateRules.revision).toBe(1);
    });

    it('rolls back correction, rule, profile receipt and audit atomically on audit failure', async () => {
      const service = await privateService();
      await expect(inPrivateScope(7, client => service.writePrivateUserRule(client, 1, 7, createAction()), { auditFail: true })).rejects.toThrow('fixture private audit refused');
      expect((await inPrivateScope(7, client => service.readPrivateUserRuleLedger(client, 1, 7))).rules).toEqual([]);
      expect((await owner.query('SELECT count(*)::integer AS n FROM audit_logs')).rows).toEqual([{ n: 0 }]);
    });

    it('preserves the reserved ledger through ordinary atomic profile edits and refuses an attempted replacement', async () => {
      const service = await privateService(); const action = createAction();
      const original = await inPrivateScope(7, client => service.writePrivateUserRule(client, 1, 7, action));
      await inPrivateScope(7, client => service.upsertUserProfile(7, 1, { displayName: 'My own profile', workflowPreferences: { layout: 'compact' } }, client));
      expect((await inPrivateScope(7, client => service.readPrivateUserRuleLedger(client, 1, 7))).rules).toEqual(original.privateRules.rules);
      await expect(inPrivateScope(7, client => service.upsertUserProfile(7, 1, { workflowPreferences: { annaRulesV1: {} } }, client)))
        .rejects.toMatchObject({ code: 'PRIVATE_RULE_RESERVED' });
      await expect(inPrivateScope(7, client => service.readPrivateUserRuleLedger(client, 1, 7), { databaseAccount: 8 })).rejects.toMatchObject({ code: 'PRIVATE_OWNER_REQUIRED' });
    });

    it('binds private hard gates to owner/version hashes without exposing instructions, and refuses demotion or stale edits', async () => {
      const service = await privateService(); const action = createAction();
      const hard = { ...action, rule: { ...action.rule, level: 'hard_gate' as const,
        policyBindings: [{ policyType: 'requires_approval' as const, enforcement: 'mandatory' as const,
          toolName: 'check_dossier_consistency', description: 'OWNER_BINDING_CANARY requires my approval.' }] } };
      const created = await inPrivateScope(7, client => service.writePrivateUserRule(client, 1, 7, hard));
      const rule = created.privateRules.rules[0];
      const gates = await inPrivateScope(7, client => service.readPrivateUserRuleGates(client, 1, 7));
      expect(gates.rules[0]).toMatchObject({ ruleId: rule.ruleId, version: 1, toolName: 'check_dossier_consistency' });
      expect(JSON.stringify(gates)).not.toContain('OWNER_');
      const { loadMandatorySkillGates } = await import('../../services/account-skill-bundles');
      const { classifyToolCall, validateHeldSkillApproval, skillPolicyApprovalFor } = await import('../../services/ana/governed-tool-gate');
      const combined = await inPrivateScope(7, client => loadMandatorySkillGates(client, 1, null, 7));
      expect(JSON.stringify(combined)).not.toContain('OWNER_');
      const call = { name: 'check_dossier_consistency', input: {} };
      const snapshot = { organizationId: 1, userId: 7, projectId: null, ...combined };
      expect(classifyToolCall(call, snapshot)).toMatchObject({ kind: 'NEEDS_APPROVAL' });
      const approval = skillPolicyApprovalFor(call, snapshot);
      if (!approval) throw new Error('Expected the actual private mandatory policy');
      const held = await inPrivateScope(7, client => validateHeldSkillApproval({ organizationId: 1, userId: 7, sqlClient: client }, call));
      expect(held).toMatchObject({ code: 'SKILL_POLICY_CHANGED', status: 409 });
      const allowed = await inPrivateScope(7, client => validateHeldSkillApproval({ organizationId: 1, userId: 7, sqlClient: client }, call, approval));
      expect(allowed).toHaveProperty('gates');
      expect((await inPrivateScope(8, client => service.readPrivateUserRuleGates(client, 1, 8))).rules).toEqual([]);
      await expect(inPrivateScope(7, client => service.writePrivateUserRule(client, 1, 7,
        { action: 'update_rule', intentId: crypto.randomUUID(), reason: 'Attempt to soften a mandatory guard.', ruleId: rule.ruleId, expectedVersion: 1, rule: action.rule })))
        .rejects.toMatchObject({ code: 'PRIVATE_RULE_DEMOTION_REFUSED' });
      await expect(inPrivateScope(7, client => service.writePrivateUserRule(client, 1, 7,
        { action: 'revoke_rule', intentId: crypto.randomUUID(), reason: 'Wrong expected private rule version.', ruleId: rule.ruleId, expectedVersion: 9 })))
        .rejects.toMatchObject({ code: 'PRIVATE_RULE_VERSION_CHANGED' });
      await inPrivateScope(7, client => service.writePrivateUserRule(client, 1, 7,
        { action: 'revoke_rule', intentId: crypto.randomUUID(), reason: 'Explicitly revoke my mandatory guard.', ruleId: rule.ruleId, expectedVersion: 1 }));
      const revoked = await inPrivateScope(7, client => service.readPrivateUserRuleGates(client, 1, 7));
      expect(revoked.rules).toEqual([]); expect(revoked.ruleHash).not.toBe(gates.ruleHash);
      const stale = await inPrivateScope(7, client => validateHeldSkillApproval({ organizationId: 1, userId: 7, sqlClient: client }, call, approval));
      expect(stale).toMatchObject({ code: 'SKILL_POLICY_CHANGED', status: 409 });
    });

    it('issues only opaque owner context receipts, rejects serialized/foreign authority and invalidates a changed private snapshot', async () => {
      const service = await privateService(); const action = createAction();
      const created = await inPrivateScope(7, client => service.writePrivateUserRule(client, 1, 7, action));
      const rule = created.privateRules.rules[0];
      const receipt = await inPrivateScope(7, client => service.issuePrivateRuleContextReceipt(client, 1, 7));
      expect(receipt).toMatchObject({ organizationId: 1, ownerUserId: 7, revision: 1, promptUse: 'protected_turns_only',
        ruleRefs: [{ ruleId: rule.ruleId, version: 1, sourceAuditEventId: rule.source.sourceAuditEventId }] });
      expect(JSON.stringify(receipt)).not.toContain('OWNER_');
      expect(Object.isFrozen(receipt)).toBe(true); expect(Object.isFrozen(receipt.ruleRefs)).toBe(true);
      await expect(inPrivateScope(7, client => service.validatePrivateRuleContextReceipt(client, JSON.parse(JSON.stringify(receipt)), { organizationId: 1, userId: 7 })))
        .rejects.toMatchObject({ code: 'PRIVATE_CONTEXT_UNVERIFIED' });
      await expect(inPrivateScope(8, client => service.validatePrivateRuleContextReceipt(client, receipt, { organizationId: 1, userId: 8 })))
        .rejects.toMatchObject({ code: 'PRIVATE_CONTEXT_UNVERIFIED' });
      expect(await inPrivateScope(7, client => service.validatePrivateRuleContextReceipt(client, receipt, { organizationId: 1, userId: 7 }))).toBe(receipt);
      await inPrivateScope(7, client => service.writePrivateUserRule(client, 1, 7, { action: 'revoke_rule', intentId: crypto.randomUUID(),
        reason: 'Revoke before any private context expansion.', ruleId: rule.ruleId, expectedVersion: 1 }));
      await expect(inPrivateScope(7, client => service.validatePrivateRuleContextReceipt(client, receipt, { organizationId: 1, userId: 7 })))
        .rejects.toMatchObject({ code: 'PRIVATE_CONTEXT_CHANGED' });
    });

    it('requires exact-version conflict decisions and detects erased or SQL-mutated private rule state', async () => {
      const service = await privateService(); const action = createAction();
      const first = await inPrivateScope(7, client => service.writePrivateUserRule(client, 1, 7, action));
      const prior = first.privateRules.rules[0];
      await expect(inPrivateScope(7, client => service.writePrivateUserRule(client, 1, 7, createAction()))).rejects.toMatchObject({ code: 'PRIVATE_RULE_CONFLICT' });
      const replacement = createAction();
      const replaced = await inPrivateScope(7, client => service.writePrivateUserRule(client, 1, 7,
        { ...replacement, rule: { ...replacement.rule, supersedes: [{ ruleId: prior.ruleId, version: prior.version }] } }));
      expect(replaced.privateRules.rules.map(rule => rule.state).sort()).toEqual(['active', 'superseded']);
      await owner.query("UPDATE user_intelligence_profiles SET workflow_preferences=jsonb_set(workflow_preferences,'{annaRulesV1,rules,1,instructions}','\"Unrecorded SQL edit\"'::jsonb) WHERE user_id=7 AND organization_id=1");
      await expect(inPrivateScope(7, client => service.readPrivateUserRuleGates(client, 1, 7))).rejects.toMatchObject({ code: 'PRIVATE_RULE_UNVERIFIED' });
      await owner.query("UPDATE user_intelligence_profiles SET workflow_preferences='{}'::jsonb WHERE user_id=7 AND organization_id=1");
      await expect(inPrivateScope(7, client => service.readPrivateUserRuleGates(client, 1, 7))).rejects.toMatchObject({ code: 'PRIVATE_RULE_UNVERIFIED' });
    });
  });

});
