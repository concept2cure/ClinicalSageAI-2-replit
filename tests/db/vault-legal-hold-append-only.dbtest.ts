/**
 * A legal hold is placed once and lifted once, and nothing else about it
 * changes (MR-08 Stage 5 steps 1 and 4, CAT1-15,
 * docs/work-orders/MR-08-vault-upload-safety-and-document-control.md).
 *
 * ── What was wrong ───────────────────────────────────────────────────────────
 * vault.legal_holds' CHECKs said what a row must hold, and nothing stopped the
 * row being changed afterwards. As the runtime role, in its own tenant, a
 * hold's reason could be rewritten, a lift undone so a released hold reads
 * active again, a lift's reason replaced, or the row deleted. The retention
 * sweep, the tenant purge and the disposition engine read this table to decide
 * what may be destroyed.
 *
 * ── How it runs ──────────────────────────────────────────────────────────────
 * As cmc-module3-history-append-only.dbtest.ts: writes and refused changes go
 * through the application's own pool (app_service) in the probe tenant's
 * request scope, with RLS on. TRUNCATE runs as the owner in a transaction that
 * is always rolled back. Every row carries this file's probe organisation.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { databaseUrl } from '../setup.db';

const CALLER = 'tests/db/vault-legal-hold-append-only.dbtest.ts';
const RUN = randomUUID().slice(0, 12);

let owner: Pool;
let org: number;
let orgUuid: string;
let programId: string;
let userId: number;

type Outcome = { ok: true; rowCount: number; rows: Array<Record<string, unknown>> } | { ok: false; message: string };

/** One statement as the runtime role, in the probe tenant's request scope. COMMITs only when `commit`. */
async function asRuntime(sql: string, params: unknown[] = [], commit = false): Promise<Outcome> {
  const { runWithTenantScope } = await import('../../server/db/tenantStore');
  const { pool } = await import('../../server/db');
  const scope = { tenantId: String(org), orgUuid, role: 'admin', source: 'request' as const, caller: CALLER };
  return runWithTenantScope(scope, async (): Promise<Outcome> => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const r = await client.query(sql, params);
      await client.query(commit ? 'COMMIT' : 'ROLLBACK');
      return { ok: true, rowCount: r.rowCount ?? 0, rows: r.rows };
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    } finally {
      client.release();
    }
  });
}

/** One statement as the owner, in a transaction that is ALWAYS rolled back. */
async function asOwnerRolledBack(sql: string, params: unknown[] = []): Promise<Outcome> {
  const client = await owner.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query(sql, params);
    return { ok: true, rowCount: r.rowCount ?? 0, rows: r.rows };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    client.release();
  }
}

const refused = (r: Outcome, what: string) =>
  expect(r.ok ? `applied (${r.rowCount} row(s))` : r.message, what).toMatch(/IMMUTABILITY_VIOLATION/);

/** Place a hold through the legitimate path: an INSERT as the runtime role, committed. */
async function place(): Promise<string> {
  const r = await asRuntime(
    `INSERT INTO vault.legal_holds (organization_id, reference, reason, scope, program_id, placed_by)
     VALUES ($1, $2, 'Litigation hold: the dosing dispute.', 'program', $3, $4) RETURNING id`,
    [org, `MATTER-${RUN}`, programId, userId], true);
  if (!r.ok) throw new Error(`placing a hold was refused: ${r.message}`);
  return String(r.rows[0].id);
}

