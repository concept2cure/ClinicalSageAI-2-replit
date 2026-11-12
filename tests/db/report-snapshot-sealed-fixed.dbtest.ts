/**
 * A sealed report snapshot is fixed for the runtime role (GA readiness map 2026-11-10, GA-D5-03).
 *
 * report_snapshots carries a run's seal in snapshot_metadata. Any role could UPDATE or DELETE the row; a rewrite was
 * detected on read (GET /api/report-os/runs/:id/seal reports a mismatch) and not prevented. The creating migration,
 * migrations/0014_report_os_foundation.sql (amended in place 2026-11-12), now carries trg_report_snapshots_sealed_fixed.
 *
 * Pinned here, as the non-owner runtime role (APP_DATABASE_URL) with the tenant stamped, on a real PostgreSQL:
 * a sealed row is neither changed nor deleted; the finalize's one write, the seal onto an unsealed row, is admitted;
 * and once sealed, that row is fixed too. The read-side check of a rewrite only an owner could make stays pinned in
 * report-os-registry-seed.dbtest.ts.
 */
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { databaseUrl } from '../setup.db';

const TAG = `sealed-snapshot-${randomUUID().slice(0, 8)}`;
let owner: Pool;
let app: Pool;
let orgId: number;
let runId: number;

const snapshotOf = async (meta: object): Promise<number> =>
  Number((await owner.query(
    `INSERT INTO report_snapshots (run_id, organization_id, scope_type, scope_id, snapshot_metadata)
     VALUES ($1, $2, 'project', $3, $4::json) RETURNING id`, [runId, orgId, TAG, JSON.stringify(meta)])).rows[0].id);
const metaOf = async (id: number) => (await owner.query('SELECT snapshot_metadata::jsonb AS m FROM report_snapshots WHERE id = $1', [id])).rows[0]?.m;

/** One statement as the runtime role, in its own transaction stamped with the tenant. */
async function asRuntime(sql: string, params: unknown[]): Promise<number> {
  const c = await app.connect();
  try {
    await c.query('BEGIN');
    await c.query("SELECT set_config('app.current_tenant_id', $1, true)", [String(orgId)]);
    const r = await c.query(sql, params);
    await c.query('COMMIT');
    return r.rowCount ?? 0;
  } catch (err) {
    await c.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    c.release();
  }
}

beforeAll(async () => {
  if (!process.env.APP_DATABASE_URL) throw new Error('APP_DATABASE_URL must use the provisioned non-owner runtime role.');
  owner = new Pool({ connectionString: databaseUrl, max: 2 });
  app = new Pool({ connectionString: process.env.APP_DATABASE_URL, max: 2 });
  orgId = Number((await owner.query(
    "INSERT INTO organizations (name, slug, status, payment_status) VALUES ($1, $1, 'active', 'active') RETURNING id", [TAG])).rows[0].id);
  runId = Number((await owner.query(
    `INSERT INTO report_runs (organization_id, scope_type, scope_id, report_type_id)
     SELECT $1, 'project', $2, type_id FROM report_type_registry ORDER BY type_id LIMIT 1 RETURNING id`, [orgId, TAG])).rows[0].id);
});

afterAll(async () => {
  if (owner && orgId) await owner.query("UPDATE organizations SET status = 'inactive' WHERE id = $1", [orgId]);
  await app?.end();
  await owner?.end();
});

describe('a sealed report snapshot, as the runtime role (GA-D5-03)', () => {
  it('cannot be changed: not its seal, not its other columns', async () => {
    const id = await snapshotOf({ seal: { contentHash: 'a'.repeat(64) } });
    const forged = JSON.stringify({ seal: { contentHash: 'f'.repeat(64) } });
    await expect(asRuntime('UPDATE report_snapshots SET snapshot_metadata = $2::json WHERE id = $1', [id, forged]))
      .rejects.toThrow(/IMMUTABILITY_VIOLATION: report snapshot \d+ is sealed and cannot be changed/);
    await expect(asRuntime('UPDATE report_snapshots SET is_latest = false WHERE id = $1', [id])).rejects.toThrow(/IMMUTABILITY_VIOLATION/);
    expect(await metaOf(id)).toEqual({ seal: { contentHash: 'a'.repeat(64) } });
  });

  it('cannot be deleted', async () => {
    const id = await snapshotOf({ seal: { contentHash: 'b'.repeat(64) } });
    await expect(asRuntime('DELETE FROM report_snapshots WHERE id = $1', [id])).rejects.toThrow(/sealed and cannot be deleted/);
    expect(await metaOf(id)).toBeDefined();
  });

  it('an unsealed snapshot takes its seal once (the finalize), and is fixed from then on', async () => {
    const id = await snapshotOf({ summary: 'draft' });
    const sealed = { summary: 'draft', seal: { contentHash: 'c'.repeat(64) } };
    expect(await asRuntime('UPDATE report_snapshots SET snapshot_metadata = $2::json WHERE id = $1', [id, JSON.stringify(sealed)])).toBe(1);
    await expect(asRuntime('UPDATE report_snapshots SET snapshot_metadata = $2::json WHERE id = $1', [id, '{}'])).rejects.toThrow(/IMMUTABILITY_VIOLATION/);
    expect(await metaOf(id)).toEqual(sealed);
  });
});
