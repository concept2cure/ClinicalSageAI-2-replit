/**
 * The Vault's deletion archive is deployed, tenant-scoped and append-only
 * (plan critique 13, rows D5, D6).
 *
 * `vault.document_archives` holds the snapshot the retention job takes of a
 * document before it is disposed of: its full record, extracted text included.
 * Its creating migration was not in the deploy set, so a database built by
 * deploy-migrate had no archive for the job to write to. Where the table did
 * exist, it had no row security and no guard, so any tenant could read every
 * archive, and the runtime role could rewrite or delete one. Here, on
 * PostgreSQL as the runtime role with RLS on:
 *
 *   - the creating migration is in the deploy set;
 *   - the retention job's write still works (control);
 *   - an archive cannot be changed, deleted or truncated;
 *   - another organisation cannot read it;
 *   - the tenant purge erases the organisation's archives, and no one else's.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { databaseUrl } from '../setup.db';

const PROBE = 'dbtest-varch ';

type Org = { id: number; uuid: string; programId: string };
type Outcome = { ok: true; rows: Array<Record<string, unknown>> } | { ok: false; message: string };
let owner: Pool;
let mine: Org;
let theirs: Org;

async function asRuntime(sql: string, params: unknown[], scope: Org | 'system'): Promise<Outcome> {
  const { runWithTenantScope, runWithSystemTenantScope } = await import('../../server/db/tenantStore');
  const { pool } = await import('../../server/db');
  const body = async (): Promise<Outcome> => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const r = await client.query(sql, params);
      await client.query('COMMIT');
      return { ok: true, rows: r.rows };
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    } finally {
      client.release();
    }
  };
  const caller = 'tests/db/vault-document-archives.dbtest.ts';
  if (scope === 'system') return runWithSystemTenantScope(caller, body);
  return runWithTenantScope({ tenantId: String(scope.id), orgUuid: scope.uuid, role: 'admin', source: 'request', caller }, body);
}

/** An archive row, as the retention job writes one. */
const ARCHIVE = `INSERT INTO vault.document_archives
                   (original_document_id, program_id, document_code, document_title, document_type, retention_policy, snapshot)
                 VALUES (gen_random_uuid(), $1, 'DBTEST-VARCH', $2, 'OTHER', 'standard', $3::jsonb) RETURNING id`;

async function archiveAsOwner(org: Org, title: string): Promise<string> {
  const { rows } = await owner.query(ARCHIVE, [org.programId, `${PROBE}${title}`, JSON.stringify({ extractedText: 'the deleted record' })]);
  return String(rows[0].id);
}

const exists = async (id: string) => (await owner.query('SELECT 1 FROM vault.document_archives WHERE id = $1', [id])).rowCount === 1;
const refused = (r: Outcome) => {
  expect(r.ok, 'the change was applied').toBe(false);
  if (!r.ok) expect(r.message).toMatch(/IMMUTABILITY_VIOLATION/);
};

async function org(slug: string): Promise<Org> {
  const o = await owner.query(
    `INSERT INTO organizations (name, slug, status) VALUES ($1, $2, 'active')
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, status = 'active' RETURNING id, uuid`,
    [`${PROBE}${slug}`, `dbtest-varch-${slug}`],
  );
  const p = await owner.query(
    `INSERT INTO regulatory_programs (name, code, organization_id, program_type, product_type, primary_agency, product_name)
     VALUES ($1, $2, $3, 'ind', 'drug', 'FDA', 'Archiva 5mg') RETURNING id`,
    [`${PROBE}${slug} program`, `DBTEST-VARCH-${slug.toUpperCase()}`, o.rows[0].id],
  );
  return { id: Number(o.rows[0].id), uuid: String(o.rows[0].uuid), programId: String(p.rows[0].id) };
}

