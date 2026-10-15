/**
 * A tenant purge writes its own chained audit row, in its own transaction, and
 * the row outlives the tenant (P1-23 part, DP-10 residual).
 *
 * `purgeTenant` (server/services/tenant/tenant-offboarding.ts) destroys a
 * tenant's content. Its header promised "its own audit entry" and the route's
 * comment called the surviving organizations row "the audit trail of the
 * deletion", but the only record the purge itself wrote was a `logger.warn`:
 * no audit_logs row named who purged which organisation, when, on the strength
 * of which export, or what it deleted. A log line is not an audit trail (21 CFR
 * Part 11 §11.10(e)); it is not chained, not sealed, and not retained with the
 * records.
 *
 * What these cases hold:
 *   1. one sha256-chained audit_logs row, on the purged organisation's own
 *      chain, naming the actor, the export receipt it relied on, the purge
 *      instant, and the rows deleted per table;
 *   2. that row survives the full purge list, run the way the route runs it
 *      (the runtime role in the platform scope);
 *   3. a purge whose audit row cannot be written does not happen.
 *
 * On PostgreSQL built by install-fresh + deploy-migrate. Fixture organisation
 * 90623; its audit rows are removed in afterAll the way the other dbtests
 * remove theirs (the no-delete trigger lifted inside one transaction only).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Pool, type PoolClient } from 'pg';
import { databaseUrl } from '../setup.db';
import { PURGE_CHILD_TABLES, purgeTenant } from '../../server/services/tenant/tenant-offboarding';
import { verifyAuditChain } from '../../server/services/audit/chain';

const ORG = 90623;
const PURGER = 4242;
const TAG = `p123_${process.pid}_${Date.now().toString(36)}`;
const DIGEST = `${TAG}-digest`;
const REASON = `${TAG} contract ended`;
const ROWS = 'purge_audit_probe_rows';

let owner: Pool;

/** The purge's transaction client, refusing exactly one statement: the audit row. */
function auditStoreRefuses(real: Pool): Pool {
  return {
    query: (text: string, params?: unknown[]) => real.query(text, params),
    async connect() {
      const c = await real.connect();
      return {
        query: (text: string, params?: unknown[]) =>
          /INSERT INTO audit_logs/.test(String(text))
            ? Promise.reject(Object.assign(new Error('audit store refused the row'), { code: '42501' }))
            : c.query(text, params),
        release: () => c.release(),
      } as unknown as PoolClient;
    },
  } as unknown as Pool;
}

async function purgeAuditRows() {
  const { rows } = await owner.query(
    `SELECT tenant_id, user_id, actor_id, action, table_name, record_id, target, reason,
            new_values, sha256_chain, chain_seq, occurred_at
       FROM audit_logs WHERE tenant_id = $1 AND action = 'tenant_purged'`,
    [ORG],
  );
  return rows;
}
async function rowsLeft(): Promise<number> {
  return (await owner.query(`SELECT count(*)::int AS n FROM ${ROWS} WHERE organization_id = $1`, [ORG])).rows[0].n;
}
async function organization() {
  return (await owner.query('SELECT status, purged_at, purged_by FROM organizations WHERE id = $1', [ORG])).rows[0];
}

async function removeFixtureAuditRows(): Promise<void> {
  const c = await owner.connect();
  try {
    await c.query('BEGIN');
    await c.query('ALTER TABLE audit_logs DISABLE TRIGGER trg_audit_logs_no_delete');
    await c.query('DELETE FROM audit_logs WHERE tenant_id = $1', [ORG]);
    await c.query('ALTER TABLE audit_logs ENABLE TRIGGER trg_audit_logs_no_delete');
    await c.query('COMMIT');
  } catch (err) {
    await c.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    c.release();
  }
}

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  await owner.query(`CREATE TABLE IF NOT EXISTS ${ROWS} (organization_id INTEGER, note TEXT)`);
  // The route-shaped case deletes as the runtime role; the probe is a fixture, so grant it.
  await owner.query(`GRANT SELECT, DELETE ON ${ROWS} TO app_service`);
});

beforeEach(async () => {
  await removeFixtureAuditRows();
  await owner.query(
    `INSERT INTO organizations (id, name, slug, status, deletion_requested_at, deletion_requested_by,
                                deletion_reason, purge_eligible_at)
     VALUES ($1, $2, $2, 'pending_deletion', now() - interval '40 days', 1, $3, now() - interval '1 day')
     ON CONFLICT (id) DO UPDATE SET status = 'pending_deletion', purged_at = NULL, purged_by = NULL,
       final_export_digest = NULL, deletion_reason = $3, purge_eligible_at = now() - interval '1 day'`,
    [ORG, TAG, REASON],
  );
  await owner.query('DELETE FROM tenant_export_receipts WHERE organization_id = $1', [ORG]);
  await owner.query(
    `INSERT INTO tenant_export_receipts (organization_id, digest, table_count, row_count, created_by)
     VALUES ($1, $2, 5, 10, NULL)`,
    [ORG, DIGEST],
  );
  await owner.query(`DELETE FROM ${ROWS} WHERE organization_id = $1`, [ORG]);
  await owner.query(`INSERT INTO ${ROWS} (organization_id, note) VALUES ($1, 'a'), ($1, 'b')`, [ORG]);
});

