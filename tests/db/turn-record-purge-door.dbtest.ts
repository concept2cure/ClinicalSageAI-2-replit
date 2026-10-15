/**
 * AnA turn records leave with the tenant, through one door; the runtime role
 * cannot rewrite any Part 11 record table (rows D5/D6, 2026-10-01).
 *
 * Two halves, both on PostgreSQL built by install-fresh + deploy-migrate:
 *
 *   1. P0-8, the grant half. The runtime role held UPDATE and DELETE on every
 *      public record table (audit_logs, the turn records, the authoring trail,
 *      the signature ledgers) and only their triggers refused a rewrite. The
 *      grant recipe now withdraws UPDATE, DELETE and TRUNCATE on each
 *      (scripts/db/provision-app-role.mjs withdrawAppendOnlyWrites), so the
 *      engine refuses them as a privilege before any trigger runs.
 *
 *   2. The purge door. A turn record's body is Customer Data (MSA §10.2, DPA
 *      §3.5): the tenant export returns it and the purge erases it. Its
 *      audit-trail record, the chained audit_logs row, stays. Both tables
 *      refuse a plain DELETE from every role, the owner included; only
 *      public.purge_tenant_turn_records, running as ana_record_purger, passes,
 *      and only for an organization pending deletion, in the platform scope,
 *      with no active legal hold.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Pool, type PoolClient } from 'pg';
import { databaseUrl } from '../setup.db';
import { purgeTenant } from '../../server/services/tenant/tenant-offboarding';
import { exportTenantFull } from '../../server/services/tenant-export/tenant-full-export.service';
import { TurnRecorder, sha256Hex, writeTurnRecord } from '../../server/services/ana/turn-record';
import { APPEND_ONLY_TABLES } from '../../scripts/db/provision-app-role.mjs';

const ORG = 90611; // offboarded
const KEEP = 90612; // another tenant, active
const TAG = `trpurge_${process.pid}_${Date.now().toString(36)}`;
const DIGEST = `${TAG}-digest`;

const appUrl = process.env.APP_DATABASE_URL;
let owner: Pool;
let app: Pool | null = null;

async function recordTurn(org: number, question: string): Promise<{ id: string; sha256: string }> {
  const r = new TurnRecorder();
  r.setTurn({ organizationId: org, runId: `${TAG}-${question}`, actorUserId: null });
  r.setRequest(question);
  r.setAnswer({ streamed: `An answer to: ${question}`, stored: `An answer to: ${question}` });
  return writeTurnRecord(owner, r.seal('answered'));
}

const count = async (table: string, org: number): Promise<number> =>
  (await owner.query(`SELECT count(*)::int AS n FROM ${table} WHERE organization_id = $1`, [org])).rows[0].n;

/** Run `fn` on one connection as the runtime role, inside a transaction rolled back after. */
async function asRuntimeRole<T>(scope: Record<string, string>, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await app!.connect();
  try {
    await c.query('BEGIN');
    for (const [k, v] of Object.entries(scope)) await c.query('SELECT set_config($1, $2, true)', [k, v]);
    return await fn(c);
  } finally {
    await c.query('ROLLBACK').catch(() => undefined);
    c.release();
  }
}
const PLATFORM = { 'app.rls_enforce': 'on', 'app.current_user_role': 'app_super_admin' };
const TENANT = { 'app.rls_enforce': 'on', 'app.current_org_id': String(ORG), 'app.current_tenant_id': String(ORG) };

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  if (appUrl) app = new Pool({ connectionString: appUrl, max: 2 });
  for (const [id, status] of [[ORG, 'pending_deletion'], [KEEP, 'active']] as const) {
    await owner.query(
      `INSERT INTO organizations (id, name, slug, status, deletion_requested_at, purge_eligible_at)
       VALUES ($1, $2, $2, $3, now() - interval '40 days', now() - interval '1 day')
       ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, purged_at = NULL, purged_by = NULL,
         final_export_digest = NULL, purge_eligible_at = now() - interval '1 day'`,
      [id, `${TAG}-${id}`, status],
    );
  }
});

beforeEach(async () => {
  await owner.query(`UPDATE organizations SET status = 'pending_deletion', purged_at = NULL WHERE id = $1`, [ORG]);
  await owner.query('DELETE FROM vault.legal_holds WHERE organization_id = $1', [ORG]);
  await owner.query('DELETE FROM tenant_export_receipts WHERE organization_id = $1', [ORG]);
  await owner.query(
    `INSERT INTO tenant_export_receipts (organization_id, digest, table_count, row_count, created_by)
     VALUES ($1, $2, 2, 4, NULL)`,
    [ORG, DIGEST],
  );
});