async function cleanup(): Promise<void> {
  // As the table's owner, the one role the archive's delete guard admits.
  await owner.query(`DELETE FROM vault.document_archives WHERE document_title LIKE $1`, [`${PROBE}%`]).catch(() => {});
  await owner.query(`DELETE FROM regulatory_programs WHERE name LIKE $1`, [`${PROBE}%`]).catch(() => {});
  await owner.query(`UPDATE organizations SET status = 'active' WHERE slug LIKE 'dbtest-varch-%'`).catch(() => {});
}

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 2 });
  await cleanup();
  mine = await org('mine');
  theirs = await org('theirs');
}, 60_000);

afterAll(async () => {
  await cleanup();
  await owner.end().catch(() => {});
});

describe('the deletion archive (critique 13)', () => {
  it('its creating migration is in the deploy set', async () => {
    const { C2C_MIGRATION_FILES } = await import('../../scripts/db/migration-set.mjs');
    expect(C2C_MIGRATION_FILES).toContain('migrations/20260608_vault_retention.sql');
  });

  /* In the organisation's own scope, the scope a per-organisation sweep runs
     in. The archive's row security mirrors vault.documents', which gives the
     platform scope nothing (VR-07's note), so the sweep must run per
     organisation to reach either table; that is handed to the jobs lane. */
  it("the retention job's write still works in the organisation's scope (control)", async () => {
    const r = await asRuntime(ARCHIVE, [mine.programId, `${PROBE}written by the job`, '{}'], mine);
    expect(r.ok, r.ok ? '' : r.message).toBe(true);
  });

  it('an archive cannot be changed, deleted or truncated', async () => {
    const id = await archiveAsOwner(mine, 'frozen');
    // In the organisation's own scope, where its row security admits the row.
    refused(await asRuntime(`UPDATE vault.document_archives SET snapshot = '{}'::jsonb WHERE id = $1`, [id], mine));
    refused(await asRuntime('DELETE FROM vault.document_archives WHERE id = $1', [id], mine));
    // Even the table's owner cannot change one (rolled back, so a database
    // without the guard keeps its row as it was).
    const o = await owner.connect();
    try {
      await o.query('BEGIN');
      await expect(o.query(`UPDATE vault.document_archives SET archive_reason = 'rewritten' WHERE id = $1`, [id])).rejects.toThrow(/IMMUTABILITY_VIOLATION/);
    } finally {
      await o.query('ROLLBACK').catch(() => undefined);
      o.release();
    }
    const c = await owner.connect();
    try {
      await c.query('BEGIN');
      await expect(c.query('TRUNCATE vault.document_archives')).rejects.toThrow(/IMMUTABILITY_VIOLATION/);
    } finally {
      await c.query('ROLLBACK').catch(() => undefined);
      c.release();
    }
    expect(await exists(id)).toBe(true);
  });

  it('another organisation cannot read it', async () => {
    const id = await archiveAsOwner(mine, 'private');
    const theirsRead = await asRuntime('SELECT id FROM vault.document_archives WHERE id = $1', [id], theirs);
    expect(theirsRead).toEqual({ ok: true, rows: [] });
    const ownRead = await asRuntime('SELECT id FROM vault.document_archives WHERE id = $1', [id], mine);
    expect(ownRead).toEqual({ ok: true, rows: [{ id }] });
  });

  it("the tenant purge erases the organisation's archives, and no one else's", async () => {
    const gone = await archiveAsOwner(mine, 'purged');
    const kept = await archiveAsOwner(theirs, 'bystander');
    await owner.query('DELETE FROM vault.legal_holds WHERE organization_id = $1', [mine.id]).catch(() => {});
    await owner.query(`UPDATE organizations SET status = 'pending_deletion' WHERE id = $1`, [mine.id]);
    try {
      const r = await asRuntime('SELECT count(*)::int AS n FROM public.purge_tenant_vault_records($1)', [mine.id], 'system');
      expect(r.ok, r.ok ? '' : r.message).toBe(true);
    } finally {
      await owner.query(`UPDATE organizations SET status = 'active' WHERE id = $1`, [mine.id]);
    }
    expect(await exists(gone)).toBe(false);
    expect(await exists(kept)).toBe(true);
  });
});