afterAll(async () => {
  if (!owner) return;
  await removeFixtureAuditRows().catch((err) => console.warn('[P1-23] audit rows left in place:', err));
  await owner.query(`DROP TABLE IF EXISTS ${ROWS}`);
  await owner.query('DELETE FROM tenant_export_receipts WHERE organization_id = $1', [ORG]);
  await owner.query('DELETE FROM organizations WHERE id = $1', [ORG]);
  await owner.end();
});

describe('a purge writes one chained audit row', () => {
  it('on the purged organisation’s own chain: who, which organisation, when, the export it relied on, what it deleted', async () => {
    await purgeTenant(owner, {
      organizationId: ORG,
      purgedByUserId: PURGER,
      preconditions: { finalExportDigest: DIGEST },
      childTables: [ROWS, 'purge_audit_probe_no_such_table'],
    });

    const rows = await purgeAuditRows();
    expect(rows, 'the purge must leave exactly one audit row naming itself').toHaveLength(1);
    const [row] = rows;
    const org = await organization();
    expect(row).toMatchObject({
      tenant_id: ORG,
      user_id: PURGER,
      actor_id: PURGER,
      table_name: 'organizations',
      record_id: String(ORG),
      reason: REASON,
    });
    expect(row.sha256_chain, 'the row is a link in the chain, not a loose record').toMatch(/^[0-9a-f]{64}$/);
    expect(row.chain_seq, 'sequenced on the tenant chain').not.toBeNull();

    const details = row.new_values;
    expect(details.exportManifest).toMatchObject({ digest: DIGEST, tableCount: 5, rowCount: 10 });
    expect(details.deletedRows).toEqual({ [ROWS]: 2 });
    expect(details.tablesAbsent).toEqual(['purge_audit_probe_no_such_table']);
    expect(details.totalRowsDeleted).toBe(2);
    expect(new Date(details.purgedAt).getTime(), 'the same instant the organisation row records').toBe(
      new Date(org.purged_at).getTime(),
    );
    expect(org.purged_by).toBe(PURGER);

    const chain = await verifyAuditChain(owner as never, { tenantId: ORG });
    expect(chain.ok, JSON.stringify(chain.brokenAt ?? {})).toBe(true);
  });

  /* The route (tenants-simple.ts) runs the purge on the runtime pool, as
     app_service, in the platform scope. audit_logs is FORCE ROW LEVEL SECURITY;
     the platform scope's super-admin arm is what admits a row for another
     organisation. And the full purge list must not reach the trail: it is keyed
     by tenant_id, it is in no purge list, and its no-delete trigger refuses. */
  it('outlives the full purge list, run the way the route runs it', async () => {
    const { pool: runtime } = await import('../../server/db');
    const { runWithSystemTenantScope } = await import('../../server/db/tenantStore');
    await runWithSystemTenantScope('tests/db/tenant-purge-audit.dbtest.ts', () =>
      purgeTenant(runtime, {
        organizationId: ORG,
        purgedByUserId: PURGER,
        preconditions: { finalExportDigest: DIGEST },
        childTables: [...PURGE_CHILD_TABLES, ROWS],
      }),
    );

    expect((await organization()).status).toBe('purged');
    const rows = await purgeAuditRows();
    expect(rows, 'the record of the deletion must survive the deletion').toHaveLength(1);
    expect(rows[0].tenant_id).toBe(ORG);
    expect(rows[0].new_values.exportManifest.digest).toBe(DIGEST);
    expect(rows[0].new_values.deletedRows[ROWS], 'the counts are what the route’s role deleted').toBe(2);
    expect(await rowsLeft()).toBe(0);
  });
});

describe('a purge whose audit row cannot be written does not happen', () => {
  it('rolls back every delete and the status change, and rejects', async () => {
    await expect(
      purgeTenant(auditStoreRefuses(owner), {
        organizationId: ORG,
        purgedByUserId: PURGER,
        preconditions: { finalExportDigest: DIGEST },
        childTables: [ROWS],
      }),
    ).rejects.toThrow(/audit store refused/);

    expect(await rowsLeft(), 'an unrecorded purge must destroy nothing').toBe(2);
    expect((await organization()).status).toBe('pending_deletion');
    expect(await purgeAuditRows()).toHaveLength(0);
  });
});