afterAll(async () => {
  if (!owner) return;
  // The tables refuse the owner too; a test teardown disables the triggers, as
  // the other tests/db teardowns do for append-only tables.
  for (const t of ['ana_turn_records', 'ana_record_blobs']) {
    await owner.query(`ALTER TABLE ${t} DISABLE TRIGGER USER`);
    await owner.query(`DELETE FROM ${t} WHERE organization_id = ANY($1)`, [[ORG, KEEP]]);
    await owner.query(`ALTER TABLE ${t} ENABLE TRIGGER USER`);
  }
  await owner.query('DELETE FROM vault.legal_holds WHERE organization_id = ANY($1)', [[ORG, KEEP]]);
  await owner.query('DELETE FROM tenant_export_receipts WHERE organization_id = ANY($1)', [[ORG, KEEP]]);
  await app?.end();
  await owner.end();
});

describe('P0-8: the runtime role can read and append to a record table, never rewrite it', () => {
  it("holds SELECT and INSERT (INSERT only where the store's ceiling allows it), and no UPDATE, DELETE or TRUNCATE, on every append-only table present", async () => {
    expect(appUrl, 'APP_DATABASE_URL names the runtime role (CI sets it)').toBeTruthy();
    const role = new URL(appUrl!).username;
    // A store with a `ceiling` (scripts/db/provision-app-role.mjs) is held to it:
    // public.audit_log_archives is SELECT only, its one writer being the archive
    // door (P0-8 anchor follow-up, 2026-10-01). Every other store is SELECT, INSERT.
    const { rows } = await owner.query(
      `SELECT t.schema || '.' || t.name AS relation, t.ceiling,
              has_table_privilege($1, c.oid, 'SELECT') AS s, has_table_privilege($1, c.oid, 'INSERT') AS i,
              has_table_privilege($1, c.oid, 'UPDATE') AS u, has_table_privilege($1, c.oid, 'DELETE') AS d,
              has_table_privilege($1, c.oid, 'TRUNCATE') AS t
         FROM jsonb_to_recordset($2::jsonb) AS t(schema text, name text, ceiling jsonb)
         JOIN pg_class c ON c.oid = to_regclass(format('%I.%I', t.schema, t.name))`,
      [role, JSON.stringify(APPEND_ONLY_TABLES)],
    );
    expect(rows.length, 'the record tables exist on a deployed database').toBe(APPEND_ONLY_TABLES.length);
    const wrong = rows.filter((r) => !r.s || r.i !== (r.ceiling ?? ['SELECT', 'INSERT']).includes('INSERT') || r.u || r.d || r.t).map((r) => r.relation);
    expect(wrong, 'relations the runtime role may rewrite or cannot append to').toEqual([]);
  });

  it('refuses the runtime role an UPDATE, DELETE or TRUNCATE as a privilege, before any trigger runs', async () => {
    for (const sql of [
      `UPDATE audit_logs SET reason = 'rewritten' WHERE false`,
      `DELETE FROM ana_turn_records WHERE false`,
      `DELETE FROM authoring_audit_trail WHERE false`,
      `TRUNCATE concept2cure_signatures`,
    ]) {
      await expect(asRuntimeRole(PLATFORM, (c) => c.query(sql)), sql).rejects.toMatchObject({ code: '42501' });
    }
  });
});

describe('the turn-record purge door', () => {
  it('refuses a plain DELETE and a TRUNCATE from the table owner too', async () => {
    await recordTurn(ORG, 'owner delete probe');
    await expect(owner.query('DELETE FROM ana_turn_records WHERE organization_id = $1', [ORG])).rejects.toThrow(
      /IMMUTABILITY_VIOLATION/,
    );
    await expect(owner.query('DELETE FROM ana_record_blobs WHERE organization_id = $1', [ORG])).rejects.toThrow(
      /IMMUTABILITY_VIOLATION/,
    );
    await expect(owner.query('TRUNCATE ana_record_blobs')).rejects.toThrow(/IMMUTABILITY_VIOLATION/);
  });

  it('refuses an organization that is not pending deletion, a tenant scope and an active hold', async () => {
    await recordTurn(KEEP, 'kept');
    const door = (c: PoolClient, org: number) => c.query('SELECT * FROM public.purge_tenant_turn_records($1)', [org]);
    await expect(asRuntimeRole(PLATFORM, (c) => door(c, KEEP))).rejects.toThrow(/not pending deletion \(status active\)/);
    await expect(asRuntimeRole(TENANT, (c) => door(c, ORG))).rejects.toMatchObject({ code: '42501' });
    await owner.query(
      `INSERT INTO vault.legal_holds (organization_id, reference, reason, scope, program_id)
       VALUES ($1, $2, 'litigation hold', 'program', gen_random_uuid())`,
      [ORG, `${TAG}-hold`],
    );
    await expect(asRuntimeRole(PLATFORM, (c) => door(c, ORG))).rejects.toThrow(/1 active legal hold/);
    expect(await count('ana_turn_records', KEEP)).toBeGreaterThan(0);
  });

  it('is not executable by PUBLIC, and is owned by the NOLOGIN purger role', async () => {
    const { rows } = await owner.query(
      `SELECT pg_get_userbyid(p.proowner) AS owner, p.prosecdef,
              has_function_privilege('public', p.oid, 'EXECUTE') AS public_exec,
              r.rolcanlogin, r.rolbypassrls, r.rolsuper
         FROM pg_proc p JOIN pg_roles r ON r.oid = p.proowner
        WHERE p.oid = 'public.purge_tenant_turn_records(integer)'::regprocedure`,
    );
    expect(rows[0]).toEqual({
      owner: 'ana_record_purger',
      prosecdef: true,
      public_exec: false,
      rolcanlogin: false,
      rolbypassrls: false,
      rolsuper: false,
    });
  });
});