const LIFT = `UPDATE vault.legal_holds SET lifted_at = NOW(), lifted_by = $2, lift_reason = 'The matter settled.' WHERE id = $1`;
const holdRow = async (id: string) => (await owner.query(
  `SELECT reference, reason, lifted_at, lifted_by, lift_reason FROM vault.legal_holds WHERE id = $1`, [id])).rows[0];

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 2 });
  const o = await owner.query(`INSERT INTO organizations (name, slug, status) VALUES ($1, $2, 'active') RETURNING id, uuid`,
    [`dbtest-holds-${RUN}`, `dbtest-holds-${RUN}`]);
  org = Number(o.rows[0].id);
  orgUuid = String(o.rows[0].uuid);
  userId = Number((await owner.query(
    `INSERT INTO users (email, name, password_hash, status) VALUES ($1, 'Hal Holder', 'x', 'active') RETURNING id`,
    [`dbtest-holds-${RUN}@example.test`])).rows[0].id);
  programId = String((await owner.query(
    `INSERT INTO regulatory_programs (name, code, organization_id, program_type, product_type, primary_agency, product_name)
     VALUES ($1, $2, $3, 'ind', 'drug', 'FDA', 'Holdia 5mg') RETURNING id`,
    [`dbtest-holds-${RUN} program`, `DBTEST-HOLDS-${RUN}`, org])).rows[0].id);
});

afterAll(async () => { await owner?.end(); });

describe('a legal hold is a record', () => {
  it('refuses a rewrite of what a hold says, as the runtime role', async () => {
    const id = await place();
    refused(await asRuntime(`UPDATE vault.legal_holds SET reason = 'Something else entirely.' WHERE id = $1`, [id]), 'reason rewritten');
    refused(await asRuntime(`UPDATE vault.legal_holds SET reference = 'OTHER' WHERE id = $1`, [id]), 'reference rewritten');
    refused(await asRuntime(`UPDATE vault.legal_holds SET placed_by = NULL WHERE id = $1`, [id]), 'placer erased');
    expect(await holdRow(id)).toMatchObject({ reference: `MATTER-${RUN}`, reason: 'Litigation hold: the dosing dispute.', lifted_at: null });
  });

  it('refuses a delete, as the runtime role', async () => {
    const id = await place();
    refused(await asRuntime(`DELETE FROM vault.legal_holds WHERE id = $1`, [id]), 'hold deleted');
    expect(await holdRow(id)).toBeTruthy();
  });

  it('admits the lift once, with its author and reason, and nothing after it', async () => {
    const id = await place();
    const lift = await asRuntime(LIFT, [id, userId], true);
    expect(lift.ok ? lift.rowCount : lift.message).toBe(1);
    expect(await holdRow(id)).toMatchObject({ lifted_by: userId, lift_reason: 'The matter settled.' });
    refused(await asRuntime(`UPDATE vault.legal_holds SET lifted_at = NULL, lifted_by = NULL, lift_reason = NULL WHERE id = $1`, [id]), 'lift undone');
    refused(await asRuntime(`UPDATE vault.legal_holds SET lift_reason = 'A different story.' WHERE id = $1`, [id]), 'lift reason replaced');
    refused(await asRuntime(LIFT, [id, userId]), 'lifted twice');
    expect(await holdRow(id)).toMatchObject({ lift_reason: 'The matter settled.' });
  });

  it('refuses a lift that also changes the hold', async () => {
    const id = await place();
    refused(await asRuntime(
      `UPDATE vault.legal_holds SET lifted_at = NOW(), lifted_by = $2, lift_reason = 'Settled.', reason = 'Rewritten on the way out.' WHERE id = $1`,
      [id, userId]), 'lift with a rewrite');
  });

  it('refuses a TRUNCATE, even as the owner', async () => {
    await place();
    refused(await asOwnerRolledBack(`TRUNCATE vault.legal_holds`), 'truncated');
  });

  it('the guards are on the boot list, so production refuses to start without them', async () => {
    const { EXPECTED_AUDIT_IMMUTABILITY_TRIGGERS } = await import('../../server/services/audit/audit-immutability-triggers');
    const names = EXPECTED_AUDIT_IMMUTABILITY_TRIGGERS.filter((t) => t.schema === 'vault' && t.table === 'legal_holds').map((t) => t.trigger);
    expect(names.sort()).toEqual(['vault_legal_holds_record_guard', 'vault_legal_holds_truncate_guard']);
    const present = (await owner.query(
      `SELECT tgname FROM pg_trigger WHERE tgrelid = 'vault.legal_holds'::regclass AND tgenabled <> 'D' AND NOT tgisinternal ORDER BY tgname`)).rows.map((r) => r.tgname);
    expect(present).toEqual(expect.arrayContaining(names));
  });
});
