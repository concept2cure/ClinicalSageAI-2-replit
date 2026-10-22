/**
 * An administrator's cancel of a colleague's AnA run and its chained audit
 * row, one transaction, on a real PostgreSQL server with RLS enforcing, as the
 * runtime role (AnA detach DT3 review, DP-82).
 *
 * The cancel used to land first and the audit row followed on its own
 * connection, its loss swallowed into a 200. run-control.ts
 * cancelAsAdministrator now writes the cancel and writeChainedAuditRow on the
 * same transaction client, and a refused row rolls the cancel back. PGlite
 * (run-control-detach.pglite.test.ts) holds the statement order; this holds
 * that the real chained write — the per-tenant chain position, the seal when
 * configured, the reason column — succeeds inside the cancel's transaction under the tenant
 * policy, and that a row the database refuses leaves the run as it was.
 *
 * Built by deploy-migrate (the CI-shaped database).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { databaseUrl } from '../../../../tests/setup.db';
import { instrumentPool } from '../../../db/poolInstrumentation';
import { runWithTenantScope } from '../../../db/tenantStore';
import { applyControl, beginRun, _resetLocalRunsForTest } from '../run-control';

const ORG = 93_801;
const ASKER = 93_811;
const ADMIN = 93_812;
const TAG = `dt3adm_${process.pid}_${Date.now().toString(36)}`;
const REASON = 'Stopping a turn that is drafting for the wrong agency.';

const appUrl = process.env.APP_DATABASE_URL;
let owner: Pool;
let app: Pool;

const asRequest = <T>(fn: () => Promise<T>) =>
  runWithTenantScope({ tenantId: String(ORG), role: null, source: 'request', caller: 'dbtest' }, fn);

const auditRows = async (runId: string) =>
  (
    await owner.query(
      `SELECT action, tenant_id, user_id, reason, new_values, sha256_chain, hmac_seal
         FROM audit_logs WHERE record_id = $1 ORDER BY occurred_at`,
      [runId],
    )
  ).rows;

beforeAll(async () => {
  expect(appUrl, 'APP_DATABASE_URL names the runtime role (CI sets it)').toBeTruthy();
  owner = new Pool({ connectionString: databaseUrl, max: 2 });
  app = instrumentPool(
    new Pool({ connectionString: appUrl, max: 4, options: '-c app.rls_enforce=on' } as ConstructorParameters<typeof Pool>[0]),
  );
  await owner.query(`INSERT INTO organizations (id, name, slug) VALUES ($1, $2, $2) ON CONFLICT (id) DO NOTHING`, [ORG, `${TAG}-${ORG}`]);
  for (const id of [ASKER, ADMIN]) {
    await owner.query(
      `INSERT INTO users (id, email, name, password_hash) VALUES ($1, $2, $2, 'x') ON CONFLICT (id) DO NOTHING`,
      [id, `${TAG}-${id}@example.invalid`],
    );
  }
});

afterEach(async () => {
  _resetLocalRunsForTest();
  await owner.query(`DELETE FROM ana_runs WHERE organization_id = $1`, [ORG]);
});

afterAll(async () => {
  if (!owner) return;
  await owner.query(`DELETE FROM ana_runs WHERE organization_id = $1`, [ORG]);
  await app?.end();
  await owner.end();
});

describe("an administrator's cancel and its chained audit row, one transaction, under RLS (DT3 review)", () => {
  it('lands with its chained row: the administrator, whose run, the reason, sealed on the tenant chain', async () => {
    const { runId } = await asRequest(() => beginRun({ pool: app, organizationId: ORG, userId: ASKER, surface: 'dbtest' }));
    const result = await asRequest(() =>
      applyControl({ pool: app, runId, organizationId: ORG, userId: ADMIN, action: 'cancel', callerIsAdmin: true, reason: REASON }),
    );
    expect(result).toMatchObject({ ok: true, status: 'cancelled', byRole: 'admin' });
    const { rows } = await owner.query(`SELECT status, stopped_reason, control_events FROM ana_runs WHERE id = $1`, [runId]);
    expect(rows[0]).toMatchObject({ status: 'cancelled', stopped_reason: 'admin_cancelled' });
    expect(rows[0].control_events).toEqual([expect.objectContaining({ action: 'cancel', byUserId: ADMIN, byRole: 'admin', reason: REASON })]);
    const audit = await auditRows(runId);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ action: 'ana.run.admin_cancelled', tenant_id: ORG, user_id: ADMIN, reason: REASON });
    const details = typeof audit[0].new_values === 'string' ? JSON.parse(audit[0].new_values) : audit[0].new_values;
    expect(details).toMatchObject({ runId, byRole: 'admin', stoppedReason: 'admin_cancelled', ownerUserId: ASKER, reason: REASON });
    // On the tenant's chain; sealed when the deployment configures the seal (AUDIT_HMAC_KEY is opt-in).
    expect(audit[0].sha256_chain).toMatch(/^[0-9a-f]{64}$/);
    expect(Boolean(audit[0].hmac_seal)).toBe(Boolean(process.env.AUDIT_HMAC_KEY));
  });

  it('a row the database refuses rolls the cancel back: the run goes on, with no control event', async () => {
    const { runId } = await asRequest(() => beginRun({ pool: app, organizationId: ORG, userId: ASKER, surface: 'dbtest' }));
    const fn = `dbtest_refuse_${TAG}`;
    await owner.query(`CREATE FUNCTION ${fn}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'dbtest: audit row refused'; END $$`);
    await owner.query(
      `CREATE TRIGGER ${fn} BEFORE INSERT ON audit_logs FOR EACH ROW WHEN (NEW.record_id = '${runId}') EXECUTE FUNCTION ${fn}()`,
    );
    try {
      const result = await asRequest(() =>
        applyControl({ pool: app, runId, organizationId: ORG, userId: ADMIN, action: 'cancel', callerIsAdmin: true, reason: REASON }),
      );
      expect(result).toMatchObject({ ok: false, code: 'AUDIT_REFUSED', status: 'running' });
    } finally {
      await owner.query(`DROP TRIGGER IF EXISTS ${fn} ON audit_logs`);
      await owner.query(`DROP FUNCTION IF EXISTS ${fn}()`);
    }
    const { rows } = await owner.query(`SELECT status, stopped_reason, control_events FROM ana_runs WHERE id = $1`, [runId]);
    expect(rows[0]).toMatchObject({ status: 'running', stopped_reason: null });
    expect(rows[0].control_events).toEqual([]);
    expect(await auditRows(runId)).toEqual([]);
  });
});