describe('a purge returns the records first, erases them, and keeps their audit trail', () => {
  it('exports the turn records, erases them with the tenant, leaves the other tenant’s, and keeps each chained row', async () => {
    const turn = await recordTurn(ORG, 'What does 21 CFR 312.23 require in the IND cover sheet?');
    await recordTurn(KEEP, 'kept tenant turn');
    const keptBefore = await count('ana_turn_records', KEEP);

    // 1. The data return carries the record byte for byte.
    const exported = await exportTenantFull(owner, ORG);
    const records = exported.tables.find((t) => t.table === 'ana_turn_records');
    const row = records?.rows.find((r) => r.id === turn.id) as { record_text: string; record_sha256: string } | undefined;
    expect(row, 'the export holds the turn record').toBeTruthy();
    expect(sha256Hex(row!.record_text)).toBe(turn.sha256);
    expect(exported.tables.find((t) => t.table === 'ana_record_blobs')?.rowCount).toBeGreaterThan(0);

    // 2. The purge erases both tables through the door.
    const purged = await purgeTenant(owner, {
      organizationId: ORG,
      purgedByUserId: 1,
      preconditions: { finalExportDigest: DIGEST },
      childTables: ['ana_turn_records', 'ana_record_blobs'],
    });
    expect(purged.status).toBe('purged');
    expect(purged.turnRecordErasure.records).toBeGreaterThan(0);
    expect(purged.turnRecordErasure.blobs).toBeGreaterThan(0);
    expect(await count('ana_turn_records', ORG)).toBe(0);
    expect(await count('ana_record_blobs', ORG)).toBe(0);
    expect(await count('ana_turn_records', KEEP), 'another tenant’s records are untouched').toBe(keptBefore);

    // 3. The audit trail stays, and still proves the exported bytes.
    const chained = await owner.query(
      `SELECT new_values->>'recordSha256' AS sha, sha256_chain FROM audit_logs
        WHERE tenant_id = $1 AND action = 'ana.turn.recorded' AND record_id = $2`,
      [ORG, turn.id],
    );
    expect(chained.rows).toHaveLength(1);
    expect(chained.rows[0].sha).toBe(sha256Hex(row!.record_text));
    expect(chained.rows[0].sha256_chain).toMatch(/^[0-9a-f]{64}$/);
  });

  it('refuses a database that has the tables but not the door, and erases nothing', async () => {
    await owner.query(`UPDATE organizations SET status = 'pending_deletion', purged_at = NULL WHERE id = $1`, [ORG]);
    await recordTurn(ORG, 'door missing probe');
    const before = await count('ana_turn_records', ORG);
    await owner.query('ALTER FUNCTION public.purge_tenant_turn_records(integer) RENAME TO purge_tenant_turn_records_hidden');
    try {
      await expect(
        purgeTenant(owner, {
          organizationId: ORG,
          purgedByUserId: 1,
          preconditions: { finalExportDigest: DIGEST },
          childTables: ['ana_turn_records', 'ana_record_blobs'],
        }),
      ).rejects.toMatchObject({ code: 'TURN_RECORD_PURGE_UNAVAILABLE' });
    } finally {
      await owner.query('ALTER FUNCTION public.purge_tenant_turn_records_hidden(integer) RENAME TO purge_tenant_turn_records');
    }
    expect(await count('ana_turn_records', ORG)).toBe(before);
  });
});
